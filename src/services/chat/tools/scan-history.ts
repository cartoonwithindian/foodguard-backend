import { getStore } from "@/lib/store";
import type { ToolResult, ScanHistoryEntry } from "@/types/chat-tools";

/**
 * The authenticated user's scan history — userId is injected by the caller
 * from the server-side session, never from the client.
 */
export async function getUserScanHistoryTool(
  args: Record<string, never>,
  ctx: { userId: string },
): Promise<ToolResult<ScanHistoryEntry[]>> {
  try {
    const store = getStore();
    const history = await store.listHistory(ctx.userId);
    const entries: ScanHistoryEntry[] = history.slice(0, 10).map((h) => {
      const snapshot = h.assessmentSnapshot as {
        name?: string;
        brand?: string | null;
        assessment?: string;
        score?: number | null;
      };
      return {
        productId: h.productId,
        name: snapshot.name ?? "Unknown product",
        brand: snapshot.brand ?? null,
        assessment: snapshot.assessment ?? "Unknown",
        score: snapshot.score ?? null,
        scannedAt: h.scannedAt,
        source: h.source,
      };
    });
    return { ok: true, data: entries };
  } catch {
    return { ok: false, error: "history_failed" };
  }
}