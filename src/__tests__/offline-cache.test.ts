import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  MemoryStorageAdapter,
  STORE_ANALYSIS,
  STORE_IMAGES,
} from "@/lib/offline/storage";
import {
  getProductCache,
  setProductCacheForTesting,
  productStaleness,
  PRODUCT_FRESH_MS,
  PRODUCT_EXPIRY_MS,
} from "@/lib/cache/product-cache";
import type { IdentifiedProduct } from "@/types/identification";
import {
  getAnalysisCache,
  setAnalysisCacheForTesting,
  analysisCacheKey,
} from "@/lib/cache/analysis-cache";
import {
  getImageCache,
  setImageCacheForTesting,
  IMAGE_CACHE_MAX_ENTRIES,
} from "@/lib/cache/image-cache";
import {
  getSyncQueue,
  setSyncQueueForTesting,
} from "@/lib/offline/sync-queue";
import {
  lookupOfflineByBarcode,
  searchOfflineByName,
  offlineProductCount,
} from "@/lib/offline/local-database";
import type { ProductAnalysisResult } from "@/data/analysis-data";

const product = (overrides: Partial<IdentifiedProduct> = {}): IdentifiedProduct => ({
  id: "p1",
  barcode: "8901491100519",
  name: "Kurkure Masala Munch",
  brand: "Kurkure",
  category: "food",
  source: "barcode",
  confidence: 0.9,
  ...overrides,
});

let adapter: MemoryStorageAdapter;

beforeEach(() => {
  adapter = new MemoryStorageAdapter(true);
  setProductCacheForTesting(adapter);
  setAnalysisCacheForTesting(adapter);
  setImageCacheForTesting(adapter);
  setSyncQueueForTesting(adapter);
});

afterEach(() => {
  setProductCacheForTesting(null);
  setAnalysisCacheForTesting(null);
  setImageCacheForTesting(null);
  setSyncQueueForTesting(null);
});

describe("product-cache", () => {
  it("saves and retrieves by barcode, preserving provenance", async () => {
    await getProductCache().save(product(), "network");
    const record = await getProductCache().getByBarcode(" 8901491100519 ");
    expect(record).not.toBeNull();
    expect(record?.resolutionSource).toBe("network");
    expect(record?.product.name).toBe("Kurkure Masala Munch");
    expect(record?.product.confidence).toBe(0.9);
  });

  it("retrieves by product id", async () => {
    await getProductCache().save(product(), "local_database");
    const record = await getProductCache().getById("p1");
    expect(record?.product.barcode).toBe("8901491100519");
  });

  it("drops expired records", async () => {
    const now = Date.now();
    await getProductCache().save(product(), "network", now - PRODUCT_EXPIRY_MS - 1000);
    expect(await getProductCache().getByBarcode("8901491100519")).toBeNull();
  });

  it("marks stale-but-usable records as stale", async () => {
    const now = Date.now();
    await getProductCache().save(product(), "network", now - PRODUCT_FRESH_MS - 1000);
    const record = await getProductCache().getByBarcode("8901491100519");
    expect(record).not.toBeNull();
    expect(productStaleness(record!)).toBe("stale");
  });

  it("searches cached products by brand substring", async () => {
    await getProductCache().save(product(), "network");
    const hits = await getProductCache().searchCached("kurkure");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].product.name).toContain("Kurkure");
  });

  it("invalidates and clears", async () => {
    await getProductCache().save(product(), "network");
    await getProductCache().invalidateBarcode("8901491100519");
    expect(await getProductCache().getByBarcode("8901491100519")).toBeNull();

    await getProductCache().save(product(), "network");
    await getProductCache().clear();
    expect(await getProductCache().count()).toBe(0);
  });
});

