import { webSearchWithFallback, type WebSearchResult } from "@/lib/external/web-search-providers";
import { isWebResearchAvailable } from "@/services/web-research.service";
import { logger } from "@/lib/logger";
import { isBarcodeLookupDomain } from "./validation";
import type { ProductLookupResult } from "./types";

/**
 * Google (via the configured web-search chain: Google CSE if keys are set,
 * otherwise SearXNG -> DuckDuckGo Lite) fallback for barcode lookups.
 *
 * The exact barcode is searched first, then "<barcode> product". Results are
 * parsed conservatively: a result is only accepted when the barcode appears
 * in its title or snippet, and junk / barcode-database pages are skipped.
 */

const GOOGLE_CONFIDENCE = 0.6;

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isJunkTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("no results") ||
    lower.includes("search results") ||
    lower.includes("just a moment") ||
    lower.length < 3
  );
}

/** Clean a product name out of a search-result title. */
export function extractProductNameFromTitle(title: string): string {
  let name = title.trim();
  // "NAME - Barcode: 1234567890123"
  name = name.split(/\s*-\s*Barcode:/i)[0].trim();
  // "NAME - 1234567890123"
  name = name.replace(/\s*-\s*\d{8,14}\s*$/, "").trim();
  // "NAME | SiteName" / "NAME - SiteName" (site suffixes)
  const pipeIdx = name.lastIndexOf("|");
  if (pipeIdx > 4) name = name.slice(0, pipeIdx).trim();
  const dashIdx = name.lastIndexOf(" - ");
  if (dashIdx > 4) {
    const suffix = name.slice(dashIdx + 3).trim();
    if (/\d/.test(suffix) === false && suffix.length < 12) {
      name = name.slice(0, dashIdx).trim();
    }
  }
  return name;
}

function guessBrand(name: string): string | undefined {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (first.length >= 2 && /^[A-Z][a-zA-Z0-9&]*$/.test(first)) return first;
  return undefined;
}

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(snack|chips|biscuit|cookie|namkeen|noodle|wafer|candy|chocolate)\b/i, "food"],
  [/\b(drink|beverage|juice|cola|soda|tea|coffee|water)\b/i, "food"],
  [/\b(oil|rice|wheat|flour|spice|sauce|pickle|dairy|milk|cheese|butter|salt|sugar|atta|bread)\b/i, "food"],
  [/\b(face wash|cream|lotion|serum|sunscreen|cosmetic|lip balm)\b/i, "cosmetics"],
  [/\b(shampoo|conditioner|soap|toothpaste|deodorant|skin care|hair)\b/i, "personal_care"],
  [/\b(cleaner|detergent|soap|floor|toilet|dishwash|household)\b/i, "household"],
];

function guessCategory(name: string): string | undefined {
  for (const [re, category] of CATEGORY_KEYWORDS) {
    if (re.test(name)) return category;
  }
  return undefined;
}

/**
 * Guard against unrelated pages that merely echo the searched digits
 * (calculators, datasets, listings, forums). A title only counts as a
 * product when it contains a pack size ("95G", "500 ml") or a recognizable
 * category keyword ("chips", "shampoo", "face wash", ...); quantity-first
 * listings ("1 adet ...", "500g ...") are rejected outright.
 */
export function looksLikeProductTitle(title: string): boolean {
  const trimmed = title.trim();
  if (/^\d+\s+(adet|pcs|st|stk|pieces?|pack)\b/i.test(trimmed)) return false;
  if (/^\d+(\.\d+)?\s*(g|kg|gr|grm|ml|l|oz)\b/i.test(trimmed)) return false;
  if (/\b\d+(\.\d+)?\s*(g|kg|gr|grm|ml|l|oz|mls|gms?)\b/i.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  for (const [re] of CATEGORY_KEYWORDS) {
    if (re.test(lower)) return true;
  }
  return false;
}

/**
 * Pick the best candidate out of web-search results. Pure function (exported
 * for tests): given results for the exact barcode query, returns a validated
 * product guess or null.
 */
export function parseGoogleResultsForBarcode(
  results: WebSearchResult[],
  barcode: string,
): ProductLookupResult | null {
  const tail = barcode.slice(-6);

  const titleCandidates = results.filter((r) => {
    const domain = extractDomain(r.url);
    if (isBarcodeLookupDomain(domain)) return false;
    const title = r.title ?? "";
    if (isJunkTitle(title)) return false;
    if (!looksLikeProductTitle(title)) return false;
    // The barcode must appear in the TITLE itself. Pages that only echo the
    // searched digits in a URL, snippet or data table (datasets, marketplaces)
    // are NOT product pages and are deliberately ignored.
    return title.includes(barcode) || title.includes(tail);
  });

  if (titleCandidates.length === 0) return null;

  const best = titleCandidates[0];
  const name = extractProductNameFromTitle(best.title ?? "");
  if (name.length < 3) return null;

  return {
    found: true,
    barcode,
    name,
    brand: guessBrand(name),
    category: guessCategory(name),
    source: "google",
    confidence: GOOGLE_CONFIDENCE,
    rawData: {
      url: best.url,
      domain: extractDomain(best.url),
      snippet: best.snippet,
    },
  };
}

export async function googleAdapter(
  barcode: string,
): Promise<ProductLookupResult> {
  if (!isWebResearchAvailable()) {
    return { found: false, barcode, source: "google", confidence: 0 };
  }

  const queries = [`"${barcode}"`, `"${barcode}" product`];
  for (const query of queries) {
    try {
      const response = await webSearchWithFallback(query, { numResults: 6 });
      if (!response.performed || response.results.length === 0) continue;
      const parsed = parseGoogleResultsForBarcode(response.results, barcode);
      if (parsed) return parsed;
    } catch (error) {
      logger.warn("product_lookup_google_query_failed", {
        barcode,
        query,
        error: String(error),
      });
    }
  }

  return { found: false, barcode, source: "google", confidence: 0 };
}