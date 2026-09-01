import { readFileSync } from "fs";
import path from "path";
import type { KnowledgeCategory, KnowledgeSeedInput } from "@/types/knowledge";
import { getEmbeddingProvider } from "@/lib/embeddings";
import { getStore } from "@/lib/store";
import { logger } from "@/lib/logger";

export const KNOWLEDGE_VERSION = "2026.2";

const MANIFEST: Array<{
  file: string;
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  category: KnowledgeCategory;
}> = [
  {
    file: "fssai-act-overview.md",
    id: "fssai-act-overview",
    title: "Food Safety and Standards Act, 2006 — Overview",
    source: "FSSAI",
    sourceUrl: "https://www.fssai.gov.in",
    category: "regulation",
  },
  {
    file: "labelling-requirements.md",
    id: "fssai-labelling",
    title: "FSS (Labelling and Display) Regulations, 2020 — Requirements",
    source: "FSSAI",
    sourceUrl: "https://www.fssai.gov.in",
    category: "labelling",
  },
  {
    file: "additives-and-ins.md",
    id: "fssai-additives",
    title: "Food Additives and INS Numbers",
    source: "FSSAI",
    sourceUrl: "https://www.fssai.gov.in",
    category: "additives",
  },
  {
    file: "contaminants.md",
    id: "fssai-contaminants",
    title: "Contaminants, Toxins and Residues Limits",
    source: "FSSAI",
    sourceUrl: "https://www.fssai.gov.in",
    category: "contaminants",
  },
  {
    file: "packaging-and-recycled.md",
    id: "fssai-packaging",
    title: "Packaging, Recycled Plastics and Recyclability Mark",
    source: "FSSAI",
    sourceUrl: "https://www.fssai.gov.in",
    category: "packaging",
  },
  {
    file: "claims-and-advertising.md",
    id: "fssai-claims",
    title: "Health Claims, Nutrient Claims and Advertising",
    source: "FSSAI",
    sourceUrl: "https://www.fssai.gov.in",
    category: "claims",
  },
  {
    file: "grievance-channels.md",
    id: "fssai-grievance",
    title: "Grievance Redressal and Complaint Channels",
    source: "FSSAI",
    sourceUrl: "https://www.fssai.gov.in",
    category: "grievance",
  },
  {
    file: "foodguard-scope.md",
    id: "foodguard-scope",
    title: "FoodGuard Assistant — Capabilities and Limits",
    source: "FoodGuard",
    sourceUrl: "https://foodguard.example.com",
    category: "foodguard",
  },
];

export const MAX_CHUNK_CHARS = 512;

export function loadKnowledgeSeed(): KnowledgeSeedInput[] {
  const dir = path.join(process.cwd(), "src", "data", "knowledge");
  return MANIFEST.map((entry) => {
    const markdown = readFileSync(path.join(dir, entry.file), "utf-8");
    const sections = markdown
      .split(/\n## /)
      .filter((raw) => raw.trim().length > 0)
      .map((raw) => {
        const lines = raw.split("\n");
        const first = lines[0]?.replace(/^#+\s*/, "").trim() ?? "";
        const body = lines
          .slice(1)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        return { section: first || "General", content: body };
      })
      .filter((s) => s.content.length > 0);
    return {
      id: entry.id,
      title: entry.title,
      source: entry.source,
      sourceUrl: entry.sourceUrl,
      category: entry.category,
      documentVersion: KNOWLEDGE_VERSION,
      sections,
    };
  });
}

/**
 * Split a section into chunks of at most MAX_CHUNK_CHARS characters on
 * sentence boundaries. Returns at least one chunk per section.
 */
export function chunkSection(section: string, content: string, pageNumber?: number): string[] {
  const paragraphs = content.split(/\.\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}. ${paragraph}` : paragraph;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = paragraph;
  }
  if (current) chunks.push(current);
  if (chunks.length === 0 && content) chunks.push(content);
  void pageNumber;
  return chunks;
}

const ingestCache = new WeakMap<object, Promise<void>>();

/**
 * Idempotent, single-flight ingestion of the curated knowledge corpus.
 * Re-runs when the knowledge version changes (e.g., after a deploy).
 */
export async function ingestKnowledgeCorpus(store = getStore()): Promise<void> {
  const cached = ingestCache.get(store as unknown as object);
  if (cached) return cached;

  const run = (async () => {
    const seed = loadKnowledgeSeed();
    const existing = await store.listKnowledgeDocuments();
    const staleVersion = existing.some((d) => d.documentVersion !== KNOWLEDGE_VERSION);
    const fresh = existing.length > 0 && !staleVersion;
    if (fresh && existing.length === seed.length) {
      logger.info("knowledge_corpus_ready", { documents: existing.length });
      return;
    }

    const embedder = getEmbeddingProvider();
    const now = new Date().toISOString();
    let chunksTotal = 0;
    for (const doc of seed) {
      const chunkTexts: string[] = [];
      for (const section of doc.sections) {
        chunkTexts.push(...chunkSection(section.section, section.content, section.pageNumber));
      }
      const embeddings = await embedder.embed(chunkTexts);
      await store.upsertKnowledgeDocument({
        id: doc.id,
        title: doc.title,
        source: doc.source,
        sourceUrl: doc.sourceUrl,
        category: doc.category,
        documentVersion: doc.documentVersion,
        createdAt: now,
        updatedAt: now,
      });
      await store.insertKnowledgeChunks(
        chunkTexts.map((content, i) => ({
          id: `${doc.id}-chunk-${i + 1}`,
          documentId: doc.id,
          content,
          section: content.slice(0, 60),
          pageNumber: doc.sections[0]?.pageNumber ?? null,
          metadata: { document: doc.title, category: doc.category },
          embedding: embeddings[i],
          createdAt: now,
        })),
      );
      chunksTotal += chunkTexts.length;
    }
    logger.info("knowledge_corpus_ingested", { documents: seed.length, chunks: chunksTotal });
  })().catch((error) => {
    ingestCache.delete(store as unknown as object);
    throw error;
  });

  ingestCache.set(store as unknown as object, run);
  return run;
}