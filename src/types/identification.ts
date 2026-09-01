/**
 * Shared types for the unified product-identification flow.
 *
 * Every input path (barcode scan, name search, product photo / OCR, manual
 * barcode) resolves into one of these shapes, which then flows into the
 * existing Product Analysis pipeline (`/api/analyze`).
 */

/** Where a product was identified from. */
export type ProductSource =
  | "barcode" // live camera / uploaded barcode image
  | "manual_barcode" // barcode typed in manually
  | "name_search" // product-name / brand search
  | "photo_ocr" // product photo + OCR identification
  | "fallback"; // resolved through a fallback match

/** Where a resolution came from in the local-first pipeline. */
export type ResolutionSource =
  | "local_cache" // served from the on-device (IndexedDB) cache
  | "local_database" // matched against bundled/offline product data
  | "network" // resolved live through the FoodGuard API
  | "fallback"; // user-confirmed / best-effort fallback match

/** A normalized product after resolution, ready for analysis. */
export type IdentifiedProduct = {
  id: string;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  imageUrl?: string | null;
  ingredientsRaw?: string;
  nutrition?: Record<string, unknown> | null;
  /** Primary source of this resolution. */
  source: ProductSource;
  /** Lower-level provenance, e.g. "indian_dataset", "google", "ocr". */
  sourceDetail?: string;
  /** 0..1 how confident we are in this identification. */
  confidence: number;
  isDemo?: boolean;
  verified?: boolean;
  /** Provenance in the local-first pipeline (cache / bundle / network). */
  resolutionSource?: ResolutionSource;
  /** Epoch ms when this resolution was produced (cache metadata preserved). */
  cachedAt?: number;
};

/** Information extracted from a product photo / OCR run. */
export type ExtractedInfo = {
  barcode?: string;
  productName?: string;
  brand?: string;
  ocrText?: string;
  ingredientsText?: string;
  nutrition?: Record<string, unknown> | null;
  ocrConfidence?: number;
  needsReview?: boolean;
  imageUrl?: string | null;
};

export type ProductResolution =
  | {
      status: "resolved";
      product: IdentifiedProduct;
      extracted?: ExtractedInfo;
    }
  | {
      status: "candidates";
      candidates: IdentifiedProduct[];
      query?: string;
      extracted?: ExtractedInfo;
    }
  | {
      status: "not_found";
      query?: string;
      barcode?: string;
      extracted?: ExtractedInfo;
    }
  | {
      status: "error";
      /** User-friendly message (not an HTTP code). */
      message: string;
      extracted?: ExtractedInfo;
    };

/** Validates + normalizes a raw barcode string, returns "" when invalid. */
export function normalizeBarcode(value: string): string {
  return value.trim().replace(/\D/g, "");
}