/**
 * On-device catalog cache (IndexedDB in browsers, memory in tests).
 *
 * Serves the previously fetched catalog page instantly when the network is
 * unavailable, and powers stale-while-revalidate refreshes when online.
 * The product data it stores is exactly what `/api/products` returned — the
 * same real FoodGuard DB rows, never fabricated.
 */
import type { CatalogProductItem } from "@/lib/store/catalog";
import { STORE_CATALOG, getStorage } from "@/lib/offline/storage";
import type { StorageAdapter, StorageRecord } from "@/lib/offline/storage";

export type CatalogCacheValue = {
  products: CatalogProductItem[];
  total: number;
  dbTotal: number;
  categories: Array<{ key: string; label: string; count: number }>;
  /** Epoch ms when this stale-while-revalidate entry was fetched. */
  fetchedAt: number;
};

export interface CatalogCacheRecord extends StorageRecord {
  data: CatalogCacheValue;
}

export const CATALOG_CACHE_VERSION = 1;
export const CATALOG_FRESH_MS = 12 * 60 * 60 * 1000; // 12 hours considered fresh
export const CATALOG_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // hard expiry ~30 days

export function catalogCacheKey(search: string, category: string, sort: string): string {
  return `catalog:${encodeURIComponent(search.trim().toLowerCase())}:${category}:${sort}`;
}

class CatalogCache {
  private adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  private isExpired(record: CatalogCacheRecord): boolean {
    return Date.now() > record.expiresAt;
  }

  async get(
    search: string,
    category: string,
    sort: string,
  ): Promise<CatalogCacheRecord | null> {
    const key = catalogCacheKey(search, category, sort);
    try {
      const record = await this.adapter.get<CatalogCacheRecord>(STORE_CATALOG, key);
      if (!record) return null;
      if (this.isExpired(record)) {
        await this.adapter.del(STORE_CATALOG, key);
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  async save(
    search: string,
    category: string,
    sort: string,
    data: CatalogCacheValue,
    now = Date.now(),
  ): Promise<void> {
    const record: CatalogCacheRecord = {
      data,
      version: CATALOG_CACHE_VERSION,
      updatedAt: now,
      expiresAt: now + CATALOG_EXPIRY_MS,
    };
    try {
      await this.adapter.set(STORE_CATALOG, catalogCacheKey(search, category, sort), record);
    } catch {
      /* ignore */
    }
  }

  async clear(): Promise<void> {
    try {
      await this.adapter.clear(STORE_CATALOG);
    } catch {
      /* ignore */
    }
  }
}

let instance: CatalogCache | null = null;

export function getCatalogCache(): CatalogCache {
  if (!instance) instance = new CatalogCache(getStorage());
  return instance;
}

export function setCatalogCacheForTesting(adapter: StorageAdapter | null): void {
  instance = adapter ? new CatalogCache(adapter) : null;
}

export function catalogCache(): CatalogCache {
  return getCatalogCache();
}