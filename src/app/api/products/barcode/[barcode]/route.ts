import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { lookupProductByBarcode } from "@/lib/product-lookup";
import type { ProductLookupResult } from "@/lib/product-lookup/types";
import { AppError, ErrorCodes } from "@/lib/errors";
import type { ProductInfo, ProductCategory, NutritionFacts } from "@/types/domain";

export const runtime = "nodejs";

/**
 * GET /api/products/barcode/:barcode
 *
 * Barcode lookup with a strict fallback chain:
 *   foodguard -> google -> barcode-list -> barcodesdatabase ->
 *   barcodespider -> OCR+google
 *
 * Response stays backward compatible:
 *   { success, data: { product, nutrition, source, confidence, mergedFrom } }
 * Unknown barcodes return 404 with error "PRODUCT_NOT_FOUND".
 */

function toProductInfo(lookup: ProductLookupResult): ProductInfo {
  const validCategories: ProductCategory[] = [
    "food",
    "cosmetics",
    "personal_care",
    "household",
    "other",
  ];
  const category = validCategories.includes(
    lookup.category as ProductCategory,
  )
    ? (lookup.category as ProductCategory)
    : "other";
  return {
    id: "",
    barcode: lookup.barcode,
    name: lookup.name ?? `Product ${lookup.barcode}`,
    brand: lookup.brand ?? null,
    category,
    country: null,
    servingSize: null,
    imageUrl: lookup.imageUrl ?? null,
    ingredientsRaw: lookup.ingredients ?? "",
    ingredientsNormalized: [],
    source: lookup.source,
    sourceUrl: null,
    verified: false,
    productDataConfidence: lookup.confidence,
    isDemo: false,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const { barcode } = await params;
    if (!/^\d{4,32}$/.test(barcode)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid barcode format");
    }
    const outcome = await lookupProductByBarcode(barcode);
    if (!outcome.success || !outcome.product) {
      throw new AppError(
        ErrorCodes.PRODUCT_NOT_FOUND,
        "Product could not be found for this barcode",
        404,
      );
    }
    return jsonSuccess(
      {
        product: toProductInfo(outcome.product),
        nutrition: (outcome.product.nutrition ?? null) as NutritionFacts | null,
        source: outcome.source,
        confidence: outcome.confidence,
        mergedFrom: outcome.mergedFrom,
        cached: outcome.cached,
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}