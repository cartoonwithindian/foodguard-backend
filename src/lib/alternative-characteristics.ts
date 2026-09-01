import { ALLERGEN_SEED } from "@/data/seed/allergens";
import { normalizeText } from "@/lib/ingredients";

/**
 * Alternative Ingredients — Phase 1: Issue → Alternative Characteristic Mapper.
 *
 * Converts FoodGaurd's EXISTING detected-issue vocabulary into a structured
 * "alternative ingredient characteristic" that later phases translate into
 * search criteria and candidate validation.
 *
 * IMPORTANT:
 * - This module performs NO product search, NO ranking, NO database access,
 *   and NO external API / LLM calls. It is a pure transformation:
 *
 *     Existing Issue  →  AlternativeCharacteristic
 *
 * - It reuses FoodGaurd's real vocabulary rather than inventing new issue
 *   names. The detected-issue inputs are the existing signals the app already
 *   produces:
 *     - nutrition concern nutrient keys from `assessNutrition()`:
 *       "sodium", "addedSugars", "sugars", "saturatedFat", "totalFat",
 *       "transFat", "salt"
 *     - normalized ingredient canonical names (e.g. "Palm Oil",
 *       "Refined Wheat Flour (Maida)")
 *     - allergen keys from `ALLERGEN_SEED` / `detectAllergens()`.
 *
 * Not every issue maps to a characteristic: if there is no safe/meaningful
 * alternative, the mapper returns null instead of inventing one.
 */

export type CharacteristicCategory = "nutrition" | "ingredient" | "allergen";

export type AlternativeCharacteristic = {
  /** Stable characteristic key, e.g. "LOWER_SODIUM", "PALM_OIL_FREE". */
  key: string;
  /** The EXACT existing FoodGaurd issue signal that produced this. */
  issueKey: string;
  /** Human-readable label, e.g. "Lower sodium". */
  label: string;
  description: string;
  /** Retrieval-hint search terms. Never proof of suitability. */
  searchTerms: string[];
  category: CharacteristicCategory;
  /** Higher = stronger/more important signal. */
  priority: number;
  /** Present for ALLERGEN_FREE characteristics: the specific allergen key. */
  allergen?: string;
};

export const NUTRITION_ISSUE_KEYS = {
  SODIUM: "sodium",
  ADDED_SUGARS: "addedSugars",
  SUGARS: "sugars",
  SATURATED_FAT: "saturatedFat",
  TOTAL_FAT: "totalFat",
  TRANS_FAT: "transFat",
  SALT: "salt",
} as const;

export type NutritionIssueKey = (typeof NUTRITION_ISSUE_KEYS)[keyof typeof NUTRITION_ISSUE_KEYS];

export const CHARACTERISTIC_KEYS = {
  LOWER_SODIUM: "LOWER_SODIUM",
  LOWER_ADDED_SUGAR: "LOWER_ADDED_SUGAR",
  LOWER_SUGAR: "LOWER_SUGAR",
  LOWER_SATURATED_FAT: "LOWER_SATURATED_FAT",
  LOWER_TOTAL_FAT: "LOWER_TOTAL_FAT",
  LOWER_TRANS_FAT: "LOWER_TRANS_FAT",
  LOWER_SALT: "LOWER_SALT",
  PALM_OIL_FREE: "PALM_OIL_FREE",
  WHOLE_GRAIN: "WHOLE_GRAIN",
  ALLERGEN_FREE: "ALLERGEN_FREE",
} as const;

export type CharacteristicKey = (typeof CHARACTERISTIC_KEYS)[keyof typeof CHARACTERISTIC_KEYS];

type NutritionDef = Omit<AlternativeCharacteristic, "issueKey" | "allergen">;

/**
 * Single source of truth: existing nutrition-concern keys → characteristic.
 * These keys are the `nutrient` values emitted by `assessNutrition()`.
 */
