import { getStore } from "@/lib/store";
import {
  CATALOG_CATEGORIES,
  classifyCatalogCategory,
  normalizeProductImageUrl,
} from "@/lib/store/catalog";
import type { CatalogFilterInput, CatalogPageResult, CatalogProductItem, DbHealthReport } from "@/lib/store/catalog";
import { listAllIndianProducts } from "@/lib/india-dataset";
import {
  resolveProductImageUrl,
  resolveProductImageUrlByBarcode,
} from "@/lib/product-image-resolver";
import { scoreCatalogMatch, tokenizeCatalogQuery } from "@/lib/search/catalog-match";
import { logger } from "@/lib/logger";

/** Stable identity key used to deduplicate across the live DB and the bundled
 * India dataset. Prefers barcode; falls back to normalized name+brand so a
 * product that appears in both sources is shown only once. */
function identityKey(opts: { barcode?: string; name?: string; brand?: string | null }): string {
  const barcode = (opts.barcode ?? "").trim();
  if (barcode) return `b:${barcode}`;
  const name = (opts.name ?? "").trim().toLowerCase();
  const brand = (opts.brand ?? "").trim().toLowerCase();
  return `n:${name}|brand:${brand}`;
}

function categoryLabel(key: string): string {
  return CATALOG_CATEGORIES.find((c) => c.key === key)?.label ?? "Other";
}

function catalogItemSort(sort: string, items: CatalogProductItem[]): void {
  switch (sort) {
    case "name_asc":
      items.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name_desc":
      items.sort((a, b) => b.name.localeCompare(a.name));
      break;
    default:
      // "new" (and unknown sorts) preserve insertion / load order
      break;
  }
}

/**
 * Catalog browsing over the real FoodGuard product data.
 *
 * The catalog degrades to the active store's `searchProducts` result and pages
 * it in-process — same shape, same UI, no fake products either way.
 */
export async function listCatalog(input: CatalogFilterInput = {}): Promise<CatalogPageResult> {
  const store = getStore();
  logger.debug("catalog_list_started", {
    search: input.search ?? "",
    category: input.category ?? "all",
    sort: input.sort ?? "new",
    offset: input.offset ?? 0,
    limit: input.limit ?? 24,
    store: store.constructor.name,
  });

  const limit = Math.min(Math.max(input.limit ?? 24, 1), 50);
  const offset = Math.max(input.offset ?? 0, 0);
  const category = input.category ?? "all";

  // Live/store products (Supabase in production) plus the bundled India
  // dataset, deduplicated by identity so the same product never appears twice.
  const hits = await store.searchProducts(input.search ?? "", "all");
  const seen = new Set<string>();
  const items: CatalogProductItem[] = [];

  for (const { product } of hits) {
    const key = identityKey({ barcode: product.barcode, name: product.name, brand: product.brand });
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: product.id,
      name: product.name,
      brand: product.brand,
      barcode: product.barcode,
      category: classifyCatalogCategory(product.name),
      categoryLabel: product.category,
      imageUrl: normalizeProductImageUrl(
        normalizeProductImageUrl(product.imageUrl) ??
          resolveProductImageUrlByBarcode(product.barcode) ??
          resolveProductImageUrl(product.name, product.brand),
      ),
      packSize: null,
      price: null,
      source: product.source,
      cardCreatedAt: null,
      verified: product.verified,
      confidence: product.productDataConfidence,
      hasNutrition: false,
      hasIngredients: product.ingredientsRaw.length > 0,
      hasBarcode: product.barcode.length > 0,
    });
  }

  const searchTokens = tokenizeCatalogQuery(input.search ?? "");
  const datasetEntries = listAllIndianProducts();
  if (datasetEntries) {
    for (const entry of datasetEntries) {
      const { product } = entry;
      const key = identityKey({ barcode: product.barcode, name: product.name, brand: product.brand });
      if (seen.has(key)) continue;
      seen.add(key);
      const catKey = classifyCatalogCategory(product.name);
      items.push({
        id: product.id || `india_${product.barcode}`,
        name: product.name,
        brand: product.brand,
        barcode: product.barcode,
        category: catKey,
        categoryLabel: categoryLabel(catKey),
        imageUrl: normalizeProductImageUrl(
          normalizeProductImageUrl(product.imageUrl) ??
            resolveProductImageUrlByBarcode(product.barcode) ??
            resolveProductImageUrl(product.name, product.brand),
        ),
        packSize: null,
        price: null,
        source: product.source,
        cardCreatedAt: null,
        verified: product.verified,
        confidence: product.productDataConfidence,
        hasNutrition: entry.hasNutrition,
        hasIngredients: entry.hasIngredients,
        hasBarcode: product.barcode.length > 0,
      });
    }
  }

  if (searchTokens.length > 0) {
    // The whole query used to be matched as one literal substring against the
    // name alone, so "low sugar products" matched nothing and brand/barcode
    // hits from the store were thrown away.
    const filtered = items.filter((item) => {
      const { matched } = scoreCatalogMatch(searchTokens, {
        name: item.name,
        brand: item.brand,
        barcode: item.barcode,
      });
      return matched > 0;
    });
    items.length = 0;
    items.push(...filtered);
  }

  if (category !== "all") {
    const filtered = items.filter((i) => i.category === category);
    items.length = 0;
    items.push(...filtered);
  }

  // "Photos only": drop rows the resolver could not attach a photo to, so the
  // grid never shows a wall of "No image" placeholders.
  if (input.hasImage) {
    const filtered = items.filter((i) => typeof i.imageUrl === "string" && i.imageUrl.length > 0);
    items.length = 0;
    items.push(...filtered);
  }

  catalogItemSort(input.sort ?? "new", items);

  // Relevance first when searching: products matching every term outrank
  // single-term hits. Array#sort is stable, so the user's chosen sort stays
  // as the tiebreaker within the same relevance band.
  if (searchTokens.length > 0) {
    const relevance = new Map<string, { matched: number; score: number }>();
    for (const item of items) {
      relevance.set(item.id, scoreCatalogMatch(searchTokens, {
        name: item.name,
        brand: item.brand,
        barcode: item.barcode,
      }));
    }
    items.sort((a, b) => {
      const ra = relevance.get(a.id) ?? { matched: 0, score: 0 };
      const rb = relevance.get(b.id) ?? { matched: 0, score: 0 };
      if (rb.matched !== ra.matched) return rb.matched - ra.matched;
      return rb.score - ra.score;
    });
  }

  const categories = new Map<string, { key: string; label: string; count: number }>();
  for (const item of items) {
    const current = categories.get(item.category) ?? {
      key: item.category,
      label: item.category === "other" ? "Other" : item.category,
      count: 0,
    };
    current.count += 1;
    categories.set(item.category, current);
  }

  return {
    products: items.slice(offset, offset + limit),
    total: items.length,
    dbTotal: items.length,
    categories: Array.from(categories.values()).sort((a, b) => b.count - a.count),
  };
}

export async function dbHealthReport(): Promise<DbHealthReport | null> {
  return null;
}