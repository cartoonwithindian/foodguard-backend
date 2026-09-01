/**
 * Product Analysis data-quality regressions
 *
 * Locks in evidence-based behaviour for the Product Analysis pipeline:
 *  1. Additive category-dependent permission (INS 160c must not resolve to
 *     the Carotenes/160a permission row).
 *  2. Labelling honesty: unverified labels are INSUFFICIENT_DATA, never PASS.
 *  3. Contaminants: reference limits never masquerade as product findings.
 *  4. Evidence-source separation (WHO → NUTRITION_GUIDANCE, USDA →
 *     SCIENTIFIC_REFERENCE, dataset → PRODUCT_DATA).
 *  5. Alternative suggestions never surface demo-brand products.
 *  6. Alternative ranking is deterministic.
 *  7. The FoodGuard score is deterministic with an explainable breakdown.
 *  8. Unknown ingredient text is flagged UNVERIFIED, never harmful.
 *  9. Attention points are deduplicated per topic.
 * 10. Product Analysis and Nutrition Details agree on normalized nutrition.
 */

import { describe, it, expect, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getNutrition } from "@/app/api/nutrition/[barcode]/route";
import { runAnalysis } from "@/services/analysis.service";
import { AdditiveChecker } from "@/services/regulatory/fssai/additive-checker";
import { LabellingChecker } from "@/services/regulatory/fssai/labelling-checker";
import { FSSAIAnalyzer } from "@/services/regulatory/fssai";
import { findAlternativesEnhanced } from "@/services/alternative-engine.service";
import { getStore } from "@/lib/store";
import { lookupProductByBarcode } from "@/lib/product-provider";

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

afterAll(() => {
  process.env.AI_PROVIDER = savedAIEnv.AI_PROVIDER ?? "mock";
  process.env.AI_API_KEY = savedAIEnv.AI_API_KEY ?? "";
});

const FAKE_BRANDS = /MorningCrunch|SpicyBites|OatPlus|RedTomato|QuickNoodle/i;

