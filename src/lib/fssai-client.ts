/**
 * FoodGuard FSSAI Regulatory API client.
 *
 * A typed, read-only HTTP client for the standalone FoodGuard FSSAI
 * Regulatory API (Python/FastAPI). The main FoodGuard app talks to that
 * service for regulatory facts — the 2,243 rules stay in the FSSAI dataset
 * (SQLite on the service side); nothing here embeds them in TypeScript.
 *
 * The client never throws on a failed/unavailable service for the read and
 * compliance helpers: callers get a typed result with
 * `serviceUnavailable: true` and no fabricated verdicts, so FoodGuard can
 * degrade gracefully (REVIEW_REQUIRED / SERVICE_UNAVAILABLE) instead of
 * crashing or reporting a false PASS.
 */

import { config } from "@/lib/config";
import { getCache } from "@/lib/cache";
import { logger } from "@/lib/logger";

// ── Normalized regulatory statuses ────────────────────────────────────────
// These mirror the FSSAI service's compliance statuses. `SERVICE_UNAVAILABLE`
// is a FoodGuard-internal state for when the FSSAI API could not be reached;
// it is not one of the official FSSAI statuses.
export type RegulatoryStatus =
  | "PASS"
  | "EXCEEDS_LIMIT"
  | "BELOW_MINIMUM"
  | "NO_APPLICABLE_LIMIT"
  | "REVIEW_REQUIRED"
  | "NO_APPLICABLE_RULE"
  | "CATEGORY_REQUIRED"
  | "LIMIT_LOOKUP"
  | "INACTIVE_RULE"
  | "NON_NUMERIC_LIMIT"
  | "UNIT_MISMATCH"
  | "SERVICE_UNAVAILABLE";

// ── Evidence / provenance ─────────────────────────────────────────────────

export interface FssaiEvidence {
  ruleId: string;
  regulation?: string | null;
  sourceDocument?: string | null;
  sourceUrl?: string | null;
  section?: string | null;
  table?: string | null;
  page?: string | null;
  sourceText?: string | null;
  confidence?: string | null;
  status?: string | null;
}

// ── Lookup entities ───────────────────────────────────────────────────────

export interface FssaiRule {
  ruleId: string;
  groupCode?: string | null;
  regulation?: string | null;
  regulationYear?: string | null;
  ruleType?: string | null;
  foodCategory?: string | null;
  product?: string | null;
  substance?: string | null;
  additiveName?: string | null;
  insNumber?: string | null;
  parameter?: string | null;
  operator?: string | null;
  limit?: string | null;
  unit?: string | null;
  limitType?: string | null;
  conditions?: string | null;
  status?: string | null;
  confidence?: string | null;
  sourceDocument?: string | null;
  sourceUrl?: string | null;
  sourceTable?: string | null;
  sourcePage?: string | null;
  effectiveDate?: string | null;
  jurisdiction?: string | null;
  authority?: string | null;
  [key: string]: unknown;
}

export interface FssaiAdditive {
  name?: string;
  insNumber?: string | null;
  functionalClass?: string | null;
  foodCategory?: string | null;
  maximumPermittedLevel?: string | null;
  limitType?: string | null;
  ruleCount?: number;
  [key: string]: unknown;
}

export interface FssaiContaminant {
  name?: string;
  ruleCount?: number;
  categories?: string[];
  [key: string]: unknown;
}

// ── Compliance result (single check) ──────────────────────────────────────

export interface FssaiComplianceCheck {
  status: string;
  message?: string;
  substance?: string | null;
  insNumber?: string | null;
  foodCategory?: string | null;
  detectedValue?: number | null;
  detectedUnit?: string | null;
  allowedLimit?: number | null;
  unit?: string | null;
  operator?: string | null;
  limitType?: string | null;
  ruleId?: string | null;
  regulation?: string | null;
  ruleType?: string | null;
  confidence?: string | null;
  effectiveStatus?: string | null;
  warnings?: Array<{ code?: string; message?: string }>;
  evidence?: FssaiEvidence[];
}

// ── Product compliance result (multi-entity) ──────────────────────────────

export interface FssaiProductCheckItem {
  type?: string;
  substance?: string;
  foodCategory?: string | null;
  detected?: number | null;
  allowed?: number | null;
  unit?: string | null;
  operator?: string | null;
  status: string;
  message?: string;
  ruleId?: string | null;
  confidence?: string | null;
  [key: string]: unknown;
}

