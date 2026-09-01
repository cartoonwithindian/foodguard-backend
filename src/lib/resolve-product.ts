/**
 * Unified product-resolution service — local-first.
 *
 * Every input method (barcode scan, manual barcode, product-name search, and
 * product photo / OCR) funnels through `resolveProduct*` helpers. Resolution
 * prefers local sources in this order:
 *
 *   1. on-device IndexedDB cache       (instant, offline-friendly, SWR)
 *   2. bundled offline database        (tiny curated subset, `local_database`)
 *   3. FoodGuard server API            (`/api/products/barcode|/search|/scan/label`)
 *
 * Network calls are wrapped with a timeout, transient retries and in-flight
 * dedup (request-manager). Every resolved product records how it was found in
 * `resolutionSource` (`local_cache` / `local_database` / `network` / `fallback`).
 * Cache provenance never lowers `product.confidence`.
 */
import type {
  ExtractedInfo,
  IdentifiedProduct,
  ProductResolution,
  ProductSource,
} from "@/types/identification";
import { normalizeBarcode } from "@/types/identification";
import { getProductCache, isStaleRecord } from "@/lib/cache/product-cache";
import type { ProductCacheRecord } from "@/lib/cache/product-cache";
import { getStorage } from "@/lib/offline/storage";
import { lookupOfflineByBarcode, searchOfflineByName } from "@/lib/offline/local-database";
import { httpJson } from "@/lib/network/request-manager";
import { isOnline, NETWORK_TIMEOUTS } from "@/lib/network/network-status";
import { canCompressClientSide, compressImageForUpload } from "@/lib/image/compress";
import { logger } from "@/lib/logger";

export type BarcodeLookupResponse = {
  success: boolean;
  data?: {
    product: {
      id: string;
      barcode: string;
      name: string;
      brand: string | null;
      category: string;
      country?: string | null;
      servingSize?: string | null;
      imageUrl?: string | null;
      ingredientsRaw?: string;
      verified?: boolean;
      isDemo?: boolean;
      productDataConfidence?: number;
    };
    nutrition?: Record<string, unknown> | null;
    source?: string;
    confidence?: number;
    mergedFrom?: string[];
    cached?: boolean;
  };
  error?: { message?: string } | null;
};

export type NameSearchResponse = {
  success: boolean;
  data?: {
    products: Array<{
      id: string;
      name: string;
      brand: string;
      category: string;
      barcode: string;
      score: number;
      ingredients?: string;
      isDemo?: boolean;
      verified?: boolean;
    }>;
    total: number;
  };
  error?: { message?: string } | null;
};

export type ScanLabelResponse = {
  success: boolean;
  barcode?: {
    value: string | null;
    format: string | null;
    status: "success" | "not_found" | "failed";
  };
  ocr?: {
    text: string;
    status: "success" | "failed";
    confidence: number | null;
    needsReview: boolean;
    provider: string;
  };
  ingredients?: string[];
  ingredientsText?: string;
  nutrition?: Record<string, unknown> | null;
  product?: {
    id: string;
    name: string;
    brand: string | null;
    category: string;
    barcode: string;
    source: string;
    confidence: number;
  };
  sources?: string[];
  rawText?: string;
  error?: string;
};

function friendlyError(op: string): string {
  return `We couldn't ${op} right now. Please check your connection and try again.`;
}

/** Only durable (IndexedDB / test-injected) storage powers the local cache. */
function cacheUsable(): boolean {
  return getStorage().supported();
}

function barcodeDedupeKey(barcode: string): string {
  return `barcode:${barcode}`;
}

