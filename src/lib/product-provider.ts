import type { ProductInfo, NutritionFacts } from "@/types/domain";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { AppError, ErrorCodes } from "@/lib/errors";
import { getCache } from "@/lib/cache";
import { getStore } from "@/lib/store";
import { buildNutrition } from "@/data/seed/products-frontend";
import {
  CURATED_PRODUCT_SEED,
  buildCuratedNutrition,
} from "@/data/seed/products-curated";
import { resolveNutritionCascade } from "@/lib/nutrition/cascade";
import { lookupIndianProductByBarcode, searchIndianProducts } from "@/lib/india-dataset";
import { lookupBarcodeSpider } from "@/lib/external/barcode-spider";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";

/**
 * Product / barcode data provider abstraction.
 *  - mock: bundled demo dataset (works offline)
 *  - openfoodfacts: Open Food Facts API (free)
 */

export interface ProductLookupResult {
  product: ProductInfo | null;
  nutrition: NutritionFacts | null;
  source: string;
}

export interface ProductDataProvider {
  lookupByBarcode(barcode: string): Promise<ProductLookupResult>;
}

function toProductInfo(input: {
  barcode: string;
  name: string;
  brand: string | null;
  category: string;
  country: string | null;
  servingSize: string | null;
  imageUrl: string | null;
  ingredientsRaw: string;
  source: string;
  sourceUrl: string | null;
  verified: boolean;
  isDemo: boolean;
  confidence: number;
}): ProductInfo {
  return {
    id: "",
    barcode: input.barcode,
    name: input.name,
    brand: input.brand,
    category: (input.category as ProductInfo["category"]) ?? "food",
    country: input.country,
    servingSize: input.servingSize,
    imageUrl: input.imageUrl,
    ingredientsRaw: input.ingredientsRaw,
    ingredientsNormalized: [],
    source: input.source,
    sourceUrl: input.sourceUrl,
    verified: input.verified,
    productDataConfidence: input.confidence,
    isDemo: input.isDemo,
  };
}

class MockProductProvider implements ProductDataProvider {
  async lookupByBarcode(barcode: string): Promise<ProductLookupResult> {
    const store = getStore();
    const found = await store.getProductByBarcode(barcode);
    if (found) return { product: found, nutrition: await store.getNutritionForProduct(found.id), source: "bundled_demo_dataset" };
    return { product: null, nutrition: null, source: "bundled_demo_dataset" };
  }
}

class OpenFoodFactsProvider implements ProductDataProvider {
  async lookupByBarcode(barcode: string): Promise<ProductLookupResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
        { signal: controller.signal, headers: { "User-Agent": "FoodGaurdAI/0.1 (hackathon demo)" } },
      );
      if (!response.ok) return { product: null, nutrition: null, source: "openfoodfacts" };
      const json = (await response.json()) as {
        product?: {
          product_name?: string;
          brands?: string;
          categories?: string;
          countries?: string;
          image_url?: string;
          serving_size?: string;
          ingredients_text?: string;
          nutrient_levels?: unknown;
          nutriments?: Record<string, number>;
        };
        status?: number;
      };
      if (!json.product || json.status !== 1 || !json.product.product_name) {
        return { product: null, nutrition: null, source: "openfoodfacts" };
      }
      const p = json.product;
      const product = toProductInfo({
        barcode,
        name: p.product_name ?? `Product ${barcode}`,
        brand: p.brands ?? null,
        category: (p.categories?.split(",")[0] ?? "food").trim().toLowerCase(),
        country: p.countries?.split(",")[0]?.trim() ?? null,
        servingSize: p.serving_size ?? null,
        imageUrl: p.image_url ?? null,
        ingredientsRaw: p.ingredients_text ?? "",
        source: "Open Food Facts",
        sourceUrl: `https://world.openfoodfacts.org/product/${barcode}`,
        verified: false,
        isDemo: false,
        confidence: 0.7,
      });

      const nutrients: NutritionFacts["nutrients"] = {};
      const n = p.nutriments ?? {};
      const map: Array<[string, string]> = [
        ["calories", "energy-kcal_100g"],
        ["protein", "proteins_100g"],
        ["carbohydrates", "carbohydrates_100g"],
        ["sugars", "sugars_100g"],
        ["totalFat", "fat_100g"],
        ["saturatedFat", "saturated-fat_100g"],
        ["transFat", "trans-fat_100g"],
        ["fiber", "fiber_100g"],
        ["sodium", "sodium_100g"],
      ];
      for (const [key, offKey] of map) {
        const value = n[offKey];
        if (typeof value === "number" && !Number.isNaN(value)) {
          nutrients[key] = { value, unit: key === "calories" ? "kcal" : key === "sodium" ? "g" : "g", confidence: 0.7 };
        }
      }
      const nutrition: NutritionFacts | null = Object.keys(nutrients).length
        ? normalizeNutritionFacts({ basis: "PER_100G", nutrients })
        : null;

      return { product, nutrition, source: "openfoodfacts" };
    } catch (error) {
      logger.warn("openfoodfacts_lookup_failed", { barcode, error: String(error) });
      throw new AppError(ErrorCodes.EXTERNAL_PROVIDER_ERROR, "Product database lookup failed");
    } finally {
      clearTimeout(timer);
    }
  }
}

