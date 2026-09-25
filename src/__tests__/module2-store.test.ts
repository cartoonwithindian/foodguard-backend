/**
 * Module 2 store behaviour.
 *
 * The pure rules live in `module2-levels.test.ts` and
 * `module2-achievements.test.ts`. This file covers what only appears once state
 * is actually persisted: that an unlock is recorded and paid exactly once, that
 * repeated reads never pay twice, that a level crossing is reported from the
 * call that caused it, and that the counters behind the rules come from real
 * activity rather than anything a caller can assert.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryStore } from "@/lib/store/memory";
import { GamificationService } from "@/gamification/services/gamification.service";
import { ChallengeService } from "@/gamification/challenges/challenge.service";
import { AppError } from "@/lib/errors";
import { gamificationConfig } from "@/gamification/config";
import { getAchievementDefinition } from "@/gamification/achievements/config";
import { xpService } from "@/gamification/services/xp.service";
import { streakService } from "@/gamification/services/streak.service";
import type { GamificationRules } from "@/gamification/models/gamification";
import type { ProductInfo } from "@/types/domain";

const FIRST_SCAN_XP = getAchievementDefinition("first_scan")!.rewardXp;
const FIRST_SCAN_TOTAL =
  gamificationConfig.successfulScanXp + gamificationConfig.uniqueProductXp + FIRST_SCAN_XP;
/** Cumulative XP that opens level 2. */
const LEVEL_TWO_XP = 100;

function fixtureProduct(barcode: string, name: string): ProductInfo {
  return {
    id: "",
    barcode,
    name,
    brand: "Module 2 Store Brand",
    category: "food",
    country: "IN",
    servingSize: null,
    imageUrl: null,
    ingredientsRaw: "Water, Salt",
    ingredientsNormalized: ["water", "salt"],
    source: "module2_store_provider",
    sourceUrl: null,
    verified: true,
    productDataConfidence: 0.99,
    isDemo: false,
  };
}

