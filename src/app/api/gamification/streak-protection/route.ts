import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { module4Service } from "@/gamification/protection/protection.service";

export const runtime = "nodejs";

/** GET /api/gamification/streak-protection - current protection inventory. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const status = await module4Service.getStreakProtection(session.id);
    return jsonSuccess(status, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
