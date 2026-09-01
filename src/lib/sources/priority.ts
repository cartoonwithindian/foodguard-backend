/**
 * Source priority & provenance system for FoodGuard AI.
 *
 * Inviolable hierarchy (highest → lowest authority):
 *   1. FSSAI / Government of India sources          (regulatory)
 *   2. Official Indian regulatory documents         (regulatory)
 *   3. Other trusted regulatory sources             (regulatory)
 *   4. USDA-derived ingredient intelligence         (NOT regulatory)
 *   5. Other datasets                               (NOT regulatory)
 *   6. LLM inference                                (never authoritative)
 */

export const SOURCE_TYPES = [
  "fssai_regulatory",
  "indian_official",
  "other_regulatory",
  "ingredient_intelligence",
  "other_dataset",
  "llm_inference",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

/** Source types permitted to answer Indian regulatory questions. */
export const REGULATORY_SOURCE_TYPES: readonly SourceType[] = [
  "fssai_regulatory",
  "indian_official",
  "other_regulatory",
];

export interface ProvenanceSource {
  /** Human-readable dataset/organisation name */
  name: string;
  /** Upstream origin, e.g. "USDA FoodData Central" */
  underlyingSource?: string;
  type: SourceType;
  /** true only when this source may establish Indian regulatory status */
  regulatory: boolean;
}

export function isRegulatorySource(source: ProvenanceSource): boolean {
  return source.regulatory === true && REGULATORY_SOURCE_TYPES.includes(source.type);
}

export function sourcePriority(source: ProvenanceSource): number {
  const idx = SOURCE_TYPES.indexOf(source.type);
  return idx === -1 ? SOURCE_TYPES.length : idx;
}

/** Lower number wins. Regulatory sources always outrank intelligence sources. */
export function compareSources(a: ProvenanceSource, b: ProvenanceSource): number {
  const pa = sourcePriority(a);
  const pb = sourcePriority(b);
  if (pa !== pb) return pa - pb;
  if (a.regulatory !== b.regulatory) return a.regulatory ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * Resolve the regulatory status of an ingredient from candidate sources.
 * Non-regulatory sources can NEVER answer; the honest result is
 * INSUFFICIENT_DATA unless an authoritative source exists.
 */
export type RegulatoryResolution =
  | { status: "verified"; authority: ProvenanceSource; detail: string }
  | { status: "INSUFFICIENT_DATA"; authority: null; detail: string };

export function resolveRegulatoryStatus(
  candidates: ProvenanceSource[],
  detailBySource?: Partial<Record<SourceType, string>>,
): RegulatoryResolution {
  const authoritative = candidates
    .filter(isRegulatorySource)
    .sort(compareSources)[0];
  if (!authoritative) {
    return {
      status: "INSUFFICIENT_DATA",
      authority: null,
      detail:
        "No FSSAI/Government of India source available for this question. " +
        "Ingredient-intelligence datasets (e.g. USDA-derived) cannot establish " +
        "Indian regulatory status.",
    };
  }
  return {
    status: "verified",
    authority: authoritative,
    detail: detailBySource?.[authoritative.type] ?? `Verified against ${authoritative.name}.`,
  };
}

export const STANDARD_PROVENANCE = {
  fssai(name = "FSSAI"): ProvenanceSource {
    return { name, underlyingSource: "Government of India", type: "fssai_regulatory", regulatory: true };
  },
  usdaIngredientIntelligence(): ProvenanceSource {
    return {
      name: "Food Ingredient Intelligence Database",
      underlyingSource: "USDA FoodData Central",
      type: "ingredient_intelligence",
      regulatory: false,
    };
  },
} as const;