const NUTRITION_MAP: Record<string, NutritionDef> = {
  [NUTRITION_ISSUE_KEYS.SODIUM]: {
    key: CHARACTERISTIC_KEYS.LOWER_SODIUM,
    label: "Lower sodium",
    description: "Look for products with lower sodium.",
    searchTerms: ["lower sodium", "low sodium", "reduced sodium"],
    category: "nutrition",
    priority: 5,
  },
  [NUTRITION_ISSUE_KEYS.ADDED_SUGARS]: {
    key: CHARACTERISTIC_KEYS.LOWER_ADDED_SUGAR,
    label: "Lower added sugar",
    description: "Look for products with lower added sugar.",
    searchTerms: ["lower added sugar", "no added sugar", "low sugar"],
    category: "nutrition",
    priority: 4,
  },
  [NUTRITION_ISSUE_KEYS.SUGARS]: {
    key: CHARACTERISTIC_KEYS.LOWER_SUGAR,
    label: "Lower sugar",
    description: "Look for products with lower total sugar.",
    searchTerms: ["lower sugar", "low sugar", "sugar free"],
    category: "nutrition",
    priority: 3,
  },
  [NUTRITION_ISSUE_KEYS.SATURATED_FAT]: {
    key: CHARACTERISTIC_KEYS.LOWER_SATURATED_FAT,
    label: "Lower saturated fat",
    description: "Look for products with lower saturated fat.",
    searchTerms: ["lower saturated fat", "low saturated fat"],
    category: "nutrition",
    priority: 4,
  },
  [NUTRITION_ISSUE_KEYS.TOTAL_FAT]: {
    key: CHARACTERISTIC_KEYS.LOWER_TOTAL_FAT,
    label: "Lower total fat",
    description: "Look for products with lower total fat.",
    searchTerms: ["lower fat", "low fat", "reduced fat"],
    category: "nutrition",
    priority: 3,
  },
  [NUTRITION_ISSUE_KEYS.TRANS_FAT]: {
    key: CHARACTERISTIC_KEYS.LOWER_TRANS_FAT,
    label: "Lower trans fat",
    description: "Look for products with lower or no trans fat.",
    searchTerms: ["trans fat free", "no trans fat", "zero trans fat"],
    category: "nutrition",
    priority: 5,
  },
  [NUTRITION_ISSUE_KEYS.SALT]: {
    key: CHARACTERISTIC_KEYS.LOWER_SALT,
    label: "Lower salt",
    description: "Look for products with lower salt.",
    searchTerms: ["lower salt", "low salt", "reduced salt"],
    category: "nutrition",
    priority: 5,
  },
};

/** Ingredient knowledge-base signals → characteristic. */
type IngredientSignal = {
  /** Existing canonical name in the FoodGaurd ingredient knowledge base. */
  canonicalName: string;
  /** Alias spellings that must also resolve to this signal. */
  aliases: string[];
  def: NutritionDef;
};

const INGREDIENT_SIGNALS: IngredientSignal[] = [
  {
    canonicalName: "Palm Oil",
    aliases: ["palm oil", "palmolein", "rbd palm oil"],
    def: {
      key: CHARACTERISTIC_KEYS.PALM_OIL_FREE,
      label: "Free of palm oil",
      description: "Look for products that do not contain palm oil.",
      searchTerms: ["no palm oil", "palm oil free", "without palm oil"],
      category: "ingredient",
      priority: 3,
    },
  },
  {
    canonicalName: "Refined Wheat Flour (Maida)",
    aliases: ["maida", "refined wheat flour"],
    def: {
      key: CHARACTERISTIC_KEYS.WHOLE_GRAIN,
      label: "Whole grain",
      description: "Look for whole-grain alternatives instead of refined flour.",
      searchTerms: ["whole wheat", "whole grain", "multigrain", "atta"],
      category: "ingredient",
      priority: 2,
    },
  },
];

function allergenCharacteristic(seed: (typeof ALLERGEN_SEED)[number]): AlternativeCharacteristic {
  const display = seed.label.toLowerCase();
  return {
    key: CHARACTERISTIC_KEYS.ALLERGEN_FREE,
    issueKey: seed.allergen,
    label: `Free of ${display}`,
    description: `Look for products that do not contain ${display}.`,
    searchTerms: [display, `no ${display}`, `without ${display}`],
    category: "allergen",
    priority: 10,
    allergen: seed.allergen,
  };
}

