import { describe, it, expect, beforeAll } from "vitest";
import type { NutritionFacts, ProductInfo } from "@/types/domain";
import { getStore } from "@/lib/store";
import {
  candidateSatisfiesNutritionCriterion,
  candidateSatisfiesIngredientExclusion,
  candidateSatisfiesAllergenExclusion,
  validateCandidateAgainstCriteria,
  detectAlternativeIssues,
  nutritionBasesComparable,
} from "@/lib/alternative-retrieval";
import { buildAlternativeSearchCriteriaList } from "@/lib/alternative-search-criteria";
import { getAlternativeCharacteristics } from "@/lib/alternative-characteristics";
import { findAlternativesForProduct, findAlternativesEnhanced } from "@/services/alternative-engine.service";

beforeAll(() => {
  process.env.DATABASE_URL = ""; // force in-memory (mock) store
});

function nutrition(nutrients: Record<string, number>): NutritionFacts {
  return {
    basis: "PER_100G",
    nutrients: Object.fromEntries(
      Object.entries(nutrients).map(([k, value]) => [k, { value, unit: k === "sodium" ? "mg" : "g", confidence: 0.9 }]),
    ),
  };
}

function product(name: string, barcode: string, ingredientsRaw: string): ProductInfo {
  return {
    id: `p-${barcode}`,
    barcode,
    name,
    brand: "TestBrand",
    category: "food",
    country: "IN",
    servingSize: null,
    imageUrl: null,
    ingredientsRaw,
    ingredientsNormalized: [],
    source: "test",
    sourceUrl: null,
    verified: false,
    productDataConfidence: 0.8,
    isDemo: false,
  };
}

const sourceNutrition = nutrition({ sodium: 700, addedSugars: 18, saturatedFat: 6, totalFat: 20 });

describe("nutrition-basis handling", () => {
  it("PER_100G vs PER_100G is comparable", () => {
    expect(nutritionBasesComparable(nutrition({ sodium: 1 }), nutrition({ sodium: 2 }))).toBe(true);
  });

  it("PER_100G vs PER_SERVING is NOT comparable", () => {
    const perServing: NutritionFacts = {
      basis: "PER_SERVING",
      servingSize: "1 pack (40g)",
      nutrients: { sodium: { value: 280, unit: "mg", confidence: 0.9 } },
    };
    expect(nutritionBasesComparable(nutrition({ sodium: 1 }), perServing)).toBe(false);
  });

  it("PER_SERVING vs PER_SERVING with different serving sizes is NOT comparable", () => {
    const a: NutritionFacts = {
      basis: "PER_SERVING",
      servingSize: "1 pack (40g)",
      nutrients: { sodium: { value: 280, unit: "mg", confidence: 0.9 } },
    };
    const b: NutritionFacts = {
      basis: "PER_SERVING",
      servingSize: "1 cup (30g)",
      nutrients: { sodium: { value: 200, unit: "mg", confidence: 0.9 } },
    };
    expect(nutritionBasesComparable(a, b)).toBe(false);
  });
});

describe("nutrition criteria validation", () => {
  it("LOWER_SODIUM accepts a candidate with lower compatible-basis sodium", () => {
    const result = candidateSatisfiesNutritionCriterion(
      { direction: "lower", referenceValue: 700 },
      sourceNutrition,
      nutrition({ sodium: 500 }),
      "sodium",
      "Sodium",
    );
    expect(result.satisfied).toBe(true);
  });

  it("LOWER_SODIUM rejects a candidate with higher sodium", () => {
    const result = candidateSatisfiesNutritionCriterion(
      { direction: "lower", referenceValue: 700 },
      sourceNutrition,
      nutrition({ sodium: 800 }),
      "sodium",
      "Sodium",
    );
    expect(result.satisfied).toBe(false);
  });

  it("LOWER_ADDED_SUGAR accepts lower added sugar", () => {
    const result = candidateSatisfiesNutritionCriterion(
      { direction: "lower", referenceValue: 18 },
      sourceNutrition,
      nutrition({ addedSugars: 10 }),
      "addedSugars",
      "Added sugar",
    );
    expect(result.satisfied).toBe(true);
  });

  it("LOWER_ADDED_SUGAR rejects higher added sugar", () => {
    const result = candidateSatisfiesNutritionCriterion(
      { direction: "lower", referenceValue: 18 },
      sourceNutrition,
      nutrition({ addedSugars: 20 }),
      "addedSugars",
      "Added sugar",
    );
    expect(result.satisfied).toBe(false);
  });

  it("LOWER_SATURATED_FAT works correctly", () => {
    expect(
      candidateSatisfiesNutritionCriterion({ direction: "lower" }, sourceNutrition, nutrition({ saturatedFat: 3 }), "saturatedFat", "Saturated fat").satisfied,
    ).toBe(true);
    expect(
      candidateSatisfiesNutritionCriterion({ direction: "lower" }, sourceNutrition, nutrition({ saturatedFat: 9 }), "saturatedFat", "Saturated fat").satisfied,
    ).toBe(false);
  });

  it("LOWER_TOTAL_FAT works correctly", () => {
    expect(
      candidateSatisfiesNutritionCriterion({ direction: "lower" }, sourceNutrition, nutrition({ totalFat: 12 }), "totalFat", "Total fat").satisfied,
    ).toBe(true);
    expect(
      candidateSatisfiesNutritionCriterion({ direction: "lower" }, sourceNutrition, nutrition({ totalFat: 25 }), "totalFat", "Total fat").satisfied,
    ).toBe(false);
  });

  it("missing candidate nutrition does NOT qualify as lower", () => {
    const result = candidateSatisfiesNutritionCriterion({ direction: "lower" }, sourceNutrition, null, "sodium", "Sodium");
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain("Missing nutrition");
  });

  it("incompatible nutrition bases are not blindly compared", () => {
    const perServing: NutritionFacts = {
      basis: "PER_SERVING",
      servingSize: "1 pack (40g)",
      nutrients: { sodium: { value: 200, unit: "mg", confidence: 0.9 } },
    };
    const result = candidateSatisfiesNutritionCriterion({ direction: "lower" }, sourceNutrition, perServing, "sodium", "Sodium");
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain("Incompatible nutrition basis");
  });

  it("a valid product-relative comparison is not overridden by any threshold", () => {
    // Candidate (500mg) is below the source (700mg) but still above typical
    // absolute thresholds — relative comparison must win.
    const result = candidateSatisfiesNutritionCriterion({ direction: "lower", referenceValue: 700 }, sourceNutrition, nutrition({ sodium: 500 }), "sodium", "Sodium");
    expect(result.satisfied).toBe(true);
  });
});

