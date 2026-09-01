import { AppError, ErrorCodes } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ProductLookupResult } from "./types";

/**
 * Lenient barcode pre-flight check used before ANY adapter is called.
 *
 * Deliberately does not enforce the EAN checksum: a real-world scanned code
 * with a corrupted checksum digit should still be looked up (and simply come
 * back as not found) rather than rejected outright.
 */
export function isValidBarcodeFormat(barcode: string): boolean {
  return /^\d{8,14}$/.test(barcode);
}

/**
 * Field-level confidence floor. Adapters are free to report a lower
 * confidence for ambiguous data, in which case the orchestrator keeps
 * looking.
 */
export const MIN_CONFIDENCE = 0.5;

/** Results whose (guessed) source site is a barcode database itself. */
const BARCODE_LOOKUP_DOMAINS = [
  "barcode-list.com",
  "barcodesdatabase.org",
  "barcodespider.com",
  "upcitemdb.com",
  "barcodelookup.com",
];

function isBarcodeLookupDomain(domain: string): boolean {
  return BARCODE_LOOKUP_DOMAINS.some(
    (d) => domain === d || domain.endsWith(`.${d}`),
  );
}

/**
 * Validation rules applied to every adapter result before it is accepted:
 *
 * 1. Barcode matches the requested barcode (when the source reports one).
 * 2. A product name OR enough identifying information (brand + category)
 *    is present.
 * 3. The result is not an obviously unrelated/generic page.
 * 4. Confidence meets the minimum threshold.
 */
export function validateLookupResult(
  result: ProductLookupResult,
  requestedBarcode: string,
): { valid: boolean; reason?: string } {
  if (!result || result.found !== true) {
    return { valid: false, reason: "not_found" };
  }
  if (result.confidence < MIN_CONFIDENCE) {
    return { valid: false, reason: `confidence_below_minimum` };
  }
  if (result.barcode && result.barcode !== requestedBarcode) {
    return {
      valid: false,
      reason: `barcode_mismatch (${result.barcode} != ${requestedBarcode})`,
    };
  }

  const name = (result.name ?? "").trim();
  const brand = (result.brand ?? "").trim();
  const category = (result.category ?? "").trim();

  if (name.length < 2 && (brand.length < 2 || category.length < 2)) {
    return { valid: false, reason: "insufficient_identifying_info" };
  }

  // Reject obvious test/placeholder entries that pollute public datasets
  // (e.g. OpenFoodFacts' "Diagnostic Test Product DELETE ME").
  if (/^(test|dummy|sample|placeholder)\b/i.test(name) ||
      /(test product|test item|delete me|dummy|placeholder|do not use|diagnostic)/i.test(name)) {
    return { valid: false, reason: "test_or_placeholder_entry" };
  }

  const lower = `${name} ${brand} ${category}`.toLowerCase();
  for (const junk of [
    "not found",
    "no results",
    "page not found",
    "search results",
    "just a moment",
  ]) {
    if (lower.includes(junk) && name.length < 12) {
      return { valid: false, reason: `generic_page (${junk})` };
    }
  }

  return { valid: true };
}

/**
 * Merge a secondary source into a primary result. Fills ONLY missing fields;
 * never overwrites higher-confidence primary data. When both sources carry a
 * conflicting value for the same field, the base (primary) wins.
 */
export function mergeLookupResults(
  base: ProductLookupResult,
  extra: ProductLookupResult,
): ProductLookupResult {
  const merged: ProductLookupResult = { ...base };
  const fields: Array<keyof ProductLookupResult> = [
    "name",
    "brand",
    "category",
    "ingredients",
    "nutrition",
    "allergens",
    "imageUrl",
  ];
  for (const field of fields) {
    const baseValue = base[field];
    const extraValue = extra[field];
    const baseEmpty =
      baseValue === undefined ||
      baseValue === null ||
      (typeof baseValue === "string" && baseValue.trim().length === 0) ||
      (Array.isArray(baseValue) && baseValue.length === 0) ||
      (typeof baseValue === "object" &&
        !Array.isArray(baseValue) &&
        Object.keys(baseValue as Record<string, unknown>).length === 0);
    if (baseEmpty && !(extraValue === undefined || extraValue === null)) {
      (merged as unknown as Record<string, unknown>)[field] = extraValue;
    }
  }
  return merged;
}

/**
 * Run an adapter defensively: any failure (timeout, HTTP error, malformed
 * HTML/JSON) is logged with source + reason and never propagates.
 */
export async function runAdapterSafely(
  key: string,
  adapter: (() => Promise<ProductLookupResult>) | undefined,
  barcode: string,
): Promise<ProductLookupResult | null> {
  if (!adapter) return null;
  try {
    return await adapter();
  } catch (error) {
    logger.warn("product_lookup_adapter_failed", {
      source: key,
      barcode,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function rejectInvalidBarcode(barcode: string): string {
  const clean = (barcode ?? "").trim();
  if (!isValidBarcodeFormat(clean)) {
    logger.info("product_lookup_invalid_barcode_rejected", { barcode: clean });
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid barcode format");
  }
  return clean;
}

export { isBarcodeLookupDomain };