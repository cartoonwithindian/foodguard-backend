import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductInfo } from "@/types/domain";
import type { DataStore } from "@/lib/store/types";
import { listCatalog } from "@/services/catalog.service";

const dbProducts: ProductInfo[] = [
  {
    id: "db-1",
    barcode: "8901058001019",
    name: "Amul Butter",
    brand: "Amul",
    category: "food",
    country: "in",
    servingSize: null,
    imageUrl: null,
    ingredientsRaw: "milk fat",
    ingredientsNormalized: [],
    source: "db",
    sourceUrl: null,
    verified: true,
    productDataConfidence: 0.9,
    isDemo: false,
  },
  {
    id: "db-2",
    barcode: "8901063000456",
    name: "Maggi Noodles",
    brand: "Nestle",
    category: "food",
    country: "in",
    servingSize: null,
    imageUrl: null,
    ingredientsRaw: "",
    ingredientsNormalized: [],
    source: "db",
    sourceUrl: null,
    verified: true,
    productDataConfidence: 0.8,
    isDemo: false,
  },
];

const dataset = [
  // Same barcode as db-1 -> must be deduplicated away
  {
    product: {
      id: "",
      barcode: "8901058001019",
      name: "Amul Butter",
      brand: "Amul",
      category: "food",
      country: null,
      servingSize: null,
      imageUrl: null,
      ingredientsRaw: "milk",
      ingredientsNormalized: [],
      source: "indian_dataset",
      sourceUrl: "https://world.openfoodfacts.org",
      verified: false,
      productDataConfidence: 0.6,
      isDemo: false,
    } as ProductInfo,
    category: "dairy",
    hasNutrition: true,
    hasIngredients: true,
  },
  // New dataset-only product
  {
    product: {
      id: "",
      barcode: "8901764012345",
      name: "Kurkure Masala Munch",
      brand: "PepsiCo",
      category: "food",
      country: "in",
      servingSize: null,
      imageUrl: null,
      ingredientsRaw: "corn",
      ingredientsNormalized: [],
      source: "indian_dataset",
      sourceUrl: "https://world.openfoodfacts.org",
      verified: false,
      productDataConfidence: 0.6,
      isDemo: false,
    } as ProductInfo,
    category: "snacks",
    hasNutrition: true,
    hasIngredients: true,
  },
];

vi.mock("@/lib/store", () => ({
  getStore: vi.fn(),
}));

vi.mock("@/lib/india-dataset", () => ({
  listAllIndianProducts: vi.fn(),
}));

// Avoid loading real Prisma side-effects; only the mocked path is exercised.
vi.mock("@/lib/store/prisma", () => ({ PrismaStore: class {} }));

import { getStore } from "@/lib/store";
import { listAllIndianProducts } from "@/lib/india-dataset";

const mockSearch = vi
  .fn<(query: string, scope: string) => Array<{ product: ProductInfo; score: number }>>()
  .mockResolvedValue(dbProducts.map((p) => ({ product: p, score: 0 })));

const fakeStore = {
  searchProducts: mockSearch,
} as unknown as DataStore;

beforeEach(() => {
  vi.clearAllMocks();
  (getStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeStore);
  (listAllIndianProducts as unknown as ReturnType<typeof vi.fn>).mockReturnValue(dataset);
});

describe("listCatalog (non-SQLite path) — India dataset merge", () => {
  it("browses India dataset products with an empty query", async () => {
    const result = await listCatalog({});
    expect(mockSearch).toHaveBeenCalledWith("", "all");
    // db-1 + db-2 + 1 new dataset product (overlap deduped) = 3
    expect(result.total).toBe(3);
    const names = result.products.map((p) => p.name);
    expect(names).toContain("Kurkure Masala Munch");
  });

  it("deduplicates by barcode so overlapping products appear once", async () => {
    const result = await listCatalog({});
    const amul = result.products.filter((p) => p.name === "Amul Butter");
    expect(amul).toHaveLength(1);
    // Prefer the live DB row (db-1) over the dataset duplicate
    expect(amul[0].id).toBe("db-1");
  });

  it("filters by category", async () => {
    const result = await listCatalog({ category: "snacks" });
    expect(result.products.every((p) => p.category === "snacks")).toBe(true);
    expect(result.products.map((p) => p.name)).toEqual(["Kurkure Masala Munch"]);
  });

  it("filters the merged India dataset by search term", async () => {
    const result = await listCatalog({ search: "kurkure" });
    expect(result.total).toBe(1);
    expect(result.products.map((p) => p.name)).toEqual(["Kurkure Masala Munch"]);
  });

  it("paginates and reports correct totals", async () => {
    const first = await listCatalog({ limit: 2, offset: 0 });
    expect(first.products).toHaveLength(2);
    expect(first.total).toBe(3);

    const second = await listCatalog({ limit: 2, offset: 2 });
    expect(second.products).toHaveLength(1);
  });

  it("covers missing barcodes with name+brand identity", async () => {
    const noBarcodeDb: ProductInfo = {
      ...dbProducts[0],
      id: "db-nobc",
      barcode: "",
      name: "Brandless Butter",
      brand: "NoBrand",
    };
    const noBarcodeDataset = {
      product: {
        ...dataset[1].product,
        barcode: "",
        name: "Brandless Butter",
        brand: "NoBrand",
      },
      category: "dairy",
      hasNutrition: false,
      hasIngredients: false,
    };
    mockSearch.mockResolvedValue([{ product: noBarcodeDb, score: 0 }]);
    (listAllIndianProducts as unknown as ReturnType<typeof vi.fn>).mockReturnValue([noBarcodeDataset]);
    const result = await listCatalog({});
    expect(result.products.length).toBe(1);
    expect(result.products[0].id).toBe("db-nobc");
  });
});
