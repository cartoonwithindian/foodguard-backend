/**
 * Product image enrichment regression
 *
 * The bundled Indian dataset carries no image URLs, so the product-analysis
 * result screen can show an empty image area. Like the alternatives engine,
 * the analysis pipeline resolves a real image from Open Food Facts by barcode
 * when one is available. These tests lock that in:
 *  1. A barcode with an OFF image gets its imageUrl attached to the result.
 *  2. A barcode with no OFF image leaves imageUrl null (graceful fallback).
 */

import { describe, it, expect, afterAll, vi } from "vitest";

const { savedAIEnv } = vi.hoisted(() => {
  const savedAIEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
  };
  process.env.AI_PROVIDER = "mock";
  process.env.AI_API_KEY = "";
  return { savedAIEnv };
});

afterAll(() => {
  process.env.AI_PROVIDER = savedAIEnv.AI_PROVIDER ?? "mock";
  process.env.AI_API_KEY = savedAIEnv.AI_API_KEY ?? "";
});

vi.mock("@/lib/external/off-image", () => ({
  fetchOffImageUrl: vi.fn(),
}));

import { fetchOffImageUrl } from "@/lib/external/off-image";
import { runAnalysis } from "@/services/analysis.service";

const mockFetchOffImageUrl = vi.mocked(fetchOffImageUrl);

describe("Product image enrichment", () => {
  it("attaches an OFF image URL to the analysis result when one exists", async () => {
    mockFetchOffImageUrl.mockResolvedValue(
      "https://images.openfoodfacts.org/images/products/890/149/110/0519/front_en.48.400.jpg",
    );

    const { frontend } = await runAnalysis({
      barcode: "8901491100519",
      ingredientsText: "Ingredients: Potato, Salt, Sugar, Palm Oil",
      skipAlternatives: true,
      skipPersonalization: true,
    });

    expect(mockFetchOffImageUrl).toHaveBeenCalledWith("8901491100519");
    expect(frontend.imageUrl).toBe(
      "https://images.openfoodfacts.org/images/products/890/149/110/0519/front_en.48.400.jpg",
    );
  }, 30000);

  it("leaves imageUrl null when OFF has no image (graceful fallback)", async () => {
    mockFetchOffImageUrl.mockResolvedValue(null);

    const { frontend } = await runAnalysis({
      barcode: "8901491100519",
      ingredientsText: "Ingredients: Potato, Salt, Sugar, Palm Oil",
      skipAlternatives: true,
      skipPersonalization: true,
    });

    expect(frontend.imageUrl).toBeUndefined();
  }, 30000);
});
