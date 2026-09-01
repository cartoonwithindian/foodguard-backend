/**
 * Legal Metrology API client.
 *
 * Calls the standalone Legal Metrology FastAPI service to run
 * compliance checks on product label images.
 *
 * The service must be running at LEGAL_METROLOGY_API_URL (default http://127.0.0.1:8000).
 */

import { logger } from "@/lib/logger";
import type {
  LegalMetrologyResult,
  LegalMetrologyHealth,
  LegalMetrologyVersion,
} from "./types";

const API_URL =
  process.env.LEGAL_METROLOGY_API_URL || "http://127.0.0.1:8001";
const API_PREFIX = "/api/v1/legal-metrology";
const TIMEOUT_MS = 120_000; // 2 minutes for image processing

// ── Health check ───────────────────────────────────────────────────────────

export async function checkHealth(): Promise<LegalMetrologyHealth | null> {
  try {
    const res = await fetch(`${API_URL}${API_PREFIX}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as LegalMetrologyHealth;
  } catch {
    return null;
  }
}

// ── Version info ───────────────────────────────────────────────────────────

export async function getVersion(): Promise<LegalMetrologyVersion | null> {
  try {
    const res = await fetch(`${API_URL}${API_PREFIX}/version`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as LegalMetrologyVersion;
  } catch {
    return null;
  }
}

// ── Analyze (images → AI extraction → rule engine) ─────────────────────────

export interface AnalyzeOptions {
  images: Array<{ buffer: Buffer; filename: string; mime: string }>;
  productName?: string;
  sourceType?: string;
  country?: string;
  productCategory?: string;
}

export async function analyze(
  options: AnalyzeOptions,
): Promise<LegalMetrologyResult> {
  const formData = new FormData();

  for (const img of options.images) {
    const uint8 = new Uint8Array(img.buffer);
    const blob = new Blob([uint8], { type: img.mime });
    formData.append("images", blob, img.filename);
  }

  if (options.productName) formData.append("product_name", options.productName);
  if (options.sourceType) formData.append("source_type", options.sourceType);
  if (options.country) formData.append("country", options.country);
  if (options.productCategory)
    formData.append("product_category", options.productCategory);

  const res = await fetch(`${API_URL}${API_PREFIX}/analyze`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = await res.json();

  if (!res.ok) {
    const err = body as { error?: { code: string; message: string } };
    throw new LegalMetrologyApiError(
      err.error?.code || "UNKNOWN",
      err.error?.message || `HTTP ${res.status}`,
    );
  }

  return body as LegalMetrologyResult;
}

// ── Validate (structured extraction → rule engine only, no AI) ─────────────

export interface ValidateOptions {
  product: Record<string, unknown>;
  extraction: {
    fields: Array<{
      field: string;
      raw_text: string | null;
      normalized_value: unknown;
      unit: string | null;
      confidence: number;
      image_id: string | null;
      bbox: [number, number, number, number] | null;
      status: "FOUND" | "NOT_FOUND" | "UNCERTAIN";
    }>;
  };
  measurements?: Record<string, unknown>;
  asOfDate?: string;
}

export async function validate(
  options: ValidateOptions,
): Promise<LegalMetrologyResult> {
  const body: Record<string, unknown> = {
    product: options.product,
    extraction: options.extraction,
    measurements: options.measurements || {},
  };
  if (options.asOfDate) body.as_of_date = options.asOfDate;

  const res = await fetch(`${API_URL}${API_PREFIX}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const resp = await res.json();

  if (!res.ok) {
    const err = resp as { error?: { code: string; message: string } };
    throw new LegalMetrologyApiError(
      err.error?.code || "UNKNOWN",
      err.error?.message || `HTTP ${res.status}`,
    );
  }

  return resp as LegalMetrologyResult;
}

// ── Convenience: check if the service is available ─────────────────────────

let _available: boolean | null = null;

export async function isServiceAvailable(): Promise<boolean> {
  if (_available !== null) return _available;
  try {
    const health = await checkHealth();
    _available = health?.status === "ok";
    if (_available) {
      logger.info("legal_metrology_service_available", { url: API_URL });
    } else {
      logger.warn("legal_metrology_service_unavailable", { url: API_URL });
    }
  } catch (error) {
    _available = false;
    logger.warn("legal_metrology_health_check_failed", { url: API_URL, error: String(error) });
  }
  return _available;
}

/** Reset availability cache (for testing or after service restart). */
export function resetAvailabilityCache(): void {
  _available = null;
}

// Periodically re-check availability so the client recovers when the
// Legal Metrology service restarts after a failure.
let _recheckTimer: ReturnType<typeof setInterval> | null = null;

function ensureRecheckInterval(): void {
  if (_recheckTimer !== null) return;
  _recheckTimer = setInterval(() => {
    // Only re-check when currently marked unavailable
    if (_available === false) {
      _available = null; // reset so next check actually pings
      void isServiceAvailable();
    }
  }, 30_000); // every 30 seconds
  // Don't let the timer keep the process alive
  if (_recheckTimer && typeof _recheckTimer === "object" && "unref" in _recheckTimer) {
    _recheckTimer.unref();
  }
}

// Start recheck on module load (server-side only)
if (typeof process !== "undefined") {
  ensureRecheckInterval();
}

// ── Error class ────────────────────────────────────────────────────────────

export class LegalMetrologyApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(`Legal Metrology API: [${code}] ${message}`);
    this.name = "LegalMetrologyApiError";
  }
}