let instance: ProductDataProvider | null = null;

/** Reset the cached provider singleton — for tests only. */
export function resetProductProviderForTesting(): void {
  instance = null;
}

function curatedLookup(barcode: string): ProductLookupResult | null {
  const seed = CURATED_PRODUCT_SEED.find((c) => c.barcode === barcode);
  if (!seed) return null;
  const product = toProductInfo({
    barcode,
    name: seed.name,
    brand: seed.brand,
    category: seed.category,
    country: seed.country ?? null,
    servingSize: seed.servingSize ?? null,
    imageUrl: seed.imageUrl ?? null,
    ingredientsRaw: seed.ingredientsRaw,
    source: seed.source,
    sourceUrl: seed.sourceUrl ?? null,
    verified: seed.verified,
    isDemo: false,
    confidence: seed.confidence,
  });
  return { product, nutrition: buildCuratedNutrition(seed.nutrition), source: "curated" };
}

export function getProductProvider(): ProductDataProvider {
  if (!instance) {
    instance = config.productData.provider === "openfoodfacts" ? new OpenFoodFactsProvider() : new MockProductProvider();
  }
  return instance;
}

/**
 * The barcode pipeline: local database -> cache -> external provider -> store.
 * Never invents data; returns null when nothing is found.
 */
export async function lookupProductByBarcode(barcode: string): Promise<ProductLookupResult> {
  const cache = getCache();
  const cached = await cache.get<ProductLookupResult>(`product:${barcode}`);
  if (cached) return cached;

  const indianResult = await lookupIndianProductByBarcode(barcode);
  if (indianResult?.product) {
    const store = getStore();
    const saved = await store.saveProductFromProvider(indianResult);
    const enriched = await enrichWithCascade(saved);
    await cache.set(`product:${barcode}`, enriched, 3600);
    return enriched;
  }

  const store = getStore();
  const local = await store.getProductByBarcode(barcode);
  if (local) {
    const nutrition = await store.getNutritionForProduct(local.id);
    const result = await enrichWithCascade({
      product: local,
      nutrition,
      source: local.source,
    });
    await cache.set(`product:${barcode}`, result, 3600);
    return result;
  }

  const external = await getProductProvider().lookupByBarcode(barcode);
  if (external.product) {
    const saved = await store.saveProductFromProvider(external);
    const enriched = await enrichWithCascade(saved);
    await cache.set(`product:${barcode}`, enriched, 3600);
    return enriched;
  }

  const spiderResult = await lookupBarcodeSpider(barcode);
  if (spiderResult?.product) {
    const saved = await store.saveProductFromProvider(spiderResult);
    const enriched = await enrichWithCascade(saved);
    await cache.set(`product:${barcode}`, enriched, 3600);
    return enriched;
  }

  const curated = curatedLookup(barcode);
  if (curated) {
    const saved = await store.saveProductFromProvider(curated);
    await cache.set(`product:${barcode}`, saved, 3600);
    return saved;
  }

  return { product: null, nutrition: null, source: "none" };
}

/**
 * Fill in missing nutrition using the USDA → API Ninjas cascade.
 *
 * For high-confidence local products (Indian dataset, curated), the cascade
 * is run as a NON-BLOCKING background task so it never delays the main
 * product response. The result is cached for subsequent requests.
 */
async function enrichWithCascade(result: ProductLookupResult): Promise<ProductLookupResult> {
  if (result.nutrition || !result.product) return result;

  const isLocalHighConfidence =
    result.source === "indian_dataset" ||
    result.source === "curated" ||
    result.source === "bundled_demo_dataset";

  if (isLocalHighConfidence) {
    // Fire-and-forget: resolve nutrition in the background so the main
    // response returns immediately. The cache will pick it up next time.
    void resolveNutritionCascade(result.product).then((nutrition) => {
      if (nutrition) {
        logger.info("nutrition_cascade_filled_background", {
          barcode: result.product!.barcode,
          source: result.source,
        });
        // Write back to cache for future requests
        getCache().set(`product:${result.product!.barcode}`, { ...result, nutrition }, 3600).catch(() => {});
      }
    }).catch((error) => {
      logger.warn("nutrition_cascade_background_failed", {
        barcode: result.product!.barcode,
        error: String(error),
      });
    });
    return result;
  }

  // For external/unknown sources, block on the cascade (best-effort)
  const nutrition = await resolveNutritionCascade(result.product);
  if (!nutrition) return result;
  logger.info("nutrition_cascade_filled", {
    barcode: result.product.barcode,
    source: result.source,
  });
  return { ...result, nutrition };
}

export { buildNutrition };
