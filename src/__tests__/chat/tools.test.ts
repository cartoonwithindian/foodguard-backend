import { describe, it, expect, vi } from "vitest";
import { InMemoryStore } from "@/lib/store/memory";
import { getStore } from "@/lib/store";
import { runTool } from "@/services/chat/tools";

// Isolate web research: never contact live search providers during tests.
// The analysis pipeline keeps running its real logic; only the network-bound
// provider module reports "no providers available / no results".
vi.mock("@/lib/external/web-search-providers", () => {
  const noResults = () => ({
    results: [] as Array<{ title: string; url: string; snippet: string; domain: string; retrievedAt: string; provider: string }>,
    totalResults: 0,
    searchQuery: "",
    performed: false,
    provider: "mock",
    error: "Web research disabled in test environment",
  });
  const noProviders = () => ({
    google: false,
    searxng: false,
    firecrawl: false,
    openSearp: false,
    agentReach: false,
    duckduckgo: false,
  });
  return {
    getAvailableProviders: noProviders,
    getSearchConfig: () => ({ primaryProvider: "duckduckgo", fallbackProviders: [] as string[], agentReachEnabled: false }),
    webSearchWithFallback: vi.fn(async () => noResults()),
    extractUrlContent: vi.fn(async () => ({ content: "", success: false, error: "Web research disabled in test environment" })),
  };
});

describe("controlled tools layer", () => {
  it("search_product returns structured top-5 hits", async () => {
    const result = await runTool("search_product", { query: "chocolate" }, { userId: "u1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as Array<{ id: string; name: string; barcode: string }>;
      expect(data.length).toBeGreaterThan(0);
      expect(data.length).toBeLessThanOrEqual(5);
      expect(data[0].name.length).toBeGreaterThan(0);
    }
  });

  it("search_product rejects empty or oversized queries", async () => {
    const empty = await runTool("search_product", { query: "   " }, { userId: "u1" });
    expect(empty.ok).toBe(false);
    const oversized = await runTool("search_product", { query: "x".repeat(200) }, { userId: "u1" });
    expect(oversized.ok).toBe(false);
  });

  it("get_product_details resolves by id and barcode; reports notFound truthfully", async () => {
    const store = new InMemoryStore();
    const products = await store.searchProducts("chocolate", "all");
    const product = products[0].product;

    const byId = await runTool("get_product_details", { product_id: product.id }, { userId: "u1" });
    expect(byId.ok).toBe(true);
    if (byId.ok) {
      expect((byId.data as { name: string }).name).toBe(product.name);
    }

    const byBarcode = await runTool("get_product_details", { barcode: product.barcode }, { userId: "u1" });
    expect(byBarcode.ok).toBe(true);
    if (byBarcode.ok) {
      expect((byBarcode.data as { name: string }).name).toBe(product.name);
    }

    const missing = await runTool("get_product_details", { product_id: "nope" }, { userId: "u1" });
    expect(missing.ok).toBe(true);
    if (missing.ok) {
      expect(missing.data).toEqual({ notFound: true });
    }
  });

  it("get_product_analysis returns the existing engine's assessment", async () => {
    const store = new InMemoryStore();
    const products = await store.searchProducts("chocolate", "all");
    const product = products[0].product;

    const result = await runTool("get_product_analysis", { product_id: product.id }, { userId: "u1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { name: string; assessment: string; score: number | null };
      expect(data.name).toBe(product.name);
      expect(data.assessment.length).toBeGreaterThan(0);
      expect(typeof data.score).toBe("number");
    }
  }, 30000);

  it("get_ingredient_info normalizes and surfaces knowledge for known ingredients", async () => {
    const result = await runTool("get_ingredient_info", { name: "INS 621" }, { userId: "u1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { canonicalName: string | null; insCode: string | null };
      expect(data.canonicalName).toBeTruthy();
    }
  });

  it("get_ingredient_info returns honest nulls for unknown ingredients", async () => {
    const result = await runTool("get_ingredient_info", { name: "XYZ-123" }, { userId: "u1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { canonicalName: string | null; category: string | null };
      expect(data.canonicalName).toBeNull();
      expect(data.category).toBeNull();
    }
  });

  it("get_user_scan_history is strictly scoped to the requesting user", async () => {
    const store = getStore();
    await store.addHistoryEntry("u1", {
      productId: "prod-1",
      assessmentSnapshot: { name: "Product A", assessment: "low", score: 90 },
      source: "manual",
    });
    await store.addHistoryEntry("u2", {
      productId: "prod-2",
      assessmentSnapshot: { name: "Secret B", assessment: "high", score: 10 },
      source: "manual",
    });

    const result = await runTool("get_user_scan_history", {}, { userId: "u1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as Array<{ name: string }>;
      const mine = data.filter((d) => d.name === "Product A");
      expect(mine.length).toBeGreaterThanOrEqual(1);
      const theirs = data.filter((d) => d.name === "Secret B");
      expect(theirs).toHaveLength(0);
    }
  });

  it("compare_products compares nutrition rows", async () => {
    const store = new InMemoryStore();
    const all = await store.searchProducts("", "all");
    const [a, b] = all.slice(0, 2).map((r) => r.product);

    const result = await runTool(
      "compare_products",
      { product_a: a.id, product_b: b.id },
      { userId: "u1" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { rows: Array<{ field: string }> };
      expect(data.rows.some((r) => r.field === "ingredients")).toBe(true);
      expect(data.rows.some((r) => r.field === "sodium")).toBe(true);
    }
  });

  it("placeholder tools fail closed with not_implemented", async () => {
    for (const name of ["get_ingredient_classification", "generate_report"]) {
      const result = await runTool(name as never, {}, { userId: "u1" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("not_implemented");
      }
    }
  });

  it("invalid tool args never crash the registry", async () => {
    const result = await runTool("get_product_details", { product_id: 42 }, { userId: "u1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_input");
    }
  });
});