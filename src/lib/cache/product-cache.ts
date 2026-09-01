/**
 * On-device product cache (IndexedDB in browsers, memory elsewhere).
 *
 * Cached products are served instantly (offline-friendly) and refreshed in
 * the background via the stale-while-revalidate helpers in resolve-product.
 *
 * Provenance from the cache (`resolutionSource: "local_cache"`) is metadata
 * about HOW the product was found — it never lowers `product.confidence`.
 */
import type { IdentifiedProduct, ResolutionSource } from "@/types/identification";
import { normalizeBarcode } from "@/types/identification";
import { STORE_PRODUCTS, getStorage } from "@/lib/offline/storage";
import type { StorageAdapter, StorageRecord } from "@/lib/offline/storage";

export interface ProductCacheRecord extends StorageRecord {
  product: IdentifiedProduct;
  /** How this product was originally resolved (cache provenance). */
  resolutionSource: ResolutionSource;
  /** Epoch ms after which the record is stale (serve + background refresh). */
  staleAt: number;
}

export const PRODUCT_CACHE_VERSION = 1;
export const PRODUCT_FRESH_MS = 30 * 24 * 60 * 60 * 1000; // keep 30 days fresh
export const PRODUCT_EXPIRY_MS = 120 * 24 * 60 * 60 * 1000; // hard expiry ~120 days

export type ProductStaleness = "fresh" | "stale" | "expired";

export function productCacheKey(barcode: string): string {
  return `barcode:${normalizeBarcode(barcode)}`;
}

export function productIdKey(id: string): string {
  return `id:${id}`;
}

export function productStaleness(record: ProductCacheRecord): ProductStaleness {
  const now = Date.now();
  if (now > record.expiresAt) return "expired";
  if (now > record.staleAt) return "stale";
  return "fresh";
}

export function isStaleRecord(record: ProductCacheRecord): boolean {
  return productStaleness(record) !== "fresh";
}

function buildRecord(
  product: IdentifiedProduct,
  resolutionSource: ResolutionSource,
  now = Date.now(),
): ProductCacheRecord {
  return {
    product,
    resolutionSource,
    version: PRODUCT_CACHE_VERSION,
    updatedAt: now,
    staleAt: now + PRODUCT_FRESH_MS,
    expiresAt: now + PRODUCT_EXPIRY_MS,
  };
}

class ProductCache {
  private adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  async getByBarcode(barcode: string): Promise<ProductCacheRecord | null> {
    const clean = normalizeBarcode(barcode);
    if (!clean) return null;
    try {
      const record = await this.adapter.get<ProductCacheRecord>(STORE_PRODUCTS, productCacheKey(clean));
      if (!record) return null;
      if (productStaleness(record) === "expired") {
        await this.adapter.del(STORE_PRODUCTS, productCacheKey(clean));
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  async getById(id: string): Promise<ProductCacheRecord | null> {
    if (!id) return null;
    try {
      const record = await this.adapter.get<ProductCacheRecord>(STORE_PRODUCTS, productIdKey(id));
      if (!record) return null;
      if (productStaleness(record) === "expired") {
        await this.adapter.del(STORE_PRODUCTS, productIdKey(id));
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  /**
   * Store a product under both its barcode and id keys. Returns the stored
   * record so callers can inspect freshness.
   */
  async save(
    product: IdentifiedProduct,
    resolutionSource: ResolutionSource,
    now = Date.now(),
  ): Promise<ProductCacheRecord | null> {
    const record = buildRecord(product, resolutionSource, now);
    try {
      if (product.barcode) {
        await this.adapter.set(STORE_PRODUCTS, productCacheKey(product.barcode), record);
      }
      if (product.id) {
        await this.adapter.set(STORE_PRODUCTS, productIdKey(product.id), record);
      }
      return record;
    } catch {
      return null;
    }
  }

  /** Minimal local search over cached products (name/brand substring match). */
  async searchCached(query: string, limit = 20): Promise<ProductCacheRecord[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    try {
      const all = await this.adapter.getAll<ProductCacheRecord>(STORE_PRODUCTS);
      const hits: ProductCacheRecord[] = [];
      for (const { value } of all) {
        if (!value || productStaleness(value) === "expired") continue;
        const { product } = value;
        const name = (product.name ?? "").toLowerCase();
        const brand = (product.brand ?? "").toLowerCase();
        if (name.includes(q) || brand.includes(q)) {
          hits.push(value);
        }
      }
      return hits.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
    } catch {
      return [];
    }
  }

  async invalidateBarcode(barcode: string): Promise<void> {
    const clean = normalizeBarcode(barcode);
    if (!clean) return;
    try {
      await this.adapter.del(STORE_PRODUCTS, productCacheKey(clean));
    } catch {
      /* ignore */
    }
  }

  async invalidateProduct(id: string): Promise<void> {
    if (!id) return;
    try {
      await this.adapter.del(STORE_PRODUCTS, productIdKey(id));
    } catch {
      /* ignore */
    }
  }

  async clear(): Promise<void> {
    try {
      await this.adapter.clear(STORE_PRODUCTS);
    } catch {
      /* ignore */
    }
  }

  count(): Promise<number> {
    return this.adapter
      .getAll<unknown>(STORE_PRODUCTS)
      .then((rows) => rows.length)
      .catch(() => 0);
  }
}

let instance: ProductCache | null = null;

/** Shared cache instance bound to the current storage adapter. */
export function getProductCache(): ProductCache {
  if (!instance) instance = new ProductCache(getStorage());
  return instance;
}

/** Test hook: re-bind the shared cache to a controlled adapter. */
export function setProductCacheForTesting(adapter: StorageAdapter | null): void {
  instance = adapter ? new ProductCache(adapter) : null;
}

/** Convenience handle mirroring getProductCache(). */
export function productCache(): ProductCache {
  return getProductCache();
}