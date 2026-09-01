import type { IngredientAnalysisItem, NutritionFacts } from "@/types/domain";
import { getScoringRules } from "./config";
import { scoreNutrients, type NutrientScoringResult } from "./components/nutrient-scorer";
import { scoreIngredientProfile, type IngredientProfileResult } from "./components/ingredient-profile-scorer";
import { scoreIngredientConcerns, type IngredientConcernResult } from "./components/ingredient-concern-scorer";
import { scoreProcessing, type ProcessingAnalysisResult } from "./components/processing-scorer";

// ── Types ────────────────────────────────────────────────────

export type FoodGuardHealthScore = {
  final_score: number;
  rating: string;
  confidence: number;

  components: {
    nutrient: { score: number; weight: number };
    ingredient_profile: { score: number; weight: number };
    ingredient_concern: { score: number; weight: number };
    processing: { score: number; weight: number; level: number };
  };

  nutrient_analysis: NutrientScoringResult;
  ingredient_analysis: IngredientProfileResult;
  ingredient_concerns: IngredientConcernResult;
  processing_analysis: ProcessingAnalysisResult;

  positive_factors: string[];
  negative_factors: string[];
  explanation: string;

  data_quality: {
    missing_fields: string[];
    warnings: string[];
  };

  debug?: {
    nutrient_contribution: number;
    ingredient_contribution: number;
    concern_contribution: number;
    processing_contribution: number;
    final_score: number;
  };
};

// ── Confidence Calculator ────────────────────────────────────

function calculateConfidence(
  nutrition: NutritionFacts | null,
  ingredients: IngredientAnalysisItem[],
  nutrientResult: NutrientScoringResult,
  ingredientResult: IngredientProfileResult,
): number {
  const rules = getScoringRules();
  const { confidenceScoring } = rules;

  // Nutrition completeness
  const totalExpectedNutrients = 11; // calories, fat, satFat, transFat, sodium, salt, carbs, fiber, sugars, addedSugars, protein
  const availableNutrients = nutrientResult.factors.filter((f) => f.available).length;
  let nutritionCompleteness: number;
  if (availableNutrients >= totalExpectedNutrients * 0.8) {
    nutritionCompleteness = confidenceScoring.nutritionCompleteness.allPresent;
  } else if (availableNutrients >= totalExpectedNutrients * 0.5) {
    nutritionCompleteness = confidenceScoring.nutritionCompleteness.mostPresent;
  } else if (availableNutrients > 0) {
    nutritionCompleteness = confidenceScoring.nutritionCompleteness.somePresent;
  } else {
    nutritionCompleteness = confidenceScoring.nutritionCompleteness.nonePresent;
  }

  // Ingredient completeness
  const matchedCount = ingredients.filter((i) => i.matched).length;
  const totalCount = ingredients.length;
  let ingredientCompleteness: number;
  if (totalCount === 0) {
    ingredientCompleteness = confidenceScoring.ingredientCompleteness.noneMatched;
  } else if (matchedCount / totalCount >= 0.8) {
    ingredientCompleteness = confidenceScoring.ingredientCompleteness.allMatched;
  } else if (matchedCount / totalCount >= 0.5) {
    ingredientCompleteness = confidenceScoring.ingredientCompleteness.mostMatched;
  } else if (matchedCount > 0) {
    ingredientCompleteness = confidenceScoring.ingredientCompleteness.someMatched;
  } else {
    ingredientCompleteness = confidenceScoring.ingredientCompleteness.noneMatched;
  }

  // Category certainty (if we have ingredients, we're fairly certain)
  const categoryCertainty = ingredients.length > 0 ? 0.85 : 0.5;

  // Processing certainty (always fairly certain based on ingredients)
  const processingCertainty = ingredientResult.primaryIngredientsAnalyzed > 0 ? 0.85 : 0.5;

  // Evidence availability
  const evidenceCount = ingredients.reduce(
    (sum, item) => sum + item.evidence.length,
    0,
  );
  const evidenceAvailability = Math.min(1.0, evidenceCount / Math.max(1, ingredients.length) * 0.5);

  // Weighted confidence
  const confidence =
    nutritionCompleteness * confidenceScoring.weights.nutritionCompleteness +
    ingredientCompleteness * confidenceScoring.weights.ingredientCompleteness +
    categoryCertainty * confidenceScoring.weights.categoryCertainty +
    processingCertainty * confidenceScoring.weights.processingCertainty +
    evidenceAvailability * confidenceScoring.weights.evidenceAvailability;

  return Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;
}

