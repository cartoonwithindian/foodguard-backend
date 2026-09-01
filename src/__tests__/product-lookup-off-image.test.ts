import { describe, it, expect, vi, beforeEach } from "vitest";
import { lookupProductByBarcode } from "@/lib/product-lookup";

vi.mock("@/lib/external/off-image", () => ({
  fetchOffImageUrl: vi.fn(),
}));
vi.mock("@/lib/product-lookup/primary", () => ({
  primaryAdapter: vi.fn(),
}));

import { fetchOffImageUrl } from "@/lib/external/off-image";
import { primaryAdapter } from "@/lib/product-lookup/primary";

const mockFetchOffImageUrl = vi.mocked(fetchOffImageUrl);
const mockPrimaryAdapter = vi.mocked(primaryAdapter);

const FOUND = (barcode: string, overrides: Record<string, unknown> = {}) => ({
  found: true,
  barcode,
  name: "Kurkure Masala Munch",
  brand: "Kurkure",
  category: "Snacks",
  ingredients: "Corn Flour, Palm Oil, Salt, Sugar",
  source: "indian_dataset",
  confidence: 0.95,
  ...overrides,
});

describe("product-lookup OFF image loop (production path)", () => {
  beforeEach(() => {
    mockFetchOffImageUrl.mockReset();
    mockPrimaryAdapter.mockReset();
  });

  it("attaches an OFF image to a found product that has none", async () => {
    mockPrimaryAdapter.mockResolvedValue(
      FOUND("8901491100519") as never,
    );
    mockFetchOffImageUrl.mockResolvedValue(
      "https://images.openfoodfacts.org/kurkure.jpg",
    );

    const result = await lookupProductByBarcode("8901491100519");

    expect(result.success).toBe(true);
    expect(result.product?.imageUrl).toBe(
      "https://images.openfoodfacts.org/kurkure.jpg",
    );
    expect(mockFetchOffImageUrl).toHaveBeenCalledTimes(1);
    expect(mockFetchOffImageUrl).toHaveBeenCalledWith("8901491100519");
    expect(result.mergedFrom).toContain("openfoodfacts");
  });

  it("keeps the existing image when the product already has one (no OFF call)", async () => {
    mockPrimaryAdapter.mockResolvedValue(
      FOUND("8901491100520", {
        imageUrl: "https://cdn.example.com/existing.jpg",
      }) as never,
    );
    mockFetchOffImageUrl.mockResolvedValue(
      "https://images.openfoodfacts.org/should-not-be-used.jpg",
    );

    const result = await lookupProductByBarcode("8901491100520");

    expect(result.product?.imageUrl).toBe(
      "https://cdn.example.com/existing.jpg",
    );
    expect(mockFetchOffImageUrl).not.toHaveBeenCalled();
  });

  it("leaves imageUrl empty when OFF has no image (graceful)", async () => {
    mockPrimaryAdapter.mockResolvedValue(FOUND("8901491100521") as never);
    mockFetchOffImageUrl.mockResolvedValue(null);

    const result = await lookupProductByBarcode("8901491100521");

    expect(result.success).toBe(true);
    expect(result.product?.imageUrl).toBeUndefined();
  });
});
