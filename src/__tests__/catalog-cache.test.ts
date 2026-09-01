import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageAdapter } from "@/lib/offline/storage";
import {
  catalogCache,
  setCatalogCacheForTesting,
  catalogCacheKey,
  CATALOG_EXPIRY_MS,
} from "@/lib/cache/catalog-cache";
import type { CatalogProductItem } from "@/lib/store/catalog";

const item: CatalogProductItem = {
  id: "FG_1",
  name: "Amul Butter",
  brand: "Amul",
  barcode: "8908003630021",
  category: "dairy",
  categoryLabel: "Dairy",
  imageUrl: null,
  packSize: "500 g",
  price: "240",
  source: "bigbasket",
  cardCreatedAt: "2025-01-01",
  verified: false,
  confidence: 0.5,
  hasNutrition: true,
  hasIngredients: false,
  hasBarcode: true,
};

describe("catalog cache", () => {
  beforeEach(() => {
    setCatalogCacheForTesting(new MemoryStorageAdapter(true));
  });

  it("stores and retrieves a catalog page per query key", async () => {
    const cache = catalogCache();
    await cache.save("amul", "dairy", "new", {
      products: [item],
      total: 1,
      dbTotal: 29557,
      categories: [{ key: "dairy", label: "Dairy", count: 1 }],
      fetchedAt: Date.now(),
    });

    const record = await cache.get("amul", "dairy", "new");
    expect(record).not.toBeNull();
    expect(record?.data.products[0]?.name).toBe("Amul Butter");
    expect(record?.data.dbTotal).toBe(29557);

    // Different query key does not collide.
    expect(await cache.get("amul", "all", "new")).toBeNull();
  });

  it("keys are stable and encode the full query", () => {
    expect(catalogCacheKey("  AMUL ", "dairy", "new")).toBe("catalog:amul:dairy:new");
    expect(catalogCacheKey("amul", "dairy", "new")).toBe("catalog:amul:dairy:new");
  });

  it("does not serve expired entries", async () => {
    const cache = catalogCache();
    const now = Date.now();
    await cache.save(
      "amul",
      "all",
      "new",
      { products: [item], total: 1, dbTotal: 1, categories: [], fetchedAt: now },
      now - CATALOG_EXPIRY_MS - 1000,
    );
    expect(await cache.get("amul", "all", "new")).toBeNull();
  });

  it("clears the catalog store", async () => {
    const cache = catalogCache();
    await cache.save("amul", "all", "new", { products: [item], total: 1, dbTotal: 1, categories: [], fetchedAt: Date.now() });
    await cache.clear();
    expect(await cache.get("amul", "all", "new")).toBeNull();
  });
});