import { NextRequest } from "next/server";
import { claimRewardSchema } from "@/schemas";
import { jsonError, jsonSuccess } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { module4Service } from "@/gamification/protection/protection.service";

export const runtime = "nodejs";

/**
 * POST /api/gamification/rewards/claim
 *
 * The body only names the reward. The store re-derives eligibility from
 * persisted activity inside the transaction, so a client cannot claim a reward
 * it has not earned, and a repeated claim is a no-op rather than a second
 * payout.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const body = await request.json().catch(() => null);
    const parsed = claimRewardSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error, requestId);
    }
    const result = await module4Service.claimReward({
      userId: session.id,
      rewardId: parsed.data.reward_id ?? null,
      userRewardId: parsed.data.user_reward_id ?? null,
    });
    return jsonSuccess(result, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
