/**
 * Product lookup fallback chain — shared types.
 *
 * The chain runs adapters in strict order: primary -> google -> barcode-list
 * -> barcodesdatabase -> barcodespider -> ocr-google. Each adapter returns a
 * normalized ProductLookupResult; the orchestrator validates, merges and
 * caches results. See index.ts.
 */

export interface ProductLookupResult {
  found: boolean;
  barcode: string;
  name?: string;
  brand?: string;
  category?: string;
  ingredients?: string;
  nutrition?: Record<string, unknown>;
  allergens?: string[];
  imageUrl?: string;
  source: string;
  confidence: number;
  rawData?: unknown;
}

export interface LookupContext {
  /** Product name already known (e.g. from OCR / user input). */
  productName?: string;
  /** Raw OCR text of a label (ingredients list etc.). */
  ocrText?: string;
}

export type LookupAdapter = (
  barcode: string,
  ctx: LookupContext,
) => Promise<ProductLookupResult>;

export type AdapterKey =
  | "primary"
  | "google"
  | "barcode-list"
  | "barcodesdatabase"
  | "barcodespider"
  | "ocr-google";

export const NOT_FOUND_RESULT: Omit<ProductLookupResult, "barcode"> = {
  found: false,
  source: "none",
  confidence: 0,
};

export const ADAPTER_ORDER: AdapterKey[] = [
  "primary",
  "google",
  "barcode-list",
  "barcodesdatabase",
  "barcodespider",
  "ocr-google",
];

/** Adapter ordering for field-enrichment of an already-found product. */
export const ENRICHMENT_ORDER: AdapterKey[] = [
  "google",
  "barcode-list",
  "barcodesdatabase",
  "barcodespider",
];