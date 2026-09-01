/**
 * FoodGuard Visual Product Search API client.
 *
 * A typed, read-only HTTP client for the standalone FoodGuard Visual Product
 * Search API (Python/FastAPI, CLIP + FAISS). Given an uploaded image, it
 * returns top-K visually-similar products.
 *
 * The client never throws on a failed/unavailable service: callers receive a
 * typed result with `ok: false` and `serviceUnavailable: true`, so scanning
 * can degrade gracefully (similar products are simply omitted) instead of
 * crashing or blocking the scan.
 */

import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────

export interface VisualSearchResult {
  rank: number;
  productName: string;
  productId?: string;
  score: number;
  imagePath?: string;
}

export interface VisualSearchResponseOk {
  ok: true;
  query: string;
  results: VisualSearchResult[];
}

export interface VisualSearchResponseErr {
  ok: false;
  /** True when the visual search service could not be reached. */
  serviceUnavailable: boolean;
  code?: string;
  message: string;
}

export type VisualSearchResponse = VisualSearchResponseOk | VisualSearchResponseErr;

// ── Configuration ─────────────────────────────────────────────────────────

const API_URL = (config.visualSearch.apiUrl || "http://127.0.0.1:8001").replace(/\/+$/, "");
const TIMEOUT_MS = config.visualSearch.timeoutMs || 30_000;

function headers(includeAuth: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (includeAuth && config.visualSearch.apiKey) {
    h["Authorization"] = `Bearer ${config.visualSearch.apiKey}`;
  }
  return h;
}

// ── Response normalization ────────────────────────────────────────────────
// The FastAPI service serializes results in snake_case (`product_name`,
// `product_id`, `image_path`). Surface camelCase fields instead.

function toCamelKey(key: string): string {
  return key.replace(/([-_][a-zA-Z0-9])/g, (m) => m[1].toUpperCase());
}

/** Deep-convert object keys from snake_case/kebab-case to camelCase. */
function camelize<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((v) => camelize(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[toCamelKey(k)] = camelize(v);
    }
    return out as T;
  }
  return value as unknown as T;
}

// ── Search by image embedding vector ──────────────────────────────────────
// The CLIP embedding is produced client-side (transformers.js); the backend
// only runs FAISS search against the 512-d IndexFlatL2 index.

/**
 * Send a raw 512-d CLIP image embedding to the visual search service and
 * return top-K similar products. Never throws — returns `{ ok: false,
 * serviceUnavailable: true }` when the service is down, and `{ ok: false,
 * code, message }` on a service error response.
 */
export async function searchByVector(
  vector: number[],
  topK = 5,
  options?: { signal?: AbortSignal },
): Promise<VisualSearchResponse> {
  try {
    const res = await fetch(`${API_URL}/api/v1/search_by_vector`, {
      method: "POST",
      headers: { ...headers(true), "Content-Type": "application/json" },
      body: JSON.stringify({ vector, top_k: topK }),
      signal: options?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
    return await normalizeResponse(res);
  } catch (error) {
    return toUnavailable(error);
  }
}

// ── Search by uploaded image ──────────────────────────────────────────────

/**
 * Upload an image to the visual search service and return top-K similar
 * products. Never throws — returns `{ ok: false, serviceUnavailable: true }`
 * when the service is down, and `{ ok: false, code, message }` on a service
 * error response.
 */
export async function searchSimilarByImage(
  data: ArrayBuffer | Uint8Array<ArrayBuffer>,
  filename = "image.jpg",
  mimeType = "image/jpeg",
  topK = 5,
  options?: { signal?: AbortSignal },
): Promise<VisualSearchResponse> {
  try {
    const body = new FormData();
    body.append("image", new Blob([data], { type: mimeType }), filename);
    body.append("top_k", String(topK));

    const res = await fetch(`${API_URL}/api/v1/search`, {
      method: "POST",
      headers: headers(true),
      body,
      signal: options?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
    return await normalizeResponse(res);
  } catch (error) {
    return toUnavailable(error);
  }
}

async function normalizeResponse(res: Response): Promise<VisualSearchResponse> {
  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const err = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    logger.warn("visual_search_api_error", {
      status: res.status,
      code: err?.code,
    });
    return {
      ok: false,
      serviceUnavailable: false,
      code: err?.code || `HTTP_${res.status}`,
      message: err?.message || `Visual search service returned HTTP ${res.status}`,
    };
  }

  const parsed = camelize<{ query?: string; results?: VisualSearchResult[] }>(payload ?? {});
  return { ok: true, query: parsed.query ?? "", results: parsed.results ?? [] };
}

function toUnavailable(error: unknown): VisualSearchResponse {
  const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
  logger.warn("visual_search_api_unavailable", {
    timeout: isTimeout,
    error: String(error),
  });
  return {
    ok: false,
    serviceUnavailable: true,
    message: isTimeout ? "Visual search service timed out" : "Visual search service is unavailable",
  };
}

// ── Health probe ──────────────────────────────────────────────────────────

/**
 * Return whether the visual search service is ready (no auth required).
 * Never throws — returns false when unreachable.
 */
export async function visualSearchAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, {
      headers: headers(false),
      signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, 5_000)),
    });
    if (!res.ok) return false;
    const data = camelize<{ runtimeReady?: boolean }>(await res.json());
    return data.runtimeReady === true;
  } catch {
    return false;
  }
}