export interface FssaiProductCompliance {
  productName?: string | null;
  foodCategory?: string | null;
  overallStatus: string;
  checks: FssaiProductCheckItem[];
  summary?: Record<string, number>;
  warnings?: Array<{ code?: string; message?: string }>;
  reviewRequired?: unknown[];
  evidence?: FssaiEvidence[];
}

// ── Type-safe client response wrapper ─────────────────────────────────────
// Every network-bound helper returns one of these so callers never need to
// handle fetch/JSON exceptions themselves.

export interface FssaiResponseOk<T> {
  ok: true;
  data: T;
}

export interface FssaiResponseErr {
  ok: false;
  /** True when the FSSAI service could not be reached (network / timeout). */
  serviceUnavailable: boolean;
  /** Stable error code when the service responded but with an error. */
  code?: string;
  message: string;
}

export type FssaiResponse<T> = FssaiResponseOk<T> | FssaiResponseErr;

// ── Configuration ─────────────────────────────────────────────────────────

const API_URL = (config.fssai.apiUrl || "http://127.0.0.1:8000").replace(/\/+$/, "");
const TIMEOUT_MS = config.fssai.timeoutMs || 10_000;
const LOOKUP_TTL = config.fssai.lookupCacheTtlSeconds || 3600;
const COMPLIANCE_TTL = 60; // measured amounts can change; keep short

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.fssai.apiKey) {
    h["Authorization"] = `Bearer ${config.fssai.apiKey}`;
  }
  return h;
}

// ── Response normalization ────────────────────────────────────────────────
// The FSSAI FastAPI service serializes responses in snake_case (e.g.
// `detected_value`, `allowed_limit`, `rule_id`). The typed client surfaces
// camelCase fields, so every successful payload is deep-converted key-by-key
// (array keys are preserved as-is; error payloads are read before conversion).

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

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<FssaiResponse<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

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
      logger.warn("fssai_api_error", {
        method,
        path,
        status: res.status,
        code: err?.code,
      });
      return {
        ok: false,
        serviceUnavailable: false,
        code: err?.code || `HTTP_${res.status}`,
        message: err?.message || `FSSAI service returned HTTP ${res.status}`,
      };
    }

    return { ok: true, data: camelize<T>(payload) };
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    logger.warn("fssai_api_unavailable", {
      method,
      path,
      timeout: isTimeout,
      error: String(error),
    });
    return {
      ok: false,
      serviceUnavailable: true,
      message: isTimeout
        ? "FSSAI service timed out"
        : "FSSAI service is unavailable",
    };
  }
}

// ── Read-only lookup helpers (cached) ─────────────────────────────────────

async function cachedGet<T>(cacheKey: string, path: string, ttl: number = LOOKUP_TTL): Promise<FssaiResponse<T>> {
  const cache = getCache();
  try {
    const hit = await cache.get<T>(cacheKey);
    if (hit) return { ok: true, data: hit };
  } catch {
    /* cache failures are non-fatal */
  }

  const res = await request<T>("GET", path);
  if (res.ok) {
    try {
      await cache.set(cacheKey, res.data, ttl);
    } catch {
      /* non-fatal */
    }
  }
  return res;
}

export interface AdditiveSearchQuery {
  q?: string;
  category?: string;
  limit?: number;
}

