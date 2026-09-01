import { z } from "zod";
import type { ToolResult } from "@/types/chat-tools";
import { searchKnowledge, formatKnowledgeHits } from "../knowledge-retrieval";
import { ingestKnowledgeCorpus } from "../knowledge-ingest";
import { logger } from "@/lib/logger";

const schema = z.object({
  query: z.string().min(2).max(200),
  category: z
    .enum(["regulation", "labelling", "additives", "contaminants", "packaging", "claims", "grievance", "foodguard", "general"])
    .optional(),
});

export async function searchRegulationsTool(
  args: { query: string; category?: string },
): Promise<ToolResult<unknown>> {
  const parsed = schema.safeParse(args);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  try {
    await ingestKnowledgeCorpus();
    const { hits, usedEmbeddings } = await searchKnowledge(parsed.data.query, {
      category: parsed.data.category as never,
      limit: 4,
    });
    if (hits.length === 0) {
      return { ok: true, data: { notFound: true, note: "No matching knowledge found; do not guess." } };
    }
    return {
      ok: true,
      data: {
        hits: hits.map((h) => ({
          content: h.chunk.content,
          document: h.chunk.metadata.document ?? "FoodGuard knowledge base",
          section: h.chunk.section,
          relevance: Math.round(h.score * 100),
        })),
        formatted: formatKnowledgeHits(hits),
        retrieval: usedEmbeddings ? "vector" : "keyword",
      },
    };
  } catch (error) {
    logger.error("search_regulations_tool_error", { message: String(error) });
    return { ok: true, data: { notFound: true, note: "Knowledge base unavailable right now." } };
  }
}