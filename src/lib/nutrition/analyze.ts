import type { NutritionFacts } from "@/types/domain";

export type NutritionConcern = {
  nutrient: string;
  level: "low" | "moderate" | "high";
  reason: string;
  actualValue?: number;
  unit?: string;
  basis?: string;
  threshold?: number;
  source?: string;
};

export type NutritionPositive = {
  nutrient: string;
  reason: string;
};

export type NutritionConfidenceContext = {
  sourceQuality?: number;
  productSpecificEvidence?: number;
};

export type NutritionAssessment = {
  concerns: NutritionConcern[];
  positives: NutritionPositive[];
  confidence: number;
};

// Per-100g thresholds retained from the existing FoodGuard profiling rules.
// A nutrient is only an attention area when its configured threshold is met.
//
// `addedSugars` reuses the existing total-sugars rule as a clearly documented,
// configurable starting point for the Alternative Ingredients feature. It only
// ever evaluates the EXPLICIT `addedSugars` field — total sugar is never
// treated as added sugar. The value requires a product decision before being
// treated as a settled regulatory/medical threshold.
const THRESHOLDS: Record<string, { high: number; moderate: number; unit: string }> = {
  sodium: { high: 600, moderate: 200, unit: "mg" },
  sugars: { high: 22.5, moderate: 5, unit: "g" },
  addedSugars: { high: 22.5, moderate: 5, unit: "g" },
  saturatedFat: { high: 5, moderate: 1.5, unit: "g" },
  totalFat: { high: 17.5, moderate: 8, unit: "g" },
  salt: { high: 1.5, moderate: 0.5, unit: "g" },
};

const POSITIVE_THRESHOLDS: Record<string, { min: number; unit: string }> = {
  fiber: { min: 3, unit: "g" },
  protein: { min: 12, unit: "g" },
};

const NUTRIENT_LABELS: Record<string, string> = {
  calories: "Calories",
  energyKj: "Energy",
  protein: "Protein",
  carbohydrates: "Total carbohydrates",
  totalCarbohydrates: "Total carbohydrates",
  sugars: "Total sugars",
  totalSugars: "Total sugars",
  addedSugars: "Added sugars",
  totalFat: "Total fat",
  saturatedFat: "Saturated fat",
  transFat: "Trans fat",
  fiber: "Dietary fibre",
  dietaryFibre: "Dietary fibre",
  sodium: "Sodium",
  salt: "Salt",
  vitaminD: "Vitamin D",
  calcium: "Calcium",
  iron: "Iron",
  potassium: "Potassium",
  cholesterol: "Cholesterol",
};

const EXPECTED_NUTRIENTS = [
  "calories",
  "totalFat",
  "saturatedFat",
  "transFat",
  "sodium",
  "salt",
  "carbohydrates",
  "fiber",
  "sugars",
  "addedSugars",
  "protein",
];

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export function nutrientLabel(key: string): string {
  return NUTRIENT_LABELS[key] ?? key;
}

export function nutrientDisplayValue(_key: string, value: number, unit: string): string {
  return `${fmt(value)}${unit}`;
}

/**
 * Deterministic nutrition-data confidence. The previous page displayed the
 * product's generic 0.6 confidence, regardless of the actual nutrition data.
 * This score is based on documented properties of the nutrition record:
 * source quality (35%), common-field completeness (35%), valid units (20%),
 * and product-specific evidence (10%). It is informational, not safety advice.
 */
