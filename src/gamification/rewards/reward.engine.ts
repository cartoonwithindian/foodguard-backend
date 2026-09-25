/**
 * Pure evaluation for FoodGuard rewards (Module 4).
 *
 * Everything here is a function of already-persisted state. It never reads a
 * request, never decides that a user "claims" anything, and never mutates:
 * the store applies the result inside its transaction. Keeping the decision
 * pure is what lets the Prisma and in-memory stores share one rule set instead
 * of drifting apart.
 */

import {
  getRewardDefinition,
  listRewardDefinitions,
  type RewardDefinition,
} from "@/gamification/rewards/config";
import type { RewardEvaluationContext, RewardView } from "@/gamification/models/rewards";

export type EarnedMilestone = {
  userRewardId: string;
  rewardId: string;
  milestoneKey: string;
  earnedAt: string;
  claimed: boolean;
  claimedAt: string | null;
};

/**
 * The idempotency anchor for a milestone.
 *
 * A one-time reward keys on the reward id alone, so it can be earned exactly
 * once. A repeatable reward keys on the *threshold that was crossed*, not on
 * the raw observation.
 *
 * That distinction matters: a 7-day reward is still 7 days when the user
 * reaches 8, 9, or 13. Keying on the raw streak would hand out a fresh reward
 * on every single increment after the target. Bucketing down to the nearest
 * multiple of the target means each threshold grants exactly once, and a longer
 * streak is a new milestone rather than a replay of the last one.
 */
export function milestoneKeyFor(
  definition: RewardDefinition,
  milestoneValue: number,
): string {
  if (definition.oneTime) return definition.id;
  const step = definition.condition.target;
  if (step <= 1) return `${definition.id}:${milestoneValue}`;
  const bucket = Math.max(step, Math.floor(milestoneValue / step) * step);
  return `${definition.id}:${bucket}`;
}

/** Observed value of a reward's condition against real persisted state. */
export function observeCondition(
  definition: RewardDefinition,
  context: RewardEvaluationContext,
): number | null {
  switch (definition.condition.type) {
    case "STREAK_DAYS":
      return context.profile.longestStreak;
    case "TOTAL_XP":
      return context.profile.totalXp;
    case "CHALLENGE_COMPLETION": {
      // Scoped to `refId`, never to the reward's own id: a reward id and a
      // challenge id are different namespaces, so comparing them would make
      // the rule permanently unsatisfiable.
      const refId = definition.condition.refId;
      if (!refId) return null;
      return context.completedChallengeIds.includes(refId) ? 1 : 0;
    }
    default:
      return null;
  }
}

export function isEligible(
  definition: RewardDefinition,
  context: RewardEvaluationContext,
): boolean {
  const observed = observeCondition(definition, context);
  if (observed === null) return false;
  return observed >= definition.condition.target;
}

/**
 * Every milestone the user has genuinely reached. The caller drops the ones
 * already recorded and persists the rest inside a transaction, where the
 * unique milestone key turns a concurrent duplicate into a no-op.
 */
export function pendingMilestones(
  context: RewardEvaluationContext,
): Array<{ definition: RewardDefinition; milestoneKey: string; milestoneValue: number }> {
  const pending: Array<{
    definition: RewardDefinition;
    milestoneKey: string;
    milestoneValue: number;
  }> = [];
  for (const definition of listRewardDefinitions()) {
    if (!isEligible(definition, context)) continue;
    const milestoneValue = observeCondition(definition, context) ?? 0;
    pending.push({
      definition,
      milestoneKey: milestoneKeyFor(definition, milestoneValue),
      milestoneValue,
    });
  }
  return pending;
}

/** Rewards left for the user to claim: earned, unclaimed, claim-required. */
export function claimableCount(rewards: RewardView[]): number {
  return rewards.filter((reward) => reward.earned && !reward.claimed && reward.requires_claim)
    .length;
}

export function toRewardView(
  definition: RewardDefinition,
  context: RewardEvaluationContext,
  earned: EarnedMilestone | null,
): RewardView {
  const observed = observeCondition(definition, context);
  return {
    user_reward_id: earned?.userRewardId ?? null,
    reward_id: definition.id,
    name: definition.name,
    description: definition.description,
    reward_type: definition.rewardType,
    condition_type: definition.condition.type,
    target: definition.condition.target,
    progress: observed ?? 0,
    eligible: isEligible(definition, context),
    earned: Boolean(earned),
    claimed: earned?.claimed ?? false,
    claimed_at: earned?.claimedAt ?? null,
    earned_at: earned?.earnedAt ?? null,
    reward_value: definition.rewardValue,
    requires_claim: !definition.autoClaim,
  };
}

export { getRewardDefinition, listRewardDefinitions };
