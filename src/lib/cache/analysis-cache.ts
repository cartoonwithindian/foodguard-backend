/**
 * Cached Product Analysis results (IndexedDB in browsers, memory elsewhere).
 *
 * Analysis output is tied to the ingredient-scoring / AI pipeline, so it is
 * versioned: when {@link ANALYSIS_CACHE_VERSION} changes (algorithm upgrade)
 * previously cached results are treated as expired and re-fetched.
 */
import type { ProductAnalysisResult } from "@/data/analysis-data";
import { normalizeBarcode } from "@/types/identification";
import { STORE_ANALYSIS, getStorage } from "@/lib/offline/storage";
import type { StorageAdapter, StorageRecord } from "@/lib/offline/storage";

export interface AnalysisCacheRecord extends StorageRecord {
  key: string;
  result: ProductAnalysisResult;
  /** Epoch ms after which the record is stale (serve + background refresh). */
  staleAt: number;
}

export const ANALYSIS_CACHE_VERSION = 2; // v2: replaced old 0–100 score with new FoodGuard 0–5 four-component score
export const ANALYSIS_FRESH_MS = 7 * 24 * 60 * 60 * 1000; // serve fresh for 7 days
export const ANALYSIS_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // hard expiry 30 days

/**
 * Stable cache key for an analysis request. Barcode wins over a name —
 * the same product scan should reuse the cached result.
 */
export function analysisCacheKey(barcode?: string, productName?: string): string | null {
  const clean = normalizeBarcode(barcode ?? "");
  if (clean) return `b:${clean}`;
  const name = (productName ?? "").trim().toLowerCase();
  return name ? `n:${name}` : null;
}

export type AnalysisStaleness = "fresh" | "stale" | "expired";

export function analysisStaleness(record: AnalysisCacheRecord): AnalysisStaleness {
  const now = Date.now();
  if (record.version !== ANALYSIS_CACHE_VERSION) return "expired";
  if (now > record.expiresAt) return "expired";
  if (now > record.staleAt) return "stale";
  return "fresh";
}

export function isAnalysisStale(record: AnalysisCacheRecord): boolean {
  return analysisStaleness(record) !== "fresh";
}

function buildRecord(key: string, result: ProductAnalysisResult, now = Date.now()): AnalysisCacheRecord {
  return {
    key,
    result,
    version: ANALYSIS_CACHE_VERSION,
    updatedAt: now,
    staleAt: now + ANALYSIS_FRESH_MS,
    expiresAt: now + ANALYSIS_EXPIRY_MS,
  };
}

class AnalysisCache {
  private adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  async get(key: string): Promise<AnalysisCacheRecord | null> {
    try {
      const record = await this.adapter.get<AnalysisCacheRecord>(STORE_ANALYSIS, key);
      if (!record) return null;
      if (analysisStaleness(record) === "expired") {
        await this.adapter.del(STORE_ANALYSIS, key);
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  async save(key: string, result: ProductAnalysisResult, now = Date.now()): Promise<AnalysisCacheRecord | null> {
    const record = buildRecord(key, result, now);
    try {
      await this.adapter.set(STORE_ANALYSIS, key, record);
      return record;
    } catch {
      return null;
    }
  }

  async invalidate(key: string): Promise<void> {
    try {
      await this.adapter.del(STORE_ANALYSIS, key);
    } catch {
      /* ignore */
    }
  }

  async clear(): Promise<void> {
    try {
      await this.adapter.clear(STORE_ANALYSIS);
    } catch {
      /* ignore */
    }
  }
}

let instance: AnalysisCache | null = null;

export function getAnalysisCache(): AnalysisCache {
  if (!instance) instance = new AnalysisCache(getStorage());
  return instance;
}

/** Test hook: re-bind the shared cache to a controlled adapter. */
export function setAnalysisCacheForTesting(adapter: StorageAdapter | null): void {
  instance = adapter ? new AnalysisCache(adapter) : null;
}

export function analysisCache(): AnalysisCache {
  return getAnalysisCache();
}