export function calculateNutritionConfidence(
  nutrition: NutritionFacts | null,
  context: NutritionConfidenceContext = {},
): number {
  if (!nutrition) return 0;
  const nutrients = nutrition.nutrients;
  const completeness = EXPECTED_NUTRIENTS.filter((key) => nutrients[key] !== undefined).length / EXPECTED_NUTRIENTS.length;
  const validUnits = Object.values(nutrients).filter((nutrient) =>
    Boolean(nutrient.sourceUnit && nutrient.normalizedUnit && nutrient.basis === nutrition.basis),
  ).length;
  const unitValidity = Object.keys(nutrients).length > 0 ? validUnits / Object.keys(nutrients).length : 0;
  const sourceQuality = Math.max(0, Math.min(1, context.sourceQuality ?? 0.75));
  const productEvidence = Math.max(0, Math.min(1, context.productSpecificEvidence ?? 0.8));
  return Math.round((sourceQuality * 0.35 + completeness * 0.35 + unitValidity * 0.2 + productEvidence * 0.1) * 100) / 100;
}

/**
 * Evaluates nutrition facts (per 100g basis) against configured thresholds.
 * Calories and added sugars are information by default; neither becomes an
 * attention area without an explicit rule in THRESHOLDS.
 */
export function assessNutrition(
  nutrition: NutritionFacts | null,
  context: NutritionConfidenceContext = {},
): NutritionAssessment {
  const concerns: NutritionConcern[] = [];
  const positives: NutritionPositive[] = [];

  if (!nutrition) {
    return { concerns, positives, confidence: 0 };
  }

  const n = nutrition.nutrients;
  const seen = new Set<string>();
  const addConcern = (concern: NutritionConcern) => {
    if (seen.has(concern.nutrient)) return;
    seen.add(concern.nutrient);
    concerns.push(concern);
  };

  for (const [key, threshold] of Object.entries(THRESHOLDS)) {
    // Salt and sodium are retained as separate fields. When both are present,
    // use the explicit salt rule once to avoid two warnings for one dietary
    // topic; this never copies or derives one value from the other.
    if (key === "sodium" && n.salt) continue;
    const nutrient = n[key];
    if (!nutrient || nutrient.value === undefined) continue;
    const value = nutrient.normalizedValue ?? nutrient.value;
    const unit = nutrient.normalizedUnit ?? nutrient.unit;
    const level = value >= threshold.high ? "high" : value >= threshold.moderate ? "moderate" : null;
    if (!level) continue;
    addConcern({
      nutrient: key,
      level,
      actualValue: value,
      unit,
      basis: nutrition.basis,
      threshold: level === "high" ? threshold.high : threshold.moderate,
      source: "Product nutrition data",
      reason: `Contains a noteworthy amount of ${nutrientLabel(key)} (${fmt(value)}${unit} per 100g).`,
    });
  }

  const trans = n.transFat;
  if (trans) {
    const value = trans.normalizedValue ?? trans.value;
    const unit = trans.normalizedUnit ?? trans.unit;
    if (value > 0.5) {
      addConcern({
        nutrient: "transFat",
        level: "high",
        actualValue: value,
        unit,
        basis: nutrition.basis,
        threshold: 0.5,
        source: "Product nutrition data",
        reason: "Contains trans fats; WHO recommends eliminating industrially produced trans fats.",
      });
    } else if (value > 0.1) {
      addConcern({
        nutrient: "transFat",
        level: "moderate",
        actualValue: value,
        unit,
        basis: nutrition.basis,
        threshold: 0.1,
        source: "Product nutrition data",
        reason: "Contains more than the configured FoodGuard trans-fat threshold.",
      });
    }
  }

  for (const [key, threshold] of Object.entries(POSITIVE_THRESHOLDS)) {
    const nutrient = n[key];
    if (nutrient && (nutrient.normalizedValue ?? nutrient.value) >= threshold.min) {
      const value = nutrient.normalizedValue ?? nutrient.value;
      const unit = nutrient.normalizedUnit ?? nutrient.unit;
      positives.push({
        nutrient: key,
        reason: `Source of ${nutrientLabel(key)} (${fmt(value)}${unit} per 100g).`,
      });
    }
  }

  return {
    concerns,
    positives,
    confidence: calculateNutritionConfidence(nutrition, context),
  };
}
