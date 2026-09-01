import { config } from "@/lib/config";
import { fetchExternalJson } from "./client";

export type WhoIndicator = {
  IndicatorCode: string;
  IndicatorName: string;
  Language: string;
  [key: string]: unknown;
};

export type WhoIndicatorsResponse = {
  value: WhoIndicator[];
};

/** List WHO Global Health Observatory indicators. */
export async function whoIndicators(top = 20): Promise<WhoIndicatorsResponse> {
  const url = new URL(`${config.external.who.baseUrl}/Indicator`);
  url.searchParams.set("$top", String(Math.min(Math.max(top, 1), 100)));
  return fetchExternalJson<WhoIndicatorsResponse>(url.toString());
}
