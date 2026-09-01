import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getCache } from "@/lib/cache";
import { fetchOffImageUrl } from "@/lib/external/off-image";
import { primaryAdapter } from "./primary";
import { googleAdapter } from "./google";
import { barcodeListAdapter } from "./barcode-list";
import { barcodesDatabaseAdapter } from "./barcodes-database";
import { barcodeSpiderAdapter } from "./barcode-spider";
import { ocrGoogleAdapter } from "./ocr-fallback";
import {
  ADAPTER_ORDER,
  ENRICHMENT_ORDER,
  type AdapterKey,
  type LookupAdapter,
  type LookupContext,
  type ProductLookupResult,
} from "./types";
import {
  rejectInvalidBarcode,
  runAdapterSafely,
  validateLookupResult,
  mergeLookupResults,
} from "./validation";

/**
 * Product barcode lookup orchestrator.
 *
 * Strict fallback chain (never parallel):
 *
 *   foodguard (India DB -> demo store -> Open Food Facts -> spider -> curated)
 *     -> google (exact barcode)          [source: "google"]
 *     -> barcode-list.com                [source: "barcode-list"]
 *     -> barcodesdatabase.org            [source: "barcodesdatabase"]
 *     -> barcodespider.com (API)         [source: "barcodespider"]
 *     -> OCR + google                    [source: "ocr-google"]
 *     -> PRODUCT_NOT_FOUND
 *
 * Reliability rules: every adapter runs with its own timeout and is wrapped
 * so a failure only logs (source + reason) and the chain moves on. Results
 * are validated before acceptance and merged field-by-field without
 * overwriting higher-confidence data. Repeated scans hit the cache instead
 * of external sources. Scraping errors are never exposed to the user.
 */

export interface LookupOutcome {
  success: boolean;
  /** Merged product (primary data preferred, missing fields filled). */
  product?: ProductLookupResult;
  /** Actual source that provided the data. */
  source: string;
  confidence: number;
  /** Secondary sources that contributed missing fields. */
  mergedFrom: string[];
  /** True when served from the in-process cache. */
  cached: boolean;
}

export interface LookupOptions {
  context?: LookupContext;
  /** Test seam: override individual adapters. */
  adapters?: Partial<Record<AdapterKey, LookupAdapter>>;
}

const CACHE_TTL_FOUND_SECONDS = 3600;
const CACHE_TTL_NOT_FOUND_SECONDS = 300;

function defaultAdapters(): Record<AdapterKey, LookupAdapter> {
  return {
    primary: (barcode) => primaryAdapter(barcode),
    google: (barcode) => googleAdapter(barcode),
    "barcode-list": (barcode) => barcodeListAdapter(barcode),
    barcodesdatabase: (barcode) => barcodesDatabaseAdapter(barcode),
    barcodespider: (barcode) => barcodeSpiderAdapter(barcode),
    "ocr-google": (barcode, ctx) => ocrGoogleAdapter(barcode, ctx),
  };
}

function buildAdapters(
  overrides?: Partial<Record<AdapterKey, LookupAdapter>>,
): Partial<Record<AdapterKey, LookupAdapter>> {
  const defaults = defaultAdapters();
  if (overrides) {
    // Test seam: injected adapters REPLACE the chain entirely so no real
    // network adapter ever runs during tests.
    return { ...overrides, primary: overrides.primary ?? defaults.primary };
  }
  if (!config.productLookup.fallbackEnabled) {
    return { primary: defaults.primary };
  }
  return defaults;
}

function isComplete(result: ProductLookupResult): boolean {
  const name = (result.name ?? "").trim();
  const brand = (result.brand ?? "").trim();
  const ingredients = (result.ingredients ?? "").trim();
  const nutrition = result.nutrition;
  const hasNutrition =
    !!nutrition && Object.keys(nutrition).length > 0;
  return name.length > 0 && brand.length > 0 && (ingredients.length > 0 || hasNutrition);
}

