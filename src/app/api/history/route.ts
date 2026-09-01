import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { historyPostSchema } from "@/schemas";
import { addHistoryEntry, listHistory } from "@/services/history.service";

export const runtime = "nodejs";

/** GET /api/history - the authenticated user's scan history. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const history = await listHistory(session.id);
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
