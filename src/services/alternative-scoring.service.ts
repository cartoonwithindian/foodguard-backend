import type { AlternativeReason, NutritionFacts, ProductInfo } from "@/types/domain";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";

/**
 * Enhanced alternative scoring model.
 *
 * Provides transparent, objective scoring for product alternatives.
 * Score components are normalized to 0-100 and weighted.
 *
 * IMPORTANT: The alternative engine should NOT mean "find the healthiest product."
 * It should mean: "Find a product similar to what the user wanted, but with
 * a better overall profile for that particular user."
 *
 * For example:
 * - Original: Kurkure Masala Munch (Extruded salty snack)
 * - Candidate A: Similar category, Lower sodium, Similar serving → HIGH MATCH
 * - Candidate B: Much lower calories, But completely different product → LOW SIMILARITY
 * - Candidate C: Similar product, But contains user's allergen → REJECT
 *
 * overallAlternativeScore =
 *   similarityScore * 0.45  (weighted higher - similarity is key)
 *   + nutritionScore * 0.20
 *   + ingredientScore * 0.15
 *   + dietaryCompatibilityScore * 0.15
 *   + evidenceQualityScore * 0.05
 */

export type ScoringInput = {
  sourceProduct: ProductInfo;
  candidateProduct: ProductInfo;
  sourceNutrition: NutritionFacts | null;
  candidateNutrition: NutritionFacts | null;
  sourceIngredientIds: string[];
  candidateIngredientIds: string[];
  sourceConcernScore: number;
  candidateConcernScore: number;
  userPreferences: {
    vegetarian?: boolean;
    vegan?: boolean;
    allergies?: string[];
    dietaryRestrictions?: string[];
    healthGoals?: string[];
  } | null;
  dataConfidence: number;
  /**
   * Product-family compatibility affinity (0-40) computed by the engine from
   * the candidate retrieval layer. When present it REPLACES the category-based
   * "same category" bonus (which is meaningless when every catalog row is
   * hardcoded to `category: "food"`). The engine hard-gates `incompatible`
   * families before scoring; unknown families pass 10 so they only win when
   * real ingredient overlap supports them.
   */
  familyAffinity?: number;
  /** Human-readable label for the family-matched reason, e.g. "chips". */
  familyLabel?: string;
};

export type ScoringResult = {
  overallScore: number; // 0-100
  similarityScore: number; // 0-100
  nutritionScore: number; // 0-100
  ingredientScore: number; // 0-100
  dietaryCompatibilityScore: number; // 0-100
  evidenceQualityScore: number; // 0-100
  reasons: AlternativeReason[];
  improvement: Record<string, string>;
};

// Nutrition keys to compare
const NUTRITION_COMPARISONS: Array<{
  key: string;
  label: string;
  lowerIsBetter: boolean;
  weight: number;
}> = [
  { key: "sodium", label: "Sodium", lowerIsBetter: true, weight: 1.0 },
  { key: "saturatedFat", label: "Saturated fat", lowerIsBetter: true, weight: 1.0 },
  { key: "sugars", label: "Sugar", lowerIsBetter: true, weight: 0.8 },
  { key: "totalFat", label: "Total fat", lowerIsBetter: true, weight: 0.6 },
  { key: "protein", label: "Protein", lowerIsBetter: false, weight: 0.7 },
  { key: "fiber", label: "Fibre", lowerIsBetter: false, weight: 0.6 },
  { key: "calories", label: "Calories", lowerIsBetter: true, weight: 0.5 },
];

/**
 * Calculate Jaccard similarity between two ingredient lists.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Get a nutrient value from nutrition facts.
 *
 * Prefers the audited `normalizedValue` (units reconciled by the units lib —
 * e.g. sodium always mg) so that a source reporting "960 mg" and a dataset
 * row reporting "0.96 g" compare as equals. Raw values in mixed units must
 * never be divided directly: 960 (mg) vs 1.0 (g) once produced a bogus
 * "Sodium 100% lower" claim.
 */
