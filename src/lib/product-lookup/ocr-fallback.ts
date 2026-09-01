import { webSearchWithFallback, type WebSearchResult } from "@/lib/external/web-search-providers";
import { isWebResearchAvailable } from "@/services/web-research.service";
import { logger } from "@/lib/logger";
import { parseGoogleResultsForBarcode } from "./google";
import type { LookupContext, ProductLookupResult } from "./types";

/**
 * OCR + product-name fallback: the last step before giving up.
 *
 * When every barcode source failed but the caller has OCR text and/or a
 * product name (from a label photo scan), search the web for
 * "brand + product name + ingredients/nutrition" and try to identify the
 * product. Deliberately low confidence — the result is a best-effort
 * identification, never presented as authoritative.
 */

const OCR_GOOGLE_CONFIDENCE = 0.55;

function productNameFromContext(ctx: LookupContext): string | undefined {
  return (ctx.productName ?? "").trim() || undefined;
}

function contextQuery(barcode: string, ctx: LookupContext): string | null {
  const name = productNameFromContext(ctx);
  if (name) {
    const snippet = (ctx.ocrText ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 8)
      .join(" ");
    return snippet
      ? `"${name}" ${snippet} ingredients nutrition`
      : `"${name}" ingredients nutrition`;
  }
  const ocr = (ctx.ocrText ?? "").trim();
  if (!ocr) return null;
  return `"${barcode}" ${ocr.replace(/\s+/g, " ").split(" ").slice(0, 8).join(" ")}`;
}

/**
 * Find the best identification candidate among results for the contextual
 * query. Pure, exported for tests.
 */
export function pickOcrGoogleCandidate(
  results: WebSearchResult[],
  barcode: string,
  ctx: LookupContext,
): ProductLookupResult | null {
  const byBarcode = parseGoogleResultsForBarcode(results, barcode);
  if (byBarcode) return byBarcode;

  const name = productNameFromContext(ctx);
  const candidates = results.filter((r) => {
    const title = (r.title ?? "").trim();
    if (title.length < 3) return false;
    const lower = title.toLowerCase();
    if (/^(not found|search results|just a moment|no results)/.test(lower)) return false;
    if (name) {
      const nameWords = name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
      const titleWords = title.toLowerCase();
      const hits = nameWords.filter((w) => titleWords.includes(w));
      return hits.length >= Math.max(1, Math.ceil(nameWords.length / 2));
    }
    return true;
  });
  if (candidates.length === 0) return null;

  const best = candidates[0];
  return {
    found: true,
    barcode,
    name: name ?? best.title ?? undefined,
    brand: undefined,
    category: undefined,
    source: "ocr-google",
    confidence: OCR_GOOGLE_CONFIDENCE,
    rawData: { url: best.url, title: best.title },
  };
}

export async function ocrGoogleAdapter(
  barcode: string,
  ctx: LookupContext,
): Promise<ProductLookupResult> {
  if (!isWebResearchAvailable()) {
    return { found: false, barcode, source: "ocr-google", confidence: 0 };
  }

  const query = contextQuery(barcode, ctx);
  if (!query) {
    return { found: false, barcode, source: "ocr-google", confidence: 0 };
  }

  try {
    const response = await webSearchWithFallback(query, { numResults: 6 });
    if (!response.performed || response.results.length === 0) {
      return { found: false, barcode, source: "ocr-google", confidence: 0 };
    }
    const parsed = pickOcrGoogleCandidate(response.results, barcode, ctx);
    if (parsed) return parsed;
  } catch (error) {
    logger.warn("product_lookup_ocr_google_failed", {
      barcode,
      error: String(error),
    });
  }

  return { found: false, barcode, source: "ocr-google", confidence: 0 };
}