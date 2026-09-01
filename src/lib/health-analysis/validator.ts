/**
 * Anti-Hallucination Validation Layer
 *
 * Runs AFTER the findings engine and BEFORE the API response.
 * Validates every generated finding against source product data.
 * Rejects any finding that references ingredients, nutrients, or
 * calculations not present in the source data.
 */

import type { HealthFinding, HealthAnalysisInput, HealthAnalysisResult } from "./types";

// Known ingredient names (lowercase) from the product data
function getKnownIngredients(input: HealthAnalysisInput): Set<string> {
  const known = new Set<string>();
  for (const ing of input.ingredients) {
    known.add(ing.name.toLowerCase());
    // Also add common variations
    for (const word of ing.name.toLowerCase().split(/\s+/)) {
      if (word.length > 3) known.add(word);
    }
  }
  return known;
}

// Known nutrient keys from the nutrition data
function getKnownNutrients(input: HealthAnalysisInput): Set<string> {
  const known = new Set<string>();
  const n = input.nutrition;
  if (!n) return known;

  if (n.sodium != null && n.sodium > 0) { known.add("sodium"); known.add("Sodium"); known.add("sodium"); }
  if (n.saturatedFat != null && n.saturatedFat > 0) { known.add("saturatedFat"); known.add("saturated_fat"); known.add("Saturated fat"); }
  if (n.totalFat != null && n.totalFat > 0) { known.add("totalFat"); known.add("total_fat"); known.add("Total fat"); }
  if (n.calories != null && n.calories > 0) { known.add("calories"); known.add("Calories"); }
  if (n.sugars != null && n.sugars > 0) { known.add("sugars"); known.add("sugar"); known.add("Total sugar"); }
  if (n.totalSugars != null && n.totalSugars > 0) { known.add("sugars"); known.add("sugar"); known.add("Total sugar"); }
  if (n.protein != null && n.protein > 0) { known.add("protein"); known.add("Protein"); }
  const fibre = n.fiber ?? n.dietaryFibre;
  if (fibre != null && fibre > 0) { known.add("fibre"); known.add("fiber"); known.add("dietaryFibre"); known.add("Dietary fibre"); }
  if (n.carbohydrates != null && n.carbohydrates > 0) { known.add("carbohydrates"); known.add("carbohydrate"); known.add("Carbohydrates"); }
  if (n.transFat != null && n.transFat > 0) { known.add("transFat"); known.add("trans_fat"); known.add("Trans fat"); }
  if (n.salt != null && n.salt > 0) { known.add("salt"); known.add("Salt"); }

  return known;
}

// Disallowed health claim patterns (unsupported causation/disease claims)
const DISALLOWED_PATTERNS = [
  /\bwill cause\b/i,
  /\bguarantees?\b/i,
  /\bcauses?\s+(cancer|diabetes|heart disease|obesity|hypertension|cardiovascular)/i,
  /\bdeadly\b/i,
  /\btoxic\b/i,
  /\bpoison\b/i,
  /\bengineered to\b/i,
  /\bdesigned to make you\b/i,
  /\baddictive?\b/i,
  /\bhyper[\s-]palatable\b/i,
  /\bhidden (sugar|salt|fat|ingredient)/i,
  /\bwill make you\b/i,
  /\bguaranteed weight\b/i,
  /\bguaranteed blood\b/i,
];

// Ingredients that must NOT be mentioned unless present in source data
const COMMON_DISALLOWED_INGREDIENTS = [
  "palmolein",
  "palm oil",
  "msg",
  "monosodium glutamate",
  "aspartame",
  "artificial flavor",
  "artificial colour",
  "artificial color",
  "preservative",
  "emulsifier",
];

export interface ValidationResult {
  valid: HealthFinding[];
  rejected: Array<{ finding: HealthFinding; reason: string }>;
  warnings: string[];
}

export function validateFindings(
  result: HealthAnalysisResult,
  input: HealthAnalysisInput,
): ValidationResult {
  const valid: HealthFinding[] = [];
  const rejected: Array<{ finding: HealthFinding; reason: string }> = [];
  const warnings: string[] = [];

  const knownIngredients = getKnownIngredients(input);
  const knownNutrients = getKnownNutrients(input);

  for (const finding of result.findings) {
    const rejectionReasons: string[] = [];

    // ── Check 1: Nutrient evidence must exist in source data ──
    const nutrientCategories = [
      "sodium",
      "saturated_fat",
      "total_fat",
      "calories",
      "sugar",
      "protein",
      "fibre",
      "trans_fat",
      "carbohydrate",
    ];
    if (nutrientCategories.includes(finding.category)) {
      const nutrientKey = finding.category;
      if (!knownNutrients.has(nutrientKey)) {
        rejectionReasons.push(
          `Finding references ${finding.category} but source data does not contain this nutrient.`,
        );
      }
    }

    // ── Check 2: No disallowed causation/disease claims ──
    for (const pattern of DISALLOWED_PATTERNS) {
      if (pattern.test(finding.explanation) || pattern.test(finding.recommendation)) {
        rejectionReasons.push(
          `Contains unsupported health claim matching pattern: ${pattern.source}.`,
        );
      }
    }

    // ── Check 3: Ingredient findings must reference actual ingredients ──
    if (finding.category === "ingredient") {
      const metricName = finding.metric.replace("ingredient_", "");
      let found = false;
      for (const known of knownIngredients) {
        if (known.includes(metricName) || metricName.includes(known)) {
          found = true;
          break;
        }
      }
      if (!found) {
        rejectionReasons.push(
          `Ingredient finding references "${metricName}" which is not in the product's ingredient list.`,
        );
      }
    }

    // ── Check 4: Evidence references must be valid ──
    for (const ev of finding.evidence) {
      const nutrientRef = ev.replace("nutrition.", "").replace("ingredient.", "");
      if (ev.startsWith("nutrition.") && !knownNutrients.has(nutrientRef)) {
        rejectionReasons.push(
          `Evidence reference "${ev}" does not match available nutrition data.`,
        );
      }
    }

    // ── Check 5: No disallowed ingredients mentioned ──
    for (const disallowed of COMMON_DISALLOWED_INGREDIENTS) {
      if (
        finding.explanation.toLowerCase().includes(disallowed) ||
        finding.recommendation.toLowerCase().includes(disallowed)
      ) {
        if (!knownIngredients.has(disallowed.toLowerCase())) {
          rejectionReasons.push(
            `Mentions ingredient "${disallowed}" which is not in the product's ingredient list.`,
          );
        }
      }
    }

    // ── Check 6: Package-level claims require package weight ──
    if (finding.basis === "per_package" && !input.nutrition?.packageWeight) {
      rejectionReasons.push(
        "Package-level claim made without package weight data.",
      );
    }

    if (rejectionReasons.length > 0) {
      rejected.push({ finding, reason: rejectionReasons.join(" | ") });
    } else {
      valid.push(finding);
    }
  }

  return { valid, rejected, warnings };
}
