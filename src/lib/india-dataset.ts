import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { ProductInfo, NutritionFacts } from "@/types/domain";
import type { ProductLookupResult } from "@/lib/product-provider";
import { logger } from "@/lib/logger";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";

// ── Raw compact types matching the JSON ──────────────────────
type RawNutrients = Record<string, number>;

type RawProduct = {
  b: string;
  n: string;
  br: string | null;
  c: string | null;
  co: string | null;
  ig: string | null;
  igTags: string | null;
  nut: RawNutrients | null;
  sv: string | null;
  all: string | null;
  add: string | null;
  nova: number | null;
  in: boolean;
};

// ── Lazy-loaded dataset state ────────────────────────────────
let products: RawProduct[] | null = null;
let barcodeIndex: Record<string, number> | null = null;
let nameIndex: Record<string, number[]> | null = null;

const DATASET_DIR = join(process.cwd(), "src", "data", "india-dataset");

function loadJsonFile<T>(label: string, filename: string): T | null {
  try {
    const filepath = join(DATASET_DIR, filename);
    if (!existsSync(filepath)) {
      logger.warn("india_dataset_file_missing", { file: label, path: filepath });
      return null;
    }
    const raw = readFileSync(filepath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.warn("india_dataset_load_failed", { file: label, error: String(error) });
    return null;
  }
}

function ensureLoaded(): boolean {
  if (products && barcodeIndex && nameIndex) return true;

  const rawProducts = loadJsonFile<RawProduct[]>("products", "products-india.json");
  if (!rawProducts) return false;
  products = rawProducts;

  const rawBarcode = loadJsonFile<Record<string, number>>("barcode-index", "barcode-index.json");
  barcodeIndex = rawBarcode ?? {};

  const rawName = loadJsonFile<Record<string, string>>("name-index", "name-index.json");
  // name-index.json stores values as space-separated strings of indices
  nameIndex = {};
  if (rawName) {
    for (const [trigram, value] of Object.entries(rawName)) {
      if (typeof value === "string") {
        nameIndex[trigram] = value.split(" ").map(Number).filter((n) => !Number.isNaN(n));
      } else if (Array.isArray(value)) {
        nameIndex[trigram] = value;
      }
    }
  }

  logger.info("india_dataset_loaded", {
    totalProducts: products.length,
    barcodesIndexed: Object.keys(barcodeIndex).length,
    trigrams: Object.keys(nameIndex).length,
  });
  return true;
}

// ── Nutrient mapping ─────────────────────────────────────────
// OFF keys in the compact format (no _100g suffix) -> NutritionFacts keys
const NUTRIENT_MAP: Array<[string, string, string]> = [
  ["energy-kcal", "calories", "kcal"],
  ["energy-kj", "energyKj", "kJ"],
  ["proteins", "protein", "g"],
  ["carbohydrates", "carbohydrates", "g"],
  ["sugars", "sugars", "g"],
  ["added-sugars", "addedSugars", "g"],
  ["fat", "totalFat", "g"],
  ["saturated-fat", "saturatedFat", "g"],
  ["trans-fat", "transFat", "g"],
  ["fiber", "fiber", "g"],
  // The compact Indian dataset follows Open Food Facts conventions: sodium is grams per 100g.
  // Normalize it to milligrams only after preserving this source unit.
  ["sodium", "sodium", "g"],
  ["salt", "salt", "g"],
];

const NUTRITION_CONFIDENCE = 0.6;

function convertNutriments(raw: RawNutrients | null): NutritionFacts | null {
  if (!raw) return null;

  const nutrients: NutritionFacts["nutrients"] = {};
  for (const [offKey, factKey, unit] of NUTRIENT_MAP) {
    const value = raw[offKey];
    if (typeof value === "number" && !Number.isNaN(value)) {
      nutrients[factKey] = { value, unit, confidence: NUTRITION_CONFIDENCE };
    }
  }
  return Object.keys(nutrients).length > 0
    ? normalizeNutritionFacts({ basis: "PER_100G", nutrients })
    : null;
}

// ── Product normalization ────────────────────────────────────
const PRODUCT_CONFIDENCE = 0.6;

function normalizeProduct(raw: RawProduct): ProductInfo {
  return {
    id: "",
    barcode: raw.b,
    name: raw.n ?? `Product ${raw.b}`,
    brand: raw.br ?? null,
    category: "food",
    country: raw.co ?? null,
    servingSize: raw.sv ?? null,
    imageUrl: null,
    ingredientsRaw: raw.ig ?? "",
    ingredientsNormalized: [],
    source: "indian_dataset",
    sourceUrl: "https://world.openfoodfacts.org",
    verified: false,
    productDataConfidence: PRODUCT_CONFIDENCE,
    isDemo: false,
  };
}

function toLookupResult(raw: RawProduct): ProductLookupResult {
  return {
    product: normalizeProduct(raw),
    nutrition: convertNutriments(raw.nut),
    source: "indian_dataset",
  };
}

// ── Public API ───────────────────────────────────────────────

/**
 * Look up an Indian product by barcode.
 * Returns null if not found or dataset cannot be loaded.
 */
export function lookupIndianProductByBarcode(
  barcode: string,
): ProductLookupResult | null {
  if (!ensureLoaded()) return null;

  const index = barcodeIndex![barcode];
  if (index === undefined || index === null) return null;

  const raw = products![index];
  if (!raw) return null;

  return toLookupResult(raw);
}

// ── Name search ──────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function makeTrigrams(text: string): string[] {
  const lower = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (lower.length < 3) return [lower];
  const tris: string[] = [];
  for (let i = 0; i <= lower.length - 3; i++) {
    tris.push(lower.slice(i, i + 3));
  }
  return tris;
}