describe("FoodGuard Module 2 levels and achievements", () => {
  let store: InMemoryStore;
  let now: Date;
  let userId: string;
  let gamification: GamificationService;
  let challenges: ChallengeService;
  let productCounter = 0;

  beforeEach(async () => {
    store = new InMemoryStore();
    now = new Date("2026-09-20T12:00:00.000Z");
    gamification = new GamificationService(store, () => now);
    challenges = new ChallengeService(store, () => now);
    const user = await store.createUser({
      email: `m2-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`,
      name: "Module 2 User",
      passwordHash: null,
      timezone: "UTC",
    });
    userId = user.id;
  });

  /** A real persisted product, so every scan or view points at a real row. */
  async function saveProduct(name: string): Promise<string> {
    productCounter += 1;
    const saved = await store.saveProductFromProvider({
      product: fixtureProduct(`55${String(productCounter).padStart(11, "0")}`, name),
      nutrition: null,
      source: "module2_store_provider",
    });
    return saved.product!.id;
  }

  /** Moves the injected clock to the next local day, recording no activity. */
  function nextDay() {
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + 1);
    now = new Date(`${next.toISOString().slice(0, 10)}T12:00:00.000Z`);
  }

  async function achievementState(target = userId) {
    return store.getAchievementState(target, makeRules(() => now));
  }

  function viewOf(
    state: Awaited<ReturnType<typeof achievementState>>,
    achievementId: string,
  ) {
    const found = state.achievements.achievements.find(
      (view) => view.achievement_id === achievementId,
    );
    if (!found) throw new Error(`missing achievement ${achievementId}`);
    return found;
  }

  it("starts a new user at level 1 with every achievement locked", async () => {
    const state = await achievementState();
    expect(state.level).toMatchObject({
      level: 1,
      total_xp: 0,
      level_xp: 0,
      next_level_xp: LEVEL_TWO_XP,
      xp_to_next_level: LEVEL_TWO_XP,
      is_max_level: false,
    });
    expect(state.achievements.total).toBe(8);
    expect(state.achievements.unlocked).toBe(0);
    expect(state.achievements.achievements.every((view) => !view.unlocked && view.unlocked_at === null)).toBe(true);
    expect(state.leveled_up).toBe(false);
    expect(state.level_up).toBeNull();
    expect(state.newly_unlocked).toEqual([]);
  });

  it("rejects an unknown user", async () => {
    await expect(achievementState("does-not-exist")).rejects.toBeInstanceOf(AppError);
  });

  it("unlocks first_scan on the first real scan and pays it exactly once", async () => {
    const productId = await saveProduct("Module 2 Product A");
    const scan = await gamification.recordProductScan({
      userId,
      productId,
      eventId: "module-2-first-scan",
    });
    // The scan reports the unlock the same transaction made, so the client
    // never has to derive it.
    expect(scan.newly_unlocked?.map((view) => view.achievement_id)).toEqual(["first_scan"]);
    expect(scan.level?.total_xp).toBe(FIRST_SCAN_TOTAL);

    const state = await achievementState();
    expect(state.level.total_xp).toBe(FIRST_SCAN_TOTAL);
    expect(state.level.level).toBe(1);
    expect(state.achievements.unlocked).toBe(1);
    expect(viewOf(state, "first_scan")).toMatchObject({
      unlocked: true,
      progress: 1,
      reward_xp: FIRST_SCAN_XP,
    });
    expect(viewOf(state, "first_scan").unlocked_at).toBe(now.toISOString());
    // Paid once, on top of the scan and unique-product XP.
    expect(state.level.total_xp).toBe(
      gamificationConfig.successfulScanXp + gamificationConfig.uniqueProductXp + FIRST_SCAN_XP,
    );
  });

  it("does not re-pay or re-add the unlock on a second read", async () => {
    await gamification.recordProductScan({
      userId,
      productId: await saveProduct("Module 2 Product A"),
      eventId: "module-2-read-once",
    });
    const first = await achievementState();
    const firstUnlockedAt = viewOf(first, "first_scan").unlocked_at;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const again = await achievementState();
      expect(again.level.total_xp).toBe(FIRST_SCAN_TOTAL);
      expect(again.achievements.unlocked).toBe(1);
      expect(again.achievements.total).toBe(8);
      expect(again.newly_unlocked).toEqual([]);
      expect(again.leveled_up).toBe(false);
      expect(again.level_up).toBeNull();
      expect(viewOf(again, "first_scan").unlocked_at).toBe(firstUnlockedAt);
    }
  });

  it("reports a level-up from the call whose achievement payout crossed the boundary", async () => {
    // 85 XP of real scan, chat, and ingredient activity, then the
    // `curious_mind` payout is the single change that crosses 100 XP.
    const products: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      products.push(await saveProduct(`Module 2 Cross Product ${index}`));
    }
    await gamification.recordProductScan({
      userId,
      productId: products[0],
      eventId: "module-2-cross-scan",
    });
    for (let index = 0; index < 3; index += 1) {
      await askAboutProduct(products[index], `Is product ${index} safe to eat every day?`);
    }
    expect((await store.getGamificationProfile(userId, makeRules(() => now))).totalXp).toBeLessThan(
      LEVEL_TWO_XP,
    );

    nextDay();
    for (let index = 3; index < 5; index += 1) {
      await askAboutProduct(products[index], `Does product ${index} contain added sugar?`);
    }
    await challenges.recordIngredientView({
      userId,
      productId: products[0],
      eventId: "module-2-cross-view-a",
    });
    await challenges.recordIngredientView({
      userId,
      productId: products[1],
      eventId: "module-2-cross-view-b",
    });
    const before = await store.getGamificationProfile(userId, makeRules(() => now));
    expect(before.totalXp).toBeLessThan(LEVEL_TWO_XP);
    expect(before.currentStreak).toBe(1);

    const state = await achievementState();
    expect(state.newly_unlocked).toEqual(["curious_mind"]);
    expect(state.leveled_up).toBe(true);
    expect(state.level_up).toEqual({
      from_level: 1,
      to_level: 2,
      total_xp: before.totalXp + getAchievementDefinition("curious_mind")!.rewardXp,
    });
    expect(state.level.level).toBe(2);
    expect(state.level.level_xp).toBe(LEVEL_TWO_XP);
    expect(state.level.current_level_xp).toBe(state.level.total_xp - LEVEL_TWO_XP);
  });

  it("stops reporting a level-up once the boundary is behind the user", async () => {
    await gamification.recordProductScan({
      userId,
      productId: await saveProduct("Module 2 Product B"),
      eventId: "module-2-level-once-a",
    });
    nextDay();
    await gamification.recordProductScan({
      userId,
      productId: await saveProduct("Module 2 Product C"),
      eventId: "module-2-level-once-b",
    });
    nextDay();
    await gamification.recordProductScan({
      userId,
      productId: await saveProduct("Module 2 Product D"),
      eventId: "module-2-level-once-c",
    });
    const settled = await achievementState();
    expect(settled.level.level).toBe(2);
    const totalAfterLevelUp = settled.level.total_xp;

    // The level-up was real, but only the call that crossed it may report it.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const again = await achievementState();
      expect(again.leveled_up).toBe(false);
      expect(again.level_up).toBeNull();
      expect(again.newly_unlocked).toEqual([]);
      expect(again.level.total_xp).toBe(totalAfterLevelUp);
      expect(again.level.level).toBe(2);
    }
  });

  it("counts only real activity toward a condition", async () => {
    const productId = await saveProduct("Module 2 Product E");
    await gamification.recordProductScan({ userId, productId, eventId: "module-2-count-scan-a" });
    // The same product again is one unique product, not two.
    await gamification.recordProductScan({ userId, productId, eventId: "module-2-count-scan-b" });
    // A greeting is not a meaningful product question and must not be recorded.
    expect(
      await challenges.recordMeaningfulChat({ userId, productId, message: "hi" }),
    ).toBeNull();
    await askAboutProduct(productId, "Does this product contain milk?");

    const state = await achievementState();
    expect(viewOf(state, "first_scan")).toMatchObject({ unlocked: true, progress: 1 });
    expect(viewOf(state, "food_explorer")).toMatchObject({
      unlocked: false,
      progress: 1,
      target: 10,
      progress_ratio: 0.1,
    });
    expect(viewOf(state, "curious_mind")).toMatchObject({ unlocked: false, progress: 1 });
    expect(viewOf(state, "ingredient_inspector")).toMatchObject({ unlocked: false, progress: 0 });
    // The one real question completed one real daily challenge, which is honest
    // progress toward the 5-challenge milestone and not yet the milestone.
    expect(viewOf(state, "challenge_champion")).toMatchObject({
      unlocked: false,
      progress: 1,
      target: 5,
    });
    // The XP milestone observes exactly the authoritative total the level is
    // derived from, payouts included.
    expect(viewOf(state, "century_club")).toMatchObject({ unlocked: false });
    expect(viewOf(state, "century_club").progress).toBe(state.level.total_xp);
    // Nothing was fabricated: only the milestones these rows genuinely reached.
    expect(state.achievements.unlocked).toBe(1);
  });

  it("derives a challenge-count achievement from real completions", async () => {
    const products: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      products.push(await saveProduct(`Module 2 Champion Product ${index}`));
    }
    for (let index = 0; index < 3; index += 1) {
      await gamification.recordProductScan({
        userId,
        productId: products[index],
        eventId: `module-2-champion-scan-${index}`,
      });
    }
    // One completed daily challenge is real progress, not the target of 5.
    const state = await achievementState();
    expect(viewOf(state, "challenge_champion")).toMatchObject({
      unlocked: false,
      progress: 1,
      target: 5,
    });
  });

  it("keeps one user's achievements out of another user's collection", async () => {
    await gamification.recordProductScan({
      userId,
      productId: await saveProduct("Module 2 Product F"),
      eventId: "module-2-isolation-scan",
    });
    const other = await store.createUser({
      email: `m2-other-${Date.now()}@test.invalid`,
      name: "Other Module 2 User",
      passwordHash: null,
      timezone: "UTC",
    });
    const otherState = await achievementState(other.id);
    expect(otherState.level.total_xp).toBe(0);
    expect(otherState.achievements.unlocked).toBe(0);
    expect(otherState.achievements.achievements.every((view) => !view.unlocked)).toBe(true);
  });

  it("does not consume a protection or streak to report a level", async () => {
    // Module 2 reads the profile; it must not rewrite the streak Module 1 owns.
    await gamification.recordProductScan({
      userId,
      productId: await saveProduct("Module 2 Product G"),
      eventId: "module-2-streak-scan",
    });
    const profile = await store.getGamificationProfile(userId, makeRules(() => now));
    expect(profile).toMatchObject({
      totalXp: FIRST_SCAN_TOTAL,
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: "2026-09-20",
    });
  });

  /** A real product question, which is what the chat rule actually accepts. */
  async function askAboutProduct(productId: string, message: string) {
    const result = await challenges.recordMeaningfulChat({ userId, productId, message });
    expect(result).not.toBeNull();
  }
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
