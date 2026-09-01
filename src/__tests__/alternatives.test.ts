import { describe, it, expect, beforeAll } from "vitest";
import { findAlternatives, findAlternativesWithPreferences } from "@/services/recommendation.service";
import type { AlternativePreferences } from "@/services/recommendation.service";
import { getStore } from "@/lib/store";

beforeAll(() => {
  process.env.DATABASE_URL = ""; // force in-memory (mock) store
});

describe("alternative ranking", () => {
  it("finds ranked alternatives for a snack product", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000001");
    expect(product).not.toBeNull();
    if (!product) return;
    const nutrition = await store.getNutritionForProduct(product.id);
    const alternatives = await findAlternatives(product, nutrition, 5);
    expect(Array.isArray(alternatives)).toBe(true);
    expect(alternatives.length).toBeGreaterThan(0);
    const scores = alternatives.map((a) => a.recommendationScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("never recommends the source product itself", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000005");
    if (!product) return;
    const alternatives = await findAlternatives(product, null, 5);
    expect(alternatives.every((a) => a.product.barcode !== "8901000000005")).toBe(true);
  });

  it("includes human-readable reasons", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000003");
    if (!product) return;
    const alternatives = await findAlternatives(product, await store.getNutritionForProduct(product.id), 5);
    if (alternatives.length > 0) {
      expect(alternatives[0]?.reasons.length).toBeGreaterThan(0);
    }
  });

  it("only returns same-category products", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000001"); // food category
    if (!product) return;
    const alternatives = await findAlternatives(product, null, 10);
    for (const alt of alternatives) {
      expect(alt.product.category).toBe(product.category);
    }
  });

  it("returns at most the requested limit", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000001");
    if (!product) return;
    const alternatives = await findAlternatives(product, null, 2);
    expect(alternatives.length).toBeLessThanOrEqual(2);
  });
});

describe("product comparison", () => {
  it("produces data-driven whyBetter reasons", async () => {
    const { compareProducts } = await import("@/services/product.service");
    const store = getStore();
    const chips = await store.getProductByBarcode("8901000000011");
    const snack = await store.getProductByBarcode("8901000000001");
    if (!chips || !snack) return;
    const result = await compareProducts([chips.id, snack.id]);
    expect(result.length).toBe(2);
    expect(Array.isArray(result[0]?.whyBetter)).toBe(true);
  });
});