function getNutrient(nutrition: NutritionFacts | null, key: string): number | null {
  if (!nutrition) return null;
  const nutrient = nutrition.nutrients[key];
  if (!nutrient) return null;
  const value = nutrient.normalizedValue ?? nutrient.value;
  return typeof value === "number" ? value : null;
}

/**
 * Calculate percentage difference between two values.
 * Returns the improvement percentage (positive = better).
 */
/**
 * Nutrients for which a reported value of exactly 0 is implausible and
 * almost always a data-quality gap (dataset rows with missing fields), not
 * a real label claim. Comparisons involving them are skipped so we never
 * surface claims like "Sodium 100% lower" built on zeros.
 */
const ZERO_IMPLAUSIBLE = new Set([
  "sodium",
  "salt",
  "totalFat",
  "saturatedFat",
  "calories",
  "protein",
  "fiber",
  "carbohydrates",
]);

function calcImprovement(
  candidate: number | null,
  source: number | null,
  lowerIsBetter: boolean,
): number | null {
  if (candidate === null || source === null || source === 0) return null;
  const diff = ((candidate - source) / Math.abs(source)) * 100;
  const improved = lowerIsBetter ? diff < 0 : diff > 0;
  if (Math.abs(diff) < 2 || !improved) return null;
  return diff;
}

/**
 * Calculate similarity score (0-100).
 *
 * When the engine supplies `familyAffinity` (product-family compatibility), it
 * replaces the coarse category comparison: the whole catalog is labelled
 * `category: "food"`, so "same category" alone would reward a packet of
 * Kurkure for matching bottled water. Family affinity is 40 (same family),
 * 26 (same superfamily) or 10 (unknown family — no evidence).
 */
function calculateSimilarityScore(
  sourceIngredientIds: string[],
  candidateIngredientIds: string[],
  sourceCategory: string,
  candidateCategory: string,
  familyAffinity?: number,
  familyLabel?: string,
): { score: number; reasons: AlternativeReason[] } {
  const reasons: AlternativeReason[] = [];
  let score = 0;

  // Family affinity replaces category match when provided.
  if (familyAffinity !== undefined) {
    score += familyAffinity;
    if (familyAffinity >= 26 && familyLabel) {
      reasons.push({ factor: "similarity", detail: `Similar product family: ${familyLabel}` });
    }
  } else {
    // Category match
    if (sourceCategory === candidateCategory) {
      score += 40;
      reasons.push({ factor: "similarity", detail: `Same category: ${sourceCategory}` });
    } else {
      score += 10;
    }
  }

  // Ingredient similarity
  const ingredientSim = jaccardSimilarity(sourceIngredientIds, candidateIngredientIds);
  const ingredientScore = Math.round(ingredientSim * 60);
  score += ingredientScore;

  if (ingredientSim > 0.3) {
    reasons.push({ factor: "similarity", detail: `${Math.round(ingredientSim * 100)}% ingredient overlap` });
  }

  return { score: Math.min(100, score), reasons };
}

/**
 * Calculate nutrition improvement score (0-100).
 */
