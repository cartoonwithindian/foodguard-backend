import type { IngredientAnalysisItem, IngredientAssessmentLabel } from "@/types/domain";
import { lookupIngredientConcern, type IngredientConcernEntry } from "../ingredients-evidence-db";
import { getScoringRules } from "../config";

const HIGH_ASSESSMENTS: ReadonlySet<IngredientAssessmentLabel> = new Set([
  "potentially_concerning",
  "allergen",
]);

const MODERATE_ASSESSMENTS: ReadonlySet<IngredientAssessmentLabel> = new Set([
  "noteworthy",
  "dietary_conflict",
  "insufficient_evidence",
]);

export type DetectedConcern = {
  ingredient: string;
  severity: "low" | "moderate" | "high";
  reason: string;
  evidenceLevel: "limited" | "moderate" | "strong";
  regulatoryStatus: string;
  sources: string[];
};

export type IngredientConcernResult = {
  score: number;
  concerns: DetectedConcern[];
  highConcernCount: number;
  moderateConcernCount: number;
  lowConcernCount: number;
  totalIngredientsChecked: number;
  explanation: string;
};

/**
 * Component C: Ingredients of Concern / Deep Dive
 *
 * Performs a deeper analysis of the ingredient list using the evidence
 * database. Detects potentially concerning ingredients and scores based
 * on the number and severity of concerns found.
 */
export function scoreIngredientConcerns(
  ingredients: IngredientAnalysisItem[],
): IngredientConcernResult {
  const rules = getScoringRules();
  const { ingredientConcernScoring } = rules;

  const concerns: DetectedConcern[] = [];
  let highConcernCount = 0;
  let moderateConcernCount = 0;
  let lowConcernCount = 0;

  // Check each matched ingredient against the concern database
  const checkedIngredients = ingredients.filter((i) => i.matched);

  const pushDbEntry = (item: IngredientAnalysisItem, dbEntry: IngredientConcernEntry) => {
    concerns.push({
      ingredient: item.name,
      severity: dbEntry.riskLevel,
      reason: dbEntry.reason,
      evidenceLevel: dbEntry.evidenceLevel,
      regulatoryStatus: dbEntry.regulatoryStatus,
      sources: dbEntry.sources,
    });
    if (dbEntry.riskLevel === "high") highConcernCount++;
    else if (dbEntry.riskLevel === "moderate") moderateConcernCount++;
    else lowConcernCount++;
  };

  const pushAnalysisConcern = (item: IngredientAnalysisItem, severity: "moderate" | "high") => {
    concerns.push({
      ingredient: item.name,
      severity,
      reason: item.explanation,
      evidenceLevel: item.evidence.length > 0 ? "moderate" : "limited",
      regulatoryStatus: "Unknown",
      sources: item.evidence.map((e) => e.organization),
    });
    if (severity === "high") highConcernCount++;
    else moderateConcernCount++;
  };

  for (const item of checkedIngredients) {
    const dbEntry = lookupIngredientConcern(item.name);

    // Flagged by the analysis as a high-severity concern
    if (HIGH_ASSESSMENTS.has(item.assessment)) {
      if (dbEntry) pushDbEntry(item, dbEntry);
      else pushAnalysisConcern(item, "moderate");
      continue;
    }

    // Flagged by the analysis as a moderate ("Attention") concern
    if (MODERATE_ASSESSMENTS.has(item.assessment)) {
      if (dbEntry && dbEntry.riskLevel !== "low") pushDbEntry(item, dbEntry);
      else pushAnalysisConcern(item, "moderate");
      continue;
    }

    // Not flagged by the analysis — check the concern DB for all matched ingredients
    if (dbEntry && dbEntry.riskLevel !== "low") {
      pushDbEntry(item, dbEntry);
    }
  }

  // Score calculation: start from base, deduct per concern
  const { scoreFormula } = ingredientConcernScoring;
  let score = scoreFormula.baseScore;

  score -= highConcernCount * scoreFormula.deductionPerHighConcern;
  score -= moderateConcernCount * scoreFormula.deductionPerModerateConcern;
  score -= lowConcernCount * scoreFormula.deductionPerLowConcern;

  score = Math.max(scoreFormula.minScore, Math.min(5, score));

  // Generate explanation
  let explanation = "";
  if (highConcernCount === 0 && moderateConcernCount === 0) {
    explanation = "No significant ingredient concerns detected based on available evidence.";
  } else {
    const parts: string[] = [];
    if (highConcernCount > 0) {
      parts.push(`${highConcernCount} high-severity concern(s)`);
    }
    if (moderateConcernCount > 0) {
      parts.push(`${moderateConcernCount} moderate-severity concern(s)`);
    }
    explanation = parts.join(", ") + " detected.";
  }

  return {
    score: Math.round(score * 10) / 10,
    concerns,
    highConcernCount,
    moderateConcernCount,
    lowConcernCount,
    totalIngredientsChecked: checkedIngredients.length,
    explanation,
  };
}
