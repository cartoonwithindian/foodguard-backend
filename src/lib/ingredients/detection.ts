import { normalizeIngredient } from "@/lib/ingredients/normalize";

/**
 * Ingredient-signal detection helpers (Alternative Ingredients — Phase 2).
 *
 * These helpers REUSE the existing ingredient normalization / knowledge base.
 * They do not create a second raw-string matcher, and they never treat an
 * unrelated occurrence of a word such as "palm" as a match — a candidate only
 * qualifies when the knowledge base resolves the ingredient to the canonical
 * entity (including its declared aliases).
 */

/** Canonical knowledge-base names used as existing-style ingredient signals. */
export const PALM_OIL_CANONICAL = "Palm Oil";
export const MAIDA_CANONICAL = "Refined Wheat Flour (Maida)";

function isCanonical(normalized: { matched: boolean; canonicalName?: string }, canonical: string): boolean {
  return normalized.matched && normalized.canonicalName === canonical;
}

/** True when an existing normalized ingredient result is palm oil. */
export function isPalmOilIngredient(normalized: { matched: boolean; canonicalName?: string }): boolean {
  return isCanonical(normalized, PALM_OIL_CANONICAL);
}

/** True when an existing normalized ingredient result is refined flour (maida). */
export function isMaidaIngredient(normalized: { matched: boolean; canonicalName?: string }): boolean {
  return isCanonical(normalized, MAIDA_CANONICAL);
}

/**
 * Detect whether a raw ingredient list contains the given canonical
 * knowledge-base ingredient (palm oil, maida, ...) using existing
 * normalization. Returns the canonical name on a match, otherwise null.
 */
export function detectIngredient(rawIngredients: string[], canonical: string): string | null {
  for (const raw of rawIngredients) {
    const normalized = normalizeIngredient(raw);
    if (isCanonical(normalized, canonical)) return canonical;
  }
  return null;
}

/** Detect palm oil in a raw ingredient list. Returns "Palm Oil" or null. */
export function detectPalmOil(rawIngredients: string[]): string | null {
  return detectIngredient(rawIngredients, PALM_OIL_CANONICAL);
}

/** Detect refined flour (maida) in a raw ingredient list. Returns canonical name or null. */
export function detectMaida(rawIngredients: string[]): string | null {
  return detectIngredient(rawIngredients, MAIDA_CANONICAL);
}