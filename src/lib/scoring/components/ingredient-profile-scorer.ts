import type { IngredientAnalysisItem } from "@/types/domain";
import { getScoringRules } from "../config";

export type IngredientProfileFactor = {
  name: string;
  position: number;
  category: string;
  score: number;
  weight: number;
  isWholeFood: boolean;
  isRefined: boolean;
  isAdditive: boolean;
};

export type IngredientProfileResult = {
  score: number;
  factors: IngredientProfileFactor[];
  primaryIngredientsAnalyzed: number;
  wholeFoodCount: number;
  refinedCount: number;
  additiveCount: number;
  explanation: string;
};

/**
 * Classify an ingredient name into a category based on the scoring rules.
 * Returns the category key and its associated score.
 */
function classifyIngredient(
  name: string,
  categories: Record<string, { score: number; keywords: string[] }>,
): { category: string; score: number; isWholeFood: boolean; isRefined: boolean; isAdditive: boolean } {
  const lower = name.toLowerCase();

  // Check each category in order (most desirable first)
  const categoryOrder = ["wholeFood", "minimallyProcessed", "processed", "highlyProcessed", "ultraProcessed"];

  for (const catKey of categoryOrder) {
    const cat = categories[catKey];
    if (!cat) continue;
    for (const keyword of cat.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return {
          category: catKey,
          score: cat.score,
          isWholeFood: catKey === "wholeFood",
          isRefined: catKey === "processed" || catKey === "highlyProcessed" || catKey === "ultraProcessed",
          isAdditive: catKey === "ultraProcessed",
        };
      }
    }
  }

  // Default: classified as minimally processed (benefit of the doubt)
  return {
    category: "unclassified",
    score: 3.0,
    isWholeFood: false,
    isRefined: false,
    isAdditive: false,
  };
}

/**
 * Component B: Ingredient Profiling
 *
 * Analyzes the first N ingredients (by weight order) and evaluates
 * the overall formulation quality based on ingredient categories.
 */
export function scoreIngredientProfile(
  ingredients: IngredientAnalysisItem[],
): IngredientProfileResult {
  const rules = getScoringRules();
  const { ingredientProfileScoring } = rules;

  // Only analyze matched ingredients with evidence
  const matchedIngredients = ingredients.filter((i) => i.matched);
  const totalIngredients = matchedIngredients.length;

  // Analyze up to first 10 ingredients (first 5 get full weight)
  const toAnalyze = matchedIngredients.slice(0, 10);

  const factors: IngredientProfileFactor[] = [];
  let weightedSum = 0;
  let totalWeight = 0;
  let wholeFoodCount = 0;
  let refinedCount = 0;
  let additiveCount = 0;

  for (let i = 0; i < toAnalyze.length; i++) {
    const item = toAnalyze[i];
    const classification = classifyIngredient(item.name, ingredientProfileScoring.categories);

    // Position-based weight: first 5 get full weight, then decay
    let weight: number;
    if (i < 5) {
      weight = ingredientProfileScoring.positionDecay.first5Weight;
    } else if (i < 10) {
      weight = ingredientProfileScoring.positionDecay.position6to10Weight;
    } else {
      weight = ingredientProfileScoring.positionDecay.position11plusWeight;
    }

    weightedSum += classification.score * weight;
    totalWeight += weight;

    if (classification.isWholeFood) wholeFoodCount++;
    if (classification.isRefined) refinedCount++;
    if (classification.isAdditive) additiveCount++;

    factors.push({
      name: item.name,
      position: i + 1,
      category: classification.category,
      score: classification.score,
      weight,
      isWholeFood: classification.isWholeFood,
      isRefined: classification.isRefined,
      isAdditive: classification.isAdditive,
    });
  }

  const score = totalWeight > 0
    ? Math.max(0, Math.min(5, weightedSum / totalWeight))
    : 3.0;

  // Generate explanation
  let explanation = "";
  if (wholeFoodCount > 0) {
    explanation += `${wholeFoodCount} whole-food ingredient(s) detected`;
  }
  if (refinedCount > 0) {
    explanation += explanation ? `, ${refinedCount} refined ingredient(s)` : `${refinedCount} refined ingredient(s)`;
  }
  if (additiveCount > 0) {
    explanation += explanation ? `, ${additiveCount} additive(s)` : `${additiveCount} additive(s)`;
  }
  if (!explanation) {
    explanation = totalIngredients === 0
      ? "No matched ingredients available for profiling."
      : "Ingredients analyzed; formulation appears standard.";
  }

  return {
    score: Math.round(score * 10) / 10,
    factors,
    primaryIngredientsAnalyzed: toAnalyze.length,
    wholeFoodCount,
    refinedCount,
    additiveCount,
    explanation,
  };
}
