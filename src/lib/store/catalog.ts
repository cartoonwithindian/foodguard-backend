// Shared catalog browsing helpers mixed into each store's product result.
// These were previously co-located with the SQLite store; they are
// store-agnostic (used by the in-memory demo store and PrismaStore alike), so
// they live here and are imported by the catalog service and search services.

export type CatalogCategoryDef = { key: string; label: string; keywords: string[] };

/**
 * Browsing categories derived from real product names (the FoodGuard DB has no
 * category column). Matching is substring-based on name, so it is a browsing
 * aid only — the products themselves are always the real DB rows, never
 * fabricated.
 */
export const CATALOG_CATEGORIES: CatalogCategoryDef[] = [
  { key: "snacks", label: "Snacks", keywords: ["chips", "namkeen", "kurkure", "bhujia", "chakli", "murukku", "khakhra", "murmura", "makhana", "puff"] },
  { key: "biscuits", label: "Biscuits & Cookies", keywords: ["biscuit", "cookie", "cookies", "cream cracker", "digestive", "rusk", "glucose biscuits"] },
  { key: "beverages", label: "Beverages", keywords: ["tea", "coffee", "juice", "drink", "beverage", "squash", "syrup", "smoothie", "energy drink", "nimbu", "limca", "soda", "water"] },
  { key: "dairy", label: "Dairy", keywords: ["milk", "curd", "yogurt", "yoghurt", "ghee", "paneer", "cheese", "cream", "lassi", "dahi", "malai"] },
  { key: "staples", label: "Staples & Grains", keywords: ["rice", "atta", "flour", "maida", "sooji", "suji", "dal", "pulse", "sugar", "salt", "oil", "spice", "masala", "turmeric", "besan", "poha", "sabudana", "wheat"] },
  { key: "instant", label: "Instant & Ready-to-Eat", keywords: ["noodle", "maggi", "instant", "pasta", "vermicelli", "oats", "cereal", "corn flakes", "muesli", "porridge", "chowmein", "brooke bond"] },
  { key: "sweets", label: "Sweets & Chocolates", keywords: ["chocolate", "candy", "toffee", "barfi", "laddoo", "laddu", "rasgulla", "cake", "pastry", "jalebi", "mithai", "chewing gum", "chocolate"] },
];

export type CatalogFilterInput = {
  search?: string;
  category?: string;
  sort?: string;
  offset?: number;
  limit?: number;
};

export type CatalogProductItem = {
  id: string;
  name: string;
  brand: string | null;
  barcode: string;
  category: string;
  categoryLabel: string;
  imageUrl: string | null;
  packSize: string | null;
  price: string | null;
  source: string | null;
  cardCreatedAt: string | null;
  verified: boolean;
  confidence: number;
  hasNutrition: boolean;
  hasIngredients: boolean;
  hasBarcode: boolean;
};

export type CatalogPageResult = {
  products: CatalogProductItem[];
  /** Products matching the current search + category filter. */
  total: number;
  /** Total rows in the products table (whole FoodGuard database). */
  dbTotal: number;
  categories: Array<{ key: string; label: string; count: number }>;
};

export type DbHealthReport = {
  totalProducts: number;
  missingName: number;
  missingBarcode: number;
  missingBrand: number;
  missingImage: number;
  missingIngredients: number;
  missingNutrition: number;
  invalidBarcode: number;
  duplicateBarcodes: number;
  productsWithDuplicateBarcode: number;
  malformedNutrition: number;
  malformedIngredients: number;
  verifiedProducts: number;
};

/**
 * Normalize a product image URL for UI consumption: only absolute
 * http(s) URLs pass through; anything else (relative paths, garbage,
 * empty strings) becomes null so the UI always falls back to its
 * placeholder instead of rendering a broken image.
 */
export function normalizeProductImageUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) return null;
  return trimmed;
}

export function classifyCatalogCategory(name: string): string {
  const lower = name.toLowerCase();
  for (const cat of CATALOG_CATEGORIES) {
    if (cat.keywords.some((kw) => lower.includes(kw))) return cat.key;
  }
  return "other";
}
