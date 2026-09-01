import type { Alternative, AlternativeReason, NutritionFacts, ProductInfo } from "@/types/domain";
import { getStore } from "@/lib/store";
import { parseIngredientText } from "@/lib/ingredients/parse";
import { normalizeIngredient } from "@/lib/ingredients/normalize";
import { ingredientIndex } from "@/lib/ingredients";
import { getCache } from "@/lib/cache";
import { FSSAIAnalyzer } from "@/services/regulatory/fssai";
import type { FSSAIAnalysisResult } from "@/services/regulatory/fssai";
import { getCachedFSSAIResult, setCachedFSSAIResult } from "@/lib/fssai-cache"

type NutritionKey = "sodium" | "saturatedFat" | "sugars" | "totalFat" | "protein" | "fiber" | "calories";

const IMPROVEMENT_KEYS: Array<{ key: NutritionKey; label: string; lowerIsBetter: boolean; factor: AlternativeReason["factor"] }> = [
  { key: "sodium", label: "Sodium", lowerIsBetter: true, factor: "lower_sodium" },
  { key: "saturatedFat", label: "Saturated fat", lowerIsBetter: true, factor: "lower_saturated_fat" },
  { key: "sugars", label: "Sugar", lowerIsBetter: true, factor: "lower_sugar" },
  { key: "totalFat", label: "Total fat", lowerIsBetter: true, factor: "better_nutrition" },
  { key: "protein", label: "Protein", lowerIsBetter: false, factor: "better_nutrition" },
  { key: "fiber", label: "Fibre", lowerIsBetter: false, factor: "better_nutrition" },
];

async function normalizedIngredientIds(product: ProductInfo): Promise<string[]> {
  const cache = getCache();
  const cached = await cache.get<string[]>(`ing-ids:${product.id}`);
  if (cached) return cached;
  const { ingredients } = parseIngredientText(product.ingredientsRaw);
  const ids = ingredients
    .map((i) => normalizeIngredient(i))
    .filter((n) => n.matched)
    .map((n) => n.canonicalName as string);
  await cache.set(`ing-ids:${product.id}`, ids, 3600);
  return ids;
}

function nutrientOf(nutrition: NutritionFacts | null, key: NutritionKey): number | null {
  const value = nutrition?.nutrients[key]?.value;
  return typeof value === "number" ? value : null;
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  return intersection / (setA.size + setB.size - intersection);
}

function pct(a: number | null, b: number | null, lowerIsBetter: boolean): string | null {
  if (a === null || b === null || b === 0) return null;
  const diff = ((a - b) / b) * 100;
  const improved = lowerIsBetter ? diff < 0 : diff > 0;
  if (Math.abs(diff) < 2 || !improved) return null;
  return `${diff > 0 ? "+" : "-"}${Math.abs(diff).toFixed(0)}%`;
}

function concernScore(ingredientIds: string[]): number {
  let score = 0;
  const records = ingredientIndex.all();
  for (const id of ingredientIds) {
    const record = records.find((r) => r.canonicalName === id);
    if (!record) continue;
    if (record.assessment === "potentially_concerning") score += 2;
    else if (record.assessment === "noteworthy") score += 1;
    else if (record.assessment === "beneficial") score -= 1;
  }
  return score;
}

/**
 * Transparent alternative ranking - purely objective, no commercial input.
 * score = similarity + nutrition improvement + ingredient improvement.
 */
export async function findAlternatives(
  product: ProductInfo,
  nutrition: NutritionFacts | null,
  limit = 5,
): Promise<Alternative[]> {
  return findAlternativesWithPreferences(product, nutrition, null, limit);
}

export type PreferenceGoal =
  | "lower_sodium"
  | "lower_sugar"
  | "lower_calories"
  | "higher_protein"
  | "higher_fiber"
  | "fewer_additives"
  | "lower_saturated_fat";

export type AlternativePreferences = {
  goals?: PreferenceGoal[];
  avoidIngredients?: string[];
};

export type EnhancedAlternative = Alternative & {
  fssai?: {
    overallStatus: string;
    additiveCount: number;
    concernsCount: number;
  };
  preferenceAlignment?: number; // 0..1 how well it matches user goals
  dataConfidence: number; // 0..1 completeness of data
};