describe("analysis-cache", () => {
  const result = {
    id: "a1",
    name: "Test Product",
    brand: "Test",
    category: "food",
    barcode: "890123",
    assessment: "low",
    score: 20,
    positivePoints: [],
    attentionPoints: [],
    ingredients: [],
    evidenceSources: [],
    alternativeSuggestions: [],
    scanDate: "",
    imageUrl: null,
    nutrition: null,
    regulatory: null,
  } as unknown as ProductAnalysisResult;

  it("builds a stable key (barcode wins over name)", () => {
    expect(analysisCacheKey(" 890123 ", "Whatever")).toBe("b:890123");
    expect(analysisCacheKey("", "Amul Butter")).toBe("n:amul butter");
    expect(analysisCacheKey("", "")).toBeNull();
  });

  it("saves and retrieves an analysis", async () => {
    const key = analysisCacheKey("890123", "")!;
    await getAnalysisCache().save(key, result);
    const record = await getAnalysisCache().get(key);
    expect(record?.result.name).toBe("Test Product");
  });

  it("treats a version mismatch as expired", async () => {
    const key = analysisCacheKey("890123", "")!;
    await getAnalysisCache().save(key, result);
    const now = Date.now();
    await adapter.set(STORE_ANALYSIS, key, {
      key,
      result,
      version: 999,
      updatedAt: now,
      staleAt: now + 10000,
      expiresAt: now + 100000,
    });
    expect(await getAnalysisCache().get(key)).toBeNull();
  });

  it("invalidates", async () => {
    const key = analysisCacheKey("890123", "")!;
    await getAnalysisCache().save(key, result);
    await getAnalysisCache().invalidate(key);
    expect(await getAnalysisCache().get(key)).toBeNull();
  });
});

describe("image-cache", () => {
  it("stores and retrieves an image blob", async () => {
    const blob = new Blob(["img"], { type: "image/jpeg" });
    await getImageCache().put("https://cdn.example/1.jpg", blob);
    expect(await getImageCache().get("https://cdn.example/1.jpg")).not.toBeNull();
  });

  it("evicts oldest entries past the bound", async () => {
    for (let i = 0; i < IMAGE_CACHE_MAX_ENTRIES + 3; i++) {
      await getImageCache().put(`url-${i}`, new Blob([`img-${i}`], { type: "image/jpeg" }));
    }
    const rows = await adapter.getAll<unknown>(STORE_IMAGES);
    expect(rows.length).toBe(IMAGE_CACHE_MAX_ENTRIES);
    expect(await getImageCache().get("url-0")).toBeNull();
    expect(await getImageCache().get("url-26")).not.toBeNull();
  });

  it("refuses to cache oversized blobs", async () => {
    const big = new Blob([new Uint8Array(13 * 1024 * 1024)], { type: "image/jpeg" });
    expect(await getImageCache().put("big", big)).toBe(false);
    expect(await getImageCache().get("big")).toBeNull();
  });
});

describe("offline sync queue", () => {
  it("enqueues, lists and processes operations", async () => {
    const op = await getSyncQueue().enqueue("report", { productId: "x" });
    expect(await getSyncQueue().pending()).toBe(1);

    const seen: string[] = [];
    const result = await getSyncQueue().process((entry) => {
      seen.push(entry.type);
    });
    expect(result).toEqual({ ok: 1, failed: 0 });
    expect(seen).toEqual(["report"]);
    expect(await getSyncQueue().pending()).toBe(0);
    expect(op.id).toBeTruthy();
  });

  it("bumps attempts on failure and drops after max attempts", async () => {
    await getSyncQueue().enqueue("report", { productId: "x" });
    const flaky = () => {
      throw new Error("still offline");
    };
    await getSyncQueue().process(flaky);
    const afterFirst = await getSyncQueue().list();
    expect(afterFirst[0].attempts).toBe(1);

    for (let i = 0; i < 10; i++) {
      await getSyncQueue().process(flaky);
    }
    expect(await getSyncQueue().pending()).toBe(0);
  });
});

describe("offline local database", () => {
  it("resolves a seeded barcode offline", () => {
    const found = lookupOfflineByBarcode("8901000000001");
    expect(found).not.toBeNull();
    expect(found?.resolutionSource).toBe("local_database");
    expect(found?.barcode).toBe("8901000000001");
  });

  it("searches by name substring offline", () => {
    const hits = searchOfflineByName("crunchy");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].name.toLowerCase()).toContain("crunchy");
  });

  it("has a small, bounded offline catalog", () => {
    expect(offlineProductCount()).toBeGreaterThan(0);
  });
});