import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { gamificationService } from "@/gamification/services/gamification.service";

export const runtime = "nodejs";

/** GET /api/gamification/profile - return the persisted XP/streak state. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const profile = await gamificationService.getProfile(session.id);
    return jsonSuccess(
      {
        total_xp: profile.totalXp,
        current_streak: profile.currentStreak,
        longest_streak: profile.longestStreak,
        last_activity_date: profile.lastActivityDate,
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