// ── Rating Helper ────────────────────────────────────────────

function getRating(score: number): string {
  const rules = getScoringRules();
  for (const threshold of rules.ratingThresholds) {
    if (score >= threshold.min && score <= threshold.max) {
      return threshold.label;
    }
  }
  return "Unknown";
}

// ── Main Engine ──────────────────────────────────────────────

export function computeFoodGuardHealthScore(
  productId: string,
  productName: string,
  nutrition: NutritionFacts | null,
  ingredients: IngredientAnalysisItem[],
  options: { includeDebug?: boolean } = {},
): FoodGuardHealthScore {
  const rules = getScoringRules();
  const { componentWeights } = rules;

  const missingFields: string[] = [];
  const warnings: string[] = [];

  // ── Component A: Nutrient Check ──
  const nutrientResult = scoreNutrients(nutrition);
  if (!nutrition) {
    missingFields.push("nutrition");
    warnings.push("No nutrition data available; nutrient score is based on defaults.");
  }

  // ── Component B: Ingredient Profiling ──
  const ingredientResult = scoreIngredientProfile(ingredients);
  if (ingredients.length === 0) {
    missingFields.push("ingredients");
    warnings.push("No ingredient data available for profiling.");
  }

  // ── Component C: Ingredient Concern ──
  const concernResult = scoreIngredientConcerns(ingredients);

  // ── Component D: Processing Level ──
  const processingResult = scoreProcessing(ingredients);

  // ── Final Weighted Score ──
  const nutrientContribution = nutrientResult.score * componentWeights.nutrient;
  const ingredientContribution = ingredientResult.score * componentWeights.ingredientProfile;
  const concernContribution = concernResult.score * componentWeights.ingredientConcern;
  const processingContribution = processingResult.score * componentWeights.processing;

  const rawScore = nutrientContribution + ingredientContribution + concernContribution + processingContribution;
  const finalScore = Math.round(Math.max(0, Math.min(5, rawScore)) * 10) / 10;

  // ── Confidence ──
  const confidence = calculateConfidence(nutrition, ingredients, nutrientResult, ingredientResult);

  // ── Rating ──
  const rating = getRating(finalScore);

  // ── Positive and Negative Factors ──
  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];

  // From nutrients
  for (const factor of nutrientResult.factors) {
    if (!factor.available) continue;
    if (factor.level === "veryLow" || factor.level === "low" || factor.level === "absent") {
      if (["sugars", "addedSugars", "saturatedFat", "transFat", "sodium", "salt", "calories"].includes(factor.nutrient)) {
        positiveFactors.push(`Low ${factor.nutrient} (${factor.value}${factor.unit})`);
      } else {
        positiveFactors.push(`Good ${factor.nutrient} (${factor.value}${factor.unit})`);
      }
    }
    if (factor.level === "high" || factor.level === "veryHigh") {
      if (["sugars", "addedSugars", "saturatedFat", "transFat", "sodium", "salt", "calories"].includes(factor.nutrient)) {
        negativeFactors.push(`High ${factor.nutrient} (${factor.value}${factor.unit})`);
      } else {
        positiveFactors.push(`High ${factor.nutrient} (${factor.value}${factor.unit})`);
      }
    }
  }

  // From ingredient profiling
  if (ingredientResult.wholeFoodCount > 0) {
    positiveFactors.push(`${ingredientResult.wholeFoodCount} whole-food ingredient(s)`);
  }
  if (ingredientResult.additiveCount > 2) {
    negativeFactors.push(`${ingredientResult.additiveCount} additives detected`);
  }

  // From concerns
  if (concernResult.highConcernCount > 0) {
    negativeFactors.push(`${concernResult.highConcernCount} high-severity ingredient concern(s)`);
  }
  if (concernResult.moderateConcernCount > 0) {
    negativeFactors.push(`${concernResult.moderateConcernCount} moderate ingredient concern(s)`);
  }

  // From processing
  if (processingResult.processingLevel >= 3) {
    negativeFactors.push(`Processing level: ${processingResult.processingLabel}`);
  } else if (processingResult.processingLevel === 1) {
    positiveFactors.push("Minimally processed product");
  }

  // ── Explanation ──
  const explanation = buildExplanation(
    finalScore,
    rating,
    nutrientResult,
    ingredientResult,
    concernResult,
    processingResult,
  );

  // ── Debug ──
  const debug = options.includeDebug
    ? {
        nutrient_contribution: Math.round(nutrientContribution * 1000) / 1000,
        ingredient_contribution: Math.round(ingredientContribution * 1000) / 1000,
        concern_contribution: Math.round(concernContribution * 1000) / 1000,
        processing_contribution: Math.round(processingContribution * 1000) / 1000,
        final_score: Math.round(rawScore * 1000) / 1000,
      }
    : undefined;

  return {
    final_score: finalScore,
    rating,
    confidence,
    components: {
      nutrient: { score: nutrientResult.score, weight: componentWeights.nutrient },
      ingredient_profile: { score: ingredientResult.score, weight: componentWeights.ingredientProfile },
      ingredient_concern: { score: concernResult.score, weight: componentWeights.ingredientConcern },
      processing: {
        score: processingResult.score,
        weight: componentWeights.processing,
        level: processingResult.processingLevel,
      },
    },
    nutrient_analysis: nutrientResult,
    ingredient_analysis: ingredientResult,
    ingredient_concerns: concernResult,
    processing_analysis: processingResult,
    positive_factors: positiveFactors,
    negative_factors: negativeFactors,
    explanation,
    data_quality: {
      missing_fields: missingFields,
      warnings,
    },
    debug,
  };
}