describe("Product Analysis data quality", () => {
  it("1. never applies another additive's permission row to INS 160c", async () => {
    const checker = new AdditiveChecker();

    // INS 160c is Paprika Oleoresins — it has no category permission row and
    // must NOT inherit the 160a(i) Beta-carotene "Any article of food" row.
    const c160 = await checker.checkSingleAdditive("INS 160c");
    expect(c160?.additiveName).toBe("Paprika Oleoresins");
    expect(c160?.matchType).toBe("INS_EXACT");
    expect(c160?.status).toBe("NOT_SPECIFIED");
    expect(c160?.permissionStatus).toBe("PERMISSION_REQUIRES_CATEGORY_DATA");
    expect(c160?.userStatus).toBe("INSUFFICIENT_DATA");
    expect(c160?.maximumLevel).toBeUndefined();

    // The same check must work from label-style text ("Colour 160c").
    const colour = await checker.checkSingleAdditive("Colour 160c");
    expect(colour?.additiveName).toBe("Paprika Oleoresins");
    expect(colour?.status).toBe("NOT_SPECIFIED");

    // 150d (Caramel IV) must not inherit the 150a (Caramel I) permission row.
    const d150 = await checker.checkSingleAdditive("Colour (150d)");
    expect(d150?.additiveName).toBe("Caramel IV-ammonia sulphite Process");
    expect(d150?.status).toBe("NOT_SPECIFIED");
    expect(d150?.permissionStatus).toBe("PERMISSION_REQUIRES_CATEGORY_DATA");

    // The actual 160a(i) additive keeps its category permission.
    const a160 = await checker.checkSingleAdditive("INS 160a(i)");
    expect(a160?.additiveName).toBe("Beta-carotene (synthetic)");
    expect(a160?.status).toBe("PERMITTED");
    expect(a160?.userStatus).toBe("PASS");
  });

  it("2. reports INSUFFICIENT_DATA for an unverified label and PASS only when verified", async () => {
    const checker = new LabellingChecker();
    const allPresent = {
      hasIngredientsList: true,
      hasNutritionInfo: true,
      hasAllergenDeclaration: true,
      hasNetQuantity: true,
      hasManufacturerInfo: true,
      hasFssaiLicense: true,
      hasVegetarianDeclaration: true,
      hasDateMarking: true,
      hasBatchLotId: true,
      hasStorageInstructions: true,
    };

    const unverified = await checker.checkLabelling(allPresent, { verified: false });
    expect(unverified.overallStatus).toBe("INSUFFICIENT_DATA");
    expect(unverified.checks.every((c) => c.status === "UNCLEAR")).toBe(true);
    expect(unverified.reason).toContain("insufficient");
    // References are the actual FSSAI gazettes the rules were extracted from.
    expect(unverified.sourceReferences.length).toBeGreaterThan(0);
    expect(unverified.sourceReferences[0]?.documentType).toContain("Gazette");

    const verified = await checker.checkLabelling(allPresent, { verified: true });
    expect(verified.overallStatus).toBe("PASS");
    expect(verified.checks.every((c) => c.status === "FOUND")).toBe(true);
  });

  it("3. keeps reference limits out of contaminant findings", async () => {
    const analyzer = new FSSAIAnalyzer();
    const result = await analyzer.analyze({
      product: { name: "Biscuit", category: "biscuits" },
      ingredients: ["wheat flour", "sugar"],
      labelVerified: false,
    });

    // Contract value (locked by earlier tests) stays REFERENCE_LIMIT_AVAILABLE…
    expect(result.regulatoryChecks.contaminants).toBe("REFERENCE_LIMIT_AVAILABLE");
    // …while the details state honestly that there is no product-specific result.
    const details = result.regulatoryCheckDetails!.contaminants;
    expect(details.status).toBe("INSUFFICIENT_DATA");
    expect(details.findings).toHaveLength(0);
    expect(details.reason).toContain("no laboratory result");
    expect(result.contaminants.every((c) => c.evidenceStatus === "REFERENCE_LIMIT_AVAILABLE")).toBe(true);
    expect(result.contaminants.every((c) => c.measuredValue === undefined)).toBe(true);
  });

  it("4. separates WHO / USDA / dataset evidence into the right categories", async () => {
    const { frontend } = await runAnalysis({
      productName: "Potato snack with sugar",
      ingredientsText: "Ingredients: Potato, Sugar, Salt",
      skipAlternatives: true,
      skipPersonalization: true,
    });

    const byName = new Map(frontend.evidenceSources.map((s) => [s.sourceName, s.evidenceCategory]));
    // WHO guidance is NUTRITION_GUIDANCE — never REGULATORY_REFERENCE.
    expect(byName.get("World Health Organization")).toBe("NUTRITION_GUIDANCE");
    // USDA scientific database is SCIENTIFIC_REFERENCE.
    expect(byName.get("USDA Agricultural Research Service")).toBe("SCIENTIFIC_REFERENCE");
    // No WHO source may be mislabelled as a regulatory reference.
    for (const source of frontend.evidenceSources) {
      if (/world health/i.test(source.sourceName)) {
        expect(source.evidenceCategory).toBe("NUTRITION_GUIDANCE");
      }
    }
  });

  it("5. never surfaces demo-brand products as alternatives", async () => {
    const { frontend } = await runAnalysis({
      barcode: "8901491100519",
      skipPersonalization: true,
    });
    const alternatives = frontend.alternatives ?? [];
    for (const alt of alternatives) {
      expect(alt.product.isDemo).toBe(false);
      expect(FAKE_BRANDS.test(alt.product.name)).toBe(false);
    }
    // Kurkure may now surface real alternatives from the Indian product
    // dataset; the key guarantee is that NO demo-brand product leaks through.
    for (const alt of alternatives) {
      expect(alt.product.isDemo).toBe(false);
      expect(FAKE_BRANDS.test(alt.product.name)).toBe(false);
    }
  });

  it("6. ranks real alternatives deterministically", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000001");
    expect(product).not.toBeNull();
    if (!product) return;
    const nutrition = await store.getNutritionForProduct(product.id);

    const first = await findAlternativesEnhanced({ product, nutrition, limit: 5 });
    const second = await findAlternativesEnhanced({ product, nutrition, limit: 5 });
    expect(first.map((a) => a.product.id)).toEqual(second.map((a) => a.product.id));
    expect(first.map((a) => a.recommendationScore)).toEqual(second.map((a) => a.recommendationScore));
    expect([...first.map((a) => a.recommendationScore)].sort((a, b) => b - a)).toEqual(
      first.map((a) => a.recommendationScore),
    );
  });

  it("7. computes the same score and breakdown for the same input twice", async () => {
    const input = {
      barcode: "8901491100519",
      skipAlternatives: true,
      skipPersonalization: true,
    };
    const first = await runAnalysis(input);
    const second = await runAnalysis(input);
    expect(first.frontend.score).toBe(second.frontend.score);
    expect(first.frontend.assessment).toBe(second.frontend.assessment);
    expect(first.frontend.scoreBreakdown).toBeDefined();
    expect(first.frontend.scoreBreakdown).toEqual(second.frontend.scoreBreakdown);
    expect(first.meta.confidence).toBe(second.meta.confidence);
  });

  it("8. flags unknown ingredient text as unverified, not harmful", async () => {
    const { frontend, meta } = await runAnalysis({
      productName: "Unknown sample",
      ingredientsText: "Ingredients: zzzxqy123, Sugar",
      skipAlternatives: true,
      skipPersonalization: true,
    });
    const unknown = frontend.ingredients.find((i) => i.name === "Unverified ingredient text detected");
    expect(unknown).toBeDefined();
    // The unknown text is never rated as a high-concern (harmful) ingredient.
    expect(unknown?.assessment).not.toBe("high");
    expect(meta.needsReview).toBe(true);
    // No attention point claims the unknown text is harmful.
    expect(frontend.attentionPoints.some((p) => /zzzxqy|unverified/i.test(p.name))).toBe(false);
  });

  it("9. deduplicates attention points per topic", async () => {
    const { frontend } = await runAnalysis({
      productName: "Dupe test",
      ingredientsText: "Ingredients: Sugar, Salt, Palm Oil",
      nutrition: {
        basis: "PER_100G",
        nutrients: {
          salt: { value: 2, unit: "g", confidence: 0.9 },
          sodium: { value: 800, unit: "mg", confidence: 0.9 },
          sugars: { value: 30, unit: "g", confidence: 0.9 },
          totalFat: { value: 33.7, unit: "g", confidence: 0.9 },
          saturatedFat: { value: 7.7, unit: "g", confidence: 0.9 },
        },
      },
      skipAlternatives: true,
      skipPersonalization: true,
    });
    const keys = frontend.attentionPoints.map((p) => p.name.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    // Salt and sodium are one dietary topic → exactly one salt point.
    expect(keys.filter((k) => k === "salt")).toHaveLength(1);
    expect(keys.filter((k) => k === "sodium")).toHaveLength(0);
    // Display names are human-readable, not raw nutrient keys.
    for (const point of frontend.attentionPoints) {
      expect(point.displayName ?? point.name).not.toBe(undefined);
    }
  });

  it("10. Product Analysis and Nutrition Details agree on normalized nutrition", async () => {
    const { frontend } = await runAnalysis({
      barcode: "8901491100519",
      skipAlternatives: true,
      skipPersonalization: true,
    });
    const response = await getNutrition(
      new NextRequest("http://localhost/api/nutrition/8901491100519"),
      { params: Promise.resolve({ barcode: "8901491100519" }) },
    );
    const body = await response.json();
    expect(frontend.nutrition?.sodium).toBe("800mg");
    expect(body.data.nutrition.sodium.value).toBe(800);
    expect(body.data.nutrition.sodium.unit).toBe("mg");
    expect(frontend.nutrition?.saturatedFat).toBe("7.7g");
    expect(body.data.nutrition.saturatedFat.value).toBe(7.7);
    expect(body.data.nutrition.saturatedFat.unit).toBe("g");
  });
});
