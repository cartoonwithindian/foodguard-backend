/**
 * Centralized configuration for FoodGuard rewards (Module 4).
 *
 * A reward is a server-owned rule: the real milestone that earns it and what it
 * pays out. Definitions are static configuration -- they describe *what*
 * qualifies, never *that* a particular user qualified, so a definition can
 * never put an entry in a user's inventory on its own.
 */

import { listChallengeDefinitions } from "@/gamification/challenges/config";
import { streakProtectionConfig } from "@/gamification/protection/config";

/** What a reward pays out. Extendable: new types need an applier, not a rewrite. */
export const REWARD_TYPES = [
  "STREAK_PROTECTION",
  "XP_BONUS",
  "ACHIEVEMENT_UNLOCK",
  "CHALLENGE_BONUS",
] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

/**
 * Real, already-persisted state a reward condition may be evaluated against.
 *
 * Only conditions backed by Module 1/3 data are listed. `ACHIEVEMENT_UNLOCK`
 * is intentionally absent: this backend has no achievement service yet, so a
 * condition for it could never be satisfied and would be an invented reward.
 * Add it here when achievements exist rather than shipping a dead rule.
 */
export const REWARD_CONDITION_TYPES = [
  /** Longest streak (Module 1) reached `target` consecutive days. */
  "STREAK_DAYS",
  /** Lifetime XP total (Module 1) reached `target`. */
  "TOTAL_XP",
  /** A completed challenge instance (Module 3). */
  "CHALLENGE_COMPLETION",
] as const;
export type RewardConditionType = (typeof REWARD_CONDITION_TYPES)[number];

export type RewardDefinition = {
  id: string;
  name: string;
  description: string;
  rewardType: RewardType;
  /**
   * `target` is the number the condition must reach. `refId` names the specific
   * item for conditions that are about one thing rather than a count
   * (`CHALLENGE_COMPLETION`); without it such a rule could never be satisfied,
   * so it is required for those types and ignored by the others.
   */
  condition: { type: RewardConditionType; target: number; refId?: string };
  /** Units of `rewardType` granted: protections, or XP for an XP bonus. */
  rewardValue: number;
  /**
   * When true the reward is applied the moment it is earned. When false it sits
   * unclaimed until the user claims it, and the backend re-validates on claim.
   */
  autoClaim: boolean;
  /**
   * One-time rewards can only ever be earned once per user. Repeatable rewards
   * record each distinct milestone separately, keyed by the value reached.
   */
  oneTime: boolean;
};

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = nonNegativeInteger(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function definition(input: Omit<RewardDefinition, "oneTime">): RewardDefinition {
  return Object.freeze({
    ...input,
    condition: Object.freeze({ ...input.condition }),
    oneTime: false,
  });
}

const sevenDayStreakDays = positiveInteger(
  process.env.REWARD_SEVEN_DAY_STREAK_DAYS?.trim(),
  streakProtectionConfig.earning.streakDays,
);

/**
 * Initial reward set. Only milestones this backend can genuinely observe are
 * configured:
 *
 *  - The 7-day streak reward is the earning rule for streak protection, so it
 *    is auto-applied: a protection the user must remember to claim would let a
 *    streak lapse in the meantime.
 *  - The 30-day streak bonus is larger, so it requires an explicit claim. That
 *    gives the claim endpoint a real, reachable unclaimed state to validate.
 *
 * No level or achievement reward is configured because neither system exists
 * here. An unconfigured milestone must not appear in the UI as earned.
 */
const initialRewardDefinitions: readonly RewardDefinition[] = Object.freeze([
  definition({
    id: "seven_day_streak_guardian",
    name: "Streak Guardian",
    description: `Keep a ${sevenDayStreakDays}-day FoodGuard streak to earn a streak protection`,
    rewardType: "STREAK_PROTECTION",
    condition: { type: "STREAK_DAYS", target: sevenDayStreakDays },
    rewardValue: 1,
    autoClaim: true,
  }),
  definition({
    id: "thirty_day_streak_bonus",
    name: "Streak Champion",
    description: "Reach a 30-day FoodGuard streak to claim a bonus",
    rewardType: "XP_BONUS",
    condition: { type: "STREAK_DAYS", target: 30 },
    rewardValue: nonNegativeInteger(process.env.REWARD_THIRTY_DAY_XP_BONUS, 250),
    autoClaim: false,
  }),
]);

export const rewardsConfig = Object.freeze({
  definitions: initialRewardDefinitions,
  supportedRewardTypes: REWARD_TYPES,
  supportedConditionTypes: REWARD_CONDITION_TYPES,
  /** Newest rows returned by the history endpoints. */
  historyLimit: nonNegativeInteger(process.env.REWARD_HISTORY_LIMIT, 50),
});

export function listRewardDefinitions(): RewardDefinition[] {
  return [...rewardsConfig.definitions];
}

export function getRewardDefinition(id: string): RewardDefinition | null {
  const key = id?.trim();
  if (!key) return null;
  return rewardsConfig.definitions.find((entry) => entry.id === key) ?? null;
}

/** Runtime guard for a condition type read back from storage. */
export function isSupportedRewardConditionType(value: unknown): value is RewardConditionType {
  return (
    typeof value === "string" &&
    (REWARD_CONDITION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Challenge-completion rewards are intentionally not configured: Module 3
 * already pays challenge XP automatically, so a second grant here would
 * double-pay. This helper reports the challenges that could back such a rule,
 * so the definitions stay honest about what is already automatic.
 */
export function alreadyAutomaticChallengeIds(): string[] {
  return listChallengeDefinitions()
    .filter((challenge) => challenge.rewardXp > 0)
    .map((challenge) => challenge.id);
}