/** Map a barcode-lookup response product into an {@link IdentifiedProduct}. */
function productFromBarcodeJson(
  json: BarcodeLookupResponse,
  source: ProductSource,
  resolutionSource: "network",
): IdentifiedProduct | null {
  const p = json.data?.product;
  if (!p) return null;
  const confidence = typeof json.data?.confidence === "number" ? json.data.confidence : 0.5;
  return {
    id: p.id ?? "",
    barcode: p.barcode,
    name: p.name || `Product ${p.barcode}`,
    brand: p.brand ?? "",
    category: p.category || "food",
    imageUrl: p.imageUrl ?? null,
    ingredientsRaw: p.ingredientsRaw ?? "",
    nutrition: json.data?.nutrition ?? null,
    source,
    sourceDetail: json.data?.source,
    confidence: Math.max(0, Math.min(1, confidence)),
    isDemo: p.isDemo,
    verified: p.verified,
    resolutionSource,
  };
}

/** Apply a cached product to a resolution (never lowering its confidence). */
function productFromCache(record: ProductCacheRecord, source: ProductSource): IdentifiedProduct {
  return {
    ...record.product,
    source,
    resolutionSource: "local_cache",
    cachedAt: record.updatedAt,
  };
}

/**
 * Background stale-while-revalidate refresh for a barcode. Fires a network
 * lookup without awaiting; failures are swallowed so the cached view is
 * never replaced by an error.
 */
async function refreshBarcode(barcode: string, source: ProductSource): Promise<void> {
  const clean = normalizeBarcode(barcode);
  if (!clean) return;
  try {
    const response = await httpJson(`/api/products/barcode/${encodeURIComponent(clean)}`, {
      timeoutMs: NETWORK_TIMEOUTS.lookup,
      dedupeKey: barcodeDedupeKey(clean),
    });
    const json = (await response.json().catch(() => null)) as BarcodeLookupResponse | null;
    if (!response.ok || !json?.success || !json.data?.product) return;
    const product = productFromBarcodeJson(json, source, "network");
    if (product) await getProductCache().save(product, "network");
  } catch (error) {
    logger.debug("swr_refresh_failed", { barcode: clean, error: String(error) });
  }
}

/**
 * Resolve a product by barcode (camera scan or manual entry both work).
 *
 * Order: on-device cache (instant) → bundled offline database (when offline)
 * → FoodGuard API (with timeout + transient retry + dedup). Cached results
 * are returned immediately; stale results trigger a background refresh.
 */
export async function resolveProductByBarcode(
  barcode: string,
  source: ProductSource,
): Promise<ProductResolution> {
  const clean = normalizeBarcode(barcode);
  if (!clean) {
    return { status: "error", message: "Please enter a barcode number." };
  }

  const cache = cacheUsable() ? getProductCache() : null;

  // 1. On-device cache — instant, works fully offline.
  if (cache) {
    const record = await cache.getByBarcode(clean);
    if (record) {
      const product = productFromCache(record, source);
      if (isStaleRecord(record)) {
        // Serve stale immediately, refresh in the background (SWR).
        void refreshBarcode(clean, source);
      }
      return { status: "resolved", product, extracted: { barcode: clean } };
    }
  }

  const online = isOnline();

  // 2. Offline → bundled offline database.
  if (!online) {
    const offline = lookupOfflineByBarcode(clean);
    if (offline) {
      return { status: "resolved", product: offline, extracted: { barcode: clean } };
    }
    return { status: "error", message: friendlyError("search for that barcode") };
  }

  // 3. Network (FoodGuard API), with timeout + transient retry + dedup.
  try {
    const response = await httpJson(`/api/products/barcode/${encodeURIComponent(clean)}`, {
      timeoutMs: NETWORK_TIMEOUTS.lookup,
      dedupeKey: barcodeDedupeKey(clean),
    });
    const json = (await response.json().catch(() => null)) as BarcodeLookupResponse | null;

    if (!response.ok || !json?.success || !json.data?.product) {
      return {
        status: "not_found",
        barcode: clean,
        extracted: { barcode: clean },
      };
    }

    const product = productFromBarcodeJson(json, source, "network");
    if (!product) {
      return {
        status: "not_found",
        barcode: clean,
        extracted: { barcode: clean },
      };
    }
    if (cache) {
      void cache.save(product, "network");
    }
    return { status: "resolved", product, extracted: { barcode: clean } };
  } catch {
    // 4. Network failed after retries → last-resort offline database.
    const offline = lookupOfflineByBarcode(clean);
    if (offline) {
      return { status: "resolved", product: offline, extracted: { barcode: clean } };
    }
    return { status: "error", message: friendlyError("search for that barcode") };
  }
}

