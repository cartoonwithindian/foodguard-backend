import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

export type ServingSizeRule = {
  defaultGrams?: number;
  defaultMl?: number;
  categoryOverrides: Record<string, number>;
};

export type NutrientThreshold = {
  max?: number;
  min?: number;
  score: number;
};

export type NutrientScoringRule = {
  unit: string;
  thresholds: Record<string, NutrientThreshold>;
};

export type ComponentWeights = {
  nutrient: number;
  ingredientProfile: number;
  ingredientConcern: number;
  processing: number;
};

export type RatingThreshold = {
  min: number;
  max: number;
  label: string;
};

export type ProcessingLevelConfig = {
  label: string;
  score: number;
  description: string;
};

export type ScoringRules = {
  version: string;
  componentWeights: ComponentWeights;
  ratingThresholds: RatingThreshold[];
  servingSizeRules: {
    solid_foods: ServingSizeRule;
    beverages: ServingSizeRule;
    spreads: ServingSizeRule;
  };
  nutrientScoring: {
    negativeNutrients: Record<string, NutrientScoringRule>;
    positiveNutrients: Record<string, NutrientScoringRule>;
    negativeWeight: number;
    positiveWeight: number;
    missingNutrientPenalty: number;
  };
  ingredientProfileScoring: {
    categories: Record<string, { score: number; keywords: string[] }>;
    positionDecay: {
      first5Weight: number;
      position6to10Weight: number;
      position11plusWeight: number;
    };
  };
  ingredientConcernScoring: {
    concernWeights: Record<string, number>;
    scoreFormula: {
      baseScore: number;
      deductionPerHighConcern: number;
      deductionPerModerateConcern: number;
      deductionPerLowConcern: number;
      minScore: number;
    };
  };
  processingClassification: {
    levels: Record<string, ProcessingLevelConfig>;
    additiveThresholds: Record<string, { max: number; levelModifier: number }>;
    refinedIngredientThresholds: Record<string, { max: number; levelModifier: number }>;
  };
  confidenceScoring: {
    weights: Record<string, number>;
    nutritionCompleteness: Record<string, number>;
    ingredientCompleteness: Record<string, number>;
  };
};

let _rules: ScoringRules | null = null;

export function getScoringRules(): ScoringRules {
  if (_rules) return _rules;
  const configPath = join(process.cwd(), "config", "scoring_rules.json");
  if (!existsSync(configPath)) {
    throw new Error(`Scoring rules not found at ${configPath}`);
  }
  const raw = readFileSync(configPath, "utf-8");
  _rules = JSON.parse(raw) as ScoringRules;
  return _rules;
}

/** Allow runtime override (useful for testing). */
export function resetScoringRules(): void {
  _rules = null;
}

/** Reload from disk (useful for testing config changes). */
export function reloadScoringRules(): ScoringRules {
  _rules = null;
  return getScoringRules();
}
