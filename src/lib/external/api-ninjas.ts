import { config } from "@/lib/config";
import { fetchExternalJson } from "./client";
import { logger } from "@/lib/logger";

/**
 * CalorieNinjas / API Ninjas Nutrition API.
 *
 * CalorieNinjas is being migrated to API Ninjas (same API shape,
 * same response format, new base URL + key). Both endpoints return
 * `{ "items": [...] }` and use the same `X-Api-Key` header.
 *
 * Endpoint: GET /v1/nutrition?query=<food text>
 * Docs note: without an explicit quantity the default is 100 grams.
 */
export type NinjasNutritionItem = {
  name: string;
  calories: number;
  serving_size_g: number;
  fat_total_g: number;
  fat_saturated_g: number;
  sodium_mg: number;
  potassium_mg: number;
  cholesterol_mg: number;
  carbohydrates_total_g: number;
  fiber_g: number;
  sugar_g: number;
  protein_g: number;
};

type NinjasNutritionResponse = { items: NinjasNutritionItem[] };

/**
 * Query the nutrition API for a food/product name.
 * Tries API Ninjas first (migration target), then falls back to
 * CalorieNinjas (current home of this key). Returns [] when the
 * provider is unreachable, unkeyed, or the key is rejected.
 */
export async function ninjasNutrition(query: string): Promise<NinjasNutritionItem[]> {
  if (!config.external.apiNinjas.apiKey) return [];

  const attempt = async (baseUrl: string): Promise<NinjasNutritionItem[]> => {
    const url = new URL(`${baseUrl}/nutrition`);
    url.searchParams.set("query", query);
    try {
      const data = await fetchExternalJson<NinjasNutritionResponse>(url.toString(), {
        headers: { "X-Api-Key": config.external.apiNinjas.apiKey },
      });
      return data?.items ?? [];
    } catch (error) {
      logger.warn("ninjas_nutrition_provider_failed", {
        baseUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  };

  const apiNinjas = await attempt(config.external.apiNinjas.baseUrl);
  if (apiNinjas.length) return apiNinjas;

  if (config.external.apiNinjas.calorieninjasBaseUrl !== config.external.apiNinjas.baseUrl) {
    const calorieninjas = await attempt(config.external.apiNinjas.calorieninjasBaseUrl);
    if (calorieninjas.length) return calorieninjas;
  }

  return [];
}