import type { NutritionFacts } from "@/types/domain";
import type { AlternativeCharacteristic } from "@/lib/alternative-characteristics";
import { CHARACTERISTIC_KEYS, NUTRITION_ISSUE_KEYS } from "@/lib/alternative-characteristics";
import { ALLERGEN_SEED } from "@/data/seed/allergens";
import { classifyProductFamily } from "@/lib/product-family";
import type { ProductFamily, ProductSuperfamily } from "@/lib/product-family";

/**
 * Alternative Ingredients — Phase 3: AlternativeCharacteristic → Structured
 * Search Criteria.
 *
 * This layer is built ON TOP of the existing search architecture. It never
 * queries the store, never ranks, and never performs retrieval. It ONLY
 * translates an AlternativeCharacteristic (plus the current product) into a
 * typed AlternativeSearchCriteria object.
 *
 * Rules:
 * - Nutrition criteria are RELATIVE to the scanned product where possible
 *   (referenceValue comes from the current product, not an arbitrary constant).
 * - Criteria that the existing data cannot support are preserved and marked in
 *   `unsupported`; the module never fakes a filter.
 * - Search terms are retrieval hints only — they are never proof of suitability.
 * - Product category/family is preserved via the existing classification.
 */

export type NutritionDirection = "lower" | "higher" | "similar";

export type NutritionCriterion = {
  direction: NutritionDirection;
  /** Reference value from the scanned product (relative comparison). */
  referenceValue?: number;
  /** Basis of the reference value (PER_100G | PER_SERVING). */
  basis?: NutritionFacts["basis"];
};

export type AlternativeSearchCriteria = {
  /** Human-readable product family of the scanned product (e.g. "cereal"). */
  category?: string;
  family?: ProductFamily | null;
  superfamily?: ProductSuperfamily | null;
  /** Characteristic keys this criteria set expresses. */
  preferredCharacteristics: string[];
  /** Ingredients (canonical knowledge-base names / allergen labels) to avoid. */
  avoidIngredients: string[];
  /** Relative nutrition comparisons keyed by nutrient field name. */
  nutrition: Record<string, NutritionCriterion>;
  /** Retrieval-hint search terms. NOT proof of suitability. */
  searchTerms: string[];
  limit?: number;
  reason?: string;
  /** Characteristics that could not be expressed as a reliable filter. */
  unsupported: string[];
};

/** The current scanned product, reduced to what criteria building needs. */
export type AlternativeCurrentProduct = {
  name?: string;
  brand?: string | null;
  category?: string;
  nutrition?: NutritionFacts | null;
};

/** Characteristic key → nutrient field for relative nutrition comparisons. */
const NUTRITION_DIRECTION: Record<string, string> = {
  [CHARACTERISTIC_KEYS.LOWER_SODIUM]: NUTRITION_ISSUE_KEYS.SODIUM,
  [CHARACTERISTIC_KEYS.LOWER_ADDED_SUGAR]: NUTRITION_ISSUE_KEYS.ADDED_SUGARS,
  [CHARACTERISTIC_KEYS.LOWER_SUGAR]: NUTRITION_ISSUE_KEYS.SUGARS,
  [CHARACTERISTIC_KEYS.LOWER_SATURATED_FAT]: NUTRITION_ISSUE_KEYS.SATURATED_FAT,
  [CHARACTERISTIC_KEYS.LOWER_TOTAL_FAT]: NUTRITION_ISSUE_KEYS.TOTAL_FAT,
  [CHARACTERISTIC_KEYS.LOWER_TRANS_FAT]: NUTRITION_ISSUE_KEYS.TRANS_FAT,
  [CHARACTERISTIC_KEYS.LOWER_SALT]: NUTRITION_ISSUE_KEYS.SALT,
};

/** Characteristic key → canonical ingredient exclusions. */
const INGREDIENT_EXCLUSIONS: Record<string, string[]> = {
  [CHARACTERISTIC_KEYS.PALM_OIL_FREE]: ["Palm Oil"],
};

/** Extra retrieval hints beyond the characteristic's own search terms. */
const SEARCH_TERM_HINTS: Record<string, string[]> = {
  [CHARACTERISTIC_KEYS.WHOLE_GRAIN]: ["whole wheat", "whole grain", "multigrain", "atta"],
  [CHARACTERISTIC_KEYS.ALLERGEN_FREE]: [],
};

function referenceValueFor(nutrition: NutritionFacts | null, nutrientKey: string): number | undefined {
  const n = nutrition?.nutrients[nutrientKey];
  if (!n) return undefined;
  const value = n.normalizedValue ?? n.value;
  return typeof value === "number" ? value : undefined;
}

/**
 * Build a single AlternativeSearchCriteria from one characteristic and the
 * current product. Category/family is preserved from the scanned product.
 */
