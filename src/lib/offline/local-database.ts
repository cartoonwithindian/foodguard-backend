/**
 * Bundled offline product database — tiny on-purpose.
 *
 * Combines the curated demo seed products with a small deterministic subset
 * of the real Indian dataset (see scripts/build-offline-subset.mjs). Used by
 * the local-first resolution pipeline to answer barcode / name queries with
 * `resolutionSource: "local_database"` when offline, and as a pre-network
 * hint when online. Kept small so it bundles into client JS without bloat.
 */
import type { IdentifiedProduct, ProductSource } from "@/types/identification";
import { normalizeBarcode } from "@/types/identification";
import { PRODUCT_SEED } from "@/data/seed/products";
import { OFFLINE_PRODUCTS } from "@/data/offline-products";

type OfflineEntry = {
  barcode: string;
  name: string;
  brand: string;
  category: string;
  country: string;
  ingredientsRaw: string;
  source: string;
  confidence: number;
  verified: boolean;
  isDemo: boolean;
};

const byBarcode = new Map<string, OfflineEntry>();
const all: OfflineEntry[] = [];

function addEntry(entry: OfflineEntry): void {
  const clean = normalizeBarcode(entry.barcode);
  if (!clean) return;
  const existing = byBarcode.get(clean);
  if (existing && !existing.isDemo && entry.isDemo) return; // real data wins over demo
  byBarcode.set(clean, entry);
  all.push(entry);
}

for (const p of PRODUCT_SEED) {
  addEntry({
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    category: p.category,
    country: p.country ?? "IN",
    ingredientsRaw: p.ingredientsRaw ?? "",
    source: p.source,
    confidence: typeof p.confidence === "number" ? p.confidence : 0.8,
    verified: Boolean(p.verified),
    isDemo: Boolean(p.isDemo),
  });
}

for (const p of OFFLINE_PRODUCTS) {
  addEntry({
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    category: p.category,
    country: p.country ?? "IN",
    ingredientsRaw: p.ingredientsRaw ?? "",
    source: "indian_dataset",
    confidence: 0.8,
    verified: false,
    isDemo: false,
  });
}

function toIdentifiedProduct(entry: OfflineEntry, source: ProductSource): IdentifiedProduct {
  return {
    id: `offline-${entry.barcode}`,
    barcode: normalizeBarcode(entry.barcode),
    name: entry.name,
    brand: entry.brand,
    category: entry.category || "food",
    imageUrl: null,
    ingredientsRaw: entry.ingredientsRaw,
    source,
    sourceDetail: entry.source,
    confidence: Math.max(0, Math.min(1, entry.confidence)),
    isDemo: entry.isDemo,
    verified: entry.verified,
    resolutionSource: "local_database",
  };
}

/** Look up a barcode in the bundled offline database. */
export function lookupOfflineByBarcode(barcode: string): IdentifiedProduct | null {
  const clean = normalizeBarcode(barcode);
  if (!clean) return null;
  const entry = byBarcode.get(clean);
  return entry ? toIdentifiedProduct(entry, "barcode") : null;
}

/** Search the bundled offline database by name/brand substring. */
export function searchOfflineByName(query: string, limit = 12): IdentifiedProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<[string, IdentifiedProduct]> = [];
  for (const entry of all) {
    const name = entry.name.toLowerCase();
    const brand = entry.brand.toLowerCase();
    let score = 0;
    if (name === q || brand === q) score = 3;
    else if (name.startsWith(q) || brand.startsWith(q)) score = 2;
    else if (name.includes(q) || brand.includes(q)) score = 1;
    if (score === 0) continue;
    const product = toIdentifiedProduct(entry, "name_search");
    scored.push([`${score}-${entry.name}`, { ...product, confidence: entry.confidence * (score / 3) }]);
  }
  scored.sort((a, b) => {
    const scoreDiff = b[0].charCodeAt(0) - a[0].charCodeAt(0);
    return scoreDiff || a[1].name.localeCompare(b[1].name);
  });
  return scored.slice(0, limit).map(([, p]) => p);
}

/** Number of products available offline (for UI / diagnostics). */
export function offlineProductCount(): number {
  return all.length;
}