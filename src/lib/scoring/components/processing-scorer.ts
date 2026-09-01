import type { IngredientAnalysisItem } from "@/types/domain";
import { getScoringRules } from "../config";

export type ProcessingAnalysisResult = {
  processingLevel: 1 | 2 | 3 | 4;
  processingLabel: string;
  score: number;
  additiveCount: number;
  refinedCount: number;
  totalIngredients: number;
  wholeFoodCount: number;
  cosmeticFunctionalCount: number;
  explanation: string;
};

/**
 * Component D: Processing Level
 *
 * Estimates how far the product is from its original/whole-food form
 * based on ingredient composition and additive presence.
 */
export function scoreProcessing(
  ingredients: IngredientAnalysisItem[],
): ProcessingAnalysisResult {
  const rules = getScoringRules();
  const { processingClassification } = rules;

  const matchedIngredients = ingredients.filter((i) => i.matched);
  const totalIngredients = matchedIngredients.length;

  // Categorize ingredients
  let additiveCount = 0;
  let refinedCount = 0;
  let wholeFoodCount = 0;
  let cosmeticFunctionalCount = 0;

  for (const item of matchedIngredients) {
    const flags = item.flags ?? [];
    const assessment = item.assessment;
    const category = item.category?.toLowerCase() ?? "";

    // Count additives (identified by flags or category)
    if (flags.includes("additive") || category.includes("additive") ||
        category.includes("preservative") || category.includes("emulsifier") ||
        category.includes("stabilizer") || category.includes("colour") ||
        category.includes("color") || category.includes("flavor") ||
        category.includes("sweetener") || category.includes("thickener")) {
      additiveCount++;
    }

    // Count refined ingredients
    if (assessment === "generally_accepted" || category.includes("refined") ||
        category.includes("processed")) {
      refinedCount++;
    }

    // Count whole-food ingredients
    if (assessment === "beneficial" || category.includes("whole") ||
        category.includes("natural")) {
      wholeFoodCount++;
    }

    // Count cosmetic/functional ingredients (not nutritionally significant)
    if (category.includes("cosmetic") || category.includes("functional") ||
        category.includes("anti-caking") || category.includes("glazing")) {
      cosmeticFunctionalCount++;
    }
  }

  // Determine processing level
  let baseLevel = 1;

  // Start with level 1 (minimally processed)
  // Escalate based on additive count
  const { additiveThresholds } = processingClassification;
  if (additiveCount > additiveThresholds.someAdditives.max) {
    baseLevel = 4; // Ultra-processed
  } else if (additiveCount > additiveThresholds.fewAdditives.max) {
    baseLevel = 3; // Highly processed
  } else if (additiveCount > 0) {
    baseLevel = 2; // Processed
  }

  // Escalate based on refined ingredient count
  const { refinedIngredientThresholds } = processingClassification;
  let refinedLevelModifier = 0;
  if (refinedCount > refinedIngredientThresholds.moderate.max) {
    refinedLevelModifier = 2;
  } else if (refinedCount > refinedIngredientThresholds.low.max) {
    refinedLevelModifier = 1;
  }

  // Apply higher of the two level determinations
  const finalLevel = Math.min(4, Math.max(baseLevel, baseLevel + refinedLevelModifier)) as 1 | 2 | 3 | 4;

  // Bonus: if many whole-food ingredients and few additives, stay at lower level
  let adjustedLevel = finalLevel;
  if (wholeFoodCount > additiveCount * 2 && finalLevel > 1) {
    adjustedLevel = Math.max(1, finalLevel - 1) as 1 | 2 | 3 | 4;
  }

  // Get score from config
  const levelConfig = processingClassification.levels[String(adjustedLevel)];
  const score = levelConfig?.score ?? 3.0;
  const label = levelConfig?.label ?? "Unknown";

  // Generate explanation
  let explanation = "";
  switch (adjustedLevel) {
    case 1:
      explanation = "Minimally processed product that retains its original whole-food characteristics.";
      break;
    case 2:
      explanation = "Simple processing techniques applied. Product retains most of its nutritional profile.";
      break;
    case 3:
      explanation = "Substantial refinement and industrial formulation detected. Multiple functional ingredients present.";
      break;
    case 4:
      explanation = "Ultra-processed industrial formulation with multiple functional additives and highly refined ingredients.";
      break;
  }

  if (additiveCount > 0) {
    explanation += ` Contains ${additiveCount} additive(s).`;
  }
  if (wholeFoodCount > 0) {
    explanation += ` Includes ${wholeFoodCount} whole-food ingredient(s).`;
  }

  return {
    processingLevel: adjustedLevel,
    processingLabel: label,
    score,
    additiveCount,
    refinedCount,
    totalIngredients,
    wholeFoodCount,
    cosmeticFunctionalCount,
    explanation,
  };
}
