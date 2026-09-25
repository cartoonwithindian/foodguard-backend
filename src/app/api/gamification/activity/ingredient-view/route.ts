import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { challengeService } from "@/gamification/challenges/challenge.service";

export const runtime = "nodejs";

const ingredientViewSchema = z
  .object({
    product_id: z.string().trim().min(1).max(200),
    ingredient_id: z.string().trim().min(1).max(120).optional(),
    event_id: z.string().trim().min(8).max(128).optional(),
  })
  .strict();

/**
 * Records a real ingredient-information view. The caller cannot submit
 * progress, completion, or XP; the store validates the product and evaluates
 * the configured challenges transactionally.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    await enforceRateLimit(`challenge-ingredient:${clientIp(request)}:${session.id}`);
    const body = await request.json().catch(() => null);
    const parsed = ingredientViewSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);
    const eventId = parsed.data.event_id ?? request.headers.get("idempotency-key")?.trim();
    if (!eventId) {
      return jsonError({ code: "VALIDATION_ERROR", message: "event_id is required" }, requestId);
    }
    const result = await challengeService.recordIngredientView({
      userId: session.id,
      productId: parsed.data.product_id,
      ingredientId: parsed.data.ingredient_id ?? null,
      eventId,
    });
    return jsonSuccess(
      {
        xp_awarded: result.activity.xpAwarded,
        total_xp: result.profile.totalXp,
        current_streak: result.profile.currentStreak,
        longest_streak: result.profile.longestStreak,
        activity_date: result.activity.activityDate,
        idempotent: result.idempotent,
        completed_challenges: result.completedChallenges ?? [],
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
