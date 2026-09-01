import type { ProductInfo } from "@/types/domain";
import type { ProductLookupResult } from "@/lib/product-provider";
import { logger } from "@/lib/logger";
import { fetchExternalJson } from "./client";

interface BarcodeSpiderResponse {
  products?: Array<{
    barcode?: string;
    product_name?: string;
    brand?: string;
    category?: string;
    image_url?: string;
    ingredients_text?: string;
    countries?: string;
    nutriments?: Record<string, number>;
  }>;
  status?: string;
}

export async function lookupBarcodeSpider(barcode: string): Promise<ProductLookupResult | null> {
  try {
    const data = await fetchExternalJson<BarcodeSpiderResponse>(
      `https://api.barcodespider.com/v1/get?api_key=${process.env.BARCODE_SPIDER_API_KEY ?? ""}&barcode=${encodeURIComponent(barcode)}`,
      { timeoutMs: 8000 },
    );
    if (!data?.products?.length) return null;
    const p = data.products[0];
    if (!p?.product_name) return null;

    const product: ProductInfo = {
      id: "",
      barcode: barcode,
      name: p.product_name ?? `Product ${barcode}`,
      brand: p.brand ?? null,
      category: (p.category?.split(",")[0]?.trim().toLowerCase() ?? "food") as ProductInfo["category"],
      country: p.countries?.split(",")[0]?.trim() ?? null,
      servingSize: null,
      imageUrl: p.image_url ?? null,
      ingredientsRaw: p.ingredients_text ?? "",
      ingredientsNormalized: [],
      source: "barcode_spider",
      sourceUrl: null,
      verified: false,
      productDataConfidence: 0.6,
      isDemo: false,
    };

    const nutrients: ProductLookupResult["nutrition"] = (() => {
      const n = p.nutriments;
      if (!n) return null;
      const map: Array<[string, string]> = [
        ["calories", "energy-kcal_100g"],
        ["protein", "proteins_100g"],
        ["carbohydrates", "carbohydrates_100g"],
        ["sugars", "sugars_100g"],
        ["totalFat", "fat_100g"],
        ["saturatedFat", "saturated-fat_100g"],
        ["fiber", "fiber_100g"],
        ["sodium", "sodium_100g"],
      ];
      const nutrients: NonNullable<ProductLookupResult["nutrition"]>["nutrients"] = {};
      for (const [key, offKey] of map) {
        const value = n[offKey];
        if (typeof value === "number" && !Number.isNaN(value)) {
          nutrients[key] = { value, unit: key === "calories" ? "kcal" : "g", confidence: 0.6 };
        }
      }
      return Object.keys(nutrients).length ? { basis: "PER_100G", nutrients } : null;
    })();

    return { product, nutrition: nutrients ?? null, source: "barcode_spider" };
  } catch (error) {
    logger.warn("barcode_spider_lookup_failed", { barcode, error: String(error) });
    return null;
  }
}
