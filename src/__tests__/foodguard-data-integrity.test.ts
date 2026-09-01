import { describe, expect, it, afterAll, vi } from "vitest";
import { runAnalysis } from "@/services/analysis.service";
import { normalizeIngredient } from "@/lib/ingredients/normalize";
import { parseIngredientText } from "@/lib/ingredients/parse";
import { normalizeNutritionValue } from "@/lib/nutrition/units";
import { computeFoodGuardScore } from "@/lib/scoring";
import { FSSAIAnalyzer } from "@/services/regulatory/fssai";
import type { IngredientAnalysisItem } from "@/types/domain";

// Isolate web research during tests: never contact live search providers.
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

describe("FoodGuard evidence-backed analysis regressions", () => {
  it.each([
    [0.8, "g", "mg", 800],
    [800, "mg", "g", 0.8],
    [7.7, "g", "g", 7.7],
    [557, "kcal", "kcal", 557],
  ] as const)("normalizes %s%s to %s", (value, sourceUnit, targetUnit, expected) => {
    expect(normalizeNutritionValue(value, sourceUnit, targetUnit).value).toBe(expected);
  });

  it("normalizes duplicate food ingredient names and INS 160c", () => {
    const parsed = parseIngredientText("Ingredients: Salt, salt, Iodised Salt, Colour (160c), Maltodextrin");
    const normalized = parsed.ingredients.map(normalizeIngredient);
    expect(normalized.filter((item) => item.canonicalName === "Salt")).toHaveLength(3);
    expect(normalized.find((item) => item.rawName.includes("160c"))?.canonicalName).toBe("INS 160c");
  });

  it("keeps nutrition fields out of ingredient analysis and hides unknown OCR text", async () => {
    const { frontend, meta } = await runAnalysis({
      productName: "OCR sample",
      ingredientsText: "Ingredients: Salt, Tomato Powder, n5 anvpas, calories 557kcal, sodium 0.8g",
      skipAlternatives: true,
      skipPersonalization: true,
    });
    const ingredientNames = frontend.ingredients.map((item) => item.name.toLowerCase());
    expect(ingredientNames).not.toContain("calories");
    expect(ingredientNames).not.toContain("sodium");
    expect(ingredientNames).toContain("unverified ingredient text detected");
    expect(meta.needsReview).toBe(true);
  });

  it("keeps the Kurkure barcode and converts source sodium grams to milligrams", async () => {
    const { frontend, meta } = await runAnalysis({
      barcode: "8901491100519",
      skipAlternatives: true,
      skipPersonalization: true,
    });
    expect(frontend.name).toBe("Kurkure");
    expect(frontend.barcode).toBe("8901491100519");
    expect(frontend.nutrition?.sodium).toBe("800mg");
    expect(meta.nutrition?.nutrients.sodium?.sourceUnit).toBe("g");
    expect(meta.nutrition?.nutrients.sodium?.normalizedUnit).toBe("mg");
    expect(frontend.ingredients.filter((item) => item.name.toLowerCase() === "salt")).toHaveLength(1);
    expect(frontend.ingredients.some((item) => /calories|sodium|saturatedfat|totalfat/i.test(item.name))).toBe(false);
    expect(frontend.attentionPoints.filter((item) => item.name.toLowerCase() === "salt")).toHaveLength(1);
    expect(frontend.evidenceSources.some((source) => source.evidenceCategory === "PRODUCT_DATA")).toBe(true);
    expect(frontend.evidenceSources.some((source) => /USDA/i.test(source.sourceName) && /rice|corn/i.test(source.summary))).toBe(false);
    expect(frontend.scoreBreakdown).toBeDefined();
  });

  it("does not treat reference counts as contaminant or labelling findings", async () => {
    const result = await new FSSAIAnalyzer().analyze({
      product: { name: "Kurkure", barcode: "8901491100519", category: "food" },
      labelData: { hasIngredientsList: true, hasNutritionInfo: true },
    });
    expect(result.regulatoryCheckDetails?.contaminants.referenceCount).toBeGreaterThan(0);
    expect(result.regulatoryCheckDetails?.contaminants.findings).toHaveLength(0);
    expect(result.regulatoryCheckDetails?.labelling.referenceCount).toBeGreaterThan(0);
    expect(result.regulatoryCheckDetails?.labelling.findings).toHaveLength(0);
  });

  it("calculates the informational score deterministically and ignores unknown/permitted entries", () => {
    const item = (name: string, assessment: IngredientAnalysisItem["assessment"], evidence: boolean): IngredientAnalysisItem => ({
      rawName: name,
      name,
      function: "test",
      assessment,
      severity: assessment === "potentially_concerning" ? "high" : "low",
      explanation: "",
      evidence: evidence ? [{ id: "e", title: "Evidence", organization: "Source", sourceType: "regulator", evidenceLevel: "high", summary: "Documented" }] : [],
      confidence: evidence ? 1 : 0.3,
      flags: [],
      allergens: [],
      matched: evidence,
    });
    const first = computeFoodGuardScore([
      item("Maltodextrin", "generally_accepted", true),
      item("Unknown", "insufficient_evidence", false),
      item("Verified concern", "potentially_concerning", true),
    ], null);
    const second = computeFoodGuardScore([
      item("Maltodextrin", "generally_accepted", true),
      item("Unknown", "insufficient_evidence", false),
      item("Verified concern", "potentially_concerning", true),
    ], null);
    expect(first).toEqual(second);
    expect(first.score).toBe(85);
    expect(first.breakdown).toHaveLength(1);
  });

  it("does not return synthetic alternatives for a real Kurkure record", async () => {
    const { frontend } = await runAnalysis({ barcode: "8901491100519", skipPersonalization: true });
    const names = frontend.alternatives?.map((alternative) => alternative.product.name) ?? [];
    expect(names).not.toEqual(expect.arrayContaining(["MorningCrunch", "SpicyBites", "OatPlus", "RedTomato", "QuickNoodle"]));
    expect(frontend.alternatives?.every((alternative) => !alternative.product.isDemo)).toBe(true);
  });
});
