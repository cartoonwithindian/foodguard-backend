import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { challengeService } from "@/gamification/challenges/challenge.service";

export const runtime = "nodejs";

/** GET /api/gamification/challenges/daily */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const challenges = await challengeService.getDailyChallenges(session.id);
    return jsonSuccess({ challenges }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
