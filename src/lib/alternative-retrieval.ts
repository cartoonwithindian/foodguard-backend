import type { NutritionFacts, ProductInfo } from "@/types/domain";
import { assessNutrition } from "@/lib/nutrition/analyze";
import { detectAllergens } from "@/lib/allergens";
import { ALLERGEN_SEED } from "@/data/seed/allergens";
import { normalizeIngredient } from "@/lib/ingredients/normalize";
import { ingredientIndex } from "@/lib/ingredients";
import { parseIngredientText } from "@/lib/ingredients/parse";
import { PALM_OIL_CANONICAL, MAIDA_CANONICAL } from "@/lib/ingredients/detection";
import type { AlternativeSearchCriteria, NutritionCriterion } from "@/lib/alternative-search-criteria";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";

/**
 * Alternative Ingredients — Phase 4: Candidate retrieval + validation.
 *
 * This module plugs the Phase 3 AlternativeSearchCriteria layer into the
 * EXISTING retrieval pipeline. It only ADDS a validation gate:
 *
 *   AlternativeSearchCriteria
 *       ↓
 *   retrieve candidates (existing store / family gate / dedupe)
 *       ↓
 *   validate candidates against criteria  ← THIS MODULE
 *       ↓
 *   existing ranking
 *
 * Rules enforced here:
 * - Nutrition comparisons are RELATIVE to the scanned product.
 * - Nutrition bases (PER_100G vs PER_SERVING) are only compared when compatible.
 * - Missing nutrition is NEVER treated as zero / never claimed "lower".
 * - Ingredient exclusions reuse the normalized knowledge base (no raw-string
 *   guessing on words like "palm").
 * - Allergen exclusions reuse the existing allergen system.
 * - Search terms are never treated as proof of suitability.
 */

export type CandidateValidationResult = {
  valid: boolean;
  violations: string[];
  satisfied: string[];
};

/** Aggregate the EXISTING issue signals for a product (Phase 2 signals + existing ones). */
export function detectAlternativeIssues(input: {
  product: Pick<ProductInfo, "ingredientsRaw">;
  nutrition: NutritionFacts | null;
}): string[] {
  const issues: string[] = [];

  // 1) Existing nutrition concerns (sodium, addedSugars, sugars, ...).
  for (const concern of assessNutrition(input.nutrition).concerns) {
    issues.push(concern.nutrient);
  }

  // 2) Existing ingredient knowledge-base signals.
  const { ingredients } = parseIngredientText(input.product.ingredientsRaw);
  const records = ingredientIndex.all();
  for (const raw of ingredients) {
    const normalized = normalizeIngredient(raw);
    if (!normalized.matched || !normalized.canonicalName) continue;
    if (normalized.canonicalName === PALM_OIL_CANONICAL) issues.push(PALM_OIL_CANONICAL);
    if (normalized.canonicalName === MAIDA_CANONICAL) issues.push(MAIDA_CANONICAL);
    const record = records.find((r) => r.canonicalName === normalized.canonicalName);
    if (record?.allergenStatus) issues.push(record.allergenStatus);
  }

  // 3) Existing label-level allergen declarations.
  for (const allergen of detectAllergens(input.product.ingredientsRaw)) {
    issues.push(allergen.allergen);
  }

  return issues;
}

function nutrientValue(nutrition: NutritionFacts | null, key: string): number | null {
  const n = nutrition?.nutrients[key];
  if (!n) return null;
  const value = n.normalizedValue ?? n.value;
  return typeof value === "number" ? value : null;
}

/** Nutrients where 0 is implausible (data gap) rather than a label claim. */
const ZERO_IMPLAUSIBLE_NUTRIENTS = new Set([
  "sodium",
  "salt",
  "totalFat",
  "saturatedFat",
  "calories",
  "protein",
  "fiber",
  "carbohydrates",
]);

/**
 * Whether two nutrition records can be compared directly.
 * PER_100G vs PER_100G is directly comparable; PER_SERVING vs PER_SERVING
 * requires a compatible serving-size basis; mixed bases are NOT comparable.
 */
