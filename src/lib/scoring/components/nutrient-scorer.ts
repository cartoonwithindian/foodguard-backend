import type { NutritionFacts, NutrientValue } from "@/types/domain";
import { getScoringRules } from "../config";

export type NutrientFactor = {
  nutrient: string;
  value: number | null;
  unit: string;
  score: number;
  available: boolean;
  level: string;
};

export type NutrientScoringResult = {
  score: number;
  factors: NutrientFactor[];
  negativeScore: number;
  positiveScore: number;
  missingCount: number;
  explanation: string;
};

function getNutrientValue(
  nutrients: Record<string, NutrientValue>,
  key: string,
): { value: number; unit: string; normalizedValue: number; normalizedUnit: string } | null {
  const nutrient = nutrients[key];
  if (!nutrient || nutrient.value === undefined) return null;
  return {
    value: nutrient.value,
    unit: nutrient.unit,
    normalizedValue: nutrient.normalizedValue ?? nutrient.value,
    normalizedUnit: nutrient.normalizedUnit ?? nutrient.unit,
  };
}

function evaluateNegativeNutrient(
  value: number,
  thresholds: Record<string, { max?: number; min?: number; score: number }>,
): { score: number; level: string } {
  // Iterate thresholds in ascending order (by max value)
  const sorted = Object.entries(thresholds)
    .filter(([, t]) => t.max !== undefined)
    .sort((a, b) => (a[1].max ?? 0) - (b[1].max ?? 0));

  for (const [level, threshold] of sorted) {
    if (value <= (threshold.max ?? Infinity)) {
      return { score: threshold.score, level };
    }
  }
  // Fallback: worst score
  const lastEntry = sorted[sorted.length - 1];
  return { score: lastEntry?.[1].score ?? 1.0, level: lastEntry?.[0] ?? "veryHigh" };
}

function evaluatePositiveNutrient(
  value: number,
  thresholds: Record<string, { max?: number; min?: number; score: number }>,
): { score: number; level: string } {
  // Iterate thresholds in descending order (by min value)
  const sorted = Object.entries(thresholds)
    .filter(([, t]) => t.min !== undefined)
    .sort((a, b) => (b[1].min ?? 0) - (a[1].min ?? 0));

  for (const [level, threshold] of sorted) {
    if (value >= (threshold.min ?? 0)) {
      return { score: threshold.score, level };
    }
  }
  // Fallback: worst score
  const lastEntry = sorted[sorted.length - 1];
  return { score: lastEntry?.[1].score ?? 2.0, level: lastEntry?.[0] ?? "absent" };
}

/**
 * Component A: RDA / Nutrient Check
 *
 * Evaluates the nutrition profile against configurable thresholds.
 * Negative nutrients (sugar, sodium, etc.) penalize high values.
 * Positive nutrients (protein, fiber) reward high values.
 * Missing nutrients reduce confidence, not score.
 */
export function scoreNutrients(
  nutrition: NutritionFacts | null,
): NutrientScoringResult {
  const rules = getScoringRules();
  const { nutrientScoring } = rules;

  const factors: NutrientFactor[] = [];
  let negativeSum = 0;
  let negativeCount = 0;
  let positiveSum = 0;
  let positiveCount = 0;
  let missingCount = 0;

  // Evaluate negative nutrients
  for (const [key, rule] of Object.entries(nutrientScoring.negativeNutrients)) {
    const nv = nutrition ? getNutrientValue(nutrition.nutrients, key) : null;
    if (!nv) {
      missingCount++;
      factors.push({
        nutrient: key,
        value: null,
        unit: rule.unit,
        score: 0,
        available: false,
        level: "missing",
      });
      continue;
    }
    // Prefer normalized value when available
    const value = nv.normalizedValue;
    const { score, level } = evaluateNegativeNutrient(value, rule.thresholds);
    negativeSum += score;
    negativeCount++;
    factors.push({
      nutrient: key,
      value,
      unit: nv.normalizedUnit,
      score,
      available: true,
      level,
    });
  }

  // Evaluate positive nutrients
  for (const [key, rule] of Object.entries(nutrientScoring.positiveNutrients)) {
    const nv = nutrition ? getNutrientValue(nutrition.nutrients, key) : null;
    if (!nv) {
      missingCount++;
      factors.push({
        nutrient: key,
        value: null,
        unit: rule.unit,
        score: 0,
        available: false,
        level: "missing",
      });
      continue;
    }
    const value = nv.normalizedValue;
    const { score, level } = evaluatePositiveNutrient(value, rule.thresholds);
    positiveSum += score;
    positiveCount++;
    factors.push({
      nutrient: key,
      value,
      unit: nv.normalizedUnit,
      score,
      available: true,
      level,
    });
  }

  // Weighted combination
  const negativeScore = negativeCount > 0 ? negativeSum / negativeCount : 3.0;
  const positiveScore = positiveCount > 0 ? positiveSum / positiveCount : 2.0;
  const raw =
    negativeScore * nutrientScoring.negativeWeight +
    positiveScore * nutrientScoring.positiveWeight;

  // Apply missing data penalty
  const totalExpected = Object.keys(nutrientScoring.negativeNutrients).length +
    Object.keys(nutrientScoring.positiveNutrients).length;
  const missingPenalty = totalExpected > 0
    ? (missingCount / totalExpected) * nutrientScoring.missingNutrientPenalty
    : 0;

  const score = Math.max(0, Math.min(5, raw - missingPenalty));

  // Generate explanation
  const availableFactors = factors.filter((f) => f.available);
  const highConcerns = availableFactors.filter(
    (f) => f.level === "veryHigh" || f.level === "high",
  );
  const positives = availableFactors.filter(
    (f) => f.level === "veryHigh" || f.level === "high",
  );

  let explanation = "";
  if (highConcerns.length > 0) {
    const concernNames = highConcerns.map((f) => f.nutrient).join(", ");
    explanation += `High ${concernNames}`;
  }
  if (positives.length > 0 && explanation) {
    explanation += "; ";
  }
  if (positives.length > 0) {
    explanation += `Good ${positives.map((f) => f.nutrient).join(", ")}`;
  }
  if (!explanation) {
    explanation = missingCount > factors.length / 2
      ? "Limited nutrition data available for scoring."
      : "Nutrition profile is within typical ranges.";
  }

  return {
    score: Math.round(score * 10) / 10,
    factors,
    negativeScore: Math.round(negativeScore * 100) / 100,
    positiveScore: Math.round(positiveScore * 100) / 100,
    missingCount,
    explanation,
  };
}