export async function lookupProductByBarcode(
  barcodeInput: string,
  options: LookupOptions = {},
): Promise<LookupOutcome> {
  const barcode = rejectInvalidBarcode(barcodeInput);
  const ctx = options.context ?? {};
  const cache = getCache();
  const cacheKey = `product:fallback:${barcode}`;

  const cached = await cache.get<LookupOutcome>(cacheKey);
  if (cached) {
    logger.info("product_lookup_cache_hit", { barcode, source: cached.source });
    return { ...cached, cached: true };
  }

  const adapters = buildAdapters(options.adapters);
  const start = Date.now();

  // ── 1. Primary FoodGuard pipeline ─────────────────────────────
  const primaryResult = await runAdapterSafely(
    "primary",
    adapters.primary ? () => adapters.primary!(barcode, ctx) : undefined,
    barcode,
  );
  let product: ProductLookupResult | null = null;
  const mergedFrom: string[] = [];

  if (primaryResult && validateLookupResult(primaryResult, barcode).valid) {
    product = primaryResult;

    // LOCAL-FIRST FAST PATH: When the Indian dataset already identified
    // this product with high confidence (≥0.9), treat it as authoritative
    // and skip the slow external enrichment cascade entirely. This is the
    // #1 fix for the 37-second barcode lookup — the local dataset is the
    // authoritative source for Indian products.
    const isLocalHighConfidence =
      primaryResult.source === "indian_dataset" &&
      primaryResult.confidence >= 0.9;

    if (isLocalHighConfidence) {
      logger.info("product_lookup_local_fast_path", {
        barcode,
        source: primaryResult.source,
        confidence: primaryResult.confidence,
        durationMs: Date.now() - start,
      });
      await finalize(product, barcode, cacheKey, mergedFrom, start, !options.adapters);
      return outcome(product, mergedFrom, false);
    }

    // Enrich missing fields from trustworthy secondary sources (never
    // overwrite primary data). Only when fallbacks are enabled.
    if (!isComplete(primaryResult) && (options.adapters || config.productLookup.fallbackEnabled)) {
      for (const key of ENRICHMENT_ORDER) {
        const adapter = adapters[key];
        if (!adapter) continue;
        const extra = await runAdapterSafely(
          key,
          () => adapter(barcode, ctx),
          barcode,
        );
        if (!extra) continue;
        if (!validateLookupResult(extra, barcode).valid) continue;
        const before = JSON.stringify(product);
        product = mergeLookupResults(product, extra);
        if (JSON.stringify(product) !== before) {
          mergedFrom.push(key);
          logger.info("product_lookup_enriched", {
            barcode,
            from: key,
            mergedFrom,
          });
          if (isComplete(product)) break;
        }
      }
    }
    await finalize(product, barcode, cacheKey, mergedFrom, start, !options.adapters);
    return outcome(product, mergedFrom, false);
  }

  // ── 2..5. External fallback chain (strict order) ──────────────
  const fallbackKeys: AdapterKey[] = [
    "google",
    "barcode-list",
    "barcodesdatabase",
    "barcodespider",
  ];
  for (const key of fallbackKeys) {
    const adapter = adapters[key];
    if (!adapter) continue;
    const result = await runAdapterSafely(key, () => adapter(barcode, ctx), barcode);
    if (result && validateLookupResult(result, barcode).valid) {
      product = result;
      await finalize(product, barcode, cacheKey, [], start, !options.adapters);
      return outcome(product, [], false);
    }
  }

  // ── 6. OCR + product-name fallback ────────────────────────────
  if (adapters["ocr-google"] && (ctx.productName || ctx.ocrText)) {
    const result = await runAdapterSafely(
      "ocr-google",
      () => adapters["ocr-google"]!(barcode, ctx),
      barcode,
    );
    if (result && validateLookupResult(result, barcode).valid) {
      product = result;
      await finalize(product, barcode, cacheKey, [], start, !options.adapters);
      return outcome(product, [], false);
    }
  }

  // ── 7. Nothing reliable ───────────────────────────────────────
  logger.info("product_lookup_not_found", { barcode, durationMs: Date.now() - start });
  const notFound: LookupOutcome = {
    success: false,
    source: "none",
    confidence: 0,
    mergedFrom: [],
    cached: false,
  };
  await cache.set(cacheKey, notFound, CACHE_TTL_NOT_FOUND_SECONDS);
  return notFound;
}

async function finalize(
  product: ProductLookupResult,
  barcode: string,
  cacheKey: string,
  mergedFrom: string[],
  start: number,
  offEnrich = true,
): Promise<void> {
  // Open Food Facts loop: when the product has no image, pull one from OFF so
  // the frontend always has art. Mirrors the analysis / alternatives path and
  // is best-effort (decorative) — never breaks the lookup. Skipped when tests
  // inject adapters so unit runs stay hermetic.
  if (offEnrich && product.found && !product.imageUrl) {
    const imageUrl = await fetchOffImageUrl(barcode);
    if (imageUrl) {
      product.imageUrl = imageUrl;
      if (!mergedFrom.includes("openfoodfacts")) mergedFrom.push("openfoodfacts");
      logger.info("product_lookup_off_image", { barcode, imageUrl, mergedFrom });
    }
  }

  logger.info("product_lookup_found", {
    barcode,
    source: product.source,
    confidence: product.confidence,
    mergedFrom,
    durationMs: Date.now() - start,
  });
  const outcomeValue: LookupOutcome = {
    success: true,
    product,
    source: product.source,
    confidence: product.confidence,
    mergedFrom,
    cached: false,
  };
  await getCache().set(cacheKey, outcomeValue, CACHE_TTL_FOUND_SECONDS);
}

function outcome(
  product: ProductLookupResult,
  mergedFrom: string[],
  cached: boolean,
): LookupOutcome {
  return {
    success: true,
    product,
    source: product.source,
    confidence: product.confidence,
    mergedFrom,
    cached,
  };
}