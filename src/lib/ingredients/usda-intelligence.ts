/**
 * USDA-derived ingredient-intelligence access layer.
 *
 * ROLE (invariant): this dataset provides INGREDIENT INTELLIGENCE ONLY.
 * It is NOT an Indian regulatory authority and must never be used to answer
 * FSSAI compliance questions — see src/lib/sources/priority.ts.
 *
 * Data: versioned snapshot compiled from
 * data/external/usda_food_ingredient_intelligence/processed/canonical_ingredients.json
 */

import rawSnapshot from "@/data/usda-intelligence/intelligence-snapshot.json";
import type { ProvenanceSource } from "@/lib/sources/priority";

export interface IntelligenceRecord {
  canonicalName: string;
  occurrenceCount: number;
  aliases: string[];
  fssaiRegistryMatch: string | null;
  fssaiRegistryId: string | null;
  insNumber: string | null;
  fssaiCategory: string | null;
  mlClass: string | null;
  intelligenceType: string | null;
  source: ProvenanceSource;
}

interface Snapshot {
  version: string;
  generatedAt: string;
  role: string;
  regulatoryAuthority: false;
  sourceDataset: { name: string; underlying_source: string; ingest_path: string };
  stats: { record_count: number; fssai_matched_records: number };
  records: Array<Omit<IntelligenceRecord, "source"> & { source: Omit<ProvenanceSource, never> }>;
}

const snapshot = rawSnapshot as unknown as Snapshot;

/** Defence-in-depth: refuse a snapshot that claims regulatory authority. */
if (snapshot.regulatoryAuthority !== false) {
  throw new Error(
    "[usda-intelligence] integrity violation: snapshot claims regulatory authority",
  );
}

const byCanonical = new Map<string, IntelligenceRecord>();
const byAlias = new Map<string, IntelligenceRecord>();
const byCategory = new Map<string, IntelligenceRecord[]>();

function keyOf(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

for (const r of snapshot.records) {
  const rec: IntelligenceRecord = {
    ...r,
    // hard-stamp provenance regardless of file contents
    source: {
      name: "Food Ingredient Intelligence Database",
      underlyingSource: "USDA FoodData Central",
      type: "ingredient_intelligence",
      regulatory: false,
    },
  };
  byCanonical.set(keyOf(rec.canonicalName), rec);
  for (const alias of rec.aliases) {
    const k = keyOf(alias);
    if (!byAlias.has(k)) byAlias.set(k, rec);
  }
  if (rec.fssaiCategory) {
    const list = byCategory.get(rec.fssaiCategory) ?? [];
    list.push(rec);
    byCategory.set(rec.fssaiCategory, list);
  }
}

export interface IngredientIntelligenceHit {
  matched: boolean;
  matchType: "canonical" | "alias" | "none";
  canonicalName?: string;
  fssaiRegistryMatch?: string | null;
  insNumber?: string | null;
  classification: {
    /** FSSAI registry category when the record traces to the regulatory dataset */
    fssaiCategory: string | null;
    /** ML-taxonomy class from the existing FoodGuard classifier taxonomy */
    mlClass: string | null;
    confidence: number;
  };
  intelligenceType: string | null;
  evidence: { productOccurrences: number; datasetVersion: string };
  sources: ProvenanceSource[];
}

/**
 * Look up an ingredient surface form. Classification confidence is derived from
 * match quality + corpus frequency; it describes INTELLIGENCE, not regulation.
 */
export function lookupIngredientIntelligence(raw: string): IngredientIntelligenceHit {
  const k = keyOf(raw);
  const hit = byCanonical.get(k) ?? byAlias.get(k);
  if (!hit) {
    return {
      matched: false,
      matchType: "none",
      classification: { fssaiCategory: null, mlClass: null, confidence: 0 },
      intelligenceType: null,
      evidence: { productOccurrences: 0, datasetVersion: snapshot.version },
      sources: [],
    };
  }
  const canonical = byCanonical.get(k) === hit;
  const freq = Math.min(1, Math.log10(1 + hit.occurrenceCount) / 3); // 0..1
  return {
    matched: true,
    matchType: canonical ? "canonical" : "alias",
    canonicalName: hit.canonicalName,
    fssaiRegistryMatch: hit.fssaiRegistryMatch,
    insNumber: hit.insNumber,
    classification: {
      fssaiCategory: hit.fssaiCategory,
      mlClass: hit.mlClass,
      confidence: Number(((canonical ? 0.75 : 0.6) + 0.2 * freq).toFixed(2)),
    },
    intelligenceType: hit.intelligenceType,
    evidence: { productOccurrences: hit.occurrenceCount, datasetVersion: snapshot.version },
    sources: [hit.source],
  };
}

/** All intelligence records observed for an FSSAI category (e.g. "Preservative"). */
export function getIntelligenceByCategory(fssaiCategory: string): IntelligenceRecord[] {
  return [...(byCategory.get(fssaiCategory) ?? [])].sort(
    (a, b) => b.occurrenceCount - a.occurrenceCount,
  );
}

/**
 * Token-overlap similarity between two ingredients over the intelligence
 * corpus vocabulary. Used for "ingredients similar to X" queries and product
 * ingredient-profile similarity. This is similarity EVIDENCE only.
 */
export function ingredientSimilarity(a: string, b: string): number {
  const toks = (s: string) =>
    new Set(keyOf(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  const A = toks(a);
  const B = toks(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function usdaIntelligenceStats() {
  return {
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    recordCount: snapshot.stats.record_count,
    fssaiMatchedRecords: snapshot.stats.fssai_matched_records,
    aliasCount: byAlias.size,
    role: snapshot.role,
    regulatoryAuthority: false as const,
    sourceDataset: snapshot.sourceDataset,
  };
}
