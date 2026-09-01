import type { EvidenceRef } from "@/types/domain";
import { EVIDENCE_SEED } from "@/data/seed/evidence";
import { getCache } from "@/lib/cache";

let evidenceById: Map<string, EvidenceRef[]> | null = null;

function buildIndex(): Map<string, EvidenceRef[]> {
  const index = new Map<string, EvidenceRef[]>();
  for (const entry of EVIDENCE_SEED) {
    const list = index.get(entry.ingredientId) ?? [];
    list.push({
      id: `ev-${entry.ingredientId}-${list.length + 1}`,
      title: entry.title,
      organization: entry.organization,
      url: entry.url,
      sourceType: entry.sourceType,
      publicationDate: entry.publicationDate,
      evidenceLevel: entry.evidenceLevel,
      summary: entry.summary,
    });
    index.set(entry.ingredientId, list);
  }
  return index;
}

/** Evidence for one ingredient; empty array means insufficient evidence. */
export async function getEvidenceForIngredient(ingredientId: string): Promise<EvidenceRef[]> {
  const cache = getCache();
  const cached = await cache.get<EvidenceRef[]>(`evidence:${ingredientId}`);
  if (cached) return cached;

  if (!evidenceById) evidenceById = buildIndex();
  const refs = evidenceById.get(ingredientId) ?? [];
  await cache.set(`evidence:${ingredientId}`, refs, 24 * 3600);
  return refs;
}

export async function getEvidenceForIngredients(ingredientIds: string[]): Promise<Map<string, EvidenceRef[]>> {
  const results = await Promise.all(ingredientIds.map((id) => getEvidenceForIngredient(id)));
  const map = new Map<string, EvidenceRef[]>();
  ingredientIds.forEach((id, i) => map.set(id, results[i]));
  return map;
}

export type EvidenceStatus = "sufficient" | "limited" | "insufficient";

export function evidenceStatusFor(refs: EvidenceRef[], confidence: number): EvidenceStatus {
  if (refs.length >= 2) return "sufficient";
  if (refs.length === 1) {
    // A single source only counts when the product data itself is confident.
    return confidence >= 0.5 ? "limited" : "insufficient";
  }
  return "insufficient";
}
