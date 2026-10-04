import { z } from "zod";
import { getStore } from "@/lib/store";
import { runAnalysis } from "@/services/analysis.service";
import type { ToolResult, ProductAnalysisSummary } from "@/types/chat-tools";
import { resolveProductId } from "./search-product";

const inputSchema = z
  .object({
    product_id: z.string().trim().min(1).max(64).optional(),
    barcode: z.string().trim().min(1).max(32).optional(),
  })
  .refine((v) => Boolean(v.product_id || v.barcode), "product_id or barcode required");

type AnalysisSummary = ProductAnalysisSummary | { notFound: true };
type CacheEntry = { value: ToolResult<AnalysisSummary>; expiresAt: number };

/**
 * Chat is interactive: a full `runAnalysis` used to run inside every message
 * (FSSAI + legal-metrology + live web research), taking 15-30s per reply.
 * Results are now memoised per product/label and the outbound research phase
 * is skipped — research only fills `meta.webResearch`, never the score.
 */
const ANALYSIS_TTL_MS = 10 * 60 * 1000;
const ANALYSIS_CACHE_MAX = 200;
const analysisCache = new Map<string, CacheEntry>();

/** FNV-1a — cheap content fingerprint so an edited label misses the cache. */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function cacheKey(productId: string, ingredientsRaw: string): string {
  return `${productId}:${fingerprint(ingredientsRaw)}`;
}

function readCache(key: string): ToolResult<AnalysisSummary> | null {
  const entry = analysisCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    analysisCache.delete(key);
    return null;
  }
  // Re-insert to mark as most-recently-used for the eviction below.
  analysisCache.delete(key);
  analysisCache.set(key, entry);
  return entry.value;
}

function writeCache(key: string, value: ToolResult<AnalysisSummary>): void {
  if (value.ok === false) return;
  while (analysisCache.size >= ANALYSIS_CACHE_MAX) {
    const oldest = analysisCache.keys().next().value;
    if (oldest === undefined) break;
    analysisCache.delete(oldest);
  }
  analysisCache.set(key, { value, expiresAt: Date.now() + ANALYSIS_TTL_MS });
}

/**
 * Runs the EXISTING FoodGuard analysis engine. The concern level and score
 * come from the engine — never from the LLM or this tool.
 */
export async function getProductAnalysisTool(
  args: { product_id?: string; barcode?: string },
): Promise<ToolResult<AnalysisSummary>> {
  const parsed = inputSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }
  try {
    const id = await resolveProductId(parsed.data);
    if (!id) return { ok: true, data: { notFound: true } };
    const store = getStore();
    const product = await store.getProductById(id);
    if (!product) return { ok: true, data: { notFound: true } };

    const key = cacheKey(product.id, product.ingredientsRaw);
    const cached = readCache(key);
    if (cached) return cached;

    const result = await runAnalysis({
      barcode: product.barcode,
      ingredientsText: product.ingredientsRaw,
      userId: null,
      language: "en",
      skipAlternatives: true,
      skipPersonalization: true,
      skipWebResearch: true,
    });

    const frontend = result.frontend;
    const summary: ToolResult<AnalysisSummary> = {
      ok: true,
      data: {
        productId: product.id,
        name: frontend.name || product.name,
        brand: frontend.brand || product.brand,
        assessment: frontend.assessment,
        assessmentDescription: frontend.assessmentDescription,
        score: frontend.score ?? null,
        confidence: frontend.confidence ?? 0,
        positivePoints: (frontend.positivePoints ?? []).map((p) => (typeof p === "string" ? p : p.text)),
        attentionPoints: (frontend.attentionPoints ?? []).map((p) => (typeof p === "string" ? p : p.name)),
        needsReview: frontend.needsReview ?? false,
        regulatoryStatus: frontend.regulatory?.overallStatus ?? null,
      },
    };
    writeCache(key, summary);
    return summary;
  } catch {
    return { ok: false, error: "analysis_failed" };
  }
}