/**
 * Search FoodGuard's database by product name / brand / partial name.
 *
 * When offline the bundled offline database + on-device cache back the query;
 * when online the server search runs and its hits are cached for later
 * offline use.
 */
export async function searchProductCandidates(query: string): Promise<ProductResolution> {
  const q = query.trim();
  if (!q) {
    return { status: "error", message: "Type a product name or brand to search." };
  }

  const online = isOnline();
  const cache = cacheUsable() ? getProductCache() : null;

  // Offline / degraded: search locally (cache + offline database).
  if (!online) {
    const cached = (cache ? await cache.searchCached(q, 12) : []).map((record) =>
      productFromCache(record, "name_search"),
    );
    const local = searchOfflineByName(q, 12);
    const candidates = mergeCandidates([...cached, ...local]);
    return fromCandidates(candidates, { query: q });
  }

  try {
    const response = await httpJson(`/api/products/search?q=${encodeURIComponent(q)}`, {
      timeoutMs: NETWORK_TIMEOUTS.lookup,
      dedupeKey: `search:${q}`,
    });
    const json = (await response.json().catch(() => null)) as NameSearchResponse | null;

    if (!response.ok || !json?.success || !json.data) {
      return { status: "error", message: friendlyError("search products") };
    }

    const candidates: IdentifiedProduct[] = (json.data.products ?? []).map((p) => ({
      id: p.id,
      barcode: p.barcode,
      name: p.name,
      brand: p.brand ?? "",
      category: p.category || "food",
      ingredientsRaw: p.ingredients ?? "",
      source: "name_search",
      sourceDetail: `search:${q}`,
      confidence: typeof p.score === "number" ? Math.max(0, Math.min(1, p.score / 100)) : 0.5,
      isDemo: p.isDemo,
      verified: p.verified,
      resolutionSource: "network",
    }));

    // Cache network hits for later offline use.
    if (cache) {
      for (const product of candidates) {
        if (product.barcode) void cache.save(product, "network");
      }
    }
    return fromCandidates(candidates, { query: q });
  } catch {
    // Network failed → surface local matches if any, otherwise a friendly error.
    const cached = (cache ? await cache.searchCached(q, 12) : []).map((record) =>
      productFromCache(record, "name_search"),
    );
    const local = searchOfflineByName(q, 12);
    const candidates = mergeCandidates([...cached, ...local]);
    if (candidates.length > 0) return fromCandidates(candidates, { query: q });
    return { status: "error", message: friendlyError("search products") };
  }
}

/** De-duplicate + order candidates by confidence, capping the list. */
function mergeCandidates(input: IdentifiedProduct[]): IdentifiedProduct[] {
  const byBarcode = new Map<string, IdentifiedProduct>();
  for (const candidate of input) {
    const key = candidate.barcode || candidate.name.toLowerCase();
    const existing = byBarcode.get(key);
    if (existing && existing.resolutionSource === "network" && !existing.id.startsWith("offline-")) {
      continue; // prefer network-resolved data
    }
    byBarcode.set(key, candidate);
  }
  return [...byBarcode.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 15);
}

function fromCandidates(
  candidates: IdentifiedProduct[],
  extra: { query?: string; extracted?: ExtractedInfo },
): ProductResolution {
  if (candidates.length === 0) {
    return { status: "not_found", query: extra.query, extracted: extra.extracted };
  }
  if (candidates.length === 1) {
    return {
      status: "resolved",
      product: candidates[0],
      extracted: extra.extracted ?? { productName: extra.query },
    };
  }
  return { status: "candidates", candidates, query: extra.query, extracted: extra.extracted };
}