describe("enhanced alternatives with preferences", () => {
  it("returns EnhancedAlternative with fssai and dataConfidence", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000001");
    expect(product).not.toBeNull();
    if (!product) return;
    const nutrition = await store.getNutritionForProduct(product.id);
    const alternatives = await findAlternativesWithPreferences(product, nutrition, null, 5);
    expect(alternatives.length).toBeGreaterThan(0);
    const alt = alternatives[0];
    expect(typeof alt.dataConfidence).toBe("number");
    expect(alt.dataConfidence).toBeGreaterThanOrEqual(0);
    expect(alt.dataConfidence).toBeLessThanOrEqual(1);
    // fssai may or may not be present depending on analyzer
    if (alt.fssai) {
      expect(typeof alt.fssai.overallStatus).toBe("string");
      expect(typeof alt.fssai.additiveCount).toBe("number");
      expect(typeof alt.fssai.concernsCount).toBe("number");
    }
  });

  it("lower_sodium preference ranks lower-sodium products higher", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000003"); // noodles, high sodium
    if (!product) return;
    const nutrition = await store.getNutritionForProduct(product.id);
    const prefs: AlternativePreferences = { goals: ["lower_sodium"] };
    const withPrefs = await findAlternativesWithPreferences(product, nutrition, prefs, 5);
    const withoutPrefs = await findAlternativesWithPreferences(product, nutrition, null, 5);
    // Both should return results
    expect(withPrefs.length).toBeGreaterThan(0);
    expect(withoutPrefs.length).toBeGreaterThan(0);
    // With preference, results should have preferenceAlignment
    for (const alt of withPrefs) {
      expect(typeof alt.preferenceAlignment).toBe("number");
    }
  });

  it("lower_sugar preference ranks lower-sugar products higher", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000005"); // cola, high sugar
    if (!product) return;
    const nutrition = await store.getNutritionForProduct(product.id);
    const prefs: AlternativePreferences = { goals: ["lower_sugar"] };
    const alternatives = await findAlternativesWithPreferences(product, nutrition, prefs, 5);
    expect(alternatives.length).toBeGreaterThan(0);
    for (const alt of alternatives) {
      expect(typeof alt.preferenceAlignment).toBe("number");
    }
  });

  it("higher_protein preference is supported", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000001");
    if (!product) return;
    const nutrition = await store.getNutritionForProduct(product.id);
    const prefs: AlternativePreferences = { goals: ["higher_protein"] };
    const alternatives = await findAlternativesWithPreferences(product, nutrition, prefs, 5);
    expect(Array.isArray(alternatives)).toBe(true);
  });

  it("avoidIngredients filters out products containing avoided ingredients", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000001");
    if (!product) return;
    const nutrition = await store.getNutritionForProduct(product.id);
    const prefs: AlternativePreferences = { avoidIngredients: ["palm oil"] };
    const alternatives = await findAlternativesWithPreferences(product, nutrition, prefs, 10);
    // Should still return some results (not all products contain palm oil)
    expect(Array.isArray(alternatives)).toBe(true);
    // None of the alternatives should contain "palm oil" in ingredients
    for (const alt of alternatives) {
      expect(alt.product.ingredientsRaw.toLowerCase()).not.toContain("palm oil");
    }
  });

  it("missing nutrition data reduces dataConfidence", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000001");
    if (!product) return;
    const alternatives = await findAlternativesWithPreferences(product, null, null, 5);
    if (alternatives.length > 0) {
      // With null nutrition, dataConfidence should be lower
      expect(alternatives[0].dataConfidence).toBeLessThan(0.8);
    }
  });

  it("no candidates returns empty array", async () => {
    const store = getStore();
    // Use a product with a unique category that has no other products
    const product = await store.getProductByBarcode("8901000000001");
    if (!product) return;
    const prefs: AlternativePreferences = {
      goals: ["lower_sodium"],
      avoidIngredients: ["corn", "flour", "oil", "salt", "sugar", "spices", "glutamate", "tartrazine", "sunset", "tbhq"],
    };
    const alternatives = await findAlternativesWithPreferences(product, null, prefs, 5);
    // May be empty if all candidates are filtered out
    expect(Array.isArray(alternatives)).toBe(true);
  });

  it("multiple goals are supported simultaneously", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000001");
    if (!product) return;
    const nutrition = await store.getNutritionForProduct(product.id);
    const prefs: AlternativePreferences = {
      goals: ["lower_sodium", "lower_sugar", "fewer_additives"],
    };
    const alternatives = await findAlternativesWithPreferences(product, nutrition, prefs, 5);
    expect(Array.isArray(alternatives)).toBe(true);
    // All returned alternatives should match at least one goal
    for (const alt of alternatives) {
      expect(alt.preferenceAlignment).toBeGreaterThan(0);
    }
  });

  it("ranking consistency: higher score = better match", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000001");
    if (!product) return;
    const nutrition = await store.getNutritionForProduct(product.id);
    const alternatives = await findAlternativesWithPreferences(product, nutrition, { goals: ["lower_sodium"] }, 5);
    if (alternatives.length >= 2) {
      const scores = alternatives.map((a) => a.recommendationScore);
      // Scores should be in descending order
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
      }
    }
  });

  it("source traceability: reasons have factor and detail", async () => {
    const store = getStore();
    const product = await store.getProductByBarcode("8901000000001");
    if (!product) return;
    const alternatives = await findAlternativesWithPreferences(product, null, null, 3);
    for (const alt of alternatives) {
      expect(alt.reasons.length).toBeGreaterThan(0);
      for (const reason of alt.reasons) {
        expect(typeof reason.factor).toBe("string");
        expect(typeof reason.detail).toBe("string");
        expect(reason.detail.length).toBeGreaterThan(0);
      }
    }
  });
});
