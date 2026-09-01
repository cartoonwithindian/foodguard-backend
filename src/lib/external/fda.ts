import { config } from "@/lib/config";
import { fetchExternalJson } from "./client";

export type FdaDrugEvent = {
  serious?: number;
  patient?: {
    drug?: Array<{
      medicinalproduct?: string;
      brand_name?: string;
      openfda?: { generic_name?: string[]; brand_name?: string[] };
    }>;
    reaction?: Array<{ reactionmeddrapt?: string }>;
  };
  receivedate?: string;
  seriousnessdeath?: string;
  seriousnessother?: string;
};

export type FdaFoodEnforcement = {
  product_description?: string;
  product_type?: string;
  classification?: string;
  reason_for_recall?: string;
  recalling_firm?: string;
  status?: string;
  recall_initiation_date?: string;
  distribution_pattern?: string;
  report_date?: string;
};

export type FdaDrugLabel = {
  id?: string;
  openfda?: { generic_name?: string[]; brand_name?: string[] };
  purpose?: string[];
  active_ingredient?: string[];
  warnings?: string[];
  indications_and_usage?: string[];
  dosage_and_administration?: string[];
};

export type FdaSearchResponse<T> = {
  meta?: { disclaimer?: string; last_updated?: string };
  results?: T[];
};

type FdaEndpoint = "drug/event" | "food/enforcement" | "drug/label";

async function fdaSearch<T>(endpoint: FdaEndpoint, search: string, limit: number): Promise<FdaSearchResponse<T>> {
  const url = new URL(`${config.external.fda.baseUrl}/${endpoint}.json`);
  if (search) url.searchParams.set("search", search);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 100)));
  return fetchExternalJson<FdaSearchResponse<T>>(url.toString());
}

/** FDA Adverse Event Reporting System (FAERS) drug event records. */
export function searchFdaDrugEvents(search: string, limit = 5): Promise<FdaSearchResponse<FdaDrugEvent>> {
  return fdaSearch<FdaDrugEvent>("drug/event", search, limit);
}

/** FDA food recall / enforcement reports. */
export function searchFdaFoodEnforcement(search: string, limit = 5): Promise<FdaSearchResponse<FdaFoodEnforcement>> {
  return fdaSearch<FdaFoodEnforcement>("food/enforcement", search, limit);
}

/** FDA drug product labels. */
export function searchFdaDrugLabels(search: string, limit = 5): Promise<FdaSearchResponse<FdaDrugLabel>> {
  return fdaSearch<FdaDrugLabel>("drug/label", search, limit);
}
