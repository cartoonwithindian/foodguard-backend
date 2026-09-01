import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { AppError, ErrorCodes } from "@/lib/errors";

/**
 * Embedding provider abstraction. Production uses an OpenAI-compatible
 * /embeddings endpoint; mock mode uses a deterministic hash-based embedder so
 * ingestion and retrieval are testable without any network access.
 */

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_DIMENSIONS = 256;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "of", "in", "on", "at",
  "to", "for", "from", "with", "by", "and", "or", "but", "not", "no", "it", "its", "this", "that",
  "these", "those", "as", "which", "who", "what", "when", "where", "how", "do", "does", "did",
  "can", "could", "will", "would", "should", "may", "must", "has", "have", "had", "about", "into",
  "than", "then", "there", "their", "they", "we", "you", "your", "our", "i", "me", "my", "he",
  "she", "him", "her", "if", "so", "such", "too", "very", "also", "per", "any", "some", "all",
  "each", "every", "more", "most", "other", "another", "only", "just", "but", "up", "down", "out",
]);


export { STOPWORDS };

/**
 * Deterministic bag-of-tokens embedder. Vectors are stable across runs and
 * support cosine similarity that mirrors real embedding behaviour well enough
 * for keyword-ish retrieval in dev/test. NEVER used in production when an API
 * key is configured.
 */
function charTrigrams(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/\s+/g, "");
  if (normalized.length < 3) return [normalized.padEnd(3, "x")];
  const trigrams: string[] = [];
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.push(normalized.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Deterministic character-trigram embedder. Trigram overlap is robust to
 * word-form variation (label/labelling, list/lists) and produces stable
 * vectors across runs for dev/test. NEVER used in production when an API key
 * is configured.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array(EMBEDDING_DIMENSIONS).fill(0) as number[];
      const trigrams = charTrigrams(text);
      for (const trigram of trigrams) {
        const bucket = hashString(trigram) % EMBEDDING_DIMENSIONS;
        const sign = hashString(`${trigram}#sign`) % 2 === 0 ? 1 : -1;
        vector[bucket] += sign;
      }
      const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0)) || 1;
      return vector.map((v) => v / norm);
    });
  }
}

class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    if (!config.ai.apiKey) {
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "AI_API_KEY is not configured");
    }
    const model = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small";
    const response = await fetch(`${config.ai.baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!response.ok) {
      logger.error("embedding_http_error", { status: response.status });
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "Embedding provider request failed");
    }
    const payload = (await response.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    const embeddings = (payload.data ?? []).map((d) => d.embedding);
    if (embeddings.length !== texts.length) {
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "Embedding provider returned incomplete results");
    }
    return embeddings;
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  // Use real provider when API key is configured (supports openai, gemini, etc.)
  if (config.ai.apiKey && config.ai.provider !== "mock") {
    return new OpenAICompatibleEmbeddingProvider();
  }
  return new MockEmbeddingProvider();
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}