function calculateNutritionScore(
  sourceNutritionRaw: NutritionFacts | null,
  candidateNutritionRaw: NutritionFacts | null,
): { score: number; reasons: AlternativeReason[]; improvement: Record<string, string> } {
  const reasons: AlternativeReason[] = [];
  const improvement: Record<string, string> = {};
  let score = 50; // base score (neutral)

  // Normalize units on BOTH sides (sodium → mg, calories → kcal, ...) before
  // any comparison. Mixed bases (per-100g vs per-serving) are not comparable.
  const sourceNutrition = sourceNutritionRaw ? normalizeNutritionFacts(sourceNutritionRaw) : null;
  const candidateNutrition = candidateNutritionRaw ? normalizeNutritionFacts(candidateNutritionRaw) : null;

  if (!sourceNutrition || !candidateNutrition) {
    return { score, reasons, improvement };
  }
  if (sourceNutrition.basis !== candidateNutrition.basis) {
    return { score, reasons, improvement };
  }

  let improvements = 0;
  let totalComparisons = 0;

  for (const { key, label, lowerIsBetter, weight } of NUTRITION_COMPARISONS) {
    const sourceVal = getNutrient(sourceNutrition, key);
    const candidateVal = getNutrient(candidateNutrition, key);

    if (sourceVal !== null && candidateVal !== null) {
      // Skip implausible zeros on either side (data-quality gap, not a claim).
      if (ZERO_IMPLAUSIBLE.has(key) && (sourceVal <= 0 || candidateVal <= 0)) continue;
      totalComparisons++;
      const diff = calcImprovement(candidateVal, sourceVal, lowerIsBetter);

      if (diff !== null) {
        improvements++;
        const diffStr = `${diff > 0 ? "+" : ""}${Math.abs(diff).toFixed(0)}%`;
        improvement[key] = diffStr;

        const factor: AlternativeReason["factor"] =
          key === "sodium" ? "lower_sodium" :
          key === "saturatedFat" ? "lower_saturated_fat" :
          key === "sugars" ? "lower_sugar" :
          "better_nutrition";

        reasons.push({
          factor,
          detail: `${label} ${diffStr} ${lowerIsBetter ? "lower" : "higher"}`,
        });

        // Score based on magnitude of improvement
        const magnitude = Math.min(Math.abs(diff) / 20, 1); // normalize to 0-1
        score += Math.round(magnitude * 15 * weight);
      }
    }
  }

  // Bonus for overall improvement ratio
  if (totalComparisons > 0) {
    const improvementRatio = improvements / totalComparisons;
    score += Math.round(improvementRatio * 20);
  }

  return { score: Math.min(100, Math.max(0, score)), reasons, improvement };
}

/**
 * Calculate ingredient concern score (0-100).
 * Higher = fewer concerns = better.
 */
function calculateIngredientScore(
  sourceConcernScore: number,
  candidateConcernScore: number,
): { score: number; reasons: AlternativeReason[] } {
  const reasons: AlternativeReason[] = [];
  let score = 50; // base

  if (candidateConcernScore < sourceConcernScore) {
    const improvement = sourceConcernScore - candidateConcernScore;
    score += Math.min(30, improvement * 10);
    reasons.push({ factor: "fewer_additives", detail: `Fewer concerning additives (${improvement} fewer concerns)` });
  } else if (candidateConcernScore > sourceConcernScore) {
    const worsening = candidateConcernScore - sourceConcernScore;
    score -= Math.min(30, worsening * 10);
    reasons.push({ factor: "better_ingredients", detail: `More concerning additives (${worsening} more concerns)` });
  }

  return { score: Math.min(100, Math.max(0, score)), reasons };
}

/**
 * Calculate dietary compatibility score (0-100).
 */
function calculateDietaryCompatibilityScore(
  candidateProduct: ProductInfo,
  candidateIngredientIds: string[],
  userPreferences: ScoringInput["userPreferences"],
  getIngredientRecord: (name: string) => { dietaryStatus: string[] } | null,
): { score: number; reasons: AlternativeReason[] } {
  const reasons: AlternativeReason[] = [];
  let score = 100; // perfect by default (no preferences = compatible)

  if (!userPreferences) {
    return { score, reasons };
  }

  let conflicts = 0;

  // Check vegetarian/vegan
  if (userPreferences.vegetarian || userPreferences.vegan) {
    for (const ingId of candidateIngredientIds) {
      const record = getIngredientRecord(ingId);
      if (record) {
        const hasConflict = record.dietaryStatus.some(s =>
          s === "not_vegan" || s === "contains_dairy" || s === "contains_egg"
        );
        if (hasConflict) {
          conflicts++;
          if (userPreferences.vegan) {
            reasons.push({ factor: "better_ingredients", detail: `Contains ${ingId} (not vegan)` });
          } else {
            reasons.push({ factor: "better_ingredients", detail: `Contains ${ingId} (not vegetarian)` });
          }
        }
      }
    }
  }

  // Check allergies
  if (userPreferences.allergies && userPreferences.allergies.length > 0) {
    const allergySet = new Set(userPreferences.allergies.map(a => a.toLowerCase()));
    for (const ingId of candidateIngredientIds) {
      if (allergySet.has(ingId.toLowerCase())) {
        conflicts += 3; // heavy penalty for allergen
        reasons.push({ factor: "better_ingredients", detail: `Contains allergen: ${ingId}` });
      }
    }
  }

  // Check dietary restrictions
  if (userPreferences.dietaryRestrictions && userPreferences.dietaryRestrictions.length > 0) {
    for (const restriction of userPreferences.dietaryRestrictions) {
      for (const ingId of candidateIngredientIds) {
        if (ingId.toLowerCase().includes(restriction.toLowerCase())) {
          conflicts += 2;
          reasons.push({ factor: "better_ingredients", detail: `Contains restricted: ${ingId}` });
        }
      }
    }
  }

  // Apply penalty
  score -= Math.min(100, conflicts * 20);

  return { score: Math.min(100, Math.max(0, score)), reasons };
}