export function nutritionBasesComparable(
  a: NutritionFacts | null,
  b: NutritionFacts | null,
): boolean {
  if (!a || !b) return false;
  if (a.basis !== b.basis) return false;
  if (a.basis === "PER_SERVING") {
    const aServing = a.servingSize?.toLowerCase().trim();
    const bServing = b.servingSize?.toLowerCase().trim();
    if (aServing && bServing && aServing !== bServing) return false;
  }
  return true;
}

/** Validate one relative nutrition criterion for a candidate. */
export function candidateSatisfiesNutritionCriterion(
  criterion: NutritionCriterion,
  sourceNutritionRaw: NutritionFacts | null,
  candidateNutritionRaw: NutritionFacts | null,
  nutrientKey: string,
  nutrientLabel: string,
): { satisfied: boolean; reason?: string } {
  // Normalize units on BOTH sides (sodium → mg, calories → kcal, ...) before
  // comparing raw values; an OCR row saved as "960 mg" and a dataset row
  // reporting "0.96 g" must compare as equals, never as 960 vs 0.96.
  const sourceNutrition = sourceNutritionRaw ? normalizeNutritionFacts(sourceNutritionRaw) : null;
  const candidateNutrition = candidateNutritionRaw ? normalizeNutritionFacts(candidateNutritionRaw) : null;
  if (!sourceNutrition || !candidateNutrition) {
    return { satisfied: false, reason: "Missing nutrition data for comparison." };
  }
  const sourceVal = nutrientValue(sourceNutrition, nutrientKey);
  const candVal = nutrientValue(candidateNutrition, nutrientKey);
  if (sourceVal === null || candVal === null) {
    return { satisfied: false, reason: `Missing ${nutrientLabel} value.` };
  }
  if (!nutritionBasesComparable(sourceNutrition, candidateNutrition)) {
    return { satisfied: false, reason: `Incompatible nutrition basis for ${nutrientLabel}.` };
  }
  // A reported value of exactly 0 for core nutrients is almost always a
  // data-quality gap, not a real claim — never credit it as "lower".
  if (ZERO_IMPLAUSIBLE_NUTRIENTS.has(nutrientKey) && (sourceVal <= 0 || candVal <= 0)) {
    return { satisfied: false, reason: `Unreliable ${nutrientLabel} value (0).` };
  }
  if (criterion.direction === "lower") {
    if (!(candVal < sourceVal)) {
      return {
        satisfied: false,
        reason: `${nutrientLabel} not lower (candidate ${candVal} >= source ${sourceVal}).`,
      };
    }
    return { satisfied: true };
  }
  if (criterion.direction === "higher" && candVal <= sourceVal) {
    return { satisfied: false, reason: `${nutrientLabel} not higher.` };
  }
  return { satisfied: true };
}

const NUTRIENT_DISPLAY: Record<string, string> = {
  sodium: "Sodium",
  addedSugars: "Added sugar",
  sugars: "Sugar",
  saturatedFat: "Saturated fat",
  totalFat: "Total fat",
  transFat: "Trans fat",
  salt: "Salt",
};

/** Validate ingredient exclusion against the normalized knowledge base. */
export function candidateSatisfiesIngredientExclusion(
  candidate: ProductInfo,
  canonical: string,
): { satisfied: boolean; reason?: string } {
  const { ingredients } = parseIngredientText(candidate.ingredientsRaw);
  for (const raw of ingredients) {
    const normalized = normalizeIngredient(raw);
    if (normalized.matched && normalized.canonicalName === canonical) {
      return { satisfied: false, reason: `Contains excluded ingredient: ${canonical}.` };
    }
  }
  return { satisfied: true };
}

