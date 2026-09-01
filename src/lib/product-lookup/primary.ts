import {
  lookupProductByBarcode as primaryLookup,
} from "@/lib/product-provider";
import type { ProductLookupResult } from "./types";

/**
 * FoodGuard's primary product pipeline: bundled Indian dataset -> demo store
 * -> Open Food Facts -> barcode spider API -> curated seed. This adapter never
 * runs external fallbacks itself; those live in the orchestrator.
 */

const SOURCE_CONFIDENCE: Record<string, number> = {
  indian_dataset: 0.95,
  bundled_demo_dataset: 0.9,
  openfoodfacts: 0.75,
  barcode_spider: 0.65,
  curated: 0.9,
};

export async function primaryAdapter(
  barcode: string,
): Promise<ProductLookupResult> {
  const result = await primaryLookup(barcode);
  if (!result?.product) {
    return { found: false, barcode, source: "none", confidence: 0 };
  }

  const source = result.source || "foodguard";
  const nutrition = (result.nutrition ?? undefined) as
    | Record<string, unknown>
    | undefined;

  return {
    found: true,
    barcode,
    name: result.product.name,
    brand: result.product.brand ?? undefined,
    category: result.product.category,
    ingredients:
      result.product.ingredientsRaw?.trim() || undefined,
    nutrition,
    allergens: undefined,
    imageUrl: result.product.imageUrl ?? undefined,
    source,
    confidence: SOURCE_CONFIDENCE[source] ?? result.product.productDataConfidence ?? 0.6,
    rawData: result,
  };
}