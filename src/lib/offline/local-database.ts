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
import { lookupIndianProductByBarcode, searchIndianProducts, getIndianDatasetStats, listAllIndianProducts } from "@/lib/india-dataset";
import { logger } from "@/lib/logger";

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
};

const byBarcode = new Map<string, OfflineEntry>();
const all: OfflineEntry[] = [];

function addEntry(entry: OfflineEntry): void {
  const clean = normalizeBarcode(entry.barcode);
  if (!clean) return;
  byBarcode.set(clean, entry);
  all.push(entry);
}

// Load Indian products into the offline database
async function loadIndianProductsIntoOfflineDb(): Promise<void> {
  const indianProducts = await listAllIndianProducts();
  if (indianProducts) {
    for (const entry of indianProducts) {
      addEntry({
        barcode: entry.product.barcode,
        name: entry.product.name,
        brand: entry.product.brand ?? "",
        category: entry.product.category,
        country: entry.product.country ?? "",
        ingredientsRaw: entry.product.ingredientsRaw,
        source: entry.product.source,
        confidence: entry.product.productDataConfidence,
        verified: entry.product.verified,
      });
    }
    logger.info("offline_db_populated", { count: indianProducts.length });
  }
}

// Initialize the offline database when the module imports
loadIndianProductsIntoOfflineDb().then(() => {
  logger.info("offline_db_initialized", { count: offlineProductCount() });
}).catch((err) => {
  logger.warn("offline_db_init_error", { error: String(err) });
});

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