// ── Explanation Builder ──────────────────────────────────────

function buildExplanation(
  score: number,
  rating: string,
  nutrient: NutrientScoringResult,
  ingredient: IngredientProfileResult,
  concern: IngredientConcernResult,
  processing: ProcessingAnalysisResult,
): string {
  const lines: string[] = [];

  lines.push(`Score: ${score}/5 (${rating})`);
  lines.push("");

  // Nutrient section
  lines.push(`Nutrition: ${nutrientScoreLabel(nutrient.score)}`);
  for (const factor of nutrient.factors.filter((f) => f.available)) {
    if (factor.level === "high" || factor.level === "veryHigh") {
      const isNegative = ["sugars", "addedSugars", "saturatedFat", "transFat", "sodium", "salt", "calories"].includes(factor.nutrient);
      if (isNegative) {
        lines.push(`- High ${factor.nutrient}`);
      } else {
        lines.push(`- High ${factor.nutrient} (positive)`);
      }
    } else if (factor.level === "low" || factor.level === "veryLow" || factor.level === "absent") {
      const isNegative = ["sugars", "addedSugars", "saturatedFat", "transFat", "sodium", "salt", "calories"].includes(factor.nutrient);
      if (isNegative) {
        lines.push(`- Low ${factor.nutrient} (positive)`);
      } else {
        lines.push(`- Moderate ${factor.nutrient}`);
      }
    }
  }
  lines.push("");

  // Ingredient section
  lines.push(`Ingredients: ${ingredientScoreLabel(ingredient.score)}`);
  if (ingredient.wholeFoodCount > 0) {
    lines.push(`- ${ingredient.wholeFoodCount} recognizable whole-food ingredient(s)`);
  }
  if (ingredient.refinedCount > 0) {
    lines.push(`- ${ingredient.refinedCount} refined ingredient(s)`);
  }
  lines.push("");

  // Concerns section
  lines.push(`Ingredients of Concern: ${concernScoreLabel(concern.score)}`);
  if (concern.highConcernCount === 0 && concern.moderateConcernCount === 0) {
    lines.push("- No significant concerns detected");
  } else {
    if (concern.highConcernCount > 0) {
      lines.push(`- ${concern.highConcernCount} high-severity concern(s)`);
    }
    if (concern.moderateConcernCount > 0) {
      lines.push(`- ${concern.moderateConcernCount} moderate concern(s)`);
    }
  }
  lines.push("");

  // Processing section
  lines.push(`Processing: ${processingScoreLabel(processing.score)}`);
  lines.push(`- ${processing.processingLabel}`);

  return lines.join("\n");
}

function nutrientScoreLabel(score: number): string {
  if (score >= 4) return "Excellent";
  if (score >= 3) return "Good";
  if (score >= 2) return "Moderate";
  return "Poor";
}

function ingredientScoreLabel(score: number): string {
  if (score >= 4) return "Excellent";
  if (score >= 3) return "Good";
  if (score >= 2) return "Moderate";
  return "Poor";
}

function concernScoreLabel(score: number): string {
  if (score >= 4) return "Excellent";
  if (score >= 3) return "Good";
  if (score >= 2) return "Moderate";
  return "Concerning";
}

function processingScoreLabel(score: number): string {
  if (score >= 4) return "Minimal";
  if (score >= 3) return "Moderate";
  if (score >= 2) return "Substantial";
  return "Industrial";
}
