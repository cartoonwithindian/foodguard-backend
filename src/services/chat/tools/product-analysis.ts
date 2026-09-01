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

/**
 * Runs the EXISTING FoodGuard analysis engine. The concern level and score
 * come from the engine — never from the LLM or this tool.
 */
export async function getProductAnalysisTool(
  args: { product_id?: string; barcode?: string },
): Promise<ToolResult<ProductAnalysisSummary | { notFound: true }>> {
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

    const result = await runAnalysis({
      barcode: product.barcode,
      ingredientsText: product.ingredientsRaw,
      userId: null,
      language: "en",
      skipAlternatives: true,
      skipPersonalization: true,
    });

    const frontend = result.frontend;
    return {
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
  } catch {
    return { ok: false, error: "analysis_failed" };
  }
}