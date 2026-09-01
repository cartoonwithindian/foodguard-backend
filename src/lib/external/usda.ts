import { config } from "@/lib/config";
import { fetchExternalJson } from "./client";

export type UsdaFood = {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string | null;
  gtinUpc?: string | null;
  foodCategory?: string | null;
  ingredients?: string | null;
  servingSize?: number | null;
  foodNutrients?: Array<{
    nutrientName?: string;
    value?: number;
    unitName?: string;
  }>;
};

export type UsdaSearchResponse = {
  totalHits: number;
  currentPage: number;
  totalPages: number;
  foods: UsdaFood[];
};

export type UsdaFoodSearchOptions = {
  query: string;
  pageSize?: number;
  pageNumber?: number;
  dataType?: string[];
};

/** Search USDA FoodData Central. Requires USDA_FDC_API_KEY. */
export async function searchUsdaFoods(options: UsdaFoodSearchOptions): Promise<UsdaSearchResponse> {
  const url = new URL(`${config.external.usdaFdc.baseUrl}/foods/search`);
  url.searchParams.set("api_key", config.external.usdaFdc.apiKey);
  url.searchParams.set("query", options.query);
  url.searchParams.set("pageSize", String(options.pageSize ?? 10));
  if (options.pageNumber) url.searchParams.set("pageNumber", String(options.pageNumber));
  if (options.dataType?.length) url.searchParams.set("dataType", options.dataType.join(","));
  return fetchExternalJson<UsdaSearchResponse>(url.toString());
}

/** Get a single food by its USDA FDC ID. */
export async function getUsdaFood(fdcId: string): Promise<UsdaFood | null> {
  const url = new URL(`${config.external.usdaFdc.baseUrl}/food/${encodeURIComponent(fdcId)}`);
  url.searchParams.set("api_key", config.external.usdaFdc.apiKey);
  try {
    return await fetchExternalJson<UsdaFood>(url.toString());
  } catch {
    return null;
  }
}
