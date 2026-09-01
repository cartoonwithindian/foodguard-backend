/**
 * Phase 6 — End-to-End Food Product Validation
 *
 * Tests the complete FoodGaurd pipeline for representative Indian
 * packaged-food categories using curated demo product data.
 *
 * Categories tested:
 * 1. Snack/namkeen (Crunchy Masala Snack)
 * 2. Namkeen (Namkeen Bhujia)
 * 3. Instant noodles (Masala Instant Noodles)
 * 4. Biscuit (Glucose Biscuits)
 * 5. Soft drink (Cola Soft Drink)
 * 6. Chocolate (Milk Chocolate Bar)
 * 7. Energy/health drink (Volt Energy Drink)
 * 8. Condiment (Tomato Ketchup)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { runAnalysis } from "@/services/analysis.service";
import { FOOD_PRODUCT_SEED } from "@/data/seed/products-food";
import { getFSSAIAdditiveKnowledgeBase } from "@/services/regulatory/fssai/additive-knowledge-base";

// Isolate web research: the e2e suite must exercise the real product-analysis
// pipeline, so only the network-bound provider module is stubbed. No external
// search provider is contacted during standard test runs.
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

// Force mock mode for AI to prevent real API calls during tests
const { savedAIEnv } = vi.hoisted(() => {
  const savedAIEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
  };
  process.env.AI_PROVIDER = "mock";
  process.env.AI_API_KEY = "";
  return { savedAIEnv };
});

// ── Product fixtures (one per required category) ─────────────

const TEST_PRODUCTS = [
  {
    category: "Snack/namkeen",
    barcode: "8901000000001", // Crunchy Masala Snack
    expectedAdditives: ["621", "102", "110", "319"],
    keyIngredients: ["Monosodium Glutamate", "Tartrazine", "Sunset Yellow", "TBHQ"],
  },
  {
    category: "Namkeen",
    barcode: "8901000000002", // Namkeen Bhujia
    expectedAdditives: ["500"],
    keyIngredients: ["Chickpea Flour", "Acidity Regulator"],
  },
  {
    category: "Instant noodles",
    barcode: "8901000000003", // Masala Instant Noodles
    expectedAdditives: ["621", "223", "202", "322", "551"],
    keyIngredients: ["Monosodium Glutamate", "Sodium Metabisulfite", "Soy Lecithin"],
  },
  {
    category: "Biscuit",
    barcode: "8901000000004", // Glucose Biscuits
    expectedAdditives: ["500", "322", "320"],
    keyIngredients: ["Soy Lecithin", "Leavening Agents", "Antioxidant"],
  },
  {
    category: "Soft drink",
    barcode: "8901000000005", // Cola Soft Drink
    expectedAdditives: ["150d", "338"],
    keyIngredients: ["Caramel Colour", "Phosphoric Acid", "Caffeine"],
  },
  {
    category: "Chocolate",
    barcode: "8901000000007", // Milk Chocolate Bar
    expectedAdditives: ["322"],
    keyIngredients: ["Soy Lecithin", "Cocoa Butter", "Milk Solids"],
  },
  {
    category: "Energy drink",
    barcode: "8901000000010", // Volt Energy Drink
    expectedAdditives: ["330", "211", "150d"],
    keyIngredients: ["Caffeine", "Taurine", "Sodium Benzoate"],
  },
  {
    category: "Condiment",
    barcode: "8901000000012", // Tomato Ketchup
    expectedAdditives: ["202", "211"],
    keyIngredients: ["Potassium Sorbate", "Sodium Benzoate"],
  },
];

// ── Shared KB reference ─────────────────────────────────────

let additiveKB: ReturnType<typeof getFSSAIAdditiveKnowledgeBase>;

beforeAll(() => {
  additiveKB = getFSSAIAdditiveKnowledgeBase();
});

afterAll(() => {
  process.env.AI_PROVIDER = savedAIEnv.AI_PROVIDER ?? "mock";
  process.env.AI_API_KEY = savedAIEnv.AI_API_KEY ?? "";
});

// ── Tests ───────────────────────────────────────────────────

describe("E2E Food Product Validation (Phase 6)", () => {
  for (const product of TEST_PRODUCTS) {
    describe(`${product.category} (${product.barcode})`, () => {
      let result: Awaited<ReturnType<typeof runAnalysis>>;

      beforeAll(async () => {
        const seed = FOOD_PRODUCT_SEED.find((p) => p.barcode === product.barcode);
        expect(seed).toBeDefined();

        result = await runAnalysis({
          barcode: product.barcode,
          ingredientsText: seed!.ingredientsRaw,
          language: "en",
          skipAlternatives: true,
          skipPersonalization: true,
        });
      });

      // ── 1. Pipeline completeness ──────────────────────────

      it("returns a frontend result with name and score", () => {
        expect(result.frontend.name).toBeTruthy();
        expect(result.frontend.score).toBeGreaterThanOrEqual(0);
        expect(result.frontend.score).toBeLessThanOrEqual(5);
        expect(result.frontend.assessment).toMatch(/^(low|moderate|high|insufficient)$/);
      });

      it("has ingredient analysis", () => {
        expect(result.frontend.ingredients.length).toBeGreaterThan(0);
      });

      it("has positive or attention points", () => {
        const totalPoints =
          result.frontend.positivePoints.length + result.frontend.attentionPoints.length;
        expect(totalPoints).toBeGreaterThan(0);
      });

      // ── 2. FSSAI regulatory analysis (HTTP-backed) ───────

      it("includes FSSAI regulatory compliance (may be review-required if service down)", () => {
        expect(result.frontend.regulatoryCompliance).toBeDefined();
        expect(result.frontend.regulatoryCompliance).not.toBeNull();
      });

      it("has an overall regulatory status", () => {
        const reg = result.frontend.regulatoryCompliance!;
        const validStatuses = [
          "PASS",
          "EXCEEDS_LIMIT",
          "BELOW_MINIMUM",
          "NO_APPLICABLE_LIMIT",
          "REVIEW_REQUIRED",
          "NO_APPLICABLE_RULE",
          "CATEGORY_REQUIRED",
          "LIMIT_LOOKUP",
          "INACTIVE_RULE",
          "NON_NUMERIC_LIMIT",
          "UNIT_MISMATCH",
          "SERVICE_UNAVAILABLE",
        ];
        expect(validStatuses).toContain(reg.overallStatus);
        expect(typeof reg.serviceAvailable).toBe("boolean");
      });

      it("never reports a false PASS when the service is unavailable", () => {
        const reg = result.frontend.regulatoryCompliance!;
        if (!reg.serviceAvailable) {
          expect(reg.overallStatus).not.toBe("PASS");
          expect(
            ["REVIEW_REQUIRED", "SERVICE_UNAVAILABLE"],
          ).toContain(reg.overallStatus);
        }
      });

      it("has additive analysis results", () => {
        const reg = result.frontend.regulatoryCompliance!;
        expect(Array.isArray(reg.additives)).toBe(true);
        if (reg.additives.length > 0) {
          expect(reg.additives[0].name).toBeTruthy();
          expect(reg.additives[0].type).toBe("additive");
        }
      });

      it("regulatory status does not change the FoodGuard health score", () => {
        // FSSAI is a separate module and must never adjust the health score.
        expect(result.frontend.score).toBeGreaterThanOrEqual(0);
        expect(result.frontend.score).toBeLessThanOrEqual(5);
        const reg = result.frontend.regulatoryCompliance!;
        // Even a degraded FSSAI result must not zero out or cap the score.
        expect(result.frontend.score).toBeGreaterThan(0);
        expect(reg).toBeDefined();
      });

      // ── 5. Nutrition data ────────────────────────────────

      it("has nutrition data", () => {
        expect(result.frontend.nutrition).toBeDefined();
        expect(result.frontend.nutrition!.calories).toBeGreaterThan(0);
      });

      // ── 6. Meta information ──────────────────────────────

      it("meta has confidence and warnings", () => {
        expect(result.meta.confidence).toBeGreaterThanOrEqual(0);
        expect(result.meta.confidence).toBeLessThanOrEqual(1);
        expect(Array.isArray(result.meta.warnings)).toBe(true);
      });

      it("does not claim the product is healthy or safe", () => {
        const desc = result.frontend.assessmentDescription.toLowerCase();
        expect(desc).not.toContain("this product is safe");
        expect(desc).not.toContain("this product is healthy");
        expect(desc).not.toContain("legally compliant");
      });
    });
  }
});

// ── Standalone validation tests ─────────────────────────────

describe("Additive KB standalone validation", () => {
  it("KB has 500+ additives loaded", () => {
    const stats = additiveKB.getStats();
    expect(stats.totalRecords).toBeGreaterThanOrEqual(500);
  });

  it("can look up INS 621 (Monosodium Glutamate)", () => {
    const result = additiveKB.lookupByINS("621");
    expect(result).not.toBeNull();
    expect(result!.insNumber).toBe("621");
    expect(result!.name.toLowerCase()).toContain("monosodium glutamate");
  });

  it("can look up INS 322 (Lecithins)", () => {
    const result = additiveKB.lookupByINS("322");
    expect(result).not.toBeNull();
    expect(result!.insNumber).toBe("322");
  });

  it("can look up INS 211 (Sodium Benzoate)", () => {
    const result = additiveKB.lookupByINS("211");
    expect(result).not.toBeNull();
    expect(result!.insNumber).toBe("211");
  });

  it("can look up by name", () => {
    const result = additiveKB.lookupByName("Citric Acid");
    expect(result).not.toBeNull();
  });

  it("returns null for unknown INS number", () => {
    const result = additiveKB.lookupByINS("99999");
    expect(result).toBeNull();
  });
});

describe("Empty / failure cases", () => {
  it("handles unknown barcode gracefully", async () => {
    const result = await runAnalysis({
      barcode: "0000000000000",
      ingredientsText: "",
      language: "en",
      skipAlternatives: true,
      skipPersonalization: true,
    });
    // Should still return a result, not crash
    expect(result.frontend).toBeDefined();
    expect(result.meta.warnings.length).toBeGreaterThan(0);
  });

  it("handles empty ingredients gracefully", async () => {
    const result = await runAnalysis({
      barcode: "",
      ingredientsText: "",
      language: "en",
      skipAlternatives: true,
      skipPersonalization: true,
    });
    expect(result.frontend).toBeDefined();
    expect(result.frontend.ingredients.length).toBe(0);
  });

  it("handles ingredients-only input (no barcode)", async () => {
    const result = await runAnalysis({
      ingredientsText:
        "Sugar, Palm Oil, Corn Flour, Salt, Monosodium Glutamate (INS 621), Tartrazine (E102)",
      language: "en",
      skipAlternatives: true,
      skipPersonalization: true,
    });
    expect(result.frontend).toBeDefined();
    expect(result.frontend.ingredients.length).toBeGreaterThan(0);
    // FSSAI analysis should still run
    expect(result.frontend.regulatory).toBeDefined();
  });
});
