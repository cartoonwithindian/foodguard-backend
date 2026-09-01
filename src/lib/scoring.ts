import type { AssessmentLevel, IngredientAnalysisItem, NutritionFacts, ScoreFactor } from "@/types/domain";
import { assessNutrition } from "@/lib/nutrition/analyze";

export const ASSESSMENT_LABEL_SCORE: Record<string, number> = {
  beneficial: 0,
  neutral: 0,
  generally_accepted: 0,
  noteworthy: -3,
  potentially_concerning: -6,
  allergen: -5,
  dietary_conflict: -4,
  insufficient_evidence: -2,
};

export function assessmentToSeverity(assessment: string): "low" | "moderate" | "high" {
  switch (assessment) {
    case "potentially_concerning":
    case "allergen":
      return "high";
    case "noteworthy":
    case "dietary_conflict":
    case "insufficient_evidence":
      return "moderate";
    default:
      return "low";
  }
}

/** Legacy factor contribution retained for callers that use the original model. */
export function scoreIngredient(item: IngredientAnalysisItem, position: number, total: number): ScoreFactor {
  const base = ASSESSMENT_LABEL_SCORE[item.assessment] ?? 0;
  const positionWeight = 1 - (position / Math.max(1, total + 1)) * 0.5;
  const impact = Math.round(base * positionWeight);

  let explanation = item.explanation;
  if (item.assessment === "potentially_concerning") {
    explanation = `Contains ${item.name}, which is classified as potentially concerning based on available evidence.`;
  } else if (item.assessment === "noteworthy") {
    explanation = `Contains ${item.name}; review its documented dietary or regulatory context.`;
  } else if (item.assessment === "allergen") {
    explanation = `Contains ${item.name}, a declared allergen.`;
  } else if (item.assessment === "insufficient_evidence") {
    explanation = `Evidence on ${item.name} is limited.`;
  }

  return {
    factor: `ingredient_${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    impact,
    explanation,
    category: "ingredients",
  };
}

export function scoreNutrition(nutrition: NutritionFacts | null): { factors: ScoreFactor[]; confidence: number } {
  const factors: ScoreFactor[] = [];
  const assessment = assessNutrition(nutrition);
  for (const concern of assessment.concerns) {
    const impact = concern.level === "high" ? -10 : -5;
    factors.push({
      factor: `nutrition_${concern.nutrient}`,
      impact,
      explanation: concern.reason,
      category: "nutrition",
    });
  }
  for (const positive of assessment.positives) {
    factors.push({
      factor: `nutrition_${positive.nutrient}_positive`,
      impact: 3,
      explanation: positive.reason,
      category: "nutrition",
    });
  }
  return { factors, confidence: assessment.confidence };
}

const FACTOR_CEILING = 20;
const FACTOR_FLOOR = 20;

/** Legacy 70-point score retained for existing consumers. */
export function computeScore(factors: ScoreFactor[]): { score: number; factors: ScoreFactor[] } {
  let delta = 0;
  for (const factor of factors) delta += factor.impact;
  const raw = 70 + delta;
  const score = Math.min(FACTOR_CEILING + 70, Math.max(70 - FACTOR_FLOOR, Math.round(raw)));
  return { score, factors };
}

export type FoodGuardScoreResult = {
  score: number;
  label: "LOW ATTENTION" | "MODERATE ATTENTION" | "HIGH ATTENTION" | "VERY HIGH ATTENTION";
  breakdown: ScoreFactor[];
};

/**
 * Evidence-backed informational score used by the analysis endpoint.
 * Base score is 100; only verified product findings receive deductions.
 * Unknown ingredients, reference availability and permitted additives do not
 * reduce the score. This is not a medical or legal safety score.
 */
export function computeFoodGuardScore(
  ingredients: IngredientAnalysisItem[],
  nutrition: NutritionFacts | null,
  regulatoryFindings: number = 0,
): FoodGuardScoreResult {
  const breakdown: ScoreFactor[] = [];
  const seenIngredients = new Set<string>();

  for (const item of ingredients) {
    const key = item.name.toLowerCase();
    if (seenIngredients.has(key)) continue;
    seenIngredients.add(key);
    if (!item.matched || item.evidence.length === 0) continue;

    if (item.assessment === "potentially_concerning") {
      breakdown.push({
        factor: `verified_ingredient_${key.replace(/[^a-z0-9]+/g, "_")}`,
        impact: -15,
        explanation: `${item.name} has a documented concern in the available evidence library.`,
        category: "ingredients",
      });
    } else if (item.assessment === "allergen") {
      breakdown.push({
        factor: `declared_allergen_${key.replace(/[^a-z0-9]+/g, "_")}`,
        impact: -15,
        explanation: `${item.name} is present as a declared allergen; this is informational and preference-dependent.`,
        category: "ingredients",
      });
    }
  }

  const nutritionAssessment = assessNutrition(nutrition);
  for (const concern of nutritionAssessment.concerns) {
    const impact = concern.level === "high" ? -15 : concern.level === "moderate" ? -10 : -5;
    breakdown.push({
      factor: `nutrition_${concern.nutrient}`,
      impact,
      explanation: concern.reason,
      category: "nutrition",
    });
  }

  if (regulatoryFindings > 0) {
    breakdown.push({
      factor: "regulatory_findings",
      impact: Math.max(-15, regulatoryFindings * -5),
      explanation: `${regulatoryFindings} product-specific regulatory finding(s) require review.`,
      category: "regulatory",
    });
  }

  const raw = 100 + breakdown.reduce((sum, factor) => sum + factor.impact, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const label = score >= 80
    ? "LOW ATTENTION"
    : score >= 60
      ? "MODERATE ATTENTION"
      : score >= 40
        ? "HIGH ATTENTION"
        : "VERY HIGH ATTENTION";

  return { score, label, breakdown };
}

export function scoreToAssessment(score: number, confidence: number): AssessmentLevel {
  if (confidence < 0.45) return "insufficient";
  if (score >= 80) return "low";
  if (score >= 60) return "moderate";
  return "high";
}

export function assessmentToConcernLevel(assessment: AssessmentLevel): "high" | "moderate" | "low" {
  if (assessment === "high") return "high";
  if (assessment === "low") return "low";
  return "moderate";
}
