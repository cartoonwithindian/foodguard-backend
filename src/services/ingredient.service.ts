import type { EvidenceRef, IngredientAnalysisItem, IngredientRecord, UnknownIngredientInfo } from "@/types/domain";
import { normalizeIngredient } from "@/lib/ingredients/normalize";
import { lookupIngredientIntelligence } from "@/lib/ingredients/usda-intelligence";
import { assessmentToSeverity } from "@/lib/scoring";
import { detectAllergens, allergenFromIngredient } from "@/lib/allergens";
import { getEvidenceForIngredient } from "@/lib/evidence";
import { getStore } from "@/lib/store";
import { getAIProvider } from "@/lib/ai";
import { config } from "@/lib/config";
import { normalizeText } from "@/lib/ingredients";

function deterministicExplanation(record: IngredientRecord, evidence: EvidenceRef[]): string {
  const base = record.description;
  const caveat = evidence.length
    ? ""
    : " Evidence on this ingredient is limited in our library, so this assessment should be treated with caution.";
  switch (record.assessment) {
    case "beneficial":
      return `Generally regarded positively in current dietary guidance. ${base}${caveat}`;
    case "neutral":
      return `${base}${caveat}`;
    case "generally_accepted":
      return `Generally considered acceptable at permitted levels. ${base}${caveat}`;
    case "noteworthy":
      return `Worth reviewing because this ingredient has a documented dietary or regulatory consideration. ${base}${caveat}`;
    case "potentially_concerning":
      return `Classified as potentially concerning based on the available evidence. ${base}${caveat}`;
    case "allergen":
      return `Declared allergen (${record.allergenStatus}). ${base}${caveat}`;
    case "dietary_conflict":
      return `May conflict with certain dietary preferences. ${base}${caveat}`;
    default:
      return `Evidence on this ingredient is limited; this assessment is informational. ${base}${caveat}`;
  }
}

export type AnalyzeIngredientsInput = {
  ingredients: string[];
  context?: string | null;
  language?: string;
  useAI?: boolean;
};

export type AnalyzeIngredientsOutput = {
  items: IngredientAnalysisItem[];
  unknownIngredients: UnknownIngredientInfo[];
  matchRate: number; // 0..1
  unresolvedCount: number;
};

/**
 * Core ingredient analysis engine.
 * Deterministic: normalize -> resolve -> assess -> evidence -> explain.
 * Never guesses: unresolved ingredients are queued for admin review.
 */
