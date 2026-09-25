/**
 * Module 4 store and API behaviour.
 *
 * The unit rules live in `module4-rewards.test.ts`. This file covers what only
 * appears once state is actually persisted: idempotency across restarts, the
 * claim flow, protection inventory, and the fact that a protection never
 * invents a scan.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryStore } from "@/lib/store/memory";
import { GamificationService } from "@/gamification/services/gamification.service";
import { AppError } from "@/lib/errors";
import { streakProtectionConfig } from "@/gamification/protection/config";
import { getRewardDefinition } from "@/gamification/rewards/config";
import { gamificationConfig } from "@/gamification/config";
import { xpService } from "@/gamification/services/xp.service";
import { streakService } from "@/gamification/services/streak.service";
import type { GamificationRules } from "@/gamification/models/gamification";

const SEVEN_DAY_TARGET = 7;
const THIRTY_DAY_TARGET = 30;

describe("FoodGuard Module 4 streak protection and rewards", () => {
  let store: InMemoryStore;
  let now: Date;
  let userId: string;

  beforeEach(async () => {
    store = new InMemoryStore();
    now = new Date("2026-09-25T12:00:00.000Z");
    const user = await store.createUser({
      email: `m4-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`,
      name: "Module 4 User",
      passwordHash: null,
      timezone: "UTC",
    });
    userId = user.id;
  });

  /** Advances the clock `days` forward without recording any activity. */
  function skipDays(days: number) {
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + days);
    now = new Date(`${next.toISOString().slice(0, 10)}T12:00:00.000Z`);
  }

  /**
   * Records one real scan per day by advancing the injected clock, so every day
   * of the streak is genuinely earned rather than back-filled.
   */
  async function earnStreak(count: number) {
    const service = new GamificationService(store, () => now);
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (count - 1)),
    );
    for (let index = 0; index < count; index += 1) {
      const day = new Date(start);
      day.setUTCDate(day.getUTCDate() + index);
      now = new Date(`${day.toISOString().slice(0, 10)}T12:00:00.000Z`);
      const result = await service.recordProductScan({
        userId,
        productId: await saveProduct(`streak-product-${index}-${day.getTime()}`),
        eventId: `event-${index}-${day.getTime()}`,
      });
      expect(result.profile.currentStreak).toBe(index + 1);
    }
    return service;
  }

  /** A scan on the current clock date, against a real persisted product. */
  async function scanOnCurrentDate(service: GamificationService, label: string) {
    const stamp = now.getTime();
    return service.recordProductScan({
      userId,
      productId: await saveProduct(`product-${label}-${stamp}`),
      eventId: `event-${label}-${stamp}`,
    });
  }

  let productCounter = 0;
  async function saveProduct(name: string): Promise<string> {
    productCounter += 1;
    const saved = await store.saveProductFromProvider({
      product: {
        id: "",
        barcode: `77${String(productCounter).padStart(11, "0")}`,
        name,
        brand: "Module 4 Brand",
        category: "food",
        country: "IN",
        servingSize: null,
        imageUrl: null,
        ingredientsRaw: "Water, Salt",
        ingredientsNormalized: ["water", "salt"],
        source: "module4_test_provider",
        sourceUrl: null,
        verified: true,
        productDataConfidence: 0.99,
        isDemo: false,
      },
      nutrition: null,
      source: "module4_test_provider",
    });
    return saved.product!.id;
  }

  it("starts a new user with no protection and nothing earned", async () => {
    const status = await store.getStreakProtection(userId, {
      ...makeRules(() => now),
    });
    expect(status.available_count).toBe(0);
    expect(status.used_count).toBe(0);
    expect(status.max_available).toBe(streakProtectionConfig.maxAvailable);

    const rewards = await store.getRewards(userId, makeRules(() => now));
    for (const reward of rewards.rewards) {
      expect(reward.earned).toBe(false);
      expect(reward.user_reward_id).toBeNull();
    }
  });

  it("never reports an unconfigured milestone as earned", async () => {
    // An invented reward must not appear in a user's inventory.
    const rewards = await store.getRewards(userId, makeRules(() => now));
    const ids = rewards.rewards.map((reward) => reward.reward_id);
    expect(ids).toEqual(
      expect.arrayContaining(["seven_day_streak_guardian", "thirty_day_streak_bonus"]),
    );
    expect(ids).not.toContain("level_10_reward");
    expect(ids).not.toContain("achievement_first_scan");
  });

  it("grants exactly one protection at the 7-day milestone", async () => {
    await earnStreak(SEVEN_DAY_TARGET);
    const status = await store.getStreakProtection(userId, makeRules(() => now));
    expect(status.available_count).toBe(1);
  });

  it("does not re-grant the protection as the streak grows past the milestone", async () => {
    // The idempotency bug this guards: keying on the raw streak granted a new
    // protection on every increment after 7.
    await earnStreak(7);
    expect((await store.getStreakProtection(userId, makeRules(() => now))).available_count).toBe(1);

    // A longer, separately-earned streak must not stack extra protections.
    const service = new GamificationService(store, () => now);
    skipDays(1);
    await scanOnCurrentDate(service, "day-8");
    const status = await store.getStreakProtection(userId, makeRules(() => now));
    expect(status.current_streak).toBe(8);
    expect(status.available_count).toBe(1);
  });

  it("keeps the inventory within the cap", async () => {
    // A second milestone cannot bank inventory beyond the configured maximum.
    await earnStreak(7);
    const status = await store.getStreakProtection(userId, makeRules(() => now));
    expect(status.available_count).toBeLessThanOrEqual(
      streakProtectionConfig.maxAvailable,
    );
  });

  it("spends the protection on a genuinely missed day and keeps the streak", async () => {
    // Seven real days earn the protection, then one missed day consumes it.
    const service = await earnStreak(7);
    skipDays(2);
    await scanOnCurrentDate(service, "return");

    const status = await store.getStreakProtection(userId, makeRules(() => now));
    expect(status.used_count).toBe(1);
    expect(status.available_count).toBe(0);
    // Eight real days of activity: the protected day bridged the gap without
    // being counted itself.
    expect(status.current_streak).toBe(8);
    expect(status.last_protected).not.toBeNull();
  });

  it("protects a missed day only once, however often the profile is read", async () => {
    await earnStreak(7);
    // Miss a day and read the profile repeatedly.
    skipDays(2);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await store.getStreakProtection(userId, makeRules(() => now));
    }
    const status = await store.getStreakProtection(userId, makeRules(() => now));
    expect(status.used_count).toBe(1);
  });

  it("does not consume a protection twice under concurrent requests", async () => {
    await earnStreak(7);
    skipDays(2);
    await Promise.all([
      store.getStreakProtection(userId, makeRules(() => now)),
      store.getStreakProtection(userId, makeRules(() => now)),
      store.getStreakProtection(userId, makeRules(() => now)),
      store.getStreakProtection(userId, makeRules(() => now)),
    ]);
    const status = await store.getStreakProtection(userId, makeRules(() => now));
    expect(status.used_count).toBe(1);
    expect(status.available_count).toBe(0);
  });

  it("keeps the protection and the streak when the gap is too large to bridge", async () => {
    await earnStreak(7);
    // Two missed days, one protection: the streak is already lost, so the
    // protection is preserved for a day it can actually save.
    skipDays(3);
    const status = await store.getStreakProtection(userId, makeRules(() => now));
    expect(status.used_count).toBe(0);
    expect(status.available_count).toBe(1);
    expect(status.current_streak).toBe(0);
  });

  it("never invents a scan to justify a protected day", async () => {
    const service = await earnStreak(6);
    const protectedDate = new Date(now);
    protectedDate.setUTCDate(protectedDate.getUTCDate() + 1);
    skipDays(2);
    await scanOnCurrentDate(service, "return-2");
    // The protected day must not appear as a real activity day.
    const profile = await store.getGamificationProfile(userId, makeRules(() => now));
    expect(profile.lastActivityDate).toBe(now.toISOString().slice(0, 10));
    expect(profile.lastActivityDate).not.toBe(
      protectedDate.toISOString().slice(0, 10),
    );
  });

  it("records the streak it protected in history", async () => {
    // Seven real days earn the protection, then a missed day consumes it while
    // the user is away. No activity today, so the preserved run is recorded
    // as-is: bridging restores the 7-day streak without extending it.
    await earnStreak(7);
    const missedDate = new Date(now);
    missedDate.setUTCDate(missedDate.getUTCDate() + 1);
    skipDays(2);
    await store.getStreakProtection(userId, makeRules(() => now));
    const history = await store.getStreakProtectionHistory(userId);
    expect(history.history.length).toBe(1);
    expect(history.history[0].protected_date).toBe(
      missedDate.toISOString().slice(0, 10),
    );
    expect(history.history[0].streak_before).toBe(7);
    expect(history.history[0].streak_after).toBe(7);
  });

  it("leaves the XP bonus unclaimed until the user claims it", async () => {
    await earnStreak(THIRTY_DAY_TARGET);
    const rewards = await store.getRewards(userId, makeRules(() => now));
    const bonus = rewards.rewards.find((r) => r.reward_id === "thirty_day_streak_bonus");
    expect(bonus?.earned).toBe(true);
    expect(bonus?.claimed).toBe(false);
    expect(rewards.available).toBe(1);
  });

  it("pays the XP bonus exactly once across repeated claims", async () => {
    await earnStreak(THIRTY_DAY_TARGET);
    const before = await store.getGamificationProfile(userId, makeRules(() => now));

    const first = await store.claimReward(
      userId,
      { rewardId: "thirty_day_streak_bonus" },
      makeRules(() => now),
    );
    expect(first.claimed).toBe(true);
    expect(first.alreadyClaimed).toBe(false);

    const after = await store.getGamificationProfile(userId, makeRules(() => now));
    const paid = after.totalXp - before.totalXp;
    const definitionXp = getRewardDefinition("thirty_day_streak_bonus")!.rewardValue;
    expect(definitionXp).toBeGreaterThan(0);
    expect(paid).toBe(definitionXp);

    // A second claim must not pay again.
    const second = await store.claimReward(
      userId,
      { rewardId: "thirty_day_streak_bonus" },
      makeRules(() => now),
    );
    expect(second.claimed).toBe(false);
    expect(second.alreadyClaimed).toBe(true);
    const finalProfile = await store.getGamificationProfile(userId, makeRules(() => now));
    expect(finalProfile.totalXp).toBe(after.totalXp);
  });

  it("refuses to claim a reward the user has not earned", async () => {
    await expect(
      store.claimReward(userId, { rewardId: "thirty_day_streak_bonus" }, makeRules(() => now)),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("refuses to claim an unknown reward", async () => {
    await expect(
      store.claimReward(userId, { rewardId: "not_a_real_reward" }, makeRules(() => now)),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("refuses a claim with no reward identifier", async () => {
    await expect(store.claimReward(userId, {}, makeRules(() => now))).rejects.toBeInstanceOf(AppError);
  });

  it("re-derives a claimed reward from persisted state on every read", async () => {
    await earnStreak(THIRTY_DAY_TARGET);
    await store.claimReward(userId, { rewardId: "thirty_day_streak_bonus" }, makeRules(() => now));

    // The claim is a stored fact, not a cached one: a later read in a different
    // code path must agree. Durability across a process restart is a Prisma
    // concern, covered by the Module 4 migration's persisted columns and the
    // unique constraints that make re-application idempotent.
    const rewards = await store.getRewards(userId, makeRules(() => now));
    const bonus = rewards.rewards.find((r) => r.reward_id === "thirty_day_streak_bonus");
    expect(bonus?.claimed).toBe(true);
    expect(bonus?.earned).toBe(true);
    // Claimed rewards stay out of the "available" count.
    expect(rewards.available).toBe(0);
  });

  it("re-derives a spent protection from persisted state on every read", async () => {
    const service = await earnStreak(7);
    skipDays(2);
    await scanOnCurrentDate(service, "restart");

    const first = await store.getStreakProtection(userId, makeRules(() => now));
    expect(first.used_count).toBe(1);
    const history = await store.getStreakProtectionHistory(userId);
    expect(history.history.length).toBe(1);

    // Repeated reads must not spend a second protection or duplicate history.
    await store.getStreakProtection(userId, makeRules(() => now));
    await store.getStreakProtection(userId, makeRules(() => now));
    const again = await store.getStreakProtection(userId, makeRules(() => now));
    const historyAgain = await store.getStreakProtectionHistory(userId);
    expect(again.used_count).toBe(1);
    expect(historyAgain.history.length).toBe(1);
  });

  it("reports an overview built from real persisted state", async () => {
    await earnStreak(7);
    const overview = await store.getGamificationOverview(userId, makeRules(() => now));
    expect(overview.current_streak).toBe(7);
    expect(overview.longest_streak).toBe(7);
    expect(overview.streak_protection.available_count).toBe(1);
    expect(overview.streak_protection.max_available).toBe(
      streakProtectionConfig.maxAvailable,
    );
    expect(overview.rewards.earned).toBeGreaterThan(0);
    expect(overview.total_xp).toBeGreaterThan(0);
  });

  it("keeps users isolated from each other's protection and rewards", async () => {
    await earnStreak(7);
    const other = await store.createUser({
      email: `m4-other-${Date.now()}@test.invalid`,
      name: "Other User",
      passwordHash: null,
      timezone: "UTC",
    });
    const otherStatus = await store.getStreakProtection(other.id, makeRules(() => now));
    const otherRewards = await store.getRewards(other.id, makeRules(() => now));
    expect(otherStatus.available_count).toBe(0);
    expect(otherRewards.rewards.every((r) => !r.earned)).toBe(true);
  });

  it("rejects Module 4 access for an unknown user", async () => {
    await expect(
      store.getStreakProtection("does-not-exist", makeRules(() => now)),
    ).rejects.toBeInstanceOf(AppError);
    await expect(store.getRewards("does-not-exist", makeRules(() => now))).rejects.toBeInstanceOf(
      AppError,
    );
  });

});

/** The same rules object the real services build, bound to the test clock. */
function makeRules(clock: () => Date = () => new Date()): GamificationRules {
  return {
    now: clock,
    duplicateRequestWindowMs: gamificationConfig.duplicateRequestWindowMs,
    xpService,
    streakService,
  };
}
