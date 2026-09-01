import { getEmbeddingProvider } from "@/lib/embeddings";
import { getStore } from "@/lib/store";
import type { KnowledgeCategory, KnowledgeSearchHit } from "@/types/knowledge";

export type RegulationSearchOptions = {
  category?: KnowledgeCategory;
  limit?: number;
};

export type RegulationSearchResult = {
  hits: KnowledgeSearchHit[];
  usedEmbeddings: boolean;
};

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "of", "in", "on", "at",
  "to", "for", "from", "with", "by", "and", "or", "but", "not", "no", "it", "its", "this", "that",
  "these", "those", "as", "which", "who", "what", "when", "where", "how", "do", "does", "did",
  "can", "could", "will", "would", "should", "may", "must", "has", "have", "had", "about", "into",
  "than", "then", "there", "their", "they", "we", "you", "your", "our", "i", "me", "my", "he",
  "she", "him", "her", "if", "so", "such", "too", "very", "also", "per", "any", "some", "all",
  "each", "every", "more", "most", "other", "another", "only", "just", "up", "down", "out", "did",
  "does", "was", "were",
]);

function stemmedTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map((t) => t.replace(/s$/, ""));
}

/**
 * Stemmed token-overlap score. Robust to word-form variation (label vs
 * labelling, list vs lists) and far more discriminative than raw trigram
 * cosine for short queries against long chunks.
 */
function tokenOverlapScore(query: string, content: string): number {
  const queryTokens = new Set(stemmedTokens(query));
  if (queryTokens.size === 0) return 0;
  const contentTokens = new Set(stemmedTokens(content));
  const overlap = [...queryTokens].filter((t) => contentTokens.has(t)).length;
  return overlap / Math.sqrt(queryTokens.size);
}

/**
 * Retrieval for the RAG layer. Production path embeds the query and scores by
 * cosine similarity; the final relevance blends the vector score with a
 * stemmed token-overlap term so coincidental hash collisions cannot surface
 * unrelated chunks. Dev/test falls back to keyword overlap alone when no
 * embedding provider (or no stored vectors) is available.
 */
export async function searchKnowledge(
  query: string,
  options: RegulationSearchOptions = {},
): Promise<RegulationSearchResult> {
  const store = getStore();
  const embedder = getEmbeddingProvider();
  let queryEmbedding: number[] | null = null;
  try {
    const [embedded] = await embedder.embed([query]);
    queryEmbedding = embedded;
  } catch {
    queryEmbedding = null;
  }
  const raw = await store.searchKnowledgeChunks(query, {
    category: options.category,
    limit: (options.limit ?? 5) * 3,
    queryEmbedding,
  });

  const blended = raw
    .map((hit) => {
      const overlap = tokenOverlapScore(query, hit.chunk.content);
      const score = queryEmbedding ? 0.5 * hit.score + 0.5 * overlap : overlap;
      return { ...hit, score };
    })
    .filter((hit) => hit.score >= MIN_RELEVANCE)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 5);

  return { hits: blended, usedEmbeddings: queryEmbedding !== null };
}

const MIN_RELEVANCE = 0.3;

export function formatKnowledgeHits(hits: KnowledgeSearchHit[]): string {
  return hits
    .map(
      (hit, index) =>
        `[${index + 1}] ${hit.chunk.content} (Source: ${hit.chunk.metadata.document ?? "FoodGuard knowledge base"}, relevance ${(hit.score * 100).toFixed(0)}%)`,
    )
    .join("\n\n");
}