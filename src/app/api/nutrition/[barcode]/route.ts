import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { nutritionDetail } from "@/services/product.service";
import { assessNutrition, calculateNutritionConfidence, nutrientLabel, nutrientDisplayValue } from "@/lib/nutrition/analyze";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";
import type { NutritionField } from "@/types/frontend-contract";

export const runtime = "nodejs";

const FIELD_ORDER = [
  "calories",
  "totalFat",
  "saturatedFat",
  "transFat",
  "cholesterol",
  "sodium",
  "salt",
  "carbohydrates",
  "fiber",
  "sugars",
  "addedSugars",
  "protein",
  "vitaminD",
  "calcium",
  "iron",
  "potassium",
];

const FIELD_MAP: Record<string, string> = {
  calories: "calories",
  totalFat: "totalFat",
  saturatedFat: "saturatedFat",
  transFat: "transFat",
  cholesterol: "cholesterol",
  sodium: "sodium",
  salt: "salt",
  carbohydrates: "totalCarbohydrates",
  fiber: "dietaryFibre",
  sugars: "totalSugars",
  addedSugars: "addedSugars",
  protein: "protein",
  vitaminD: "vitaminD",
  calcium: "calcium",
  iron: "iron",
  potassium: "potassium",
};

function sourceQuality(source: string): number {
  if (source === "indian_dataset") return 0.85;
  if (/label|curated/i.test(source)) return 0.9;
  if (/openfoodfacts/i.test(source)) return 0.75;
  if (/usda|ninjas/i.test(source)) return 0.45;
  return 0.6;
}

/**
 * GET /api/nutrition/:barcode
 * NutritionProductDetail-compatible payload with auditable source units.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const { barcode } = await params;
    const { product, nutrition } = await nutritionDetail(barcode);
    const normalizedNutrition = normalizeNutritionFacts(nutrition);

    const fields: Record<string, NutritionField> = {};
    for (const key of FIELD_ORDER) {
      fields[FIELD_MAP[key] ?? key] = { label: nutrientLabel(key), value: "—", unit: "", available: false };
    }

    for (const [key, nv] of Object.entries(normalizedNutrition.nutrients)) {
      const target = FIELD_MAP[key];
      if (!target) continue;
      const normalizedValue = nv.normalizedValue ?? nv.value;
      const normalizedUnit = nv.normalizedUnit ?? nv.unit;
      fields[target] = {
        label: nutrientLabel(key),
        value: normalizedValue,
        unit: normalizedUnit,
        available: true,
        sourceValue: nv.sourceValue ?? nv.value,
        sourceUnit: nv.sourceUnit ?? nv.unit,
        normalizedValue,
        normalizedUnit,
        basis: normalizedNutrition.basis,
      };
    }

    const sourceName = product.source;
    const assessment = assessNutrition(normalizedNutrition, {
      sourceQuality: sourceQuality(sourceName),
      productSpecificEvidence: product.barcode === barcode ? 0.95 : 0.7,
    });
    const attentionAreas = assessment.concerns.map((concern) => {
      const nv = normalizedNutrition.nutrients[concern.nutrient];
      const value = concern.actualValue ?? nv?.normalizedValue ?? nv?.value ?? 0;
      const unit = concern.unit ?? nv?.normalizedUnit ?? nv?.unit ?? "";
      return {
        name: nutrientLabel(concern.nutrient),
        nutrient: concern.nutrient,
        value: nutrientDisplayValue(concern.nutrient, value, unit),
        unit,
        basis: concern.basis ?? normalizedNutrition.basis,
        threshold: concern.threshold ?? 0,
        severity: concern.level,
        reason: concern.reason,
        source: concern.source ?? sourceName,
      };
    });
    const positivePoints = assessment.positives.map((positive) => {
      const nv = normalizedNutrition.nutrients[positive.nutrient];
      const value = nv?.normalizedValue ?? nv?.value ?? 0;
      const unit = nv?.normalizedUnit ?? nv?.unit ?? "";
      return {
        name: nutrientLabel(positive.nutrient),
        value: nv ? nutrientDisplayValue(positive.nutrient, value, unit) : "",
        description: positive.reason,
      };
    });
    const confidence = calculateNutritionConfidence(normalizedNutrition, {
      sourceQuality: sourceQuality(sourceName),
      productSpecificEvidence: product.barcode === barcode ? 0.95 : 0.7,
    });

    return jsonSuccess(
      {
        id: product.id,
        name: product.name,
        brand: product.brand ?? "",
        category: product.category,
        barcode: product.barcode,
        scanDate: new Date().toISOString(),
        servingSize: normalizedNutrition.servingSize ?? "100g",
        servingsPerContainer: normalizedNutrition.servingsPerContainer,
        nutrition: fields,
        attentionAreas,
        positivePoints,
        context: "Values shown per 100g. Information is for educational purposes and is not medical advice.",
        dataQuality: confidence >= 0.8 ? "high" : confidence >= 0.6 ? "medium" : "low",
        dataQualityExplanation: `Data confidence: ${Math.round(confidence * 100)}%. Calculated from source quality, field completeness, unit validity, and product-specific evidence.`,
        source: {
          sourceName,
          sourceType: "food_database",
          database: "food_database",
          summary: `Product-specific nutrition values from ${sourceName}; source and normalized units are retained separately.`,
          url: product.sourceUrl ?? undefined,
        },
        confidence,
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