describe("ingredient exclusion validation", () => {
  it("PALM_OIL_FREE rejects palm oil", () => {
    const candidate = product("Corn Flakes A", "1000000000001", "Ingredients: Corn, Palm Oil, Salt, Sugar.");
    expect(candidateSatisfiesIngredientExclusion(candidate, "Palm Oil").satisfied).toBe(false);
  });

  it("PALM_OIL_FREE rejects recognized palm-oil aliases (Palmolein)", () => {
    const candidate = product("Corn Flakes B", "1000000000002", "Ingredients: Corn, Palmolein, Salt.");
    expect(candidateSatisfiesIngredientExclusion(candidate, "Palm Oil").satisfied).toBe(false);
  });

  it("PALM_OIL_FREE does not falsely reject unrelated 'palm' text", () => {
    const candidate = product("Snack C", "1000000000003", "Ingredients: Corn, Palm Kernel Oil, Salt.");
    expect(candidateSatisfiesIngredientExclusion(candidate, "Palm Oil").satisfied).toBe(true);
  });

  it("accepts a candidate without palm oil", () => {
    const candidate = product("Corn Flakes D", "1000000000004", "Ingredients: Corn, Sugar, Salt.");
    expect(candidateSatisfiesIngredientExclusion(candidate, "Palm Oil").satisfied).toBe(true);
  });
});

describe("allergen exclusion validation", () => {
  it("ALLERGEN_FREE rejects a candidate containing the allergen", () => {
    const candidate = product("Chocolate E", "1000000000005", "Ingredients: Sugar, Milk, Cocoa Solids.");
    const result = candidateSatisfiesAllergenExclusion(candidate, "milk");
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain("allergen");
  });

  it("ALLERGEN_FREE accepts a candidate without the allergen", () => {
    const candidate = product("Chocolate F", "1000000000006", "Ingredients: Sugar, Cocoa Solids, Cocoa Powder.");
    expect(candidateSatisfiesAllergenExclusion(candidate, "milk").satisfied).toBe(true);
  });
});