export async function analyzeIngredients(input: AnalyzeIngredientsInput): Promise<AnalyzeIngredientsOutput> {
  const store = getStore();
  const items: IngredientAnalysisItem[] = [];
  const unknownSeen = new Set<string>();
  const ingredientKeys = new Set<string>();
  let unknownDisplayAdded = false;

  for (const raw of input.ingredients) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const normalized = normalizeIngredient(trimmed);
    const isSectionWord = /^(ingredients?|nutrition|nutrition\s+facts|allergens?|मिश्रित)$/i.test(trimmed);
    if (isSectionWord || !trimmed) continue;

    const key = normalized.matched && normalized.canonicalName
      ? normalizeText(normalized.canonicalName)
      : normalizeText(trimmed);
    if (ingredientKeys.has(key)) continue;
    ingredientKeys.add(key);

    if (!normalized.matched) {
      // Auxiliary intelligence may recognise the surface form; this NEVER
      // resolves the item — assessment stays insufficient_evidence.
      const intelHit = lookupIngredientIntelligence(trimmed);
      const intelligence = intelHit.matched
        ? {
            canonicalName: intelHit.canonicalName!,
            matchType: intelHit.matchType as "canonical" | "alias",
            fssaiRegistryMatch: intelHit.fssaiRegistryMatch ?? null,
            insNumber: intelHit.insNumber ?? null,
            classification: {
              category: intelHit.classification.fssaiCategory,
              confidence: intelHit.classification.confidence,
            },
            intelligenceType: intelHit.intelligenceType,
            evidence: intelHit.evidence,
            source: {
              name: "Food Ingredient Intelligence Database",
              underlyingSource: "USDA FoodData Central",
              type: "ingredient_intelligence" as const,
              regulatory: false as const,
            },
            regulatoryStatus: "INSUFFICIENT_DATA" as const,
          }
        : undefined;
      if (!unknownSeen.has(normalizeText(trimmed))) {
        unknownSeen.add(normalizeText(trimmed));
        try {
          await store.addUnknownIngredient({
            rawName: trimmed,
            normalizedAttempt: null,
            confidence: normalized.confidence,
            context: input.context ?? null,
          });
        } catch {
          // Non-fatal: unknown queue is best-effort.
        }
      }
      if (!unknownDisplayAdded) {
        items.push({
          rawName: trimmed,
          name: "Unverified ingredient text detected",
          function: "unverified label text",
          assessment: "insufficient_evidence",
          severity: "moderate",
          explanation: intelligence
            ? `Recognised in our ingredient-intelligence corpus as "${intelligence.canonicalName}". Indian regulatory status is determined separately using FSSAI sources and remains unverified here.`
            : "Unable to confidently identify this portion of the label. The system does not guess unknown ingredient names; review the original product label.",
          evidence: [],
          confidence: 0.3,
          flags: ["unknown"],
          allergens: [],
          matched: false,
          ...(intelligence ? { intelligence } : {}),
        });
        unknownDisplayAdded = true;
      }
      continue;
    }

    // Auxiliary intelligence (USDA-derived). Intelligence NEVER upgrades an
    // unresolved ingredient: regulatory status stays INSUFFICIENT_DATA unless
    // an FSSAI record resolves it below.
    const intelHit = lookupIngredientIntelligence(trimmed);
    const intelligence = intelHit.matched
      ? {
          canonicalName: intelHit.canonicalName!,
          matchType: intelHit.matchType as "canonical" | "alias",
          fssaiRegistryMatch: intelHit.fssaiRegistryMatch ?? null,
          insNumber: intelHit.insNumber ?? null,
          classification: {
            category: intelHit.classification.fssaiCategory,
            confidence: intelHit.classification.confidence,
          },
          intelligenceType: intelHit.intelligenceType,
          evidence: intelHit.evidence,
          source: {
            name: "Food Ingredient Intelligence Database",
            underlyingSource: "USDA FoodData Central",
            type: "ingredient_intelligence" as const,
            regulatory: false as const,
          },
          regulatoryStatus: "INSUFFICIENT_DATA" as const,
        }
      : undefined;

    const found = await resolveRecord(normalized.canonicalName ?? trimmed);
    if (!found) continue;

    const evidence = await getEvidenceForIngredient(found.id);
    const allergen =
      allergenFromIngredient(trimmed, found.allergenStatus) ?? detectAllergens(trimmed)[0] ?? null;

    let explanation = deterministicExplanation(found, evidence);
    if (input.useAI && config.ai.provider !== "mock") {
      try {
        const ai = await getAIProvider().explainIngredient({
          name: found.canonicalName,
          function: found.function,
          assessment: found.assessment,
          evidence: evidence.map((e) => ({ organization: e.organization, summary: e.summary, url: e.url })),
          userLanguage: input.language === "hi" ? "hi" : "en",
        });
        explanation = ai.explanation;
      } catch {
        // Fall back to the deterministic explanation.
      }
    }

    const severity = assessmentToSeverity(found.assessment);

    items.push({
      rawName: trimmed,
      name: found.canonicalName,
      identifier: normalized.identifier,
      function: found.function,
      category: found.category,
      assessment: found.assessment,
      severity,
      explanation,
      evidence,
      confidence: normalized.confidence,
      flags: [...(found.isAdditive ? ["additive"] : []), ...(allergen ? ["allergen"] : [])],
      allergens: allergen ? [allergen] : [],
      matched: true,
      ...(intelligence ? { intelligence } : {}),
    });
  }

  const matchedCount = items.filter((i) => i.matched).length;
  const totalDistinctIngredients = matchedCount + unknownSeen.size;
  const matchRate = totalDistinctIngredients ? matchedCount / totalDistinctIngredients : 0;

  return {
    items,
    unknownIngredients: [...unknownSeen].map((name) => ({
      id: `unk-${name}`,
      rawName: name,
      normalizedAttempt: null,
      confidence: 0.3,
      status: "pending" as const,
      context: input.context ?? null,
      createdAt: new Date().toISOString(),
    })),
    matchRate: Math.round(matchRate * 100) / 100,
    unresolvedCount: unknownSeen.size,
  };
}

async function resolveRecord(canonicalName: string): Promise<IngredientRecord | null> {
  const store = getStore();
  const found = await store.getIngredientByCanonical(canonicalName);
  return found;
}
