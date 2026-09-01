import { describe, it, expect } from "vitest";
import { assessNutrition } from "@/lib/nutrition/analyze";
import { parseNutritionTable } from "@/lib/nutrition/parse";
import type { NutritionFacts } from "@/types/domain";

describe("assessNutrition", () => {
  it("flags high sodium and high sugar", () => {
    const nutrition: NutritionFacts = {
      basis: "PER_100G",
      nutrients: {
        sodium: { value: 1200, unit: "mg", confidence: 0.9 },
        sugars: { value: 30, unit: "g", confidence: 0.9 },
        saturatedFat: { value: 12, unit: "g", confidence: 0.9 },
        calories: { value: 500, unit: "kcal", confidence: 0.9 },
        protein: { value: 5, unit: "g", confidence: 0.9 },
        fiber: { value: 2, unit: "g", confidence: 0.9 },
      },
    };
    const assessment = assessNutrition(nutrition);
    const keys = assessment.concerns.map((c) => c.nutrient);
    expect(keys).toContain("sodium");
    expect(keys).toContain("sugars");
    expect(keys).toContain("saturatedFat");
    const sodium = assessment.concerns.find((c) => c.nutrient === "sodium");
    expect(sodium?.level).toBe("high");
  });

  it("credits fibre and protein", () => {
    const nutrition: NutritionFacts = {
      basis: "PER_100G",
      nutrients: {
        fiber: { value: 8, unit: "g", confidence: 0.9 },
        protein: { value: 15, unit: "g", confidence: 0.9 },
      },
    };
    const assessment = assessNutrition(nutrition);
    expect(assessment.positives.map((p) => p.nutrient)).toContain("fiber");
    expect(assessment.positives.map((p) => p.nutrient)).toContain("protein");
  });

  it("moderate values are moderate, not high", () => {
    const nutrition: NutritionFacts = {
      basis: "PER_100G",
      nutrients: { sodium: { value: 300, unit: "mg", confidence: 0.9 } },
    };
    const assessment = assessNutrition(nutrition);
    const sodium = assessment.concerns.find((c) => c.nutrient === "sodium");
    expect(sodium?.level).toBe("moderate");
  });

  it("reports low confidence when little data is available", () => {
    const nutrition: NutritionFacts = { basis: "PER_100G", nutrients: {} };
    expect(assessNutrition(nutrition).confidence).toBeLessThan(0.5);
    expect(assessNutrition(null).confidence).toBeLessThan(0.5);
  });
});

describe("parseNutritionTable", () => {
  it("extracts values from a nutrition table", () => {
    const text = [
      "Nutrition Facts",
      "Serving size: 1 pack (40g)",
      "Energy 500 kcal",
      "Protein 5g",
      "Carbohydrates 60g",
      "of which sugars 5g",
      "Total Fat 28g",
      "of which saturates 13g",
      "Dietary Fibre 2g",
      "Sodium 680mg",
    ].join("\n");
    const parsed = parseNutritionTable(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.nutrients.calories?.value).toBe(500);
    expect(parsed?.nutrients.sodium?.value).toBe(680);
    expect(parsed?.nutrients.saturatedFat?.value).toBe(13);
    expect(parsed?.nutrients.sugars?.value).toBe(5);
    expect(parsed?.servingSize).toContain("40g");
  });

  it("returns null for text without numbers", () => {
    expect(parseNutritionTable("Ingredients: water, salt")).toBeNull();
  });
});
