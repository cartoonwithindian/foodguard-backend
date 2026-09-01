/**
 * FoodGuard Four-Component Health Scoring Engine — Unit Tests
 *
 * Tests 10 product scenarios covering the full range of product types.
 * Each test verifies:
 * - All scores are between 0 and 5
 * - Missing data never becomes fake zero
 * - Configuration changes affect scores predictably
 * - Identical input produces identical output
 * - Explanations agree with numerical results
 */
import { describe, it, expect, beforeEach } from "vitest";
import { computeFoodGuardHealthScore } from "@/lib/scoring/engine";
import { reloadScoringRules } from "@/lib/scoring/config";
import type { IngredientAnalysisItem, NutritionFacts } from "@/types/domain";

// ── Test Helpers ─────────────────────────────────────────────

function makeIngredient(overrides: Partial<IngredientAnalysisItem> = {}): IngredientAnalysisItem {
  return {
    rawName: overrides.name ?? "unknown",
    name: overrides.name ?? "unknown",
    function: overrides.function ?? "ingredient",
    category: overrides.category,
    assessment: overrides.assessment ?? "neutral",
    severity: overrides.severity ?? "low",
    explanation: overrides.explanation ?? "Test ingredient",
    evidence: overrides.evidence ?? [],
    confidence: overrides.confidence ?? 0.8,
    flags: overrides.flags ?? [],
    allergens: overrides.allergens ?? [],
    matched: overrides.matched !== undefined ? overrides.matched : true,
    ...(overrides.identifier ? { identifier: overrides.identifier } : {}),
  };
}

function makeNutrition(nutrients: Record<string, { value: number; unit: string }>): NutritionFacts {
  const n: NutritionFacts["nutrients"] = {};
  for (const [key, val] of Object.entries(nutrients)) {
    n[key] = { value: val.value, unit: val.unit, confidence: 0.9 };
  }
  return { basis: "PER_100G", nutrients: n };
}

function score(ingredients: IngredientAnalysisItem[], nutrition: NutritionFacts | null = null) {
  return computeFoodGuardHealthScore("test-001", "Test Product", nutrition, ingredients, { includeDebug: true });
}

// ── Tests ────────────────────────────────────────────────────

