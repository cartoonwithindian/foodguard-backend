import { logger } from "@/lib/logger";
import type { ProductLookupResult } from "./types";

/**
 * barcodesdatabase.org adapter.
 *
 * Looks up https://barcodesdatabase.org/barcode/{BARCODE}. The site sits
 * behind a Cloudflare challenge, so server-side requests frequently get a
 * challenge page instead of product data; the adapter detects that and
 * fails fast (the orchestrator moves on). The parser is tolerant of the
 * site's title conventions for the cases where a real page is returned.
 */

const BARCODES_DB_URL = (barcode: string) =>
  `https://barcodesdatabase.org/barcode/${barcode}`;

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

export const BARCODES_DB_CONFIDENCE = 0.65;

const CHALLENGE_MARKERS = ["just a moment", "cf-chl-", "enable javascript and cookies"];

/** Detect a Cloudflare/bot challenge page. */
export function isChallengePage(html: string): boolean {
  const lower = html.toLowerCase();
  return CHALLENGE_MARKERS.some((m) => lower.includes(m));
}

/**
 * Parse the product name out of a barcodesdatabase.org result page.
 * Pure, exported for tests.
 */
export function parseBarcodesDatabasePage(
  html: string,
  barcode: string,
): string | null {
  if (isChallengePage(html)) return null;

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch?.[1]?.trim();
  if (!rawTitle || rawTitle.length < 3) return null;

  // Strip site-name suffixes ("NAME | Barcode Database", "NAME - BarcodesDatabase.org").
  let name = rawTitle.split(/\s*[|]\s*/)[0].trim();
  name = name.split(/\s*-\s*(barcode database|barcodesdatabase|barcodes? database|the barcode database)/i)[0].trim();

  if (name.length < 2) return null;
  if (/^(barcode database|barcodes database|not found|page not found|home)$/i.test(name)) return null;
  if (!html.includes(barcode)) return null;
  return name;
}

function guessBrand(name: string): string | undefined {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (first.length >= 2 && /^[A-Z][a-zA-Z0-9&]*$/.test(first)) return first;
  return undefined;
}

export async function barcodesDatabaseAdapter(
  barcode: string,
): Promise<ProductLookupResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(BARCODES_DB_URL(barcode), {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": USER_AGENT,
        },
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      logger.info("product_lookup_barcodes_database_http_error", {
        barcode,
        status: response.status,
      });
      return { found: false, barcode, source: "barcodesdatabase", confidence: 0 };
    }

    const html = await response.text();
    if (isChallengePage(html)) {
      logger.info("product_lookup_barcodes_database_challenge", { barcode });
      return { found: false, barcode, source: "barcodesdatabase", confidence: 0 };
    }

    const name = parseBarcodesDatabasePage(html, barcode);
    if (!name) {
      return { found: false, barcode, source: "barcodesdatabase", confidence: 0 };
    }

    return {
      found: true,
      barcode,
      name,
      brand: guessBrand(name),
      source: "barcodesdatabase",
      confidence: BARCODES_DB_CONFIDENCE,
      rawData: { pageUrl: BARCODES_DB_URL(barcode) },
    };
  } catch (error) {
    logger.warn("product_lookup_barcodes_database_failed", {
      barcode,
      error: error instanceof Error ? error.message : String(error),
    });
    return { found: false, barcode, source: "barcodesdatabase", confidence: 0 };
  }
}