import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getNutrition } from "@/app/api/nutrition/[barcode]/route";
import {
  assessNutrition,
  calculateNutritionConfidence,
  nutrientLabel,
} from "@/lib/nutrition/analyze";
import { normalizeNutritionFacts, normalizeNutritionValue } from "@/lib/nutrition/units";
import { lookupIndianProductByBarcode } from "@/lib/india-dataset";
import type { NutritionFacts } from "@/types/domain";

describe("Nutrition Details data integrity", () => {
  it("uses Kurkure's actual food_database sodium field and preserves its source unit", () => {
    const result = lookupIndianProductByBarcode("8901491100519");
    expect(result?.product?.name).toBe("Kurkure");
    expect(result?.source).toBe("indian_dataset");
    expect(result?.nutrition?.nutrients.sodium?.sourceValue).toBe(0.8);
    expect(result?.nutrition?.nutrients.sodium?.sourceUnit).toBe("g");
    expect(result?.nutrition?.nutrients.sodium?.normalizedValue).toBe(800);
    expect(result?.nutrition?.nutrients.sodium?.normalizedUnit).toBe("mg");
  });

  it.each([
    [0.8, "g", "mg", 800],
    [800, "mg", "mg", 800],
    [7.7, "g", "g", 7.7],
    [557, "kcal", "kcal", 557],
  ] as const)("normalizes %s%s to %s", (value, sourceUnit, targetUnit, expected) => {
    const normalized = normalizeNutritionValue(value, sourceUnit, targetUnit);
    expect(normalized.sourceValue).toBe(value);
    expect(normalized.sourceUnit).toBe(sourceUnit);
    expect(normalized.normalizedValue).toBe(expected);
    expect(normalized.normalizedUnit).toBe(targetUnit);
  });

  it("keeps salt and sodium separate and does not derive one from the other", () => {
    const nutrition: NutritionFacts = {
      basis: "PER_100G",
      nutrients: {
        sodium: { value: 0.8, unit: "g", confidence: 0.9 },
        salt: { value: 2, unit: "g", confidence: 0.9 },
      },
    };
    const normalized = normalizeNutritionFacts(nutrition);
    expect(normalized.nutrients.sodium?.normalizedValue).toBe(800);
    expect(normalized.nutrients.sodium?.normalizedUnit).toBe("mg");
    expect(normalized.nutrients.salt?.normalizedValue).toBe(2);
    expect(normalized.nutrients.salt?.normalizedUnit).toBe("g");
    expect(Object.keys(normalized.nutrients)).toEqual(["sodium", "salt"]);
  });

  it("does not flag calories or added sugar merely because values exist", () => {
    const assessment = assessNutrition({
      basis: "PER_100G",
      nutrients: {
        calories: { value: 557, unit: "kcal", confidence: 0.9 },
        addedSugars: { value: 0.8, unit: "g", confidence: 0.9 },
      },
    });
    expect(assessment.concerns).toEqual([]);
  });

  it("retains configured threshold findings once each", () => {
    const assessment = assessNutrition({
      basis: "PER_100G",
      nutrients: {
        totalFat: { value: 33.7, unit: "g", confidence: 0.9 },
        saturatedFat: { value: 7.7, unit: "g", confidence: 0.9 },
        salt: { value: 2, unit: "g", confidence: 0.9 },
        sodium: { value: 800, unit: "mg", confidence: 0.9 },
      },
    });
    const nutrients = assessment.concerns.map((finding) => finding.nutrient);
    expect(nutrients).toEqual(["saturatedFat", "totalFat", "salt"]);
    expect(new Set(nutrients).size).toBe(nutrients.length);
    expect(assessment.concerns.every((finding) => finding.basis === "PER_100G" && finding.threshold !== undefined && finding.source)).toBe(true);
  });

  it("uses a placeholder for every missing Nutrition Details field", async () => {
    const response = await getNutrition(
      new NextRequest("http://localhost/api/nutrition/8901491100519"),
      { params: Promise.resolve({ barcode: "8901491100519" }) },
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.nutrition.cholesterol.value).toBe("—");
    expect(body.data.nutrition.cholesterol.available).toBe(false);
    expect(body.data.nutrition.sodium.value).toBe(800);
    expect(body.data.nutrition.sodium.unit).toBe("mg");
    expect(body.data.nutrition.sodium.sourceValue).toBe(0.8);
    expect(body.data.nutrition.sodium.sourceUnit).toBe("g");
    expect(body.data.nutrition.sodium.normalizedValue).toBe(800);
    expect(body.data.nutrition.sodium.normalizedUnit).toBe("mg");
    expect(body.data.nutrition.sodium.basis).toBe("PER_100G");
    expect(body.data.nutrition.salt.value).toBe(1.99);
    expect(body.data.nutrition.salt.unit).toBe("g");
    expect(body.data.source.sourceName).toBe("indian_dataset");
    expect(body.data.source.database).toBe("food_database");
  });

  it("normalizes display labels and calculates confidence deterministically", () => {
    expect(nutrientLabel("vitaminD")).toBe("Vitamin D");
    expect(nutrientLabel("calcium")).toBe("Calcium");
    expect(nutrientLabel("iron")).toBe("Iron");
    expect(nutrientLabel("potassium")).toBe("Potassium");
    expect(nutrientLabel("cholesterol")).toBe("Cholesterol");
    expect(nutrientLabel("saturatedFat")).toBe("Saturated fat");
    expect(nutrientLabel("totalFat")).toBe("Total fat");
    expect(nutrientLabel("fiber")).toBe("Dietary fibre");
    expect(nutrientLabel("addedSugars")).toBe("Added sugars");

    const result = lookupIndianProductByBarcode("8901491100519");
    const first = calculateNutritionConfidence(result?.nutrition ?? null, {
      sourceQuality: 0.85,
      productSpecificEvidence: 0.95,
    });
    const second = calculateNutritionConfidence(result?.nutrition ?? null, {
      sourceQuality: 0.85,
      productSpecificEvidence: 0.95,
    });
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0.6);
  });
});
