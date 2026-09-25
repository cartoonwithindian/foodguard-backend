/**
 * Shared contracts for the FoodGuard streak protection + rewards module.
 *
 * The database remains authoritative. Nothing here carries a client-supplied
 * protection count, reward amount, or claim state: the client asks "what is my
 * state" and renders the answer.
 */

import type { GamificationProfileRecord } from "@/gamification/models/gamification";
import type { RewardDefinition, RewardType } from "@/gamification/rewards/config";
import type { ProtectionReason } from "@/gamification/protection/config";

export type StreakProtectionState = {
  userId: string;
  availableCount: number;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StreakProtectionUsageRecord = {
  usageId: string;
  userId: string;
  protectedDate: string;
  streakBefore: number;
  streakAfter: number;
  usedAt: string;
  reason: string;
};

/** GET /gamification/streak-protection */
export type StreakProtectionStatus = {
  available_count: number;
  used_count: number;
  max_available: number;
  /** Streak currently held, including any bridged day. */
  current_streak: number;
  /**
   * Most recent protection the backend consumed, or null when none was used.
   * Drives the "Streak Protected" notice; absent means nothing happened.
   */
  last_protected: {
    protected_date: string;
    used_at: string;
    reason: string;
  } | null;
};

export type StreakProtectionHistoryResult = {
  history: Array<{
    protected_date: string;
    streak_before: number;
    streak_after: number;
    used_at: string;
    reason: string;
  }>;
};

export type RewardRecord = {
  userRewardId: string;
  userId: string;
  rewardId: string;
  milestoneKey: string;
  earnedAt: string;
  claimed: boolean;
  claimedAt: string | null;
};

/** A configured reward plus this user's real progress toward it. */
export type RewardView = {
  user_reward_id: string | null;
  reward_id: string;
  name: string;
  description: string;
  reward_type: RewardType;
  condition_type: string;
  target: number;
  /** Observed value of the condition, e.g. the user's longest streak. */
  progress: number;
  eligible: boolean;
  earned: boolean;
  claimed: boolean;
  claimed_at: string | null;
  earned_at: string | null;
  /** XP amount or protection count this reward pays out. */
  reward_value: number;
  requires_claim: boolean;
};

export type RewardListResult = {
  rewards: RewardView[];
  available: number;
  earned: number;
  claimed: number;
};

/** A milestone event that produced (or failed to produce) a reward grant. */
export type RewardEvaluationOutcome = {
  definitionId: string;
  /** False when the reward had already been recorded for this milestone. */
  granted: boolean;
  autoClaimed: boolean;
  reason: "granted" | "already_recorded" | "not_eligible" | "cap_reached";
};

export type GamificationOverview = {
  total_xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  achievements: Record<string, unknown>;
  challenges: Record<string, unknown>;
  streak_protection: {
    available_count: number;
    max_available: number;
    used_count: number;
  };
  rewards: {
    available: number;
    earned: number;
  };
};

/**
 * Real state the reward engine evaluates against. Built by the store from
 * persisted Module 1 / Module 3 rows so a reward can never be granted from
 * client input.
 */
export type RewardEvaluationContext = {
  userId: string;
  now: Date;
  profile: GamificationProfileRecord;
  /** Challenge ids the user has genuinely completed (Module 3). */
  completedChallengeIds: readonly string[];
  definitions: readonly RewardDefinition[];
};

export type ClaimRewardResult = {
  reward: RewardView;
  /** False when the reward was already claimed -- a retry, not an error. */
  claimed: boolean;
  alreadyClaimed: boolean;
};

export type { ProtectionReason, RewardDefinition, RewardType };
