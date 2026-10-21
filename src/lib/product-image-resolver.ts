/**
 * Product image resolver — backed by `fg_product_images.json`.
 *
 * The mapping (34,533 entries, sourced from the same dataset that powers the
 * visual-search FAISS index and hosted at
 * https://huggingface.co/nazimtovo/foodguard-assets) maps normalized product
 * names to real retail photo URLs. This module resolves a product's image by
 * name/brand and is used by the product catalog, search and barcode endpoints
 * when a product has no stored `image_url`.
 *
 * Design:
 *  - Lazy single-shot load (JSON parsed once, ~5 MB); failures degrade to
 *    "no image" and never throw into request paths.
 *  - Match = highest Jaccard token overlap between the query and the mapping
 *    key, above a strict threshold (0.6) so we never attach a wrong photo.
 *  - Brand words boost candidates; numbers/doses ("90 g", "10kg") must match
 *    to prevent cross-size mislabeling.
 *  - Only http(s) URLs are returned.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@/lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IMAGE_MAP_FILENAME = "fg_product_images.json";
const BARCODE_IMAGE_INDEX_FILENAME = "fg_product_images_by_barcode.json";

/** Jaccard overlap required to accept a match (0..1). Strict by design. */
const MIN_SCORE = 0.6;

type Entry = { url: string; tokens: Set<string>; numbers: Set<string> };

let entries: Entry[] | null = null;
let byToken: Map<string, Entry[]> | null = null;

/**
 * Exact barcode -> photo index, prebuilt from Open Food Facts by
 * `scripts/build-barcode-image-index.ts`.
 *
 * The name map above misses products whose catalog name is shorter than the
 * retail listing name ("Kurkure"). Barcodes are exact, so this lookup is both
 * cheaper and safer than fuzzy name matching, and it removes the need for the
 * per-request live lookup that only ran on the product detail page.
 */
let barcodeImages: Map<string, string> | null = null;

function loadBarcodeImages(): Map<string, string> {
  if (barcodeImages) return barcodeImages;
  const map = new Map<string, string>();
  try {
    const file = path.join(__dirname, "..", "..", "data", BARCODE_IMAGE_INDEX_FILENAME);
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
      for (const [barcode, url] of Object.entries(parsed)) {
        if (/^[0-9]{8,14}$/.test(barcode) && typeof url === "string" && /^https?:\/\//i.test(url)) {
          map.set(barcode, url);
        }
      }
    }
  } catch (error) {
    logger.warn("product_image_barcode_index_failed", { error: String(error) });
  }
  barcodeImages = map;
  return map;
}

/**
 * Resolve a photo by barcode. Exact match only, so a returned URL is always the
 * product's own photo.
 */
export function resolveProductImageUrlByBarcode(
  barcode: string | null | undefined,
): string | null {
  const value = (barcode ?? "").trim();
  if (!/^[0-9]{8,14}$/.test(value)) return null;
  return loadBarcodeImages().get(value) ?? null;
}

const STOP_TOKENS = new Set([
  "the", "and", "with", "for", "of", "a", "an", "in", "by", "or", "to",
]);

/** Normalize any product string: lowercase, strip entities/digits, tokenize. */
function tokenize(value: string): { tokens: string[]; numbers: string[] } {
  const normalized = value
    .toLowerCase()
    .replace(/&[a-z]+;|&#\d+;/g, " ") // HTML entities (&#039; etc.)
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens: string[] = [];
  const numbers: string[] = [];
  for (const word of normalized.split(" ")) {
    if (!word) continue;
    // Numbers carry size/dose info ("90", "4.5", "250") — keep them separate.
    if (/^\d+(\.\d+)?$/.test(word)) {
      numbers.push(word.replace(/\.0+$/, ""));
    } else if (!STOP_TOKENS.has(word)) {
      tokens.push(word);
    }
  }
  return { tokens, numbers };
}

function buildEntry(name: string, url = ""): Entry {
  const { tokens, numbers } = tokenize(name);
  return { url, tokens: new Set(tokens), numbers: new Set(numbers) };
}

function loadMapping(): { entries: Entry[]; byToken: Map<string, Entry[]> } {
  if (entries && byToken) return { entries, byToken };

  const candidates = [
    path.resolve(process.cwd(), "data", IMAGE_MAP_FILENAME),
    path.resolve(__dirname, "..", "data", IMAGE_MAP_FILENAME),
    path.resolve(__dirname, "..", "..", "data", IMAGE_MAP_FILENAME),
  ];

  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) {
    logger.warn("product_image_map_missing", { tried: candidates });
    entries = [];
    byToken = new Map();
    return { entries, byToken };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, string>;
    const list: Entry[] = [];
    const tokenIndex = new Map<string, Entry[]>();
    for (const [name, url] of Object.entries(raw)) {
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
      const entry = buildEntry(name, url);
      if (entry.tokens.size === 0) continue;
      list.push(entry);
      for (const token of entry.tokens) {
        const bucket = tokenIndex.get(token);
        if (bucket) bucket.push(entry);
        else tokenIndex.set(token, [entry]);
      }
    }
    entries = list;
    byToken = tokenIndex;
    logger.info("product_image_map_loaded", {
      file,
      entries: list.length,
      tokens: tokenIndex.size,
    });
  } catch (error) {
    logger.warn("product_image_map_invalid", { error: String(error) });
    entries = [];
    byToken = new Map();
  }

  return { entries, byToken };
}

/**
 * Resolve a real product photo URL for a product by name (and optional
 * brand). Returns null when nothing matches confidently — never guesses.
 */
export function resolveProductImageUrl(
  productName: string,
  brand?: string | null,
): string | null {
  const name = (productName ?? "").trim();
  if (!name) return null;

  const { entries: all, byToken: index } = loadMapping();
  if (!all || all.length === 0 || !index) return null;

  const query = buildEntry(brand ? `${brand} ${name}` : name);
  if (query.tokens.size === 0) return null;

  // Candidate lookup: products sharing at least one informative token,
  // falling back to rarest-token traversal for long multi-word names.
  let candidates: Entry[];
  const informative = query.tokens;
  if (informative.size <= 4) {
    const sets = [...informative].map((t) => index.get(t) ?? []);
    const smallest = sets.reduce((a, b) => (a.length <= b.length ? a : b));
    candidates = smallest;
  } else {
    const sorted = [...informative]
      .map((t) => index.get(t) ?? [])
      .sort((a, b) => a.length - b.length);
    candidates = sorted.slice(0, 3).flat();
  }
  if (!candidates || candidates.length === 0) return null;

  let best: Entry | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    // Jaccard on informative tokens.
    let overlap = 0;
    for (const token of query.tokens) {
      if (candidate.tokens.has(token)) overlap += 1;
    }
    const union = new Set([...query.tokens, ...candidate.tokens]).size;
    const score = union === 0 ? 0 : overlap / union;
    if (score <= bestScore) continue;

    // Numbers (weights/sizes) must agree when both sides carry them —
    // "maggie noodles 70g" must not take the photo of the 420g pack.
    const queryNumbers = query.numbers;
    const candNumbers = candidate.numbers;
    if (queryNumbers.size > 0 && candNumbers.size > 0) {
      const agrees = [...queryNumbers].some((n) => candNumbers.has(n));
      if (!agrees) continue;
    }

    best = candidate;
    bestScore = score;
  }

  if (best && bestScore >= MIN_SCORE) {
    return best.url;
  }
  return null;
}

/** Test/ops hook: whether the mapping loaded successfully. */
export function isProductImageMapLoaded(): boolean {
  loadMapping();
  return (entries?.length ?? 0) > 0;
}
