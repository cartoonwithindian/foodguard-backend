/**
 * Exports the local SQLite product catalog to NDJSON for the Appwrite import.
 *
 *   npx tsx scripts/appwrite/export-catalog.ts \
 *     --db ../data/foodguard/foodguard.db --out-dir ./tmp/appwrite
 *
 * Produces two files:
 *   products.ndjson  one Appwrite `products` row per line
 *   barcodes.ndjson  one Appwrite `product_barcodes` row per line
 *
 * The child tables are loaded into maps first: `product_ingredients` has
 * ~127k rows, so per-product queries would issue ~30k extra statements.
 */

import { mkdirSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import {
  toAppwriteBarcodeRow,
  toAppwriteProductRow,
  type SqliteProductRow,
} from "../../src/lib/appwrite/catalog-mapping.js";

interface Args {
  db: string;
  outDir: string;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    db: resolve(process.cwd(), "../data/foodguard/foodguard.db"),
    outDir: resolve(process.cwd(), "tmp/appwrite"),
    limit: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--db") args.db = resolve(process.cwd(), argv[++i]);
    else if (flag === "--out-dir") args.outDir = resolve(process.cwd(), argv[++i]);
    else if (flag === "--limit") args.limit = Number(argv[++i]);
    else throw new Error(`unknown flag: ${flag}`);
  }
  return args;
}

function groupBy(table: string, key: string, value: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const rows = db.prepare(`SELECT ${key} AS k, ${value} AS v FROM ${table}`).all() as Array<{
    k: string;
    v: string | number | null;
  }>;
  for (const row of rows) {
    if (row.v === null || row.v === undefined) continue;
    const bucket = map.get(row.k);
    if (bucket) bucket.push(String(row.v));
    else map.set(row.k, [String(row.v)]);
  }
  return map;
}

function groupByNumber(table: string, key: string, value: string): Map<string, number[]> {
  const map = new Map<string, number[]>();
  const rows = db.prepare(`SELECT ${key} AS k, ${value} AS v FROM ${table}`).all() as Array<{
    k: string;
    v: number | null;
  }>;
  for (const row of rows) {
    if (row.v === null || row.v === undefined) continue;
    const bucket = map.get(row.k);
    if (bucket) bucket.push(row.v);
    else map.set(row.k, [row.v]);
  }
  return map;
}

const args = parseArgs(process.argv.slice(2));

const db = new Database(args.db, { readonly: true, fileMustExist: true });
const productCount = (db.prepare("SELECT count(*) AS c FROM products").get() as { c: number }).c;
console.log(`Source: ${args.db}`);
console.log(`Products in source: ${productCount}`);

mkdirSync(args.outDir, { recursive: true });
const productsOut = createWriteStream(resolve(args.outDir, "products.ndjson"), { flags: "w" });
const barcodesOut = createWriteStream(resolve(args.outDir, "barcodes.ndjson"), { flags: "w" });

console.log("Loading aggregates...");
const barcodesByProduct = groupBy("barcodes", "product_id", "barcode");
const sourcesByProduct = groupBy("barcodes", "product_id", "source");
const ingredientsByProduct = groupByNumber("product_ingredients", "product_id", "ingredient_id");
const allergensByProduct = groupByNumber("product_allergens", "product_id", "allergen_id");
const nutritionByProduct = new Map<string, string>();
for (const row of db.prepare("SELECT product_id, nutrition_json FROM nutrition").all() as Array<{
  product_id: string;
  nutrition_json: string | null;
}>) {
  if (row.nutrition_json) nutritionByProduct.set(row.product_id, row.nutrition_json);
}

const limit = args.limit ?? Number.POSITIVE_INFINITY;
let exported = 0;
let skipped = 0;

const productStatement = args.limit
  ? db.prepare("SELECT * FROM products LIMIT ?")
  : db.prepare("SELECT * FROM products");

const rows = (args.limit ? productStatement.iterate(limit) : productStatement.iterate()) as IterableIterator<
  SqliteProductRow
>;

for (const row of rows) {
  if (exported >= limit) break;
  try {
    const mapped = toAppwriteProductRow(
      { ...row, nutrition_json: nutritionByProduct.get(row.product_id) ?? null },
      {
        barcodes: barcodesByProduct.get(row.product_id),
        sources: sourcesByProduct.get(row.product_id),
        ingredientIds: ingredientsByProduct.get(row.product_id),
        allergenIds: allergensByProduct.get(row.product_id),
      },
    );
    productsOut.write(`${JSON.stringify(mapped)}\n`);
    exported += 1;
  } catch (error) {
    skipped += 1;
    console.error(`  skipped ${row.product_id}: ${(error as Error).message}`);
  }
}

let barcodeRows = 0;
for (const row of db.prepare("SELECT barcode, product_id, source, confidence FROM barcodes").all() as Array<{
  barcode: string;
  product_id: string;
  source: string | null;
  confidence: number | null;
}>) {
  barcodesOut.write(`${JSON.stringify(toAppwriteBarcodeRow(row))}\n`);
  barcodeRows += 1;
}

productsOut.end();
barcodesOut.end();

await Promise.all([
  new Promise<void>((res) => productsOut.once("finish", () => res())),
  new Promise<void>((res) => barcodesOut.once("finish", () => res())),
]);

console.log(`Exported products: ${exported}${skipped ? ` (skipped ${skipped})` : ""}`);
console.log(`Exported barcodes: ${barcodeRows}`);
console.log(`Output: ${args.outDir}`);
db.close();