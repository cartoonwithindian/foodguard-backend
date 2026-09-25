import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { challengeService } from "@/gamification/challenges/challenge.service";

export const runtime = "nodejs";

/** GET /api/gamification/challenges - current daily/weekly instances and history. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const result = await challengeService.getChallenges(session.id);
    return jsonSuccess(result, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