export function buildAlternativeSearchCriteria(
  characteristic: AlternativeCharacteristic,
  currentProduct: AlternativeCurrentProduct,
): AlternativeSearchCriteria {
  const criteria: AlternativeSearchCriteria = {
    preferredCharacteristics: [characteristic.key],
    avoidIngredients: [],
    nutrition: {},
    searchTerms: [...characteristic.searchTerms],
    unsupported: [],
    reason: `Characteristic: ${characteristic.key}`,
  };

  const cls = classifyProductFamily({
    name: currentProduct.name ?? "",
    brand: currentProduct.brand ?? "",
    category: (currentProduct.category as "food") ?? "food",
  });
  criteria.family = cls.family;
  criteria.superfamily = cls.superfamily;
  if (cls.family) criteria.category = cls.family.replace(/_/g, " ");

  // Relative nutrition comparisons against the scanned product.
  const nutrientKey = NUTRITION_DIRECTION[characteristic.key];
  if (nutrientKey) {
    criteria.nutrition[nutrientKey] = {
      direction: "lower",
      referenceValue: referenceValueFor(currentProduct.nutrition ?? null, nutrientKey),
      basis: currentProduct.nutrition?.basis,
    };
  }

  // Ingredient exclusions via the existing normalized ingredient system.
  for (const exclusion of INGREDIENT_EXCLUSIONS[characteristic.key] ?? []) {
    if (!criteria.avoidIngredients.includes(exclusion)) criteria.avoidIngredients.push(exclusion);
  }

  // Allergen exclusions reuse the existing allergen vocabulary.
  if (characteristic.key === CHARACTERISTIC_KEYS.ALLERGEN_FREE && characteristic.allergen) {
    const seed = ALLERGEN_SEED.find((s) => s.allergen === characteristic.allergen);
    const label = seed?.label ?? characteristic.allergen;
    if (!criteria.avoidIngredients.includes(label)) criteria.avoidIngredients.push(label);
  }

  // Whole-grain: the catalog cannot PROVE a product is whole grain, so the
  // characteristic is preserved and search terms added, but validation is
  // explicitly marked unsupported rather than faked.
  if (characteristic.key === CHARACTERISTIC_KEYS.WHOLE_GRAIN) {
    criteria.unsupported.push(CHARACTERISTIC_KEYS.WHOLE_GRAIN);
    for (const term of SEARCH_TERM_HINTS[characteristic.key]) {
      if (!criteria.searchTerms.includes(term)) criteria.searchTerms.push(term);
    }
  }

  return criteria;
}

/**
 * Combine multiple characteristics into one non-contradictory criteria object.
 * Nutrition criteria for the same nutrient are merged (existing referenceValue
 * is preserved); exclusions, search terms and preferred characteristics are
 * unioned; the first family/category wins.
 */
export function buildAlternativeSearchCriteriaList(
  characteristics: AlternativeCharacteristic[],
  currentProduct: AlternativeCurrentProduct,
): AlternativeSearchCriteria {
  const merged: AlternativeSearchCriteria = {
    preferredCharacteristics: [],
    avoidIngredients: [],
    nutrition: {},
    searchTerms: [],
    unsupported: [],
  };

  const seenTerms = new Set<string>();
  const pushTerms = (terms: string[]) => {
    for (const term of terms) {
      const key = term.toLowerCase();
      if (seenTerms.has(key)) continue;
      seenTerms.add(key);
      merged.searchTerms.push(term);
    }
  };

  for (const characteristic of characteristics) {
    const single = buildAlternativeSearchCriteria(characteristic, currentProduct);

    if (!merged.preferredCharacteristics.includes(characteristic.key)) {
      merged.preferredCharacteristics.push(characteristic.key);
    }
    for (const ingredient of single.avoidIngredients) {
      if (!merged.avoidIngredients.includes(ingredient)) merged.avoidIngredients.push(ingredient);
    }
    for (const [nutrientKey, criterion] of Object.entries(single.nutrition)) {
      const existing = merged.nutrition[nutrientKey];
      if (!existing) {
        merged.nutrition[nutrientKey] = criterion;
      } else if (existing.referenceValue === undefined && criterion.referenceValue !== undefined) {
        merged.nutrition[nutrientKey] = { ...existing, ...criterion };
      }
    }
    pushTerms(single.searchTerms);
    for (const unsupported of single.unsupported) {
      if (!merged.unsupported.includes(unsupported)) merged.unsupported.push(unsupported);
    }
    merged.category = merged.category ?? single.category;
    merged.family = merged.family ?? single.family;
    merged.superfamily = merged.superfamily ?? single.superfamily;
    merged.limit = merged.limit ?? single.limit;
  }

  merged.reason = characteristics.map((c) => c.key).join(", ");
  return merged;
}