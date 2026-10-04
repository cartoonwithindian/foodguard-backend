/**
 * Maps the local SQLite product catalog onto Appwrite TablesDB rows.
 *
 * Source: `data/foodguard/foodguard.db` (see `scripts/appwrite/export-catalog.ts`).
 * The source is relational — `products`, `barcodes`, `nutrition`,
 * `product_ingredients`, `product_allergens` — while Appwrite is a document
 * store. The mapping therefore denormalises the 1:1 and 1:N child rows onto
 * the product document so a product read costs a single row fetch, and keeps
 * only `barcodes` in its own table because barcode lookup needs a uniqueness
 * constraint (Appwrite cannot put a unique index on an array column).
 *
 * Kept free of I/O so it can be unit tested without Appwrite credentials.
 */

/** Column sizes must match `provision.sh`; Appwrite rejects over-long values. */
export const COLUMN_LIMITS = {
  productId: 64,
  name: 512,
  normalizedName: 512,
  brand: 256,
  normalizedBrand: 256,
  barcode: 64,
  barcodes: 64,
  variant: 128,
  packSize: 64,
  quantity: 64,
  unit: 32,
  foodType: 64,
  dietary: 128,
  price: 32,
  mrp: 32,
  rating: 16,
  dataStatus: 32,
  sources: 64,
} as const;

export type SqliteProductRow = {
  product_id: string;
  name: string | null;
  normalized_name: string | null;
  brand: string | null;
  normalized_brand: string | null;
  barcode: string | null;
  variant: string | null;
  pack_size: string | null;
  quantity: string | null;
  unit: string | null;
  description: string | null;
  food_type: string | null;
  dietary: string | null;
  image_url: string | null;
  price: string | null;
  mrp: string | null;
  rating: string | null;
  data_status: string | null;
  completeness_score: number | null;
  confidence_score: number | null;
  created_at: string | null;
  updated_at: string | null;
  nutrition_json?: string | null;
};

/** Aggregates collected per product by the exporter. */
export type SqliteProductAggregates = {
  barcodes?: string[];
  sources?: string[];
  ingredientIds?: number[];
  allergenIds?: number[];
};

export type AppwriteProductRow = Record<string, unknown>;

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function clip(value: string | null, max: number): string | null {
  if (value === null) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function str(
  value: unknown,
  key: keyof typeof COLUMN_LIMITS,
): string | null {
  return clip(clean(value), COLUMN_LIMITS[key]);
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The `url` column rejects anything unparseable, so validate before sending. */
function url(value: unknown): string | null {
  const text = clean(value);
  if (text === null) return null;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * The catalog stores naive timestamps, e.g. `2026-08-19T00:24:23.750292` from
 * Python's `datetime.utcnow().isoformat()`. `new Date()` would read those as
 * *local* time, so running this importer in Asia/Calcutta would shift all
 * 29,650 `createdAt`/`updatedAt` values by +05:30. A timestamp without an
 * offset is therefore pinned to UTC, which keeps the import reproducible
 * regardless of the machine's timezone.
 */
export function isoDate(value: unknown): string | null {
  const text = clean(value);
  if (text === null) return null;
  const naive = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(text);
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const parsed = new Date(naive && !hasOffset ? `${text.replace(" ", "T")}Z` : text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function uniqueSorted(values: Array<string | number> | undefined): Array<string | number> {
  if (!values || values.length === 0) return [];
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * `nutrition_json` is a JSON blob in SQLite. Appwrite stores it as text, so it
 * is re-serialised defensively — malformed source rows must not abort a 29k
 * row import.
 */
function jsonText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return JSON.stringify({ raw: text });
  }
}

export function toAppwriteProductRow(
  row: SqliteProductRow,
  aggregates: SqliteProductAggregates = {},
): AppwriteProductRow {
  const productId = str(row.product_id, "productId");
  if (productId === null) {
    throw new Error("product_id is required and cannot be empty");
  }

  const barcodes = uniqueSorted(
    (aggregates.barcodes ?? []).map((b) => str(b, "barcodes")).filter((b): b is string => b !== null),
  );
  const primaryBarcode = str(row.barcode, "barcode");

  return {
    productId,
    name: str(row.name, "name"),
    normalizedName: str(row.normalized_name, "normalizedName"),
    brand: str(row.brand, "brand"),
    normalizedBrand: str(row.normalized_brand, "normalizedBrand"),
    barcode: primaryBarcode,
    // Union of the denormalised column and the child table so a product that
    // only has barcodes in `barcodes` is still scannable from the document.
    barcodes: [...new Set([...(primaryBarcode ? [primaryBarcode] : []), ...barcodes])],
    variant: str(row.variant, "variant"),
    packSize: str(row.pack_size, "packSize"),
    quantity: str(row.quantity, "quantity"),
    unit: str(row.unit, "unit"),
    description: clean(row.description),
    foodType: str(row.food_type, "foodType"),
    dietary: str(row.dietary, "dietary"),
    imageUrl: url(row.image_url),
    price: str(row.price, "price"),
    mrp: str(row.mrp, "mrp"),
    rating: str(row.rating, "rating"),
    dataStatus: str(row.data_status, "dataStatus"),
    completenessScore: number(row.completeness_score),
    confidenceScore: number(row.confidence_score),
    nutrition: jsonText(row.nutrition_json),
    ingredientIds: uniqueSorted(aggregates.ingredientIds),
    allergenIds: uniqueSorted(aggregates.allergenIds),
    sources: uniqueSorted(
      (aggregates.sources ?? []).map((s) => str(s, "sources")).filter((s): s is string => s !== null),
    ),
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
  };
}

export function toAppwriteBarcodeRow(row: {
  barcode: string;
  product_id: string;
  source?: string | null;
  confidence?: number | null;
}): AppwriteProductRow {
  const barcode = str(row.barcode, "barcode");
  const productId = str(row.product_id, "productId");
  if (barcode === null || productId === null) {
    throw new Error(`barcode and product_id are required (got ${row.barcode}, ${row.product_id})`);
  }
  return {
    barcode,
    productId,
    source: str(row.source, "sources"),
    confidence: number(row.confidence),
  };
}