describe("validateCandidateAgainstCriteria", () => {
  it("accepts a candidate satisfying all supported constraints", () => {
    const criteria = buildAlternativeSearchCriteriaList(
      getAlternativeCharacteristics(["sodium", "addedSugars", "Palm Oil"]),
      { name: "Corn Flakes", category: "food", nutrition: sourceNutrition },
    );
    const candidate = product("Corn Flakes Lite", "2000000000002", "Ingredients: Corn, Sugar, Salt.");
    const result = validateCandidateAgainstCriteria(candidate, nutrition({ sodium: 500, addedSugars: 10 }), criteria, sourceNutrition);
    expect(result.valid).toBe(true);
    expect(result.satisfied.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a candidate with higher added sugar (B case)", () => {
    const criteria = buildAlternativeSearchCriteriaList(
      getAlternativeCharacteristics(["sodium", "addedSugars", "Palm Oil"]),
      { name: "Corn Flakes", category: "food", nutrition: sourceNutrition },
    );
    const candidate = product("Corn Flakes Sweet", "2000000000003", "Ingredients: Corn, Sugar, Salt.");
    const result = validateCandidateAgainstCriteria(candidate, nutrition({ sodium: 500, addedSugars: 20 }), criteria, sourceNutrition);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("Added sugar"))).toBe(true);
  });

  it("rejects a candidate containing palm oil (C case)", () => {
    const criteria = buildAlternativeSearchCriteriaList(
      getAlternativeCharacteristics(["sodium", "addedSugars", "Palm Oil"]),
      { name: "Corn Flakes", category: "food", nutrition: sourceNutrition },
    );
    const candidate = product("Corn Flakes Oily", "2000000000004", "Ingredients: Corn, Sugar, Salt, Palm Oil.");
    const result = validateCandidateAgainstCriteria(candidate, nutrition({ sodium: 500, addedSugars: 10 }), criteria, sourceNutrition);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("Palm Oil"))).toBe(true);
  });

  it("rejects a candidate with higher sodium", () => {
    const criteria = buildAlternativeSearchCriteriaList(
      getAlternativeCharacteristics(["sodium"]),
      { name: "Corn Flakes", category: "food", nutrition: sourceNutrition },
    );
    const candidate = product("Corn Flakes Salty", "2000000000005", "Ingredients: Corn, Sugar, Salt.");
    const result = validateCandidateAgainstCriteria(candidate, nutrition({ sodium: 900 }), criteria, sourceNutrition);
    expect(result.valid).toBe(false);
  });

  it("missing candidate nutrition fails the nutrition criteria", () => {
    const criteria = buildAlternativeSearchCriteriaList(
      getAlternativeCharacteristics(["sodium"]),
      { name: "Corn Flakes", category: "food", nutrition: sourceNutrition },
    );
    const candidate = product("Corn Flakes NoData", "2000000000006", "Ingredients: Corn, Sugar, Salt.");
    const result = validateCandidateAgainstCriteria(candidate, null, criteria, sourceNutrition);
    expect(result.valid).toBe(false);
  });
});

describe("detectAlternativeIssues", () => {
  it("detects nutrition + ingredient + allergen signals from existing data", () => {
    const source = product("Corn Flakes", "3000000000001", "Ingredients: Corn, Palm Oil, Milk, Sugar, Salt.");
    const issues = detectAlternativeIssues({ product: source, nutrition: sourceNutrition });
    expect(issues).toContain("sodium");
    expect(issues).toContain("addedSugars");
    expect(issues).toContain("Palm Oil");
    expect(issues).toContain("milk");
  });
});

describe("full flow integration (issue → characteristic → criteria → retrieval → validation → ranking)", () => {
  it("returns only candidates that satisfy every supported criterion and the family gate", async () => {
    const store = getStore();

    const source = await store.saveProductFromProvider({
      product: product("Corn Flakes", "4000000000001", "Ingredients: Corn, Sugar, Salt, Palm Oil, Maida."),
      nutrition: sourceNutrition,
      source: "test",
    });
    const sourceProduct = source.product!;

    await store.saveProductFromProvider({
      product: product("Corn Flakes Light", "4000000000002", "Ingredients: Corn, Sugar, Salt."),
      nutrition: nutrition({ sodium: 500, addedSugars: 10, saturatedFat: 3, totalFat: 10, sugars: 2 }),
      source: "test",
    });
    await store.saveProductFromProvider({
      product: product("Corn Flakes Sweet", "4000000000003", "Ingredients: Corn, Sugar, Salt."),
      nutrition: nutrition({ sodium: 500, addedSugars: 20, saturatedFat: 3, totalFat: 10 }),
      source: "test",
    });
    await store.saveProductFromProvider({
      product: product("Corn Flakes Oily", "4000000000004", "Ingredients: Corn, Sugar, Salt, Palm Oil."),
      nutrition: nutrition({ sodium: 500, addedSugars: 10, saturatedFat: 3, totalFat: 10 }),
      source: "test",
    });
    await store.saveProductFromProvider({
      product: product("Vegetable Soup", "4000000000005", "Ingredients: Tomato, Water, Salt, Spices."),
      nutrition: nutrition({ sodium: 300, addedSugars: 5, saturatedFat: 1, totalFat: 2 }),
      source: "test",
    });

    const { alternatives } = await findAlternativesForProduct({
      product: sourceProduct,
      nutrition: sourceNutrition,
      limit: 10,
    });

    const names = alternatives.map((a) => a.product.name);
    expect(names).toContain("Corn Flakes Light");
    expect(names).not.toContain("Corn Flakes Sweet"); // higher added sugar
    expect(names).not.toContain("Corn Flakes Oily"); // contains palm oil
    expect(names).not.toContain("Vegetable Soup"); // different family
  });

  it("is backward compatible: engine without criteria behaves as before", async () => {
    const store = getStore();
    const sourceProduct = await store.getProductByBarcode("8901000000001");
    expect(sourceProduct).not.toBeNull();
    if (!sourceProduct) return;
    const result = await findAlternativesEnhanced({
      product: sourceProduct,
      nutrition: await store.getNutritionForProduct(sourceProduct.id),
      userPreferences: null,
      limit: 3,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});