import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryStorageAdapter } from "@/lib/offline/storage";
import { setCatalogCacheForTesting, catalogCache } from "@/lib/cache/catalog-cache";
import {
  normalizeSearchQuery,
  dedupeCatalogProducts,
  searchCatalogProducts,
} from "@/lib/search/search-service";
import type { CatalogProductItem } from "@/lib/store/catalog";

const item = (overrides: Partial<CatalogProductItem> = {}): CatalogProductItem => ({
  id: "FG_1",
  name: "Amul Butter",
  brand: "Amul",
  barcode: "8908003630021",
  category: "dairy",
  categoryLabel: "Dairy",
  imageUrl: "https://cdn.example.com/amul-butter.jpg",
  packSize: "500 g",
  price: "240",
  source: "bigbasket",
  cardCreatedAt: "2025-01-01",
  verified: false,
  confidence: 0.5,
  hasNutrition: true,
  hasIngredients: false,
  hasBarcode: true,
  ...overrides,
});

const catalogResponse = {
  success: true,
  data: {
    products: [{ ...item() }],
    total: 1,
    dbTotal: 29557,
    page: 1,
    limit: 24,
    hasMore: false,
    categories: [{ key: "dairy", label: "Dairy", count: 1 }],
  },
};

describe("normalizeSearchQuery", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeSearchQuery("   Amul   Butter  ")).toBe("amul butter");
  });

  it("turns hyphens into spaces", () => {
    expect(normalizeSearchQuery("curd-and-cream 8908-0036")).toBe("curd cream 8908 0036");
  });

  it("drops connective 'and' and '&' between terms", () => {
    expect(normalizeSearchQuery("milk & cream and butter")).toBe("milk cream butter");
  });

  it("returns empty string for blank input", () => {
    expect(normalizeSearchQuery("   ")).toBe("");
    expect(normalizeSearchQuery("")).toBe("");
  });
});

describe("dedupeCatalogProducts", () => {
  it("keeps one card per barcode across duplicate imported rows", () => {
    const list = [
      item({ id: "FG_1", barcode: "8908003630021", name: "Amul Butter" }),
      item({ id: "FG_2", barcode: "8908003630021", name: "Amul Butter" }),
      item({ id: "FG_3", barcode: "8908003630021", name: "Amul Butter" }),
    ];
    expect(dedupeCatalogProducts(list).map((p) => p.id)).toEqual(["FG_1"]);
  });

  it("dedupes barcode-less products by normalized name", () => {
    const list = [
      item({ id: "FG_1", barcode: "", name: "Amul Milk Cake" }),
      item({ id: "FG_2", barcode: "8908003630021", name: "Amul Milk Cake" }),
      item({ id: "FG_3", barcode: "", name: "Amul Milk Cake" }),
    ];
    expect(dedupeCatalogProducts(list).map((p) => p.id)).toEqual(["FG_1", "FG_2"]);
  });

  it("falls back to id when both barcode and name are missing", () => {
    const list = [
      item({ id: "FG_1", barcode: "", name: "" }),
      item({ id: "FG_2", barcode: "", name: "" }),
    ];
    expect(dedupeCatalogProducts(list).map((p) => p.id)).toEqual(["FG_1", "FG_2"]);
  });

  it("preserves order and does not merge distinct names", () => {
    const list = [
      item({ id: "FG_1", barcode: "", name: "Amul Milk Cake" }),
      item({ id: "FG_2", barcode: "", name: "Amul Fresh Milk 500 ml" }),
      item({ id: "FG_3", barcode: "", name: "Amul Milk Cake" }),
    ];
    expect(dedupeCatalogProducts(list).map((p) => p.name)).toEqual([
      "Amul Milk Cake",
      "Amul Fresh Milk 500 ml",
    ]);
  });
});

describe("searchCatalogProducts", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    setCatalogCacheForTesting(new MemoryStorageAdapter(true));
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches on a cache miss and returns the fresh payload", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => catalogResponse,
    });

    const result = await searchCatalogProducts({ query: "  Amul-Butter  ", category: "dairy", sort: "new" });

    expect(result.fromCache).toBe(false);
    expect(result.products[0]?.name).toBe("Amul Butter");
    expect(result.categories[0]?.key).toBe("dairy");

    // The normalized query was sent to the API, and the result was cached.
    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("search=amul+butter");
    expect(requestedUrl).toContain("category=dairy");

    const cached = await catalogCache().get("amul butter", "dairy", "new");
    expect(cached?.data.products[0]?.id).toBe("FG_1");
  });

  it("serves the cached result instantly and refreshes in the background", async () => {
    const cache = catalogCache();
    await cache.save("amul butter", "dairy", "new", {
      products: [{ ...item(), id: "CACHED" }],
      total: 1,
      dbTotal: 29557,
      categories: [{ key: "dairy", label: "Dairy", count: 1 }],
      fetchedAt: Date.now(),
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...catalogResponse,
        data: { ...catalogResponse.data, products: [{ ...item(), id: "FRESH" }] },
      }),
    });

    const result = await searchCatalogProducts({ query: "amul butter", category: "dairy", sort: "new" });

    // Cache-first: stale content surfaced now.
    expect(result.fromCache).toBe(true);
    expect(result.products[0]?.id).toBe("CACHED");

    // The background refresh did hit the network.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Let the revalidation settle and confirm the cache now holds fresh data.
    await vi.waitFor(async () => {
      const cached = await catalogCache().get("amul butter", "dairy", "new");
      return expect(cached?.data.products[0]?.id).toBe("FRESH");
    });
  });

  it("throws when the API reports failure", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: { message: "boom" } }),
    });

    await expect(searchCatalogProducts({ query: "kurkure" })).rejects.toThrow("boom");
  });

  it("returns an empty result instead of throwing when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new DOMException("The user aborted a request.", "AbortError"));

    const result = await searchCatalogProducts({ query: "amul", signal: controller.signal });
    expect(result.products).toEqual([]);
    expect(result.fromCache).toBe(false);
  });

  it("loads later pages over the network with the page param", async () => {
    const page2 = {
      ...catalogResponse,
      data: {
        ...catalogResponse.data,
        page: 2,
        hasMore: true,
        products: [{ ...item(), id: "FG_2", name: "Amul Fresh Milk 500 ml" }],
      },
    };
    fetchMock.mockResolvedValue({ ok: true, json: async () => page2 });

    const result = await searchCatalogProducts({ query: "milk", category: "all", page: 2 });

    expect(result.page).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(result.products[0]?.id).toBe("FG_2");

    // Page > 1 always hits the network and never reads the on-device cache.
    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("page=2");
    expect(requestedUrl).toContain("search=milk");
    expect(await catalogCache().get("milk", "all", "new")).toBeNull();
  });
});