/** Validate allergen exclusion using the existing allergen system. */
export function candidateSatisfiesAllergenExclusion(
  candidate: ProductInfo,
  allergenKey: string,
): { satisfied: boolean; reason?: string } {
  const label = ALLERGEN_SEED.find((s) => s.allergen === allergenKey)?.label ?? allergenKey;
  const labelMatches = detectAllergens(candidate.ingredientsRaw).some((a) => a.allergen === allergenKey);
  if (labelMatches) {
    return { satisfied: false, reason: `Contains allergen: ${label}.` };
  }
  const { ingredients } = parseIngredientText(candidate.ingredientsRaw);
  const records = ingredientIndex.all();
  for (const raw of ingredients) {
    const normalized = normalizeIngredient(raw);
    if (!normalized.matched || !normalized.canonicalName) continue;
    const record = records.find((r) => r.canonicalName === normalized.canonicalName);
    if (record?.allergenStatus === allergenKey) {
      return { satisfied: false, reason: `Contains allergen: ${label}.` };
    }
  }
  return { satisfied: true };
}

/** Merge multiple criteria objects into one (union semantics, first wins). */
export function mergeCriteriaList(criteriaList: AlternativeSearchCriteria[]): AlternativeSearchCriteria {
  const merged: AlternativeSearchCriteria = {
    preferredCharacteristics: [],
    avoidIngredients: [],
    nutrition: {},
    searchTerms: [],
    unsupported: [],
  };
  const seenTerms = new Set<string>();
  for (const criteria of criteriaList) {
    for (const key of criteria.preferredCharacteristics) {
      if (!merged.preferredCharacteristics.includes(key)) merged.preferredCharacteristics.push(key);
    }
    for (const ingredient of criteria.avoidIngredients) {
      if (!merged.avoidIngredients.includes(ingredient)) merged.avoidIngredients.push(ingredient);
    }
    for (const [nutrientKey, criterion] of Object.entries(criteria.nutrition)) {
      if (!merged.nutrition[nutrientKey]) merged.nutrition[nutrientKey] = criterion;
    }
    for (const term of criteria.searchTerms) {
      const k = term.toLowerCase();
      if (!seenTerms.has(k)) {
        seenTerms.add(k);
        merged.searchTerms.push(term);
      }
    }
    for (const u of criteria.unsupported) {
      if (!merged.unsupported.includes(u)) merged.unsupported.push(u);
    }
    merged.category = merged.category ?? criteria.category;
    merged.family = merged.family ?? criteria.family;
    merged.superfamily = merged.superfamily ?? criteria.superfamily;
    merged.limit = merged.limit ?? criteria.limit;
  }
  return merged;
}

/**
 * Validate a candidate against the structured criteria. Returns whether the
 * candidate satisfies every SUPPORTED constraint and lists violations.
 */
export function validateCandidateAgainstCriteria(
  candidate: ProductInfo,
  candidateNutrition: NutritionFacts | null,
  criteria: AlternativeSearchCriteria,
  sourceNutrition: NutritionFacts | null,
): CandidateValidationResult {
  const violations: string[] = [];
  const satisfied: string[] = [];

  for (const [nutrientKey, criterion] of Object.entries(criteria.nutrition)) {
    const label = NUTRIENT_DISPLAY[nutrientKey] ?? nutrientKey;
    const result = candidateSatisfiesNutritionCriterion(
      criterion,
      sourceNutrition,
      candidateNutrition,
      nutrientKey,
      label,
    );
    if (result.satisfied) {
      const direction = criterion.direction === "higher" ? "Higher" : "Lower";
      satisfied.push(`${direction} ${label.toLowerCase()} than the scanned product.`);
    } else if (result.reason) {
      violations.push(result.reason);
    }
  }

  for (const avoid of criteria.avoidIngredients) {
    if (avoid === PALM_OIL_CANONICAL) {
      const result = candidateSatisfiesIngredientExclusion(candidate, PALM_OIL_CANONICAL);
      if (result.satisfied) {
        satisfied.push("Does not contain palm oil.");
      } else if (result.reason) {
        violations.push(result.reason);
      }
    } else {
      const seed = ALLERGEN_SEED.find((s) => s.label === avoid || s.allergen === avoid);
      if (seed) {
        const result = candidateSatisfiesAllergenExclusion(candidate, seed.allergen);
        if (result.satisfied) {
          satisfied.push(`Does not contain ${seed.label.toLowerCase()}.`);
        } else if (result.reason) {
          violations.push(result.reason);
        }
      }
    }
  }

  return { valid: violations.length === 0, violations, satisfied };
}