import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { module4Service } from "@/gamification/protection/protection.service";

export const runtime = "nodejs";

/** GET /api/gamification/overview - one payload for the gamification home. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const overview = await module4Service.getOverview(session.id);
    return jsonSuccess(overview, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
