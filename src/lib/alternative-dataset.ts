/**
 * Alternative Ingredients — Phase 7: ML-ready dataset preparation.
 *
 * The purpose of this module is DATA PREPARATION ONLY.
 *
 * - It converts Phase 6 behavioural feedback records into deterministic,
 *   reproducible, ML-ready training examples.
 * - It NEVER trains a model, NEVER changes ranking, NEVER changes
 *   recommendation scores.
 * - All functions here are PURE and DETERMINISTIC: the same input always
 *   produces the same output. No network calls, no LLM calls, no randomness.
 * - No raw OCR text, no raw ingredient text, no images, no demographics.
 *
 * Phase 7 prepares data only. It does NOT modify production ranking.
 * ML training was NOT implemented. Phase 8 is responsible for the actual
 * ML ranking experiment.
 */
import type {
  AlternativeFeedbackEvent,
  AlternativeFeedbackEventRecord,
} from "@/lib/alternative-feedback";
import type { NutritionFacts, ProductInfo } from "@/types/domain";
import type { UserPreferencesRecord } from "@/lib/store/types";

/**
 * Deterministic behavioural labels (dataset signals ONLY — NOT ranking
 * weights). Phase 8 may choose a different learning-to-rank formulation;
 * these values are a documented initial representation, not scientifically
 * optimal labels.
 */
export const ALTERNATIVE_LABELS: Record<AlternativeFeedbackEvent, number> = {
  VIEWED: 0,
  CLICKED: 1,
  SELECTED: 2,
  REJECTED: -1,
};

export function toAlternativeLabel(eventType: AlternativeFeedbackEvent): number {
  return ALTERNATIVE_LABELS[eventType];
}

/** Nutrient fields used for nutrition features (existing FoodGaurd vocabulary). */
export const DATASET_NUTRIENT_FIELDS = [
  "sodium",
  "salt",
  "sugars",
  "addedSugars",
  "totalFat",
  "saturatedFat",
  "transFat",
  "fiber",
] as const;

export type DatasetNutrientField = (typeof DATASET_NUTRIENT_FIELDS)[number];

/** Nutrients where LOWER is better (for improvement direction encoding). */
const LOWER_IS_BETTER = new Set<string>([
  "sodium",
  "salt",
  "sugars",
  "addedSugars",
  "totalFat",
  "saturatedFat",
  "transFat",
]);

/** Nutrients where HIGHER is better (fiber). */
const HIGHER_IS_BETTER = new Set<string>(["fiber"]);

/**
 * Deterministic, machine-readable feature vector.
 *
 * Every key is a fixed, documented string; missing/incomparable values are
 * EXPLICITLY `null` — never fabricated as zero.
 */
export type AlternativeFeatureVector = {
  /** Product features (available at recommendation time). */
  same_family: number;
  same_superfamily: number;
  category_compatible: number;
  /** Existing ranking context (preserved verbatim, never altered). */
  rank_position: number;
  recommendation_score: number;
  /**
   * Characteristic features: has_<characteristic_key_lowercased>.
   * Only characteristics that exist in the actual feedback context are set;
   * unknown characteristic keys are rejected before this point.
   */
  has_lower_sodium: number;
  has_lower_added_sugar: number;
  has_lower_sugar: number;
  has_lower_saturated_fat: number;
  has_lower_total_fat: number;
  has_lower_trans_fat: number;
  has_lower_salt: number;
  has_palm_oil_free: number;
  has_whole_grain: number;
  has_allergen_free: number;
  /**
   * Nutrition features per supported nutrient:
   * - source_<n>: source product value
   * - candidate_<n>: alternative product value
   * - <n>_delta: candidate - source (absolute difference)
   * - <n>_relative_delta: (candidate - source) / source when source !== 0
   * - improvement_<n>: +1 improved, -1 worse, 0 equal (direction of
   *   improvement relative to the nutrient's better direction)
   * All are null when either value is missing or the bases are not
   * comparable (see comparableNutritionBasis).
   */
  nutrition: Record<string, number | null>;
};

/**
 * One ML-ready training example produced from a single feedback record.
 * Features contain ONLY information available at recommendation time.
 */
export type AlternativeTrainingExample = {
  userId: string;
  productId: string;
  alternativeProductId: string;
  eventType: AlternativeFeedbackEvent;
  /** Deterministic behavioural label (see ALTERNATIVE_LABELS). */
  label: number;
  rankPosition: number;
  recommendationScore: number;
  characteristicKeys: string[];
  sourceIssueKeys: string[];
  criteriaSnapshot: AlternativeFeedbackEventRecord["criteriaSnapshot"];
  /** Explicit preference features (separate from the behavioural label). */
  explicitPreferences: {
    pref_missing: number;
    pref_vegetarian: number;
    pref_vegan: number;
    pref_allergy_count: number;
    pref_dietary_restriction_count: number;
    pref_avoid_ingredient_count: number;
    pref_health_goal_count: number;
  };
  features: AlternativeFeatureVector;
  timestamp: string;
  /** Feedback record id — provenance, not a model feature. */
  sourceRecordId: string;
};

export function isComparableNutritionBasis(
  a: NutritionFacts | null,
  b: NutritionFacts | null,
): boolean {
  if (!a || !b) return false;
  if (a.basis !== b.basis) return false;
  if (a.basis === "PER_100G") return true;
  // PER_SERVING is only comparable when serving sizes match.
  return (a.servingSize ?? null) === (b.servingSize ?? null);
}