export interface ContaminantSearchQuery {
  q?: string;
  category?: string;
  limit?: number;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** GET /health — is the FSSAI service reachable and seeded? */
export async function checkHealth(): Promise<FssaiResponse<{
  status: string;
  rules: number;
  productsCount: number;
  additivesCount: number;
  categoriesCount: number;
  regulationsCount: number;
  apiVersion?: string;
  datasetVersion?: string;
}>> {
  return request<{
    status: string;
    rules: number;
    productsCount: number;
    additivesCount: number;
    categoriesCount: number;
    regulationsCount: number;
    apiVersion?: string;
    datasetVersion?: string;
  }>("GET", "/health");
}

/** GET /api/v1/rules/{ruleId} — a single normalized FSSAI rule. */
export async function getRule(ruleId: string): Promise<FssaiResponse<FssaiRule>> {
  return cachedGet<FssaiRule>(`fssai:rule:${ruleId}`, encodeURI(`/api/v1/rules/${ruleId}`));
}

/** GET /api/v1/evidence/{ruleId} — official source provenance for a rule. */
export async function getEvidence(ruleId: string): Promise<FssaiResponse<FssaiEvidence[]>> {
  return cachedGet<FssaiEvidence[]>(`fssai:evidence:${ruleId}`, encodeURI(`/api/v1/evidence/${ruleId}`));
}

/** GET /api/v1/additives — FPS&FA additives reference data. */
export async function searchAdditives(query?: AdditiveSearchQuery): Promise<FssaiResponse<FssaiAdditive[]>> {
  const q = query?.q ? `?q=${encodeURIComponent(query.q)}` : "";
  const cat = query?.category && !query.q ? `?category=${encodeURIComponent(query.category)}` : "";
  const path = `/api/v1/additives${q || cat}`;
  return cachedGet<FssaiAdditive[]>(`fssai:additives:${q}${cat}`, path);
}

/** GET /api/v1/contaminants — CTR contaminants reference data. */
export async function searchContaminants(query?: ContaminantSearchQuery): Promise<FssaiResponse<FssaiContaminant[]>> {
  const path = query?.q
    ? `/api/v1/contaminants/search?q=${encodeURIComponent(query.q)}`
    : "/api/v1/contaminants";
  return cachedGet<FssaiContaminant[]>(`fssai:contaminants:${query?.q ?? "all"}`, path);
}

/** GET /api/v1/categories — food categories reference data. */
export async function searchCategories(q?: string): Promise<FssaiResponse<string[]>> {
  const path = q
    ? `/api/v1/categories/search?q=${encodeURIComponent(q)}`
    : "/api/v1/categories";
  return cachedGet<string[]>(`fssai:categories:${q ?? "all"}`, path);
}

export interface CheckAdditiveInput {
  additive: string;
  foodCategory?: string;
  amount?: number;
  unit?: string;
}

/** POST /api/v1/check/additive — additive dose vs. applicable FSSAI limit. */
export async function checkAdditive(input: CheckAdditiveInput): Promise<FssaiResponse<FssaiComplianceCheck>> {
  return request<FssaiComplianceCheck>(
    "POST",
    "/api/v1/check/additive",
    {
      additive: input.additive,
      food_category: input.foodCategory,
      amount: input.amount,
      unit: input.unit ?? "mg/kg",
    },
  );
}

export interface CheckContaminantInput {
  substance: string;
  foodCategory?: string;
  amount?: number;
  unit?: string;
}

/** POST /api/v1/check/contaminant — contaminant level vs. FSSAI limit (or limit lookup). */
export async function checkContaminant(input: CheckContaminantInput): Promise<FssaiResponse<FssaiComplianceCheck>> {
  return request<FssaiComplianceCheck>(
    "POST",
    "/api/v1/check/contaminant",
    {
      substance: input.substance,
      food_category: input.foodCategory,
      amount: input.amount,
      unit: input.unit ?? "mg/kg",
    },
  );
}

export interface CheckProductInput {
  productName?: string;
  foodCategory?: string;
  ingredients?: string[];
  additives?: Array<{ name: string; amount?: number; unit?: string; insNumber?: string }>;
  contaminants?: Array<{ name: string; amount?: number; unit?: string; insNumber?: string }>;
}

/** POST /api/v1/check/product — multi-additive/contaminant product compliance (no health score). */
export async function checkProduct(input: CheckProductInput): Promise<FssaiResponse<FssaiProductCompliance>> {
  return request<FssaiProductCompliance>(
    "POST",
    "/api/v1/check/product",
    {
      product_name: input.productName,
      food_category: input.foodCategory,
      ingredients: input.ingredients ?? [],
      additives: (input.additives ?? []).map((a) => ({
        name: a.name,
        ins_number: a.insNumber,
        amount: a.amount,
        unit: a.unit ?? "mg/kg",
      })),
      contaminants: (input.contaminants ?? []).map((c) => ({
        name: c.name,
        ins_number: c.insNumber,
        amount: c.amount,
        unit: c.unit ?? "mg/kg",
      })),
    },
  );
}

/**
 * True when the FSSAI service is reachable and healthy. Returns false
 * (never throws) so callers can skip FSSAI work gracefully.
 */
let _healthy: boolean | null = null;
let _healthCheckedAt = 0;

export async function isFssaiAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_healthy !== null && now - _healthCheckedAt < 30_000) return _healthy;
  const res = await checkHealth();
  _healthy = res.ok && res.data?.status === "ok";
  _healthCheckedAt = now;
  return _healthy;
}

/** Reset cached availability (used by tests). */
export function resetFssaiAvailability(): void {
  _healthy = null;
  _healthCheckedAt = 0;
}
