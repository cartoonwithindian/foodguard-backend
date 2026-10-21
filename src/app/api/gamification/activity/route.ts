import { NextRequest } from "next/server";
import { jsonError } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { AppError, ErrorCodes } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * POST /api/gamification/activity — RETIRED (self-service product_scan).
 *
 * This endpoint used to accept `{action_type:"product_scan", product_id, event_id}`
 * and award XP. That let any authenticated caller mint unlimited XP by
 * replaying product ids with a fresh `event_id` per call, with no analysis ever
 * happening: `recordSuccessfulProductScan` only checks that the product exists
 * and is not a demo, so a scripted client could farm the rate-limit budget
 * (120 req/min -> ~1,200 XP/min) and never scan anything.
 *
 * XP for a scan is now awarded in exactly one place — POST /api/analyze, which
 * can prove the product was actually resolved and analysed — and is returned in
 * that response's `gamification` block. The `Idempotency-Key` header is still
 * honoured there, so HTTP retries of one scan still collapse to one award.
 *
 * Non-scoring activities (ingredient views, meaningful chats) use their own
 * routes: /api/gamification/activity/ingredient-view and /api/chat.
 *
 * The route is kept as an explicit, authenticated 403 rather than a 404 so an
 * older deployed client fails loudly instead of silently losing its reward.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await requireAuth(request);
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      "Self-service product_scan rewards are no longer accepted here. " +
        "Send scan_event_id to POST /api/analyze; the gamification block of that " +
        "response carries the awarded XP.",
      403,
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}