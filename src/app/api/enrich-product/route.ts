/**
 * POST /api/enrich-product
 *
 * Manually trigger web enrichment for a product.
 * Searches the web, fetches pages, extracts ingredients/nutrition,
 * and saves to the database.
 *
 * Body: { productName?: string, barcode?: string, brand?: string }
 *
 * Admin-only: this crawls the live web on demand and writes to the shared
 * product catalogue, so it is deliberately not reachable anonymously —
 * previously any visitor could trigger unbounded outbound crawling and
 * poison the catalog with arbitrary data.
 */

import { NextRequest, NextResponse } from "next/server";
import { enrichProductFromWeb, saveEnrichedProduct } from "@/services/web-product-enrichment";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { enrichProductSchema } from "@/schemas";
import { jsonError } from "@/lib/http";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? "enrich-product";
  try {
    await requireAdmin(request);
    await enforceRateLimit(`enrich:${clientIp(request)}`);

    const parsed = enrichProductSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error, requestId);
    const { productName, barcode, brand } = parsed.data;

    logger.info("enrich_product_request", { productName, barcode, brand });

    const enrichment = await enrichProductFromWeb(
      productName || `Product ${barcode}`,
      barcode,
      brand,
    );

    if (!enrichment.success) {
      return NextResponse.json({
        success: false,
        message: "Could not find product information on the web",
        evidence: enrichment.evidence,
      });
    }

    // Save to database
    const saved = await saveEnrichedProduct(enrichment, productName || `Product ${barcode}`, barcode);

    return NextResponse.json({
      success: true,
      product: saved?.product ?? null,
      nutrition: saved?.nutrition ?? null,
      enrichment: {
        source: enrichment.source,
        sourceUrl: enrichment.sourceUrl,
        ingredientsRaw: enrichment.ingredientsRaw,
        nutrition: enrichment.nutrition,
        evidence: enrichment.evidence,
      },
    });
  } catch (error) {
    // Goes through jsonError so AppError status/codes are preserved and raw
    // exception text (provider URLs, tokens, SQL) is never echoed back.
    logger.error("enrich_product_error", { error: String(error) });
    return jsonError(error, requestId);
  }
}