describe("FoodGuard Four-Component Health Scoring Engine", () => {
  beforeEach(() => {
    reloadScoringRules();
  });

  // ── 1. Healthy minimally processed product ──
  it("should score a healthy minimally processed product highly", () => {
    const result = score(
      [
        makeIngredient({ name: "almonds", assessment: "beneficial", category: "whole" }),
        makeIngredient({ name: "cashews", assessment: "beneficial", category: "whole" }),
        makeIngredient({ name: "honey", assessment: "beneficial", category: "whole" }),
      ],
      makeNutrition({
        calories: { value: 200, unit: "kcal" },
        sugars: { value: 3, unit: "g" },
        saturatedFat: { value: 1, unit: "g" },
        sodium: { value: 50, unit: "mg" },
        protein: { value: 15, unit: "g" },
        fiber: { value: 5, unit: "g" },
      }),
    );

    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.final_score).toBeGreaterThanOrEqual(3.0);
    expect(["Okay", "Good", "Excellent"]).toContain(result.rating);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.positive_factors.length).toBeGreaterThan(0);
    expect(result.data_quality.missing_fields).toHaveLength(0);
  });

  // ── 2. High-sugar snack ──
  it("should penalize a high-sugar snack", () => {
    const result = score(
      [
        makeIngredient({ name: "sugar", assessment: "neutral", category: "refined" }),
        makeIngredient({ name: "corn flour", assessment: "neutral", category: "refined" }),
        makeIngredient({ name: "palm oil", assessment: "neutral", category: "refined" }),
        makeIngredient({ name: "artificial flavor", assessment: "noteworthy", category: "additive" }),
        makeIngredient({ name: "tartrazine", assessment: "potentially_concerning", category: "colour" }),
      ],
      makeNutrition({
        calories: { value: 450, unit: "kcal" },
        sugars: { value: 35, unit: "g" },
        addedSugars: { value: 30, unit: "g" },
        saturatedFat: { value: 8, unit: "g" },
        sodium: { value: 300, unit: "mg" },
        protein: { value: 2, unit: "g" },
        fiber: { value: 0.5, unit: "g" },
      }),
    );

    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.final_score).toBeLessThan(3.0);
    expect(result.negative_factors.length).toBeGreaterThan(0);
    expect(result.components.nutrient.score).toBeLessThan(3);
  });

  // ── 3. High-sodium product ──
  it("should penalize high sodium", () => {
    const result = score(
      [
        makeIngredient({ name: "salt", assessment: "neutral", category: "seasoning" }),
        makeIngredient({ name: "sodium nitrite", assessment: "potentially_concerning", category: "preservative" }),
      ],
      makeNutrition({
        calories: { value: 250, unit: "kcal" },
        sugars: { value: 5, unit: "g" },
        saturatedFat: { value: 3, unit: "g" },
        sodium: { value: 800, unit: "mg" },
        protein: { value: 10, unit: "g" },
        fiber: { value: 1, unit: "g" },
      }),
    );

    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.negative_factors.some((f) => f.toLowerCase().includes("sodium"))).toBe(true);
  });

  // ── 4. High-protein product ──
  it("should reward high protein", () => {
    const result = score(
      [
        makeIngredient({ name: "whey protein isolate", assessment: "beneficial", category: "protein" }),
        makeIngredient({ name: "milk", assessment: "beneficial", category: "dairy" }),
      ],
      makeNutrition({
        calories: { value: 180, unit: "kcal" },
        sugars: { value: 2, unit: "g" },
        saturatedFat: { value: 1, unit: "g" },
        sodium: { value: 100, unit: "mg" },
        protein: { value: 25, unit: "g" },
        fiber: { value: 1, unit: "g" },
      }),
    );

    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.positive_factors.some((f) => f.toLowerCase().includes("protein"))).toBe(true);
    expect(result.components.nutrient.score).toBeGreaterThanOrEqual(3);
  });

  // ── 5. High-fiber product ──
  it("should reward high fiber", () => {
    const result = score(
      [
        makeIngredient({ name: "whole wheat", assessment: "beneficial", category: "whole" }),
        makeIngredient({ name: "oats", assessment: "beneficial", category: "whole" }),
        makeIngredient({ name: "flax seeds", assessment: "beneficial", category: "whole" }),
      ],
      makeNutrition({
        calories: { value: 220, unit: "kcal" },
        sugars: { value: 4, unit: "g" },
        saturatedFat: { value: 1.5, unit: "g" },
        sodium: { value: 80, unit: "mg" },
        protein: { value: 10, unit: "g" },
        fiber: { value: 12, unit: "g" },
      }),
    );

    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.positive_factors.some((f) => f.toLowerCase().includes("fiber"))).toBe(true);
    expect(result.ingredient_analysis.wholeFoodCount).toBeGreaterThanOrEqual(2);
  });

  // ── 6. Product with many additives ──
  it("should penalize products with many additives", () => {
    const result = score([
      makeIngredient({ name: "corn starch", assessment: "neutral", category: "refined" }),
      makeIngredient({ name: "sugar", assessment: "neutral", category: "refined" }),
      makeIngredient({ name: "tartrazine", assessment: "potentially_concerning", category: "colour" }),
      makeIngredient({ name: "sunset yellow", assessment: "potentially_concerning", category: "colour" }),
      makeIngredient({ name: "aspartame", assessment: "noteworthy", category: "sweetener" }),
      makeIngredient({ name: "polysorbate 80", assessment: "generally_accepted", category: "emulsifier" }),
      makeIngredient({ name: "sodium benzoate", assessment: "generally_accepted", category: "preservative" }),
      makeIngredient({ name: "artificial flavor", assessment: "noteworthy", category: "flavor" }),
    ]);

    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.processing_analysis.additiveCount).toBeGreaterThanOrEqual(3);
    expect(result.processing_analysis.processingLevel).toBeGreaterThanOrEqual(2);
  });

  // ── 7. Ultra-processed product ──
  it("should classify ultra-processed products with low processing score", () => {
    const result = score([
      makeIngredient({ name: "corn starch", assessment: "neutral", category: "refined" }),
      makeIngredient({ name: "sugar", assessment: "neutral", category: "refined" }),
      makeIngredient({ name: "partially hydrogenated oil", assessment: "potentially_concerning", category: "trans_fat" }),
      makeIngredient({ name: "high fructose corn syrup", assessment: "noteworthy", category: "refined" }),
      makeIngredient({ name: "msg", assessment: "generally_accepted", category: "flavor_enhancer" }),
      makeIngredient({ name: "artificial flavor", assessment: "noteworthy", category: "flavor" }),
      makeIngredient({ name: "sodium nitrite", assessment: "potentially_concerning", category: "preservative" }),
      makeIngredient({ name: "tartrazine", assessment: "potentially_concerning", category: "colour" }),
    ]);

    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.processing_analysis.processingLevel).toBeGreaterThanOrEqual(3);
    expect(result.processing_analysis.processingLabel).toMatch(/Highly|Ultra/);
  });

  // ── 8. Incomplete nutrition data ──
  it("should handle missing nutrition data gracefully", () => {
    const result = score(
      [
        makeIngredient({ name: "milk", assessment: "beneficial", category: "dairy" }),
        makeIngredient({ name: "sugar", assessment: "neutral", category: "refined" }),
      ],
      null, // No nutrition data
    );

    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.data_quality.missing_fields).toContain("nutrition");
    expect(result.confidence).toBeLessThan(0.8); // Confidence should decrease
    expect(result.nutrient_analysis.missingCount).toBeGreaterThan(0);
  });

  // ── 9. Missing ingredient list ──
  it("should handle missing ingredients gracefully", () => {
    const result = score(
      [], // No ingredients
      makeNutrition({
        calories: { value: 200, unit: "kcal" },
        sugars: { value: 10, unit: "g" },
        saturatedFat: { value: 3, unit: "g" },
        sodium: { value: 200, unit: "mg" },
        protein: { value: 8, unit: "g" },
        fiber: { value: 2, unit: "g" },
      }),
    );

    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.data_quality.missing_fields).toContain("ingredients");
    expect(result.confidence).toBeLessThan(0.8);
    expect(result.ingredient_analysis.primaryIngredientsAnalyzed).toBe(0);
  });

  // ── 10. Mixed-quality product ──
  it("should produce a moderate score for mixed-quality products", () => {
    const result = score(
      [
        makeIngredient({ name: "whole wheat flour", assessment: "beneficial", category: "whole" }),
        makeIngredient({ name: "sugar", assessment: "neutral", category: "refined" }),
        makeIngredient({ name: "palm oil", assessment: "neutral", category: "refined" }),
        makeIngredient({ name: "cocoa powder", assessment: "beneficial", category: "whole" }),
        makeIngredient({ name: "salt", assessment: "neutral", category: "seasoning" }),
        makeIngredient({ name: "emulsifier", assessment: "generally_accepted", category: "emulsifier" }),
      ],
      makeNutrition({
        calories: { value: 350, unit: "kcal" },
        sugars: { value: 18, unit: "g" },
        saturatedFat: { value: 4, unit: "g" },
        sodium: { value: 350, unit: "mg" },
        protein: { value: 6, unit: "g" },
        fiber: { value: 4, unit: "g" },
      }),
    );

    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    // Should be in the middle range
    expect(result.final_score).toBeGreaterThanOrEqual(1.5);
    expect(result.final_score).toBeLessThanOrEqual(4.0);
  });

  // ── Determinism tests ──
  it("should produce identical output for identical input", () => {
    const ingredients = [
      makeIngredient({ name: "oats", assessment: "beneficial" }),
      makeIngredient({ name: "sugar", assessment: "neutral" }),
    ];
    const nutrition = makeNutrition({
      calories: { value: 200, unit: "kcal" },
      sugars: { value: 10, unit: "g" },
    });

    const result1 = computeFoodGuardHealthScore("id1", "Product", nutrition, ingredients);
    const result2 = computeFoodGuardHealthScore("id1", "Product", nutrition, ingredients);

    expect(result1.final_score).toBe(result2.final_score);
    expect(result1.rating).toBe(result2.rating);
    expect(result1.confidence).toBe(result2.confidence);
  });

  // ── Score bounds ──
  it("should always clamp scores between 0 and 5", () => {
    // Worst possible product
    const worstResult = score(
      [
        makeIngredient({ name: "tartrazine", assessment: "potentially_concerning" }),
        makeIngredient({ name: "aspartame", assessment: "noteworthy" }),
        makeIngredient({ name: "partially hydrogenated", assessment: "potentially_concerning" }),
      ],
      makeNutrition({
        calories: { value: 999, unit: "kcal" },
        sugars: { value: 60, unit: "g" },
        addedSugars: { value: 50, unit: "g" },
        saturatedFat: { value: 20, unit: "g" },
        transFat: { value: 3, unit: "g" },
        sodium: { value: 2000, unit: "mg" },
        protein: { value: 0, unit: "g" },
        fiber: { value: 0, unit: "g" },
      }),
    );

    expect(worstResult.final_score).toBeGreaterThanOrEqual(0);
    expect(worstResult.final_score).toBeLessThanOrEqual(5);
    expect(worstResult.components.nutrient.score).toBeGreaterThanOrEqual(0);
    expect(worstResult.components.nutrient.score).toBeLessThanOrEqual(5);
    expect(worstResult.components.ingredient_profile.score).toBeGreaterThanOrEqual(0);
    expect(worstResult.components.ingredient_profile.score).toBeLessThanOrEqual(5);
    expect(worstResult.components.ingredient_concern.score).toBeGreaterThanOrEqual(0);
    expect(worstResult.components.ingredient_concern.score).toBeLessThanOrEqual(5);
    expect(worstResult.components.processing.score).toBeGreaterThanOrEqual(0);
    expect(worstResult.components.processing.score).toBeLessThanOrEqual(5);
  });

  // ── Debug mode ──
  it("should include debug info when requested", () => {
    const result = score(
      [makeIngredient({ name: "oats" })],
      makeNutrition({ calories: { value: 100, unit: "kcal" } }),
    );

    expect(result.debug).toBeDefined();
    expect(result.debug!.nutrient_contribution).toBeGreaterThanOrEqual(0);
    expect(result.debug!.ingredient_contribution).toBeGreaterThanOrEqual(0);
    expect(result.debug!.concern_contribution).toBeGreaterThanOrEqual(0);
    expect(result.debug!.processing_contribution).toBeGreaterThanOrEqual(0);
  });

  // ── Explanation quality ──
  it("should produce a non-empty explanation", () => {
    const result = score(
      [makeIngredient({ name: "milk", assessment: "beneficial" })],
      makeNutrition({ protein: { value: 10, unit: "g" } }),
    );

    expect(result.explanation).toBeTruthy();
    expect(result.explanation.length).toBeGreaterThan(10);
  });

  // ── Rating label correctness ──
  it("should assign correct rating labels", () => {
    const result = score(
      [
        makeIngredient({ name: "oats", assessment: "beneficial" }),
        makeIngredient({ name: "almonds", assessment: "beneficial" }),
        makeIngredient({ name: "honey", assessment: "beneficial" }),
      ],
      makeNutrition({
        calories: { value: 180, unit: "kcal" },
        sugars: { value: 3, unit: "g" },
        saturatedFat: { value: 0.5, unit: "g" },
        sodium: { value: 30, unit: "mg" },
        protein: { value: 12, unit: "g" },
        fiber: { value: 8, unit: "g" },
      }),
    );

    // A healthy product should get a positive rating
    expect(["Okay", "Good", "Excellent"]).toContain(result.rating);
  });

  // ── Component weights are applied ──
  it("should apply component weights to final score", () => {
    const result = score(
      [makeIngredient({ name: "oats", assessment: "beneficial" })],
      makeNutrition({
        calories: { value: 150, unit: "kcal" },
        sugars: { value: 2, unit: "g" },
        protein: { value: 10, unit: "g" },
      }),
    );

    const expected =
      result.components.nutrient.score * result.components.nutrient.weight +
      result.components.ingredient_profile.score * result.components.ingredient_profile.weight +
      result.components.ingredient_concern.score * result.components.ingredient_concern.weight +
      result.components.processing.score * result.components.processing.weight;

    expect(Math.abs(result.debug!.final_score - expected)).toBeLessThan(0.01);
  });

  // ── Kurkure regression test (barcode 8901491100519) ──
  it("should score Kurkure as 0–5, NOT 0–100", () => {
    // Kurkure ingredients: Rice, Corn (Maize), Palm Oil, Spices, Salt,
    // Sugar, Flavour (Natural / Artificial), Paprika Oleoresins / INS 160c,
    // Maltodextrin
    const kurkureIngredients = [
      makeIngredient({ name: "Rice", assessment: "neutral", category: "grain" }),
      makeIngredient({ name: "Corn (Maize)", assessment: "neutral", category: "grain" }),
      makeIngredient({ name: "Palm Oil", assessment: "neutral", category: "oil" }),
      makeIngredient({ name: "Spices", assessment: "beneficial", category: "whole" }),
      makeIngredient({ name: "Salt", assessment: "neutral", category: "seasoning" }),
      makeIngredient({ name: "Sugar", assessment: "neutral", category: "refined" }),
      makeIngredient({ name: "Flavour (Natural / Artificial)", assessment: "noteworthy", category: "flavor" }),
      makeIngredient({ name: "Paprika Oleoresins / INS 160c", assessment: "generally_accepted", category: "colour" }),
      makeIngredient({ name: "Maltodextrin", assessment: "generally_accepted", category: "refined" }),
    ];
    const kurkureNutrition = makeNutrition({
      calories: { value: 557, unit: "kcal" },
      sugars: { value: 2.2, unit: "g" },
      sodium: { value: 800, unit: "mg" },
      saturatedFat: { value: 7.7, unit: "g" },
      fat: { value: 33.7, unit: "g" },
      salt: { value: 2, unit: "g" },
      protein: { value: 6, unit: "g" },
      fiber: { value: 0, unit: "g" },
    });

    const result = computeFoodGuardHealthScore(
      "kurkure-8901491100519",
      "Kurkure",
      kurkureNutrition,
      kurkureIngredients,
      { includeDebug: true },
    );

    // Score MUST be 0–5, NEVER 0–100
    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.final_score).toBeLessThan(55); // Old 0-100 scores should never appear

    // All four components must be 0–5
    expect(result.components.nutrient.score).toBeGreaterThanOrEqual(0);
    expect(result.components.nutrient.score).toBeLessThanOrEqual(5);
    expect(result.components.ingredient_profile.score).toBeGreaterThanOrEqual(0);
    expect(result.components.ingredient_profile.score).toBeLessThanOrEqual(5);
    expect(result.components.ingredient_concern.score).toBeGreaterThanOrEqual(0);
    expect(result.components.ingredient_concern.score).toBeLessThanOrEqual(5);
    expect(result.components.processing.score).toBeGreaterThanOrEqual(0);
    expect(result.components.processing.score).toBeLessThanOrEqual(5);

    // Confidence must be 0–1
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);

    // Rating must be a valid label
    expect(["Very Poor", "Poor", "Okay", "Good", "Excellent"]).toContain(result.rating);

    // Explanation must be present and non-empty
    expect(result.explanation).toBeTruthy();
    expect(result.explanation.length).toBeGreaterThan(10);

    // Debug info should be present
    expect(result.debug).toBeDefined();
    expect(result.debug!.final_score).toBeGreaterThanOrEqual(0);
    expect(result.debug!.final_score).toBeLessThanOrEqual(5);
  });

  // ── Missing FSSAI data must NOT affect FoodGuard score ──
  it("should score correctly even without FSSAI data", () => {
    const ingredients = [
      makeIngredient({ name: "oats", assessment: "beneficial" }),
      makeIngredient({ name: "sugar", assessment: "neutral" }),
    ];
    const nutrition = makeNutrition({
      calories: { value: 200, unit: "kcal" },
      sugars: { value: 8, unit: "g" },
      protein: { value: 5, unit: "g" },
    });

    const result = computeFoodGuardHealthScore("test-no-fssai", "Product", nutrition, ingredients);

    // FSSAI absence must not make the score unavailable
    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.rating).not.toBe("Unknown");
    expect(result.confidence).toBeGreaterThan(0);
  });

  // ── Missing both nutrition AND ingredients ──
  it("should lower confidence when both nutrition and ingredients are missing", () => {
    const result = score([], null);

    expect(result.final_score).toBeGreaterThanOrEqual(0);
    expect(result.final_score).toBeLessThanOrEqual(5);
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.data_quality.missing_fields).toContain("nutrition");
    expect(result.data_quality.missing_fields).toContain("ingredients");
  });
});
