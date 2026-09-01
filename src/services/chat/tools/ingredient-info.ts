import { z } from "zod";
import { getStore } from "@/lib/store";
import { normalizeIngredient, normalizedDisplayName } from "@/lib/ingredients/normalize";
import type { ToolResult, IngredientInfo, IngredientInfoToolArgs } from "@/types/chat-tools";

const inputSchema = z.object({ name: z.string().trim().min(1).max(120) });

export async function getIngredientInfoTool(
  args: IngredientInfoToolArgs,
): Promise<ToolResult<IngredientInfo>> {
  const parsed = inputSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }
  try {
    const store = getStore();
    const raw = parsed.data.name;
    const normalized = normalizeIngredient(raw);

    const byCanonical = normalized.matched
      ? await store.getIngredientByCanonical(normalized.canonicalName!)
      : null;
    const byAlias = await store.getIngredientByAlias(raw);
    const record = byCanonical ?? byAlias;

    if (!record) {
      return {
        ok: true,
        data: {
          raw,
          normalized: normalized.matched ? normalizedDisplayName(normalized) : null,
          canonicalName: null,
          insCode: null,
          category: null,
          function: null,
          assessment: null,
          evidence: [],
        },
      };
    }

    const evidence = await store.getEvidenceByIngredientId(record.id);
    return {
      ok: true,
      data: {
        raw,
        normalized: normalized.matched ? normalizedDisplayName(normalized) : record.canonicalName,
        canonicalName: record.canonicalName,
        insCode: record.insCode ?? null,
        category: record.category,
        function: record.function,
        assessment: record.assessment,
        evidence: evidence.slice(0, 5).map((e) => ({
          organization: e.organization,
          summary: e.summary,
          url: e.url,
        })),
      },
    };
  } catch {
    return { ok: false, error: "lookup_failed" };
  }
}