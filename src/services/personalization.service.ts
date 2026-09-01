import type {
  AllergenMatch,
  IngredientAnalysisItem,
  NutritionFacts,
  PersonalizedAnalysis,
  PersonalizedFlag,
  UserPreferencesInput,
} from "@/types/domain";
import { getStore } from "@/lib/store";
import { normalizeText } from "@/lib/ingredients";

const DIET_CONFLICT_HINTS: Record<string, string[]> = {
  vegan: ["not_vegan", "contains_dairy", "contains_egg"],
  vegetarian: ["not_vegan", "contains_dairy", "contains_egg"],
};

/**
 * Personalized interpretation of an OBJECTIVE analysis.
 * Objective facts (ingredient identity, nutrition values) are never changed
 * by user preferences - flags are computed separately on top of them.
 */
export async function personalize(
  userId: string | null,
  items: IngredientAnalysisItem[],
  allergens: AllergenMatch[],
  nutrition: NutritionFacts | null,
  prefsOverride?: UserPreferencesInput,
): Promise<PersonalizedAnalysis> {
  const flags: PersonalizedFlag[] = [];
  const store = getStore();

  let prefs: UserPreferencesInput | null = prefsOverride ?? null;
  if (!prefs && userId) {
    const record = await store.getUserPreferences(userId);
    if (record) {
      prefs = {
        vegetarian: record.vegetarian,
        vegan: record.vegan,
        allergies: record.allergies,
        dietaryRestrictions: record.dietaryRestrictions,
        avoidIngredients: record.avoidIngredients,
        preferredIngredients: record.preferredIngredients,
        healthGoals: record.healthGoals,
        sensitivityPreferences: record.sensitivityPreferences,
      };
    }
  }
  if (!prefs) {
    return { flags: [], compatible: true, summary: "No preferences set - analysis is not personalised." };
  }

  const avoid = new Set((prefs.avoidIngredients ?? []).map(normalizeText));
  const prefer = new Set((prefs.preferredIngredients ?? []).map(normalizeText));
  const userAllergies = new Set((prefs.allergies ?? []).map((a) => normalizeText(a)));

  // 1) Allergen alerts (confirmed + precautionary, different severity).
  for (const match of allergens) {
    if (userAllergies.has(normalizeText(match.allergen)) || userAllergies.has(normalizeText(match.allergen.replace("_", " ")))) {
      flags.push({
        type: "allergen_alert",
        ingredient: match.allergen,
        preference: match.allergen,
        severity: match.type === "contains" ? "high" : "moderate",
        message:
          match.type === "contains"
            ? `This product contains ${match.allergen}, which is in your allergy list.`
            : `This product may contain ${match.allergen} (${match.type.replace(/_/g, " ")}). Check before consuming if you are allergic.`,
      });
    }
  }

  // 2) Avoid-list conflicts.
  for (const item of items) {
    if (!item.matched) continue;
    if (avoid.has(normalizeText(item.name)) || avoid.has(normalizeText(item.rawName))) {
      flags.push({
        type: "preference_conflict",
        ingredient: item.name,
        preference: item.rawName,
        severity: "moderate",
        message: `Contains ${item.name}, which is on your avoid list.`,
      });
    }
  }

  // 3) Dietary conflicts (vegan / vegetarian / restrictions).
  for (const item of items) {
    if (!item.matched) continue;
    const record = await store.getIngredientByCanonical(item.name);
    if (!record) continue;
    for (const [diet, forbidden] of Object.entries(DIET_CONFLICT_HINTS)) {
      if ((diet === "vegan" && prefs.vegan) || (diet === "vegetarian" && prefs.vegetarian)) {
        const conflict = record.dietaryStatus.some((s) => forbidden.includes(s));
        if (conflict) {
          flags.push({
            type: "dietary_conflict",
            ingredient: item.name,
            preference: diet,
            severity: "moderate",
            message: `Contains ${item.name}, which may not suit a ${diet} diet.`,
          });
        }
      }
    }
    for (const restriction of prefs.dietaryRestrictions ?? []) {
      const r = normalizeText(restriction);
      if (
        record.dietaryStatus.some((s) => normalizeText(s) === r) ||
        normalizeText(record.canonicalName) === r ||
        record.aliases.some((a) => normalizeText(a.alias) === r)
      ) {
        flags.push({
          type: "dietary_conflict",
          ingredient: item.name,
          preference: restriction,
          severity: "moderate",
          message: `Contains ${item.name}, which conflicts with your dietary restriction (${restriction}).`,
        });
      }
    }
  }

  // 4) Health-goal conflicts from nutrition.
  const goals = prefs.healthGoals ?? [];
  const sugar = nutrition?.nutrients.sugars?.value ?? 0;
  const sodium = nutrition?.nutrients.sodium?.value ?? 0;
  const satFat = nutrition?.nutrients.saturatedFat?.value ?? 0;
  const fiber = nutrition?.nutrients.fiber?.value ?? 0;

  if (goals.includes("weight_loss") && sugar > 11) {
    flags.push({
      type: "health_goal_conflict",
      preference: "weight_loss",
      severity: "moderate",
      message: `Contains ${sugar}g sugar per 100g - may be less suitable for your weight-loss goal.`,
    });
  }
  if (goals.includes("improve_nutrition") && sodium > 400) {
    flags.push({
      type: "health_goal_conflict",
      preference: "improve_nutrition",
      severity: "moderate",
      message: `Contains ${sodium}mg sodium per 100g - worth considering for your nutrition goal.`,
    });
  }
  if (goals.includes("weight_loss") && satFat > 5) {
    flags.push({
      type: "health_goal_conflict",
      preference: "weight_loss",
      severity: "moderate",
      message: `Contains ${satFat}g saturated fat per 100g - worth checking for your weight-loss goal.`,
    });
  }

  // 5) Positive matches.
  for (const item of items) {
    if (!item.matched) continue;
    if (prefer.has(normalizeText(item.name))) {
      flags.push({
        type: "positive_match",
        ingredient: item.name,
        preference: item.name,
        severity: "low",
        message: `Contains ${item.name}, which is on your preferred-ingredients list.`,
      });
    }
  }
  if (goals.includes("weight_loss") && fiber >= 3) {
    flags.push({
      type: "positive_match",
      preference: "higher_fibre",
      severity: "low",
      message: `Provides ${fiber}g dietary fibre per 100g - aligns with your higher-fibre goal.`,
    });
  }

  const compatible = !flags.some((f) => f.severity === "high");
  const summary =
    flags.length === 0
      ? "No personal conflicts detected with your current preferences."
      : `Found ${flags.length} personal consideration${flags.length > 1 ? "s" : ""} based on your preferences.`;

  return { flags, compatible, summary };
}
