import type { NutritionFacts, ProductInfo } from "@/types/domain";
import { logger } from "@/lib/logger";
import { searchUsdaFoods, getUsdaFood, type UsdaFood } from "@/lib/external/usda";
import { ninjasNutrition, type NinjasNutritionItem } from "@/lib/external/api-ninjas";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";

/**
 * Nutrition fallback cascade.
 *
 * Order of resolution:
 *   1. Product already carries nutrition (local / Open Food Facts / curated)
 *   2. USDA FoodData Central  (search by product name)
 *   3. API Ninjas Nutrition   (query by product name)
 *   4. null  → "Insufficient Data"
 *
 * This module is only invoked when a resolved product has NO nutrition data.
 */

// USDA nutrient name → FoodGaurd nutrient key
const USDA_TO_KEY: Record<string, string> = {
  Energy: "calories",
  Protein: "protein",
  "Carbohydrate, by difference": "carbohydrates",
  "Total lipid (fat)": "totalFat",
  "Fatty acids, total saturated": "saturatedFat",
  "Fatty acids, total trans": "transFat",
  "Fiber, total dietary": "fiber",
  "Sugars, total including NLEA": "sugars",
  "Total Sugars": "sugars",
  "Sodium, Na": "sodium",
  "Potassium, K": "potassium",
  "Cholesterol": "cholesterol",
};

const NUTRIENT_UNITS = new Set(["KCAL", "G", "MG"]);

function unitFor(key: string, unitName?: string): string {
  if (key === "calories") return "kcal";
  const u = (unitName ?? "G").toUpperCase();
  return NUTRIENT_UNITS.has(u) ? u.toLowerCase() : "g";
}

function ninjasResultMatches(query: string, item: NinjasNutritionItem | null | undefined): boolean {
  if (!item) return false;
  const tokens = queryTokens(query);
  if (!tokens.length) return true;
  const name = (item.name ?? "").toLowerCase();
  return tokens.some((t) => name.includes(t));
}

function usdaToNutrition(food: UsdaFood): NutritionFacts | null {
  const nutrients: NutritionFacts["nutrients"] = {};
  for (const n of food.foodNutrients ?? []) {
    const key = n.nutrientName ? USDA_TO_KEY[n.nutrientName] : undefined;
    if (!key || typeof n.value !== "number") continue;
    nutrients[key] = { value: n.value, unit: unitFor(key, n.unitName), confidence: 0.55 };
  }
  if (!Object.keys(nutrients).length) return null;
  return normalizeNutritionFacts({ basis: "PER_100G", nutrients });
}

function ninjasToNutrition(items: NinjasNutritionItem[]): NutritionFacts | null {
  if (!items.length) return null;
  const item = items[0];
  const scale = item.serving_size_g > 0 ? 100 / item.serving_size_g : 1;
  const nutrients: NutritionFacts["nutrients"] = {};
  const map: Array<[string, number | undefined]> = [
    ["calories", item.calories],
    ["totalFat", item.fat_total_g],
    ["saturatedFat", item.fat_saturated_g],
    ["sodium", item.sodium_mg],
    ["potassium", item.potassium_mg],
    ["cholesterol", item.cholesterol_mg],
    ["carbohydrates", item.carbohydrates_total_g],
    ["fiber", item.fiber_g],
    ["sugars", item.sugar_g],
    ["protein", item.protein_g],
  ];
  for (const [key, value] of map) {
    if (typeof value === "number" && !Number.isNaN(value)) {
      nutrients[key] = {
        value: Math.round(value * scale * 100) / 100,
        unit: key === "calories" ? "kcal" : key === "sodium" || key === "potassium" || key === "cholesterol" ? "mg" : "g",
        confidence: 0.5,
      };
    }
  }
  if (!Object.keys(nutrients).length) return null;
  return normalizeNutritionFacts({ basis: "PER_100G", nutrients });
}

function searchQueryFor(product: ProductInfo): string {
  const brand = product.brand ? `${product.brand} ` : "";
  return `${brand}${product.name}`.trim();
}

const STOPWORDS = new Set([
  "food", "foods", "product", "real", "not", "with", "and", "for", "the",
  "brand", "snack", "item", "indian", "flavour", "flavor",
]);

function queryTokens(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.toLowerCase().replace(/[^a-z0-9]/gi, ""))
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/** USDA fuzzy-matches nonsense queries, so require a real keyword overlap. */
function usdaResultMatches(query: string, food: UsdaFood | null | undefined): boolean {
  if (!food) return false;
  const tokens = queryTokens(query);
  if (!tokens.length) return true; // query too generic to filter
  const description = (food.description ?? "").toLowerCase();
  return tokens.some((t) => description.includes(t));
}

/** Resolve nutrition for a product using the USDA → API Ninjas cascade. Returns null when all sources miss. */
export async function resolveNutritionCascade(product: ProductInfo): Promise<NutritionFacts | null> {
  const query = searchQueryFor(product);
  if (!query) return null;

  try {
    const usda = await searchUsdaFoods({ query, pageSize: 3 });
    const candidate = usda.foods?.[0];
    if (usdaResultMatches(query, candidate)) {
      const detail = candidate?.foodNutrients?.length ? candidate : candidate ? await getUsdaFood(String(candidate.fdcId)) : null;
      if (usdaResultMatches(query, detail)) {
        const nutrition = usdaToNutrition(detail ?? candidate);
        if (nutrition) return nutrition;
      }
    }
  } catch (error) {
    logger.warn("usda_nutrition_cascade_failed", { barcode: product.barcode, error: String(error) });
  }

  try {
    const items = await ninjasNutrition(query);
    if (ninjasResultMatches(query, items[0])) {
      const nutrition = ninjasToNutrition(items);
      if (nutrition) return nutrition;
    }
  } catch (error) {
    logger.warn("ninjas_nutrition_cascade_failed", { barcode: product.barcode, error: String(error) });
  }

  return null;
}