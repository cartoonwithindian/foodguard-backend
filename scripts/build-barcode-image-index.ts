/**
 * Build a barcode -> image URL index for the catalog.
 *
 * The bundled India dataset ships zero image URLs. Product detail pages get a
 * photo because the lookup pipeline lazily calls Open Food Facts per barcode
 * (`fetchOffImageUrl`) and caches the result, which is why a product showed an
 * image after being opened but "No image" in the catalog grid.
 *
 * This script resolves those URLs ahead of time and writes a static index, so
 * the catalog can show real photos with no per-request network calls.
 *
 * Usage: npx tsx scripts/build-barcode-image-index.ts [--limit N] [--concurrency N]
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const OUT_PATH = resolve(process.cwd(), "data/fg_product_images_by_barcode.json");
/**
 * Barcodes already proven to have no photo. Without this a resumed build would
 * re-query every miss forever, which is what made the first attempt hammer the
 * API into HTTP 429.
 */
const MISSES_PATH = resolve(process.cwd(), "data/fg_product_image_misses.json");
const OFF_API = "https://world.openfoodfacts.org/api/v2/product";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number.parseInt(process.argv[i + 1] ?? "", 10);
  return Number.isFinite(v) ? v : fallback;
}

type DatasetRow = { b?: string; img?: string | null };

function collectBarcodes(limit: number): { barcode: string; name: string }[] {
  const path = resolve(process.cwd(), "src/data/india-dataset/products-india.json");
  if (!existsSync(path)) {
    throw new Error(`Missing dataset at ${path}`);
  }
  const rows = JSON.parse(readFileSync(path, "utf8")) as DatasetRow[];
  const out: { barcode: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const barcode = (row.b ?? "").trim();
    // Only well-formed retail barcodes; the OFF lookup rejects anything else.
    if (!/^\d{8,14}$/.test(barcode) || seen.has(barcode)) continue;
    seen.add(barcode);
    out.push({ barcode, name: "" });
    if (limit > 0 && out.length >= limit) break;
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One request per `requestDelayMs`. Open Food Facts documents ~10 reads/min for
 * the product endpoint; hammering it returns 429 and silently poisons the
 * index, so the delay is non-negotiable and 429s back off hard.
 */
let lastRequestAt = 0;

async function politeFetch(url: string, minDelayMs: number): Promise<Response> {
  for (let attempt = 0; attempt <= 5; attempt += 1) {
    const wait = minDelayMs - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    const res = await fetch(url, {
      headers: {
        // OFF asks API consumers to identify themselves.
        "User-Agent": "FoodGuard/1.0 (catalog image index build)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status !== 429) return res;
    const retryAfter = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 120000)
      : Math.min(15000 * 2 ** attempt, 120000);
    console.warn(`  429 rate limited; backing off ${Math.round(backoff / 1000)}s`);
    await sleep(backoff);
  }
  return new Response("", { status: 429 });
}

async function resolveOne(
  barcode: string,
  minDelayMs: number,
): Promise<{ barcode: string; imageUrl: string } | null> {
  try {
    const res = await politeFetch(
      `${OFF_API}/${barcode}.json?fields=image_front_url,image_url`,
      minDelayMs,
    );
    if (!res.ok) {
      // A rate-limited/unavailable response is NOT proof the product has no
      // photo, so it must not be cached as a miss.
      if (res.status === 429) throw new Error("rate limited");
      return null;
    }
    const data = (await res.json()) as {
      status?: number;
      product?: { image_front_url?: string | null; image_url?: string | null };
    };
    if (data.status !== 1) return null;
    const url = data.product?.image_front_url ?? data.product?.image_url ?? null;
    if (!url || !/^https:\/\//i.test(url)) return null;
    // Only real image hosting, never OFF's own placeholders.
    if (/placeholder|no[-_]?image|\/images\/products\/.*\/\s*\./i.test(url)) return null;
    return { barcode, imageUrl: url };
  } catch {
    return null;
  }
}

async function main() {
  const limit = arg("limit", 0);
  // Single-flight by default: OFF tolerates ~10 product reads/min.
  const concurrency = Math.max(arg("concurrency", 1), 1);
  const delayMs = arg("delay", 6500);
  const targets = collectBarcodes(limit);

  // Ad-hoc verification mode: --barcodes 8901491100519,8901491361026
  const extraIdx = process.argv.indexOf("--barcodes");
  if (extraIdx !== -1) {
    const extra = (process.argv[extraIdx + 1] ?? "")
      .split(",")
      .map((b) => b.trim())
      .filter((b) => /^[0-9]{8,14}$/.test(b));
    targets.length = 0;
    targets.push(...extra.map((barcode) => ({ barcode, name: "" })));
  }
  console.log(`resolving ${targets.length} barcodes from Open Food Facts (concurrency=${concurrency})`);

  const existing: Record<string, string> = existsSync(OUT_PATH)
    ? (JSON.parse(readFileSync(OUT_PATH, "utf8")) as Record<string, string>)
    : {};
  console.log(`reusing ${Object.keys(existing).length} previously resolved barcodes`);

  const misses = new Set<string>(
    existsSync(MISSES_PATH)
      ? (JSON.parse(readFileSync(MISSES_PATH, "utf8")) as string[])
      : [],
  );
  console.log(`skipping ${misses.size} barcodes previously confirmed imageless`);

  const index: Record<string, string> = { ...existing };
  let done = 0;
  let hits = 0;
  let skipped = 0;
  let rateLimited = 0;
  // Resume: never re-check a barcode we already know the answer for.
  let queue = targets.map((t) => t.barcode).filter((b) => !(b in index) && !misses.has(b));

  const worker = async () => {
    for (;;) {
      const barcode = queue.shift();
      if (!barcode) return;
      done += 1;
      if (index[barcode]) {
        hits += 1;
        skipped += 1;
        continue;
      }
      let found: { barcode: string; imageUrl: string } | null = null;
      try {
        found = await resolveOne(barcode, delayMs);
      } catch {
        rateLimited += 1;
        // Do not record a miss; leave it for the next resumed run.
        queue.push(barcode);
        await sleep(30000);
      }
      if (found) {
        index[found.barcode] = found.imageUrl;
        hits += 1;
        misses.delete(barcode);
      } else if (!rateLimited || rateLimited < done) {
        misses.add(barcode);
      }
      if (done % 25 === 0) {
        console.log(
          `  ${done}/${queue.length + done} checked, ${hits} with photos, ${misses.size} known imageless`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  // Sort so the file is stable/diffable across rebuilds.
  const sorted = Object.fromEntries(
    Object.entries(index).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(OUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  writeFileSync(MISSES_PATH, `${JSON.stringify([...misses].sort(), null, 2)}\n`, "utf8");

  console.log(
    `wrote ${OUT_PATH}: ${Object.keys(sorted).length} barcodes with photos (${hits} found this run, ${skipped} skipped as cached, ${rateLimited} left unresolved by rate limiting)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});