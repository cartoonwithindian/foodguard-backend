"use client";

import type { CatalogProductItem } from "@/lib/store/catalog";
import { catalogCache } from "@/lib/cache/catalog-cache";

/**
 * Client-side product search over the real FoodGuard data.
 *
 * Mirror of the catalog page pattern: reads from the on-device catalog cache
 * first (instant local results on slow/offline networks), then refreshes from
 * `/api/products` which searches the real FoodGuard SQLite database — never
 * the old mock search-data. Results keep a normalized `imageUrl` produced by
 * the backend, so the UI only ever renders images, never raw URLs.
 */

export type CatalogApiResponse = {
  success: boolean;
  data?: {
    products: CatalogProductItem[];
    total: number;
    dbTotal: number;
    page: number;
    limit: number;
    hasMore: boolean;
    categories: Array<{ key: string; label: string; count: number }>;
  };
  error?: { message?: string } | null;
};

export type CatalogSearchResult = {
  products: CatalogProductItem[];
  total: number;
  dbTotal: number;
  categories: Array<{ key: string; label: string; count: number }>;
  /** Current page number of `products`. */
  page: number;
  /** Whether more results exist beyond this page. */
  hasMore: boolean;
  /** True when the products were served from the on-device cache. */
  fromCache: boolean;
};

export type SearchRequestOptions = {
  query: string;
  category?: string;
  sort?: string;
  limit?: number;
  /** 1-based page number. Page 1 is cache-first; later pages always hit the network. */
  page?: number;
  signal?: AbortSignal;
};

/** Normalize a free-text query: trim, lowercase, collapse whitespace, strip dashes. */
export function normalizeSearchQuery(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*&\s*|\band\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collapse repeated products that surface from the real catalog. The reference
 * data contains legitimate duplicate rows (the same product imported from
 * multiple sources, sharing a barcode or an identical name), so a single
 * search page can render several identical cards and a "load more" append can
 * show repeats. Deduping by barcode (falling back to a normalized name, then
 * id) keeps one card per distinct product while preserving the API order.
 */
export function dedupeCatalogProducts(
  products: CatalogProductItem[],
): CatalogProductItem[] {
  const seen = new Set<string>();
  const out: CatalogProductItem[] = [];
  for (const product of products) {
    const key = product.barcode?.trim()
      ? `bc:${product.barcode.trim().toLowerCase()}`
      : product.name?.trim()
        ? `name:${product.name.trim().toLowerCase()}`
        : `id:${product.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(product);
  }
  return out;
}

/**
 * Search the real catalog with cache-first reads (stale-while-revalidate).
 * Returns the cached result immediately when present, then refreshes in the
 * background and resolves with the fresh /api/products payload.
 */
export async function searchCatalogProducts(
  options: SearchRequestOptions,
): Promise<CatalogSearchResult> {
  const query = normalizeSearchQuery(options.query);
  const category = options.category ?? "all";
  const sort = options.sort ?? "new";
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 50);
  const page = Math.max(options.page ?? 1, 1);
  const signal = options.signal;

  // Later pages (infinite scroll / load-more) always hit the network; the
  // on-device cache only holds the first page of each query.
  if (page > 1) {
    const fresh = await fetchRemote(query, category, sort, limit, page, signal);
    if (!fresh) {
      return { products: [], total: 0, dbTotal: 0, categories: [], page, hasMore: false, fromCache: false };
    }
    return fresh;
  }

  // Keep a snapshot so parallel searches never clobber each other's outcome.
  const cached = await catalogCache().get(query, category, sort);
  if (cached && cached.data.products.length > 0) {
    // Serve local results immediately, then refresh in the background.
    const refresh = fetchRemote(query, category, sort, limit, 1, signal);
    void refresh.then(async (freshData) => {
      if (!freshData) return;
      await catalogCache().save(query, category, sort, {
        products: freshData.products,
        total: freshData.total,
        dbTotal: freshData.dbTotal,
        categories: freshData.categories,
        fetchedAt: Date.now(),
      });
    }).catch(() => {
      /* offline — keep showing the cached result */
    });

    return {
      products: cached.data.products,
      total: cached.data.total,
      dbTotal: cached.data.dbTotal,
      categories: cached.data.categories,
      page: 1,
      hasMore: cached.data.products.length < cached.data.total,
      fromCache: true,
    };
  }

  const fresh = await fetchRemote(query, category, sort, limit, page, signal);
  if (!fresh) {
    return { products: [], total: 0, dbTotal: 0, categories: [], page, hasMore: false, fromCache: false };
  }
  if (fresh.products.length > 0) {
    await catalogCache().save(query, category, sort, {
      products: fresh.products,
      total: fresh.total,
      dbTotal: fresh.dbTotal,
      categories: fresh.categories,
      fetchedAt: Date.now(),
    });
  }
  return fresh;
}

async function fetchRemote(
  query: string,
  category: string,
  sort: string,
  limit: number,
  page: number,
  signal?: AbortSignal,
): Promise<CatalogSearchResult | null> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    category,
    sort,
  });
  if (query) params.set("search", query);

  try {
    const response = await fetch(`/api/products?${params.toString()}`, { signal });
    const json = (await response.json()) as CatalogApiResponse;
    if (!response.ok || !json.success || !json.data) {
      throw new Error(json.error?.message ?? "Product search failed");
    }
    const data = json.data;
    return {
      products: data.products,
      total: data.total,
      dbTotal: data.dbTotal,
      categories: data.categories,
      page: data.page,
      hasMore: data.hasMore,
      fromCache: false,
    };
  } catch (error) {
    if (signal?.aborted) return null;
    throw error;
  }
}