function scoreProduct(queryLower: string, nameLower: string): number {
  // Exact match
  if (nameLower === queryLower) return 100;
  // Starts with query
  if (nameLower.startsWith(queryLower)) return 90;
  // Contains query as substring
  if (nameLower.includes(queryLower)) return 70;

  // Word-level scoring
  const queryWords = tokenize(queryLower);
  const nameWords = tokenize(nameLower);
  if (queryWords.length === 0 || nameWords.length === 0) return 0;

  let matchedWords = 0;
  for (const qw of queryWords) {
    for (const nw of nameWords) {
      if (nw === qw || nw.startsWith(qw) || qw.startsWith(nw)) {
        matchedWords++;
        break;
      }
    }
  }

  // All name words found in query → strong match even if query has extras
  let nameMatched = 0;
  for (const nw of nameWords) {
    for (const qw of queryWords) {
      if (nw === qw || nw.startsWith(qw) || qw.startsWith(nw)) {
        nameMatched++;
        break;
      }
    }
  }
  const nameCoverage = nameWords.length > 0 ? nameMatched / nameWords.length : 0;
  if (nameCoverage >= 1) return 80; // all DB name words present in query
  if (nameCoverage >= 0.75) return 65;

  const wordOverlap = matchedWords / queryWords.length;
  if (wordOverlap >= 1) return 60;
  if (wordOverlap >= 0.5) return 40;
  if (matchedWords > 0) return 20;

  // Trigram Jaccard similarity (fallback)
  const queryTris = makeTrigrams(queryLower);
  const nameTris = makeTrigrams(nameLower);
  const nameTriSet = new Set(nameTris);
  let intersection = 0;
  for (const t of queryTris) {
    if (nameTriSet.has(t)) intersection++;
  }
  const union = new Set([...queryTris, ...nameTris]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  return Math.round(jaccard * 15);
}

/**
 * Search Indian products by name.
 * Uses trigram index for fast candidate lookup, then scores results.
 */
export function searchIndianProducts(
  query: string,
  limit = 10,
): Array<{ product: ProductInfo; score: number }> {
  if (!ensureLoaded() || !query.trim()) return [];

  const queryLower = query.toLowerCase().trim();
  const queryTokens = tokenize(queryLower);

  if (queryTokens.length === 0) return [];

  // Gather candidate indices from trigram index
  const candidateCounts = new Map<number, number>();
  for (const token of queryTokens) {
    const tris = makeTrigrams(token);
    for (const tri of tris) {
      const indices = nameIndex![tri];
      if (!indices) continue;
      for (const idx of indices) {
        candidateCounts.set(idx, (candidateCounts.get(idx) ?? 0) + 1);
      }
    }
  }

  // Score candidates — prioritise those matching more trigrams
  const scored: Array<{ product: ProductInfo; score: number }> = [];

  // Sort candidates by match count descending, take top candidates for scoring
  const sortedIndices = [...candidateCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit * 5)
    .map(([idx]) => idx);

  for (const idx of sortedIndices) {
    const raw = products![idx];
    if (!raw) continue;

    const s = scoreProduct(queryLower, (raw.n ?? "").toLowerCase());
    if (s > 0) {
      scored.push({ product: normalizeProduct(raw), score: s });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Return stats about the loaded dataset.
 */
export function getIndianDatasetStats(): {
  totalProducts: number;
  barcodesIndexed: number;
} {
  if (!ensureLoaded()) return { totalProducts: 0, barcodesIndexed: 0 };
  return {
    totalProducts: products!.length,
    barcodesIndexed: Object.keys(barcodeIndex!).length,
  };
}

// ── Catalog listing ──────────────────────────────────────────

export type IndianCatalogEntry = {
  product: ProductInfo;
  /** Raw dataset category string (may be empty). */
  category: string;
  hasNutrition: boolean;
  hasIngredients: boolean;
};

/**
 * Return every product in the bundled Indian dataset as lightweight catalog
 * entries. Used by the catalog service so empty-query browsing exposes the
 * full offline catalog without inserting ~19k rows into the live database.
 * Returns null (rather than an empty array) when the dataset cannot load, so
 * callers can tell a genuine empty result from a missing file.
 */
export function listAllIndianProducts(): IndianCatalogEntry[] | null {
  if (!ensureLoaded()) return null;

  const entries: IndianCatalogEntry[] = new Array(products!.length);
  for (let i = 0; i < products!.length; i++) {
    const raw = products![i];
    entries[i] = {
      product: normalizeProduct(raw),
      category: raw.c ?? "",
      hasNutrition: raw.nut !== null && Object.keys(raw.nut).length > 0,
      hasIngredients: raw.ig !== null && raw.ig.length > 0,
    };
  }
  return entries;
}
