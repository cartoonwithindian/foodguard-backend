import type { IngredientRecord } from "@/types/domain";
import { BASE_INGREDIENTS_1 } from "./base-1";
import { BASE_INGREDIENTS_2 } from "./base-2";
import { ADDITIVE_INGREDIENTS_1 } from "./additives-1";
import { ADDITIVE_INGREDIENTS_2 } from "./additives-2";
import { CARE_INGREDIENTS } from "./care";
import { MISC_INGREDIENTS } from "./misc";

/**
 * The full deterministic ingredient knowledge base.
 * Alias resolution builds the lookup index used by normalizeIngredient().
 */
export const INGREDIENT_SEED: IngredientRecord[] = [
  ...BASE_INGREDIENTS_1,
  ...BASE_INGREDIENTS_2,
  ...ADDITIVE_INGREDIENTS_1,
  ...ADDITIVE_INGREDIENTS_2,
  ...CARE_INGREDIENTS,
  ...MISC_INGREDIENTS,
];
