import { describe, it, expect } from "vitest";
import type { NutritionFacts } from "@/types/domain";
import { getAlternativeCharacteristic } from "@/lib/alternative-characteristics";
import { buildAlternativeSearchCriteria, buildAlternativeSearchCriteriaList } from "@/lib/alternative-search-criteria";

const cerealNutrition: NutritionFacts = {
  basis: "PER_100G",
  nutrients: {
    sodium: { value: 700, unit: "mg", confidence: 0.9 },
    addedSugars: { value: 18, unit: "g", confidence: 0.9 },
    saturatedFat: { value: 6, unit: "g", confidence: 0.9 },
    totalFat: { value: 20, unit: "g", confidence: 0.9 },
  },
};

const currentProduct = {
  name: "Corn Flakes",
  brand: "Demo",
  category: "food",
  nutrition: cerealNutrition,
};

function char(key: string) {
  return getAlternativeCharacteristic(key)!;
}

describe("buildAlternativeSearchCriteria", () => {
  it("LOWER_SODIUM → sodium lower-than-current-product criterion", () => {
    const criteria = buildAlternativeSearchCriteria(char("sodium"), currentProduct);
    expect(criteria.preferredCharacteristics).toContain("LOWER_SODIUM");
    expect(criteria.nutrition.sodium).toEqual({ direction: "lower", referenceValue: 700, basis: "PER_100G" });
  });

  it("LOWER_ADDED_SUGAR → added sugar lower-than-current-product criterion", () => {
    const criteria = buildAlternativeSearchCriteria(char("addedSugars"), currentProduct);
    expect(criteria.nutrition.addedSugars).toEqual({ direction: "lower", referenceValue: 18, basis: "PER_100G" });
  });

  it("LOWER_SATURATED_FAT → saturated fat lower-than-current-product criterion", () => {
    const criteria = buildAlternativeSearchCriteria(char("saturatedFat"), currentProduct);
    expect(criteria.nutrition.saturatedFat.direction).toBe("lower");
    expect(criteria.nutrition.saturatedFat.referenceValue).toBe(6);
  });

  it("LOWER_TOTAL_FAT → total fat lower-than-current-product criterion", () => {
    const criteria = buildAlternativeSearchCriteria(char("totalFat"), currentProduct);
    expect(criteria.nutrition.totalFat.direction).toBe("lower");
    expect(criteria.nutrition.totalFat.referenceValue).toBe(20);
  });

  it("PALM_OIL_FREE → palm oil exclusion", () => {
    const criteria = buildAlternativeSearchCriteria(char("Palm Oil"), currentProduct);
    expect(criteria.avoidIngredients).toContain("Palm Oil");
  });

  it("ALLERGEN_FREE → allergen exclusion", () => {
    const criteria = buildAlternativeSearchCriteria(char("milk"), currentProduct);
    expect(criteria.avoidIngredients).toContain("Milk / Dairy");
    expect(criteria.preferredCharacteristics).toContain("ALLERGEN_FREE");
  });

  it("preserves the product family/category", () => {
    const criteria = buildAlternativeSearchCriteria(char("sodium"), currentProduct);
    expect(criteria.family).toBe("cereal");
    expect(criteria.superfamily).toBe("staples");
    expect(criteria.category).toBe("cereal");
  });

  it("generates search terms from the characteristic", () => {
    const criteria = buildAlternativeSearchCriteria(char("sodium"), currentProduct);
    expect(criteria.searchTerms).toContain("lower sodium");
    expect(criteria.searchTerms).toContain("low sodium");
  });

  it("marks WHOLE_GRAIN as unsupported but keeps retrieval hints", () => {
    const criteria = buildAlternativeSearchCriteria(char("maida"), currentProduct);
    expect(criteria.preferredCharacteristics).toContain("WHOLE_GRAIN");
    expect(criteria.unsupported).toContain("WHOLE_GRAIN");
    expect(criteria.searchTerms).toContain("whole grain");
  });

  it("handles a missing current nutrition value safely (no reference value, no invented number)", () => {
    const criteria = buildAlternativeSearchCriteria(char("sodium"), { name: "Cereal", category: "food" });
    expect(criteria.nutrition.sodium).toEqual({ direction: "lower" });
    expect(criteria.nutrition.sodium.referenceValue).toBeUndefined();
  });

  it("does not generate fake criteria for an unknown characteristic", () => {
    const unknown = getAlternativeCharacteristic("NOT_A_REAL_ISSUE");
    expect(unknown).toBeNull();
  });
});

describe("buildAlternativeSearchCriteriaList", () => {
  it("combines multiple characteristics safely", () => {
    const characteristics = [char("sodium"), char("addedSugars"), char("Palm Oil")];
    const criteria = buildAlternativeSearchCriteriaList(characteristics, currentProduct);
    expect(criteria.preferredCharacteristics).toEqual(["LOWER_SODIUM", "LOWER_ADDED_SUGAR", "PALM_OIL_FREE"]);
    expect(criteria.nutrition.sodium.direction).toBe("lower");
    expect(criteria.nutrition.addedSugars.direction).toBe("lower");
    expect(criteria.avoidIngredients).toContain("Palm Oil");
    expect(criteria.family).toBe("cereal");
  });

  it("does not drop valid criteria when another characteristic exists", () => {
    const criteria = buildAlternativeSearchCriteriaList([char("sodium"), char("totalFat")], currentProduct);
    expect(criteria.nutrition.sodium.referenceValue).toBe(700);
    expect(criteria.nutrition.totalFat.referenceValue).toBe(20);
  });

  it("deduplicates search terms across characteristics", () => {
    const criteria = buildAlternativeSearchCriteriaList([char("sodium"), char("salt")], currentProduct);
    const terms = criteria.searchTerms.map((t) => t.toLowerCase());
    expect(new Set(terms).size).toBe(terms.length);
  });
});