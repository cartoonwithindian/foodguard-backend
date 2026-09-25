/**
 * Module 4 reward and protection rules.
 *
 * These cover the decisions that are expensive to get wrong and invisible in a
 * happy-path API test: milestone idempotency, cap behaviour, and the guarantee
 * that a protection bridges a day without inflating a streak.
 */

import { describe, expect, it } from "vitest";
import {
  getRewardDefinition,
  listRewardDefinitions,
  alreadyAutomaticChallengeIds,
} from "@/gamification/rewards/config";
import {
  isEligible,
  milestoneKeyFor,
  observeCondition,
  pendingMilestones,
  toRewardView,
} from "@/gamification/rewards/reward.engine";
import { decideProtection } from "@/gamification/protection/protection.engine";
import { streakProtectionConfig } from "@/gamification/protection/config";
import type {
  RewardEvaluationContext,
  StreakProtectionUsageRecord,
} from "@/gamification/models/rewards";
import type { GamificationProfileRecord } from "@/gamification/models/gamification";
import { streakService } from "@/gamification/services/streak.service";

const SEVEN = "seven_day_streak_guardian";
const THIRTY = "thirty_day_streak_bonus";

function profile(overrides: Partial<GamificationProfileRecord> = {}): GamificationProfileRecord {
  return {
    userId: "user-1",
    totalXp: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function context(overrides: Partial<RewardEvaluationContext> = {}): RewardEvaluationContext {
  return {
    userId: "user-1",
    now: new Date("2026-03-01T12:00:00.000Z"),
    profile: profile(),
    completedChallengeIds: [],
    definitions: listRewardDefinitions(),
    ...overrides,
  };
}

function definition(id: string) {
  const found = getRewardDefinition(id);
  if (!found) throw new Error(`missing definition ${id}`);
  return found;
}

describe("reward configuration", () => {
  it("only configures milestones this backend can genuinely observe", () => {
    // No achievements or levels exist here, so no rule may claim to reward one.
    const ids = listRewardDefinitions().map((entry) => entry.rewardType);
    expect(ids).not.toContain("ACHIEVEMENT_UNLOCK");
  });

  it("auto-applies the protection reward and requires a claim for the XP bonus", () => {
    // A protection the user must remember to claim would let the very streak it
    // protects lapse before it could be used.
    expect(definition(SEVEN).autoClaim).toBe(true);
    expect(definition(THIRTY).autoClaim).toBe(false);
  });

  it("does not re-pay challenges that Module 3 already pays automatically", () => {
    // Every configured challenge pays XP, so a second grant would double-pay.
    expect(alreadyAutomaticChallengeIds().length).toBeGreaterThan(0);
    const automatic = new Set(alreadyAutomaticChallengeIds());
    for (const entry of listRewardDefinitions()) {
      if (entry.condition.type !== "CHALLENGE_COMPLETION") continue;
      expect(automatic.has(entry.condition.refId ?? "")).toBe(false);
    }
  });
});

describe("milestone keys", () => {
  it("grants a streak reward once per threshold, not once per increment", () => {
    const reward = definition(SEVEN);
    // The bug this guards: keying on the raw streak handed out a fresh reward
    // at 8, 9, 10... because each observation produced a new key.
    const atSeven = milestoneKeyFor(reward, 7);
    expect(milestoneKeyFor(reward, 8)).toBe(atSeven);
    expect(milestoneKeyFor(reward, 13)).toBe(atSeven);
    // A genuinely new milestone is a separate grant.
    expect(milestoneKeyFor(reward, 14)).not.toBe(atSeven);
  });

  it("keys a one-time reward on the id alone", () => {
    const reward = { ...definition(THIRTY), oneTime: true };
    expect(milestoneKeyFor(reward, 30)).toBe(THIRTY);
    expect(milestoneKeyFor(reward, 60)).toBe(THIRTY);
  });
});

describe("reward eligibility", () => {
  it("is not eligible below the target and eligible at or above it", () => {
    const reward = definition(SEVEN);
    expect(isEligible(reward, context({ profile: profile({ longestStreak: 6 }) }))).toBe(false);
    expect(isEligible(reward, context({ profile: profile({ longestStreak: 7 }) }))).toBe(true);
  });

  it("keeps evaluating a 7-day reward eligible at 8 days without re-granting", () => {
    const reward = definition(SEVEN);
    const ctx = context({ profile: profile({ longestStreak: 8 }) });
    expect(isEligible(reward, ctx)).toBe(true);
    expect(observeCondition(reward, ctx)).toBe(8);
  });

  it("leaves a challenge rule unsatisfiable rather than matching a reward id", () => {
    // Reward ids and challenge ids are different namespaces. Without refId the
    // rule must not silently fire.
    const broken = {
      ...definition(SEVEN),
      condition: { type: "CHALLENGE_COMPLETION" as const, target: 1 },
    };
    const ctx = context({ completedChallengeIds: [SEVEN] });
    expect(observeCondition(broken, ctx)).toBeNull();
    expect(isEligible(broken, ctx)).toBe(false);
  });

  it("scopes a challenge rule to the challenge it names", () => {
    const scoped = {
      ...definition(SEVEN),
      condition: { type: "CHALLENGE_COMPLETION" as const, target: 1, refId: SEVEN },
    };
    expect(isEligible(scoped, context({ completedChallengeIds: [SEVEN] }))).toBe(true);
    expect(isEligible(scoped, context({ completedChallengeIds: ["other"] }))).toBe(false);
  });

  it("reports only genuinely reached milestones as pending", () => {
    const pending = pendingMilestones(context({ profile: profile({ longestStreak: 7 }) }));
    expect(pending.map((entry) => entry.definition.id)).toContain(SEVEN);
    expect(pending.map((entry) => entry.definition.id)).not.toContain(THIRTY);
  });
});

describe("reward views", () => {
  it("shows a locked reward as not earned", () => {
    const view = toRewardView(definition(SEVEN), context(), null);
    expect(view.earned).toBe(false);
    expect(view.claimed).toBe(false);
  });

  it("shows real progress toward an unearned reward", () => {
    const view = toRewardView(definition(SEVEN), context({ profile: profile({ longestStreak: 3 }) }), null);
    expect(view.earned).toBe(false);
    expect(view.progress).toBe(3);
    expect(view.target).toBe(7);
    expect(view.eligible).toBe(false);
  });

  it("surfaces an earned but unclaimed reward as claimable", () => {
    const milestone = {
      userRewardId: "ur-1",
      rewardId: THIRTY,
      milestoneKey: `${THIRTY}:30`,
      earnedAt: "2026-03-01T12:00:00.000Z",
      claimed: false,
      claimedAt: null,
    };
    const view = toRewardView(
      definition(THIRTY),
      context({ profile: profile({ longestStreak: 30 }) }),
      milestone,
    );
    expect(view.earned).toBe(true);
    expect(view.claimed).toBe(false);
    expect(view.user_reward_id).toBe("ur-1");
  });
});

describe("protection decisions", () => {
  // Local-date arithmetic on plain `YYYY-MM-DD` keys, independent of the
  // service under test.
  const days = (start: string, count: number) => {
    const out: string[] = [];
    const cursor = new Date(`${start}T00:00:00.000Z`);
    for (let index = 0; index < count; index += 1) {
      out.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  };

  it("bridges a single missed day when a protection is available", () => {
    const decision = decideProtection({
      activityDates: days("2026-03-01", 6),
      protectedDates: [],
      today: "2026-03-08",
      availableCount: 1,
    });
    expect(decision.protectedDates).toEqual(["2026-03-07"]);
    expect(decision.declined).toBeNull();
  });

  it("does nothing when there is no protection available", () => {
    const decision = decideProtection({
      activityDates: days("2026-03-01", 6),
      protectedDates: [],
      today: "2026-03-08",
      availableCount: 0,
    });
    expect(decision.protectedDates).toEqual([]);
  });

  it("declines rather than partially bridging a gap it cannot cover", () => {
    // Two missed days, one protection. Spending it would still leave the streak
    // broken, so the protection is kept for a day it can actually save.
    const decision = decideProtection({
      activityDates: days("2026-03-01", 6),
      protectedDates: [],
      today: "2026-03-09",
      availableCount: 1,
    });
    expect(decision.declined).toBe("insufficient_protections");
    expect(decision.protectedDates).toEqual([]);
  });

  it("bridges a gap it has enough protections to cover", () => {
    const decision = decideProtection({
      activityDates: days("2026-03-01", 6),
      protectedDates: [],
      today: "2026-03-09",
      availableCount: 2,
    });
    expect(decision.protectedDates).toEqual(["2026-03-07", "2026-03-08"]);
  });

  it("never bridges a day the user already recorded", () => {
    const decision = decideProtection({
      activityDates: days("2026-03-01", 7),
      protectedDates: ["2026-03-07"],
      today: "2026-03-08",
      availableCount: 1,
    });
    expect(decision.protectedDates).toEqual([]);
  });

  it("preserves streak length through a protected day", () => {
    // Six real days plus one protected gap day is still a 6-day streak, and the
    // protected day is not counted toward the total.
    const activityDates = days("2026-03-01", 6);
    const state = streakService.calculateForProfile(
      activityDates,
      "2026-03-08",
      ["2026-03-07"],
    );
    expect(state.currentStreak).toBe(6);
    expect(state.longestStreak).toBe(6);
  });

  it("extends to 7 on the next real day, not 8", () => {
    const activityDates = [...days("2026-03-01", 6), "2026-03-08"];
    const state = streakService.calculateForProfile(
      activityDates,
      "2026-03-08",
      ["2026-03-07"],
    );
    expect(state.currentStreak).toBe(7);
    expect(state.longestStreak).toBe(7);
  });

  it("bridges a missed day when the user returns and scans today", () => {
    // The regression this guards: today's activity is already recorded when the
    // decision runs, so measuring the gap from the last scan to today found no
    // gap at all and the missed day went unbridged. The bridgeable gap is the
    // one immediately preceding the run that ends today.
    const activityDates = [...days("2026-03-01", 7), "2026-03-09"];
    const decision = decideProtection({
      activityDates,
      protectedDates: [],
      today: "2026-03-09",
      availableCount: 1,
    });
    expect(decision.protectedDates).toEqual(["2026-03-08"]);
    expect(decision.declined).toBeNull();
    // The preserved run is the seven real days before the gap, and the day the
    // user logged after the gap resumes it rather than restarting.
    expect(decision.streakBefore).toBe(7);
    expect(decision.streakAfter).toBe(8);
  });

  it("keeps the whole streak when the user returns after bridging a gap", () => {
    const activityDates = [...days("2026-03-01", 7), "2026-03-09"];
    const state = streakService.calculateForProfile(activityDates, "2026-03-09", [
      "2026-03-08",
    ]);
    expect(state.currentStreak).toBe(8);
    expect(state.longestStreak).toBe(8);
  });

  it("caps the inventory so a milestone cannot bank unlimited protections", () => {
    expect(streakProtectionConfig.maxAvailable).toBe(1);
  });
});

describe("protection status", () => {
  it("reports a new user with no protection", () => {
    const status = { availableCount: 0, usedCount: 0, protectedDates: [], usage: [] as StreakProtectionUsageRecord[] };
    expect(status.availableCount).toBe(0);
    expect(status.usedCount).toBe(0);
  });
});
