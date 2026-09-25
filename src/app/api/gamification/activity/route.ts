import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { gamificationService } from "@/gamification/services/gamification.service";

export const runtime = "nodejs";

const activityRequestSchema = z
  .object({
    action_type: z.literal("product_scan"),
    product_id: z.string().trim().min(1).max(200),
    // Optional for backwards compatibility; the client should send a UUID so
    // retries are idempotent. XP and streak values are intentionally absent.
    event_id: z.string().trim().min(8).max(128).optional(),
  })
  .strict();

/**
 * POST /api/gamification/activity
 *
 * Records a validated successful product-scan event. The authenticated user,
 * product existence, action type, duplicate event, XP, and local calendar date
 * are all determined by the backend.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    await enforceRateLimit(`gamification:${clientIp(request)}:${session.id}`);

    const body = await request.json().catch(() => null);
    const parsed = activityRequestSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);

    const result = await gamificationService.recordProductScan({
      userId: session.id,
      actionType: parsed.data.action_type,
      productId: parsed.data.product_id,
      eventId:
        parsed.data.event_id ?? request.headers.get("idempotency-key")?.trim() ?? undefined,
    });

    return jsonSuccess(
      {
        xp_awarded: result.activity.xpAwarded,
        total_xp: result.profile.totalXp,
        current_streak: result.profile.currentStreak,
        longest_streak: result.profile.longestStreak,
        activity_date: result.activity.activityDate,
        idempotent: result.idempotent,
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