/**
 * Identify a product from a photo/package image through the server pipeline.
 *
 * The image is compressed on-device before upload (adaptive target by network
 * quality) — never uploading a raw multi-MB frame on a slow connection.
 */
export async function resolveProductByPhoto(
  file: Blob | File,
): Promise<{ resolution: ProductResolution; extracted: ExtractedInfo }> {
  const extracted: ExtractedInfo = {};

  try {
    // Adaptively compress before upload; pass through when not possible.
    let upload: Blob = file;
    if (canCompressClientSide() && isOnline()) {
      try {
        upload = await compressImageForUpload(file);
      } catch {
        upload = file;
      }
    }

    const form = new FormData();
    const blob = upload instanceof Blob ? upload : new Blob([upload], { type: "image/jpeg" });
    const ext = blob.type.includes("png")
      ? "png"
      : blob.type.includes("webp")
        ? "webp"
        : blob.type.includes("heic") || blob.type.includes("heif")
          ? "heic"
          : "jpg";
    form.append("image", blob, `label.${ext}`);
    form.append("detectBarcode", "true");

    // Best-effort client-side CLIP embedding so the backend can return
    // visually-similar products via FAISS only. Never blocks the scan: any
    // failure (model unavailable / slow / errored) just omits the vector.
    try {
      const { config } = await import("@/lib/config");
      if (config.visualSearch.clientEmbed && typeof window !== "undefined") {
        const { embedImage } = await import("@/lib/visual-embed");
        const vector = await embedImage(blob);
        form.append("embedding", JSON.stringify(vector));
      }
    } catch {
      // ignore — visual search candidates are optional
    }

    const response = await httpJson("/api/scan/label", {
      method: "POST",
      body: form,
      timeoutMs: NETWORK_TIMEOUTS.upload,
    });
    const json = (await response.json().catch(() => null)) as (ScanLabelResponse & {
      rawText?: string;
      ingredientsText?: string;
      productName?: string;
    }) | null;

    if (!response.ok || !json?.success) {
      const message =
        json?.error ||
        "We couldn't read this photo. Try a clearer, well-lit image of the packaging.";
      return { resolution: { status: "error", message, extracted }, extracted };
    }

    // Fill extracted info
    const barcodeValue = json.barcode?.value ?? null;
    const ocrText = json.ocr?.text ?? json.rawText ?? "";
    extracted.barcode = barcodeValue ?? undefined;
    extracted.ocrText = ocrText || undefined;
    extracted.ingredientsText = json.ingredientsText ?? undefined;
    extracted.nutrition = json.nutrition ?? null;
    extracted.ocrConfidence = json.ocr?.confidence ?? undefined;
    extracted.needsReview = json.ocr?.needsReview ?? false;

    const nameGuess = guessProductName(ocrText, json.product?.name);
    extracted.productName = nameGuess || undefined;

    // 1. Barcode detected on the photo -> resolve straight through barcode.
    if (barcodeValue) {
      const resolution = await resolveProductByBarcode(barcodeValue, "photo_ocr");
      return { resolution, extracted };
    }

    // 2. No barcode but OCR gave a name -> run name matching.
    if (nameGuess) {
      const resolution = await searchProductCandidates(nameGuess);
      if (resolution.status === "candidates" || resolution.status === "resolved") {
        return { resolution: { ...resolution, extracted }, extracted };
      }
      return {
        resolution: { status: "not_found", query: nameGuess, extracted },
        extracted,
      };
    }

    // 3. Nothing usable detected.
    return {
      resolution: {
        status: "not_found",
        extracted,
      },
      extracted,
    };
  } catch {
    return {
      resolution: { status: "error", message: friendlyError("read this photo") },
      extracted,
    };
  }
}

/**
 * Local-first photo resolution: try the on-device barcode decoder first
 * (works offline and online), then fall back to pure-client OCR when offline
 * or on slow connections, and only then to the server OCR pipeline.
 */
