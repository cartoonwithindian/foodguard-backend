import type { AllergenDeclarationType, AllergenMatch } from "@/types/domain";
import { ALLERGEN_SEED } from "@/data/seed/allergens";
import { normalizeText } from "@/lib/ingredients";

const FACILITY_RE = /processed\s+in\s+a\s+facility/i;
const MAY_RE = /may\s+contain|might\s+contain|may\s+contain\s+traces/i;

/**
 * Deterministic allergen detection.
 *
 * Distinguishes three declaration types with different meanings:
 *  - contains: confirmed presence (label declares the allergen as an ingredient)
 *  - may_contain: possible cross-contact (precautionary statement)
 *  - processed_in_facility: shared-facility statement
 */
export function detectAllergens(text: string): AllergenMatch[] {
  if (!text) return [];
  const normalized = normalizeText(text);
  const matches: AllergenMatch[] = [];

  for (const seed of ALLERGEN_SEED) {
    let type: AllergenDeclarationType | null = null;
    let confidence = 0;
    let evidence = "";

    if (FACILITY_RE.test(normalized) && seed.mayContainTriggers.length > 0) {
      // "processed in a facility with milk" - check within the same sentence.
      const facilityPart = normalized.split(FACILITY_RE)[1] ?? "";
      const trigger = seed.triggers.find((t) => facilityPart.includes(t.toLowerCase()));
      if (trigger) {
        type = "processed_in_facility";
        confidence = 0.55;
        evidence = `Processed in a facility with ${seed.label}`;
      }
    }

    if (!type && MAY_RE.test(normalized)) {
      const mayPart = normalized.split(MAY_RE)[1] ?? "";
      const trigger = seed.triggers.find((t) => mayPart.includes(t.toLowerCase()));
      if (trigger) {
        type = "may_contain";
        confidence = 0.6;
        evidence = seed.label;
      }
    }

    if (!type) {
      const declaration = seed.declarations.find((d) => normalized.includes(d.toLowerCase()));
      if (declaration) {
        type = "contains";
        confidence = 0.97;
        evidence = declaration;
      }
    }

    if (!type) {
      const trigger = seed.triggers.find((t) => normalized.includes(t.toLowerCase()));
      if (trigger) {
        type = "contains";
        confidence = 0.9;
        evidence = trigger;
      }
    }

    if (type) {
      matches.push({ allergen: seed.allergen, type, confidence, evidence });
    }
  }

  return matches;
}

/**
 * Detects allergens declared inside a single ingredient string
 * (e.g. "whey protein" -> milk). Reuses the knowledge base allergen status.
 */
export function allergenFromIngredient(ingredientText: string, allergenStatus?: string): AllergenMatch | null {
  if (allergenStatus) {
    return {
      allergen: allergenStatus,
      type: "contains",
      confidence: 0.9,
      evidence: ingredientText,
    };
  }
  return null;
}