/**
 * Calculate evidence quality score (0-100).
 */
function calculateEvidenceQualityScore(
  dataConfidence: number,
  hasNutrition: boolean,
  hasIngredients: boolean,
): { score: number; reasons: AlternativeReason[] } {
  const reasons: AlternativeReason[] = [];
  let score = 0;

  // Data completeness contributes to evidence quality
  if (hasNutrition) {
    score += 30;
    reasons.push({ factor: "better_nutrition", detail: "Nutrition data available" });
  }
  if (hasIngredients) {
    score += 30;
    reasons.push({ factor: "better_ingredients", detail: "Ingredient data available" });
  }

  // Overall data confidence
  score += Math.round(dataConfidence * 40);

  return { score: Math.min(100, score), reasons };
}

/**
 * Calculate the overall alternative score with transparent breakdown.
 */
export function calculateAlternativeScore(
  input: ScoringInput,
  getIngredientRecord: (name: string) => { dietaryStatus: string[] } | null,
): ScoringResult {
  // 1. Similarity score
  const similarity = calculateSimilarityScore(
    input.sourceIngredientIds,
    input.candidateIngredientIds,
    input.sourceProduct.category,
    input.candidateProduct.category,
    input.familyAffinity,
    input.familyLabel,
  );

  // 2. Nutrition score
  const nutrition = calculateNutritionScore(
    input.sourceNutrition,
    input.candidateNutrition,
  );

  // 3. Ingredient score
  const ingredient = calculateIngredientScore(
    input.sourceConcernScore,
    input.candidateConcernScore,
  );

  // 4. Dietary compatibility score
  const dietary = calculateDietaryCompatibilityScore(
    input.candidateProduct,
    input.candidateIngredientIds,
    input.userPreferences,
    getIngredientRecord,
  );

  // 5. Evidence quality score
  const evidence = calculateEvidenceQualityScore(
    input.dataConfidence,
    input.candidateNutrition !== null,
    input.candidateIngredientIds.length > 0,
  );

  // Weighted overall score
  // Similarity is weighted highest (0.45) because the core concept is:
  // "Find a SIMILAR product with a better profile, not just the healthiest product"
  const overallScore = Math.round(
    similarity.score * 0.45 +
    nutrition.score * 0.20 +
    ingredient.score * 0.15 +
    dietary.score * 0.15 +
    evidence.score * 0.05
  );

  // Combine all reasons (deduplicated)
  const allReasons = [
    ...similarity.reasons,
    ...nutrition.reasons,
    ...ingredient.reasons,
    ...dietary.reasons,
    ...evidence.reasons,
  ];

  // Deduplicate by factor+detail
  const seenReasons = new Set<string>();
  const uniqueReasons = allReasons.filter(r => {
    const key = `${r.factor}:${r.detail}`;
    if (seenReasons.has(key)) return false;
    seenReasons.add(key);
    return true;
  });

  return {
    overallScore: Math.min(100, Math.max(0, overallScore)),
    similarityScore: similarity.score,
    nutritionScore: nutrition.score,
    ingredientScore: ingredient.score,
    dietaryCompatibilityScore: dietary.score,
    evidenceQualityScore: evidence.score,
    reasons: uniqueReasons.slice(0, 6),
    improvement: nutrition.improvement,
  };
}