/**
 * Extract the nutrition feature block for one nutrient.
 * Returns null values when not comparable or missing — never zero.
 */
export function extractNutrientFeatures(
  nutrient: DatasetNutrientField,
  sourceNutrition: NutritionFacts | null,
  candidateNutrition: NutritionFacts | null,
): { source: number | null; candidate: number | null; delta: number | null; relativeDelta: number | null; improvement: number | null } {
  const none = { source: null, candidate: null, delta: null, relativeDelta: null, improvement: null };
  if (!isComparableNutritionBasis(sourceNutrition, candidateNutrition)) {
    return none;
  }
  const source = sourceNutrition?.nutrients[nutrient];
  const candidate = candidateNutrition?.nutrients[nutrient];
  if (!source && !candidate) return none;
  // Missing values are explicit null — never fabricated as zero.
  const sourceValue = source ? source.value : null;
  const candidateValue = candidate ? candidate.value : null;
  if (sourceValue === null || candidateValue === null) {
    return { source: sourceValue, candidate: candidateValue, delta: null, relativeDelta: null, improvement: null };
  }
  const delta = candidateValue - sourceValue;
  const relativeDelta = sourceValue !== 0 ? delta / sourceValue : null;
  let improvement: number | null;
  if (LOWER_IS_BETTER.has(nutrient)) improvement = delta < 0 ? 1 : delta > 0 ? -1 : 0;
  else if (HIGHER_IS_BETTER.has(nutrient)) improvement = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  else improvement = 0;
  return { source: sourceValue, candidate: candidateValue, delta, relativeDelta, improvement };
}

export type FeatureExtractionInput = {
  sourceProduct: ProductInfo;
  candidateProduct: ProductInfo;
  sourceNutrition: NutritionFacts | null;
  candidateNutrition: NutritionFacts | null;
  record: AlternativeFeedbackEventRecord;
  sameFamily: boolean;
  sameSuperfamily: boolean;
  categoryCompatible: boolean;
  preferences?: UserPreferencesRecord | null;
};

/**
 * Deterministic feature extraction. All inputs must be data available at
 * recommendation time; behavioural information is NEVER a feature.
 */
export function extractAlternativeFeatures(input: FeatureExtractionInput): {
  features: AlternativeFeatureVector;
  explicitPreferences: AlternativeTrainingExample["explicitPreferences"];
} {
  const { record, preferences } = input;
  const characteristics = new Set(record.characteristicKeys);

  const nutrition: Record<string, number | null> = {};
  for (const nutrient of DATASET_NUTRIENT_FIELDS) {
    const n = extractNutrientFeatures(nutrient, input.sourceNutrition, input.candidateNutrition);
    nutrition[`source_${nutrient}`] = n.source;
    nutrition[`candidate_${nutrient}`] = n.candidate;
    nutrition[`${nutrient}_delta`] = n.delta;
    nutrition[`${nutrient}_relative_delta`] = n.relativeDelta;
    nutrition[`improvement_${nutrient}`] = n.improvement;
  }

  const explicitPreferences: AlternativeTrainingExample["explicitPreferences"] = preferences
    ? {
        pref_missing: 0,
        pref_vegetarian: preferences.vegetarian ? 1 : 0,
        pref_vegan: preferences.vegan ? 1 : 0,
        pref_allergy_count: preferences.allergies.length,
        pref_dietary_restriction_count: preferences.dietaryRestrictions.length,
        pref_avoid_ingredient_count: preferences.avoidIngredients.length,
        pref_health_goal_count: preferences.healthGoals.length,
      }
    : {
        pref_missing: 1,
        pref_vegetarian: 0,
        pref_vegan: 0,
        pref_allergy_count: 0,
        pref_dietary_restriction_count: 0,
        pref_avoid_ingredient_count: 0,
        pref_health_goal_count: 0,
      };

  return {
    features: {
      same_family: input.sameFamily ? 1 : 0,
      same_superfamily: input.sameSuperfamily ? 1 : 0,
      category_compatible: input.categoryCompatible ? 1 : 0,
      rank_position: record.rankPosition,
      recommendation_score: record.recommendationScore,
      has_lower_sodium: characteristics.has("LOWER_SODIUM") ? 1 : 0,
      has_lower_added_sugar: characteristics.has("LOWER_ADDED_SUGAR") ? 1 : 0,
      has_lower_sugar: characteristics.has("LOWER_SUGAR") ? 1 : 0,
      has_lower_saturated_fat: characteristics.has("LOWER_SATURATED_FAT") ? 1 : 0,
      has_lower_total_fat: characteristics.has("LOWER_TOTAL_FAT") ? 1 : 0,
      has_lower_trans_fat: characteristics.has("LOWER_TRANS_FAT") ? 1 : 0,
      has_lower_salt: characteristics.has("LOWER_SALT") ? 1 : 0,
      has_palm_oil_free: characteristics.has("PALM_OIL_FREE") ? 1 : 0,
      has_whole_grain: characteristics.has("WHOLE_GRAIN") ? 1 : 0,
      has_allergen_free: characteristics.has("ALLERGEN_FREE") ? 1 : 0,
      nutrition,
    },
    explicitPreferences,
  };
}