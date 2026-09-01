import { logger } from "@/lib/logger";
import type { ProductLookupResult } from "./types";

/**
 * barcode-list.com adapter.
 *
 * Looks up https://barcode-list.com/barcode/EN/barcode-{BARCODE}/Search.htm
 * and parses the (server-rendered) result page. The site is user-submitted
 * data; the most popular entry appears in the <title> as
 * "PRODUCT NAME - Barcode: {BARCODE}".
 */

const BARCODE_LIST_URL = (barcode: string) =>
  `https://barcode-list.com/barcode/EN/barcode-${barcode}/Search.htm`;

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

export const BARCODE_LIST_CONFIDENCE = 0.7;

/** Parse the product name out of a barcode-list.com result page. Pure, exported for tests. */
export function parseBarcodeListPage(html: string, barcode: string): string | null {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch?.[1]?.trim();
  if (!rawTitle || rawTitle.length < 3) return null;

  const name = rawTitle.split(/\s*-\s*Barcode:/i)[0].trim();
  if (name.length < 2) return null;
  // Unknown barcodes get a "Search For:{BARCODE}" page — never a match.
  if (/^(barcode[- ]?list|search|not found|home)$/i.test(name)) return null;
  if (/^search\s+for:?\b/i.test(name)) return null;
  if (/^(no results|not found|error|403|access denied|just a moment)/i.test(name)) return null;
  if (!html.includes(barcode)) return null;
  return name;
}

function guessBrand(name: string): string | undefined {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (first.length >= 2 && /^[A-Z][a-zA-Z0-9&]*$/.test(first)) return first;
  return undefined;
}

export async function barcodeListAdapter(
  barcode: string,
): Promise<ProductLookupResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(BARCODE_LIST_URL(barcode), {
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
      logger.info("product_lookup_barcode_list_http_error", {
        barcode,
        status: response.status,
      });
      return { found: false, barcode, source: "barcode-list", confidence: 0 };
    }

    const html = await response.text();
    if (html.includes("403 Forbidden") || html.includes("Just a moment")) {
      return { found: false, barcode, source: "barcode-list", confidence: 0 };
    }

    const name = parseBarcodeListPage(html, barcode);
    if (!name) {
      return { found: false, barcode, source: "barcode-list", confidence: 0 };
    }

    return {
      found: true,
      barcode,
      name,
      brand: guessBrand(name),
      source: "barcode-list",
      confidence: BARCODE_LIST_CONFIDENCE,
      rawData: { pageUrl: BARCODE_LIST_URL(barcode) },
    };
  } catch (error) {
    logger.warn("product_lookup_barcode_list_failed", {
      barcode,
      error: error instanceof Error ? error.message : String(error),
    });
    return { found: false, barcode, source: "barcode-list", confidence: 0 };
  }
}