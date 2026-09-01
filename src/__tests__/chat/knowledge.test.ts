import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { getStore } from "@/lib/store";
import { InMemoryStore } from "@/lib/store/memory";
import { loadKnowledgeSeed, chunkSection, ingestKnowledgeCorpus, MAX_CHUNK_CHARS } from "@/services/chat/knowledge-ingest";
import { searchKnowledge, formatKnowledgeHits } from "@/services/chat/knowledge-retrieval";
import { runTool } from "@/services/chat/tools";

// Force mock mode for AI to prevent real API calls during tests
const { savedAIEnv } = vi.hoisted(() => {
  const savedAIEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
  };
  process.env.AI_PROVIDER = "mock";
  process.env.AI_API_KEY = "";
  return { savedAIEnv };
});

afterAll(() => {
  process.env.AI_PROVIDER = savedAIEnv.AI_PROVIDER ?? "mock";
  process.env.AI_API_KEY = savedAIEnv.AI_API_KEY ?? "";
});

describe("knowledge corpus", () => {
  it("loads the curated seed documents from disk", () => {
    const seed = loadKnowledgeSeed();
    expect(seed.length).toBeGreaterThanOrEqual(8);
    for (const doc of seed) {
      expect(doc.id.length).toBeGreaterThan(0);
      expect(doc.source.length).toBeGreaterThan(0);
      expect(doc.sections.length).toBeGreaterThan(0);
      expect(doc.documentVersion).toMatch(/^\d{4}\.\d+$/);
    }
  });

  it("chunks sections within the size limit", () => {
    const chunks = chunkSection("Test", "a. ".repeat(600));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
  });
});

describe("RAG ingestion and retrieval", () => {
  beforeEach(async () => {
    await ingestKnowledgeCorpus(getStore());
  });

  it("ingests all documents into the active store", async () => {
    const docs = await getStore().listKnowledgeDocuments();
    expect(docs.length).toBeGreaterThanOrEqual(8);
    for (const doc of docs) {
      expect(doc.documentVersion).toBe("2026.2");
    }
  });

  it("retrieves relevant chunks for additive questions", async () => {
    const { hits, usedEmbeddings } = await searchKnowledge("what is INS 621 monosodium glutamate", {
      limit: 4,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(usedEmbeddings).toBe(true);
    const top = hits[0];
    expect(top.chunk.content.length).toBeGreaterThan(0);
    expect(top.score).toBeGreaterThan(0);
  });

  it("retrieves labelling chunks for label questions", async () => {
    const { hits } = await searchKnowledge("ingredient list must be in descending order of weight");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.content.toLowerCase()).toContain("ingredient");
  });

  it("returns empty hits without guessing for unrelated queries", async () => {
    const { hits } = await searchKnowledge("zqxwv nothing matching this in the corpus", { limit: 3 });
    expect(hits).toHaveLength(0);
  });

  it("formats hits with source attribution", async () => {
    const { hits } = await searchKnowledge("recyclability mark");
    expect(hits.length).toBeGreaterThan(0);
    const formatted = formatKnowledgeHits(hits);
    expect(formatted).toContain("Source:");
    expect(formatted).toContain("relevance");
  });

  it("search_regulations tool fails closed with notFound for unknown topics", async () => {
    const result = await runTool(
      "search_regulations",
      { query: "zqxwv nonsense topic" },
      { userId: "u1" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { notFound: boolean }).notFound).toBe(true);
    }
  });

  it("search_regulations rejects invalid input", async () => {
    const result = await runTool("search_regulations", { query: "x" }, { userId: "u1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_input");
  });

  it("works on a fresh InMemoryStore instance", async () => {
    const store = new InMemoryStore();
    await ingestKnowledgeCorpus(store);
    const docs = await store.listKnowledgeDocuments();
    expect(docs.length).toBeGreaterThanOrEqual(8);
    const { hits } = await searchKnowledge("FSSAI license number on the label");
    expect(hits.length).toBeGreaterThan(0);
  }, 30000);
});