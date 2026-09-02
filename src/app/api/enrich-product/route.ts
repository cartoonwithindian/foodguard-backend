/**
 * POST /api/enrich-product
 *
 * Manually trigger web enrichment for a product.
 * Searches the web, fetches pages, extracts ingredients/nutrition,
 * and saves to the database.
 *
 * Body: { productName: string, barcode?: string, brand?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { enrichProductFromWeb, saveEnrichedProduct } from "@/services/web-product-enrichment";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productName, barcode, brand } = body;

    if (!productName && !barcode) {
      return NextResponse.json(
        { error: "Either productName or barcode is required" },
        { status: 400 },
      );
    }

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
    logger.error("enrich_product_error", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to enrich product", details: String(error) },
      { status: 500 },
    );
  }
}
