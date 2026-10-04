import { describe, expect, it } from "vitest";
import {
  COLUMN_LIMITS,
  toAppwriteBarcodeRow,
  toAppwriteProductRow,
  type SqliteProductRow,
} from "@/lib/appwrite/catalog-mapping";

/**
 * The Appwrite import moves 29,650 products. Every row is validated by Appwrite
 * on write, so a single over-long string, malformed URL or unparseable date
 * aborts a batch. These tests pin the normalisation that prevents that.
 */

const base: SqliteProductRow = {
  product_id: "p-001",
  name: "Amul Taaza Toned Milk",
  normalized_name: "amul taaza toned milk",
  brand: "Amul",
  normalized_brand: "amul",
  barcode: "8901491100520",
  variant: null,
  pack_size: "500",
  quantity: "1",
  unit: "ml",
  description: "Toned milk",
  food_type: "dairy",
  dietary: "vegetarian",
  image_url: "https://example.invalid/amul.jpg",
  price: "27.00",
  mrp: "28.00",
  rating: "4.2",
  data_status: "complete",
  completeness_score: 0.91,
  confidence_score: 0.95,
  created_at: "2026-01-02T03:04:05Z",
  updated_at: "2026-01-02T03:04:05Z",
  nutrition_json: '{"energy_kcal":58}',
};

describe("toAppwriteProductRow", () => {
  it("maps snake_case columns onto the Appwrite camelCase document", () => {
    const row = toAppwriteProductRow(base);
    expect(row.productId).toBe("p-001");
    expect(row.normalizedName).toBe("amul taaza toned milk");
    expect(row.normalizedBrand).toBe("amul");
    expect(row.packSize).toBe("500");
    expect(row.foodType).toBe("dairy");
    expect(row.dataStatus).toBe("complete");
    expect(row.completenessScore).toBeCloseTo(0.91);
  });

  it("normalises null, empty and whitespace-only strings to null", () => {
    const row = toAppwriteProductRow({
      ...base,
      name: null,
      brand: "",
      variant: "   ",
    });
    expect(row.name).toBeNull();
    expect(row.brand).toBeNull();
    expect(row.variant).toBeNull();
  });

  it("truncates strings to the declared column size", () => {
    const row = toAppwriteProductRow({
      ...base,
      name: "x".repeat(COLUMN_LIMITS.name + 50),
    });
    expect((row.name as string).length).toBe(COLUMN_LIMITS.name);
  });

  it("drops values the url column would reject", () => {
    // Appwrite rejects a non-URL in a `url` column and fails the whole batch.
    for (const bad of ["not a url", "javascript:alert(1)", "ftp://example.invalid/x.jpg", ""]) {
      expect(toAppwriteProductRow({ ...base, image_url: bad }).imageUrl, bad).toBeNull();
    }
    expect(toAppwriteProductRow({ ...base, image_url: "http://x.invalid/a.jpg" }).imageUrl).toBe(
      "http://x.invalid/a.jpg",
    );
  });

  it("drops unparseable datetimes instead of sending invalid values", () => {
    const row = toAppwriteProductRow({ ...base, created_at: "not-a-date", updated_at: null });
    expect(row.createdAt).toBeNull();
    expect(row.updatedAt).toBeNull();
  });

  it("normalises dates to ISO 8601", () => {
    const row = toAppwriteProductRow({ ...base, created_at: "2026-01-02 03:04:05" });
    expect(row.createdAt).toBe("2026-01-02T03:04:05.000Z");
  });

  it("treats the catalog's naive UTC timestamps as UTC, not machine-local", () => {
    // The catalog stores `datetime.utcnow().isoformat()` output, which carries
    // no offset. Reading it as local time would shift every row by the
    // importer's UTC offset (this machine is Asia/Calcutta, +05:30).
    const naive = toAppwriteProductRow({
      ...base,
      created_at: "2026-08-19T00:24:23.750292",
      updated_at: "2026-08-19T01:24:31.975167",
    });
    expect(naive.createdAt).toBe("2026-08-19T00:24:23.750Z");
    expect(naive.updatedAt).toBe("2026-08-19T01:24:31.975Z");

    // An explicit offset must still be honoured rather than overwritten.
    expect(toAppwriteProductRow({ ...base, created_at: "2026-08-19T00:24:23+02:00" }).createdAt).toBe(
      "2026-08-18T22:24:23.000Z",
    );
    expect(toAppwriteProductRow({ ...base, created_at: "2026-08-19T00:24:23Z" }).createdAt).toBe(
      "2026-08-19T00:24:23.000Z",
    );
  });

  it("re-serialises the nutrition blob and survives malformed JSON", () => {
    expect(toAppwriteProductRow(base).nutrition).toBe('{"energy_kcal":58}');
    expect(toAppwriteProductRow({ ...base, nutrition_json: "{oops" }).nutrition).toBe(
      '{"raw":"{oops"}',
    );
    expect(toAppwriteProductRow({ ...base, nutrition_json: null }).nutrition).toBeNull();
  });

  it("merges the denormalised barcode with the child-table barcodes", () => {
    const row = toAppwriteProductRow(base, { barcodes: ["8901491100520", "8901491100521"] });
    expect(row.barcodes).toEqual(["8901491100520", "8901491100521"]);
  });

  it("keeps products that only exist in the barcodes table scannable", () => {
    const row = toAppwriteProductRow({ ...base, barcode: null }, { barcodes: ["8901491100521"] });
    expect(row.barcode).toBeNull();
    expect(row.barcodes).toEqual(["8901491100521"]);
  });

  it("de-duplicates and orders the ingredient and allergen id arrays", () => {
    const row = toAppwriteProductRow(base, {
      ingredientIds: [30, 10, 30, 20],
      allergenIds: [5, 5],
    });
    expect(row.ingredientIds).toEqual([10, 20, 30]);
    expect(row.allergenIds).toEqual([5]);
  });

  it("defaults missing aggregates to empty arrays, never undefined", () => {
    const row = toAppwriteProductRow(base);
    expect(row.ingredientIds).toEqual([]);
    expect(row.allergenIds).toEqual([]);
    expect(row.sources).toEqual([]);
  });

  it("converts non-numeric scores to null rather than NaN", () => {
    const row = toAppwriteProductRow({
      ...base,
      completeness_score: "abc" as unknown as number,
      confidence_score: null,
    });
    expect(row.completenessScore).toBeNull();
    expect(row.confidenceScore).toBeNull();
  });

  it("refuses a row without a product id", () => {
    expect(() => toAppwriteProductRow({ ...base, product_id: "" })).toThrow(/product_id/);
  });
});

describe("toAppwriteBarcodeRow", () => {
  it("maps the barcodes table", () => {
    expect(
      toAppwriteBarcodeRow({
        barcode: "8901491100520",
        product_id: "p-001",
        source: "indian_dataset",
        confidence: 0.95,
      }),
    ).toEqual({
      barcode: "8901491100520",
      productId: "p-001",
      source: "indian_dataset",
      confidence: 0.95,
    });
  });

  it("rejects rows missing the join keys", () => {
    expect(() => toAppwriteBarcodeRow({ barcode: "", product_id: "p-1" })).toThrow();
    expect(() => toAppwriteBarcodeRow({ barcode: "1", product_id: "" })).toThrow();
  });
});