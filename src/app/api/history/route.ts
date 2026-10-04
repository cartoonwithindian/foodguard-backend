import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { historyPostSchema } from "@/schemas";
import { addHistoryEntry, listHistory } from "@/services/history.service";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { clampInt } from "@/lib/url-guard";
import { MAX_HISTORY_LIST } from "@/lib/store/types";

export const runtime = "nodejs";

/** GET /api/history - the authenticated user's scan history. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    // The frontend asks for `?limit=5`; it was silently ignored before.
    const limit = clampInt(new URL(request.url).searchParams.get("limit"), MAX_HISTORY_LIST, 1, MAX_HISTORY_LIST);
    const history = await listHistory(session.id, limit);
    return jsonSuccess({ history, total: history.length }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

/** POST /api/history - save a scan/analysis result. */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    // Shares the global per-IP budget: this writes a row per call and was the
    // only remaining unthrottled write endpoint (only auth-gated, which stops
    // anonymous traffic but not a signed-up loop).
    await enforceRateLimit(`history-write:${clientIp(request)}`);

    const body = await request.json();
    const parsed = historyPostSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);

    const entry = await addHistoryEntry(session.id, {
      productId: parsed.data.productId,
      source: parsed.data.source,
      assessmentSnapshot: parsed.data.assessmentSnapshot as never,
    });
    return jsonSuccess({ entry }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
