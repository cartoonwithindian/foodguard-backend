/**
 * Imports the exported catalog NDJSON into Appwrite TablesDB.
 *
 *   npx tsx scripts/appwrite/import-catalog.ts --dir ./tmp/appwrite
 *   npx tsx scripts/appwrite/import-catalog.ts --dir ./tmp/appwrite --skip-existing
 *   npx tsx scripts/appwrite/import-catalog.ts --dir ./tmp/appwrite --dry-run
 *
 * Uses the Appwrite server SDK rather than `appwrite tablesdb create-rows`
 * because the CLI passes rows as command-line arguments, which cannot carry
 * 29,650 products. Schema provisioning still uses the CLI (provision.sh).
 *
 * Batches are retried with exponential backoff on rate limits and 5xx. When a
 * batch fails permanently its rows are retried individually so one malformed
 * row cannot block the other 99, and the rejects are written to disk.
 */

import { createReadStream, existsSync, createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { Client, TablesDB } from "node-appwrite";

interface Args {
  dir: string;
  databaseId: string;
  productsTable: string;
  barcodesTable: string;
  batchSize: number;
  limit: number | null;
  skipExisting: boolean;
  dryRun: boolean;
  target: "all" | "products" | "barcodes";
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dir: resolve(process.cwd(), "tmp/appwrite"),
    databaseId: process.env.APPWRITE_DATABASE_ID ?? "foodguard",
    productsTable: process.env.APPWRITE_PRODUCTS_TABLE_ID ?? "products",
    barcodesTable: process.env.APPWRITE_BARCODES_TABLE_ID ?? "product_barcodes",
    batchSize: 100,
    limit: null,
    skipExisting: false,
    dryRun: false,
    target: "all",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--dir") args.dir = resolve(process.cwd(), argv[++i]);
    else if (flag === "--batch-size") args.batchSize = Number(argv[++i]);
    else if (flag === "--limit") args.limit = Number(argv[++i]);
    else if (flag === "--skip-existing") args.skipExisting = true;
    else if (flag === "--dry-run") args.dryRun = true;
    else if (flag === "--products-only") args.target = "products";
    else if (flag === "--barcodes-only") args.target = "barcodes";
    else throw new Error(`unknown flag: ${flag}`);
  }
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 100) {
    throw new Error("--batch-size must be between 1 and 100 (Appwrite bulk limit)");
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

let client: Client | undefined;
let tables: TablesDB | undefined;

if (!args.dryRun) {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const project = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  if (!endpoint || !project || !apiKey) {
    throw new Error(
      "APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_API_KEY are required (or use --dry-run)",
    );
  }
  client = new Client().setEndpoint(endpoint).setProject(project).setKey(apiKey);
  tables = new TablesDB(client);
}

/**
 * `createRow` requires an explicit `rowId`, so the per-row retry path derives a
 * stable one from the row's unique key. Appwrite row IDs allow a-z, A-Z, 0-9,
 * period, hyphen and underscore up to 36 chars, which a truncated hex digest
 * always satisfies regardless of what the catalog contains.
 */
function deterministicRowId(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

async function withRetry<T>(label: string, run: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const status = (error as { code?: number }).code;
      if (!RETRYABLE.has(Number(status))) throw error;
      const delay = Math.min(30_000, 2 ** attempt * 1000);
      console.warn(`  ${label}: attempt ${attempt}/${attempts} failed (${status}); retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** Reads an NDJSON file, newest rows last, honouring --limit. */
async function* readRows(path: string, limit: number | null): AsyncGenerator<Record<string, unknown>> {
  if (!existsSync(path)) {
    console.warn(`  (missing ${path} — nothing to import)`);
    return;
  }
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let seen = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (limit !== null && seen >= limit) break;
    seen += 1;
    try {
      yield JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      console.warn(`  skipping malformed line ${seen}: ${(error as Error).message}`);
    }
  }
}

async function fetchExistingIds(tableId: string, key: string): Promise<Set<string>> {
  const seen = new Set<string>();
  const LIMIT = 100;
  for (let offset = 0; ; offset += LIMIT) {
    const page = await withRetry(`listRows ${tableId}@${offset}`, () =>
      tables!.listRows({
        databaseId: args.databaseId,
        tableId,
        queries: [`limit(${LIMIT})`, `offset(${offset})`],
      }),
    );
    for (const row of page.rows as Array<Record<string, unknown>>) {
      const value = row[key];
      if (typeof value === "string") seen.add(value);
    }
    const total = page.total ?? seen.size;
    if (offset + LIMIT >= total || page.rows.length === 0) break;
  }
  return seen;
}

interface Outcome {
  imported: number;
  skipped: number;
  failed: number;
}

async function importFile(
  file: string,
  tableId: string,
  key: string,
): Promise<Outcome> {
  console.log(`\n==> Importing ${file} into table '${tableId}'`);
  const failuresPath = resolve(args.dir, `${tableId}.failures.ndjson`);
  const failures = createWriteStream(failuresPath, { flags: "w" });

  let existing: Set<string> | null = null;
  if (args.skipExisting) {
    console.log("  fetching existing ids...");
    existing = await fetchExistingIds(tableId, key);
    console.log(`  ${existing.size} row(s) already present`);
  }

  const outcome: Outcome = { imported: 0, skipped: 0, failed: 0 };
  let batch: Array<Record<string, unknown>> = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const rows = batch;
    batch = [];

    if (args.dryRun) {
      outcome.imported += rows.length;
      console.log(`  [dry-run] would import ${rows.length} row(s)`);
      return;
    }

    try {
      await withRetry(`createRows ${tableId}`, () =>
        tables!.createRows({ databaseId: args.databaseId, tableId, rows }),
      );
      outcome.imported += rows.length;
      console.log(`  imported ${outcome.imported} (batch of ${rows.length})`);
    } catch (batchError) {
      // Isolate the offending rows rather than losing the whole batch.
      console.warn(`  batch of ${rows.length} failed: ${(batchError as Error).message}`);
      for (const row of rows) {
        const rowKey = String(row[key]);
        try {
          await withRetry(`createRow ${tableId}`, () =>
            tables!.createRow({
              databaseId: args.databaseId,
              tableId,
              rowId: deterministicRowId(rowKey),
              data: row,
            }),
          );
          outcome.imported += 1;
        } catch (rowError) {
          outcome.failed += 1;
          failures.write(
            `${JSON.stringify({ row, error: (rowError as Error).message })}\n`,
          );
        }
      }
    }
  };

  for await (const row of readRows(file, args.limit)) {
    if (existing && existing.has(String(row[key]))) {
      outcome.skipped += 1;
      continue;
    }
    batch.push(row);
    if (batch.length >= args.batchSize) await flush();
  }
  await flush();
  failures.end();
  await new Promise<void>((r) => failures.once("finish", () => r()));

  console.log(
    `  done: imported=${outcome.imported} skipped=${outcome.skipped} failed=${outcome.failed}`,
  );
  if (outcome.failed > 0) console.log(`  rejects: ${failuresPath}`);
  return outcome;
}

const products = await importFile(
  resolve(args.dir, "products.ndjson"),
  args.productsTable,
  "productId",
);
const barcodes =
  args.target === "products"
    ? { imported: 0, skipped: 0, failed: 0 }
    : await importFile(resolve(args.dir, "barcodes.ndjson"), args.barcodesTable, "barcode");

const totals = {
  imported: products.imported + barcodes.imported,
  skipped: products.skipped + barcodes.skipped,
  failed: products.failed + barcodes.failed,
};
console.log("\n==> Import summary");
console.log(`  imported: ${totals.imported}`);
console.log(`  skipped:  ${totals.skipped}`);
console.log(`  failed:   ${totals.failed}`);
if (totals.failed > 0) process.exitCode = 1;