async function runFSSAIForProduct(product: ProductInfo, ingredientsRaw: string): Promise<FSSAIAnalysisResult | null> {
  // Try cache first
  const cached = await getCachedFSSAIResult(product.id);
  if (cached) return cached;

  try {
    const analyzer = FSSAIAnalyzer.singleton();
    const result = await analyzer.analyze({
      product: { name: product.name, category: product.category, barcode: product.barcode },
      ingredients: parseIngredientText(ingredientsRaw).ingredients,
      category: product.category,
    });
    // Cache the result
    await setCachedFSSAIResult(product.id, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Enhanced alternative ranking with user preference support and FSSAI data.
 */
export async function findAlternativesWithPreferences(
  product: ProductInfo,
  nutrition: NutritionFacts | null,
  prefs: AlternativePreferences | null,
  limit = 5,
): Promise<EnhancedAlternative[]> {
  const store = getStore();
  const candidates = await store.searchProducts("");
  const sourceIngs = await normalizedIngredientIds(product);
  const goals = prefs?.goals ?? [];
  const avoidSet = new Set((prefs?.avoidIngredients ?? []).map((s) => s.toLowerCase()));
  const ranked: Array<{ alt: EnhancedAlternative; raw: number }> = [];

  for (const candidate of candidates) {
    if (candidate.product.id === product.id || candidate.product.barcode === product.barcode) continue;
    if (candidate.product.category !== product.category) continue;
    if (candidate.product.category === "other") continue;

    const candidateIngs = await normalizedIngredientIds(candidate.product);
    const candidateNutrition = await store.getNutritionForProduct(candidate.product.id);

    const simIngredients = jaccard(sourceIngs, candidateIngs);
    const similarity = Math.round(simIngredients * 100) / 100;
    if (similarity < 0.15) continue;

    // ── Avoid ingredients check ──
    if (avoidSet.size > 0) {
      const candidateRawIngredients = parseIngredientText(candidate.product.ingredientsRaw).ingredients;
      const hasAvoided = candidateRawIngredients.some((ing) =>
        [...avoidSet].some((avoid) => ing.toLowerCase().includes(avoid)),
      );
      if (hasAvoided) continue;
    }

    const improvement: Record<string, string> = {};
    const reasons: AlternativeReason[] = [];
    let improvementScore = 0;
    let preferenceScore = 0;

    // ── Nutrition comparison ──
    for (const { key, label, lowerIsBetter, factor } of IMPROVEMENT_KEYS) {
      const diff = pct(nutrientOf(candidateNutrition, key), nutrientOf(nutrition, key), lowerIsBetter);
      if (diff) {
        improvement[key] = diff;
        improvementScore += lowerIsBetter ? 2.5 : 1.5;
        reasons.push({ factor, detail: `${label} ${diff}` });
      }
    }

    // ── Concern score ──
    const sourceConcern = concernScore(sourceIngs);
    const candidateConcern = concernScore(candidateIngs);
    if (candidateConcern < sourceConcern) {
      improvementScore += 3;
      reasons.push({ factor: "fewer_additives", detail: "Fewer concerning additives" });
    }

    // ── User preference alignment ──
    if (goals.length > 0) {
      let matches = 0;
      for (const goal of goals) {
        switch (goal) {
          case "lower_sodium": {
            const src = nutrientOf(nutrition, "sodium");
            const cand = nutrientOf(candidateNutrition, "sodium");
            if (src !== null && cand !== null && cand < src) { matches++; preferenceScore += 3; }
            break;
          }
          case "lower_sugar": {
            const src = nutrientOf(nutrition, "sugars");
            const cand = nutrientOf(candidateNutrition, "sugars");
            if (src !== null && cand !== null && cand < src) { matches++; preferenceScore += 3; }
            break;
          }
          case "lower_calories": {
            const src = nutrientOf(nutrition, "calories");
            const cand = nutrientOf(candidateNutrition, "calories");
            if (src !== null && cand !== null && cand < src) { matches++; preferenceScore += 2.5; }
            break;
          }
          case "higher_protein": {
            const src = nutrientOf(nutrition, "protein");
            const cand = nutrientOf(candidateNutrition, "protein");
            if (src !== null && cand !== null && cand > src) { matches++; preferenceScore += 2; }
            break;
          }
          case "higher_fiber": {
            const src = nutrientOf(nutrition, "fiber");
            const cand = nutrientOf(candidateNutrition, "fiber");
            if (src !== null && cand !== null && cand > src) { matches++; preferenceScore += 2; }
            break;
          }
          case "fewer_additives": {
            if (candidateConcern < sourceConcern) { matches++; preferenceScore += 3; }
            break;
          }
          case "lower_saturated_fat": {
            const src = nutrientOf(nutrition, "saturatedFat");
            const cand = nutrientOf(candidateNutrition, "saturatedFat");
            if (src !== null && cand !== null && cand < src) { matches++; preferenceScore += 2.5; }
            break;
          }
        }
      }
      const alignment = goals.length > 0 ? matches / goals.length : 0;
      if (alignment === 0) continue; // skip if no preference match
    }

    // ── Data confidence (considers both source AND candidate data) ──
    const hasCandidateNutrition = candidateNutrition !== null && Object.keys(candidateNutrition.nutrients).length > 0;
    const hasSourceNutrition = nutrition !== null && Object.keys(nutrition.nutrients).length > 0;
    const hasIngredients = candidateIngs.length > 0;
    const dataConfidence =
      (hasCandidateNutrition && hasSourceNutrition ? 0.4 : hasCandidateNutrition || hasSourceNutrition ? 0.2 : 0) +
      (hasIngredients ? 0.3 : 0) +
      (similarity > 0.3 ? 0.2 : 0.1);

    // ── FSSAI analysis (lightweight — reuse if already cached) ──
    let fssai: FSSAIAnalysisResult | null = null;
    try {
      fssai = await runFSSAIForProduct(candidate.product, candidate.product.ingredientsRaw);
    } catch {
      // FSSAI failure is not fatal
    }

    // ── Score ──
    const recommendationScore = Math.min(
      95,
      Math.max(20, Math.round(
        similarity * 35 +
        Math.min(improvementScore, 12) * 3 +
        preferenceScore * 2 +
        dataConfidence * 10,
      )),
    );

    reasons.push({ factor: "similarity", detail: "Similar product category" });

    const prefAlignment = goals.length > 0
      ? goals.reduce((acc, goal) => {
          switch (goal) {
            case "lower_sodium": {
              const src = nutrientOf(nutrition, "sodium");
              const cand = nutrientOf(candidateNutrition, "sodium");
              return acc + (src !== null && cand !== null && cand < src ? 1 : 0);
            }
            case "lower_sugar": {
              const src = nutrientOf(nutrition, "sugars");
              const cand = nutrientOf(candidateNutrition, "sugars");
              return acc + (src !== null && cand !== null && cand < src ? 1 : 0);
            }
            case "lower_calories": {
              const src = nutrientOf(nutrition, "calories");
              const cand = nutrientOf(candidateNutrition, "calories");
              return acc + (src !== null && cand !== null && cand < src ? 1 : 0);
            }
            case "higher_protein": {
              const src = nutrientOf(nutrition, "protein");
              const cand = nutrientOf(candidateNutrition, "protein");
              return acc + (src !== null && cand !== null && cand > src ? 1 : 0);
            }
            case "higher_fiber": {
              const src = nutrientOf(nutrition, "fiber");
              const cand = nutrientOf(candidateNutrition, "fiber");
              return acc + (src !== null && cand !== null && cand > src ? 1 : 0);
            }
            case "fewer_additives": {
              return acc + (candidateConcern < sourceConcern ? 1 : 0);
            }
            case "lower_saturated_fat": {
              const src = nutrientOf(nutrition, "saturatedFat");
              const cand = nutrientOf(candidateNutrition, "saturatedFat");
              return acc + (src !== null && cand !== null && cand < src ? 1 : 0);
            }
            default: return acc;
          }
        }, 0) / goals.length
      : undefined;

    ranked.push({
      raw: recommendationScore,
      alt: {
        product: candidate.product,
        similarity,
        improvement,
        recommendationScore,
        reasons: reasons.slice(0, 4),
        whyBetter: reasons.length > 1 ? reasons[0].detail : "Similar alternative",
        fssai: fssai ? {
          overallStatus: fssai.overallStatus,
          additiveCount: fssai.additives?.length ?? 0,
          concernsCount: (fssai.additives ?? []).filter((a) =>
            a.status === "RESTRICTED" || a.status === "NOT_PERMITTED" || a.needsReview,
          ).length,
        } : undefined,
        preferenceAlignment: prefAlignment,
        dataConfidence,
      },
    });
  }

  return ranked
    .sort((a, b) => b.raw - a.raw)
    .slice(0, limit)
    .map((r) => r.alt);
}