function isAllergen(issue: string): (typeof ALLERGEN_SEED)[number] | null {
  const norm = normalizeText(issue);
  for (const seed of ALLERGEN_SEED) {
    if (
      norm === seed.allergen ||
      norm === normalizeText(seed.label) ||
      seed.triggers.some((t) => normalizeText(t) === norm)
    ) {
      return seed;
    }
  }
  return null;
}

/**
 * Map a single existing FoodGaurd issue/flag to an AlternativeCharacteristic.
 * Returns null when no safe/meaningful alternative characteristic exists.
 */
export function getAlternativeCharacteristic(issue: string): AlternativeCharacteristic | null {
  if (!issue || typeof issue !== "string") return null;
  const trimmed = issue.trim();
  if (!trimmed) return null;
  const norm = normalizeText(trimmed);

  // 1) Existing nutrition concern keys ("sodium", "addedSugars", ...).
  const nutritionDef = Object.values(NUTRITION_MAP).find((def) =>
    Object.keys(NUTRITION_MAP).some((key) => normalizeText(key) === norm && NUTRITION_MAP[key] === def),
  );
  if (nutritionDef) {
    return { ...nutritionDef, issueKey: trimmed };
  }

  // 2) Ingredient knowledge-base signals (canonical or alias).
  for (const signal of INGREDIENT_SIGNALS) {
    if (
      norm === normalizeText(signal.canonicalName) ||
      signal.aliases.some((a) => normalizeText(a) === norm)
    ) {
      return { ...signal.def, issueKey: signal.canonicalName };
    }
  }

  // 3) Allergens (existing allergen keys / labels / triggers).
  const allergen = isAllergen(trimmed);
  if (allergen) return allergenCharacteristic(allergen);

  return null;
}

/** Find a characteristic definition by its stable key. */
export function getCharacteristicByKey(key: string): AlternativeCharacteristic | null {
  if (!key) return null;
  for (const def of Object.values(NUTRITION_MAP)) {
    if (def.key === key) return { ...def, issueKey: key };
  }
  for (const signal of INGREDIENT_SIGNALS) {
    if (signal.def.key === key) return { ...signal.def, issueKey: signal.canonicalName };
  }
  const allergen = ALLERGEN_SEED.find((seed) =>
    [seed.allergen, seed.label.toLowerCase(), ...seed.triggers].some((t) => normalizeText(t) === normalizeText(key)),
  );
  if (allergen) return allergenCharacteristic(allergen);
  return null;
}

/**
 * Map multiple detected issues to characteristics.
 * - accepts existing issue strings (or { issue } wrappers)
 * - maps each valid issue
 * - removes duplicates (first occurrence wins, preserving input order)
 * - ignores issues with no mapping
 */
export function getAlternativeCharacteristics(
  issues: Array<string | { issue: string }>,
): AlternativeCharacteristic[] {
  const seen = new Set<string>();
  const out: AlternativeCharacteristic[] = [];
  for (const raw of issues) {
    const issue = typeof raw === "string" ? raw : raw.issue;
    const characteristic = getAlternativeCharacteristic(issue);
    if (!characteristic) continue;
    if (seen.has(characteristic.key)) continue;
    seen.add(characteristic.key);
    out.push(characteristic);
  }
  return out;
}

export function characteristicLabel(key: string): string {
  return getCharacteristicByKey(key)?.label ?? key;
}

/**
 * API-safe, response-friendly projection of an AlternativeCharacteristic.
 * Excludes internal details (search terms, category plumbing) that consumers
 * of the alternatives API do not need.
 */
export type AlternativeCharacteristicInfo = {
  key: string;
  issueKey: string;
  label: string;
  description: string;
  priority: number;
};

export function toAlternativeCharacteristicInfo(
  characteristic: AlternativeCharacteristic,
): AlternativeCharacteristicInfo {
  return {
    key: characteristic.key,
    issueKey: characteristic.issueKey,
    label: characteristic.label,
    description: characteristic.description,
    priority: characteristic.priority,
  };
}