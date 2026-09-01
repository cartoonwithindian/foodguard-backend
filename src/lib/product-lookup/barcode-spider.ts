import { lookupBarcodeSpider } from "@/lib/external/barcode-spider";
import { logger } from "@/lib/logger";
import type { ProductLookupResult } from "./types";

/**
 * barcodespider.com adapter.
 *
 * Uses the existing barcode-spider API adapter (the site's official API,
 * preferred over scraping per the reliability rules). The API key is
 * optional; without a key the API returns no data and the adapter reports
 * not found so the chain continues.
 */

export const BARCODE_SPIDER_CONFIDENCE = 0.6;

export async function barcodeSpiderAdapter(
  barcode: string,
): Promise<ProductLookupResult> {
  try {
    const result = await lookupBarcodeSpider(barcode);
    if (!result?.product) {
      return { found: false, barcode, source: "barcodespider", confidence: 0 };
    }
    const product = result.product;
    return {
      found: true,
      barcode,
      name: product.name,
      brand: product.brand ?? undefined,
      category: product.category,
      ingredients: product.ingredientsRaw?.trim() || undefined,
      imageUrl: product.imageUrl ?? undefined,
      source: "barcodespider",
      confidence: BARCODE_SPIDER_CONFIDENCE,
      rawData: result,
    };
  } catch (error) {
    logger.warn("product_lookup_barcode_spider_failed", {
      barcode,
      error: error instanceof Error ? error.message : String(error),
    });
    return { found: false, barcode, source: "barcodespider", confidence: 0 };
  }
}