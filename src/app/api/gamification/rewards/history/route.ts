import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { module4Service } from "@/gamification/protection/protection.service";

export const runtime = "nodejs";

/** GET /api/gamification/rewards/history - earned and claimed rewards. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const history = await module4Service.getRewardHistory(session.id);
    return jsonSuccess(history, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