export async function resolveProductByPhotoLocalFirst(
  file: Blob | File,
  onProgress?: (status: string) => void,
): Promise<{ resolution: ProductResolution; extracted: ExtractedInfo }> {
  const extracted: ExtractedInfo = {};

  // 1. Local barcode decode — fast and offline-friendly.
  if (typeof window !== "undefined") {
    try {
      const { decodeBarcodeFromImage } = await import("@/lib/barcode/decoder");
      const barcode = await decodeBarcodeFromImage(file);
      if (barcode?.value) {
        extracted.barcode = barcode.value;
        const resolution = await resolveProductByBarcode(barcode.value, "photo_ocr");
        return { resolution, extracted };
      }
    } catch {
      // fall through to OCR / server
    }
  }

  const online = isOnline();

  // 2. Offline / slow → pure-client OCR.
  if (!online) {
    onProgress?.("Running offline OCR");
    const { recognizeLocal } = await import("@/lib/offline/local-ocr");
    const ocr = await recognizeLocal(file, (status) => onProgress?.(status));
    if (ocr?.text) {
      extracted.ocrText = ocr.text;
      extracted.ocrConfidence = ocr.confidence;
      extracted.needsReview = ocr.confidence < 0.6;
      const nameGuess = guessProductName(ocr.text);
      if (nameGuess) {
        extracted.productName = nameGuess;
        const resolution = await searchProductCandidates(nameGuess);
        if (resolution.status === "candidates" || resolution.status === "resolved") {
          return { resolution: { ...resolution, extracted }, extracted };
        }
        return { resolution: { status: "not_found", query: nameGuess, extracted }, extracted };
      }
    }
    return { resolution: { status: "not_found", extracted }, extracted };
  }

  // 3. Online → server pipeline (compressed upload).
  return resolveProductByPhoto(file);
}

/**
 * Best-effort product name extraction from raw OCR text.
 * Prefers the first short non-empty line that carries a retail name look.
 */
export function guessProductName(ocrText: string, known?: string | null): string | null {
  if (known && known.trim()) return known.trim().slice(0, 200);
  if (!ocrText) return null;

  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const stop = new Set([
    "ingredients",
    "ingredient",
    "nutrition",
    "nutritional",
    "value",
    "values",
    "manufactured",
    "marketed",
    "fssai",
    "lic",
    "contains",
    "may contain",
    "net weight",
    "best before",
    "storage",
    "serve",
    "serving",
    "per 100g",
    "per serving",
    "energy",
    "protein",
    "carbohydrates",
    "fat",
    "salt",
    "sugar",
    "imported",
    "imported by",
    "distributed",
  ]);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (stop.has(lower)) continue;
    if (/^\d/.test(line)) continue; // barcodes / percentages / dates
    if (lower.includes("www.") || lower.includes(".com") || lower.includes(".in")) continue;
    if (line.length < 2 || line.length > 60) continue;
    if (/^[\d\s.,%]+$/.test(line)) continue;
    return line;
  }
  return null;
}

/**
 * Build the /analysis route path that feeds the SAME Product Analysis
 * pipeline used by barcode scanning.
 */
export function buildAnalysisPath(
  product: IdentifiedProduct,
  extracted?: ExtractedInfo,
  imageUrl?: string | null,
): string {
  const params = new URLSearchParams();
  if (product.barcode) params.set("barcode", product.barcode);
  else if (extracted?.barcode) params.set("barcode", extracted.barcode);
  if (product.name && product.name !== `Product ${product.barcode}`) {
    params.set("productName", product.name);
  }
  if (product.brand) params.set("brand", product.brand);
  if (product.ingredientsRaw) params.set("ingredients", product.ingredientsRaw);
  if (extracted?.ocrText) params.set("ocrText", extracted.ocrText);
  if (typeof extracted?.ocrConfidence === "number") {
    params.set("ocrConfidence", String(extracted.ocrConfidence));
  }
  const img = imageUrl || product.imageUrl || extracted?.imageUrl;
  if (img) params.set("imageUrl", img);
  const qs = params.toString();
  return qs ? `/analysis?${qs}` : "/analysis";
}