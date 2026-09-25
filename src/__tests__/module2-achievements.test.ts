/**
 * Module 2 achievement rules.
 *
 * The engine is pure: it reads already-persisted state and decides nothing
 * about persistence. These tests cover the decisions that are cheap to get
 * wrong and invisible in a happy-path API test -- which counter feeds which
 * rule, that a met condition is not the same thing as a recorded unlock, and
 * that a locked achievement still reports honest progress instead of being
 * hidden or faked as earned.
 */

import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_CONDITION_TYPES,
  getAchievementDefinition,
  listAchievementDefinitions,
  type AchievementConditionType,
} from "@/gamification/achievements/config";
import {
  achievementViews,
  isUnlocked,
  levelUpBetween,
  observeCondition,
  pendingUnlocks,
  progressRatio,
  summarizeAchievements,
  toAchievementView,
  toLevelView,
  type AchievementContext,
} from "@/gamification/achievements/achievement.engine";
import type { AchievementRecord } from "@/gamification/models/achievements";

/** Which context counter each condition type is allowed to observe. */
const COUNTER_FOR_CONDITION = {
  UNIQUE_PRODUCTS_SCANNED: "uniqueProductsScanned",
  TOTAL_XP: "totalXp",
  LONGEST_STREAK: "longestStreak",
  INGREDIENT_VIEWS: "ingredientViews",
  MEANINGFUL_CHATS: "meaningfulChats",
  CHALLENGES_COMPLETED: "challengesCompleted",
} as const satisfies Record<AchievementConditionType, keyof AchievementContext>;

function context(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    userId: "user-1",
    now: new Date("2026-09-20T12:00:00.000Z"),
    totalXp: 0,
    longestStreak: 0,
    uniqueProductsScanned: 0,
    ingredientViews: 0,
    meaningfulChats: 0,
    challengesCompleted: 0,
    unlocked: [],
    ...overrides,
  };
}

function definition(id: string) {
  const found = getAchievementDefinition(id);
  if (!found) throw new Error(`missing definition ${id}`);
  return found;
}

function record(achievementId: string, overrides: Partial<AchievementRecord> = {}): AchievementRecord {
  return {
    achievementId,
    userId: "user-1",
    unlockedAt: "2026-09-20T12:00:00.000Z",
    xpAwarded: definition(achievementId).rewardXp,
    ...overrides,
  };
}

/** A context where exactly one condition type reports progress. */
function onlyCounter(counter: keyof AchievementContext, value: number): AchievementContext {
  return context({ [counter]: value });
}

describe("achievement catalogue", () => {
  it("configures the documented set of achievements", () => {
    expect(
      listAchievementDefinitions().map((entry) => [
        entry.id,
        entry.condition.type,
        entry.condition.target,
        entry.rewardXp,
      ]),
    ).toEqual([
      ["first_scan", "UNIQUE_PRODUCTS_SCANNED", 1, 10],
      ["food_explorer", "UNIQUE_PRODUCTS_SCANNED", 10, 25],
      ["ingredient_inspector", "INGREDIENT_VIEWS", 5, 20],
      ["curious_mind", "MEANINGFUL_CHATS", 5, 20],
      ["streak_of_three", "LONGEST_STREAK", 3, 15],
      ["streak_of_seven", "LONGEST_STREAK", 7, 35],
      ["challenge_champion", "CHALLENGES_COMPLETED", 5, 40],
      // The XP milestone itself is the documented default target; it stays
      // env-overridable so the policy can change without a code edit.
      ["century_club", "TOTAL_XP", 500, 0],
    ]);
  });

  it("configures only condition types the engine can observe", () => {
    // A rule with no backing counter would be a milestone no user could ever
    // complete, so it must not be shipped.
    for (const entry of listAchievementDefinitions()) {
      expect(ACHIEVEMENT_CONDITION_TYPES).toContain(entry.condition.type);
      expect(COUNTER_FOR_CONDITION[entry.condition.type]).toBeDefined();
      expect(entry.condition.target).toBeGreaterThan(0);
      expect(entry.rewardXp).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps achievement ids unique so a record identifies one unlock", () => {
    const ids = listAchievementDefinitions().map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never configures a rule that would re-pay a reward Module 3 or 4 already pays", () => {
    // Challenges and streak protections are automatic elsewhere; an achievement
    // that duplicated either would double-pay the same behaviour.
    const ids = listAchievementDefinitions().map((entry) => entry.id);
    expect(ids).not.toContain("daily_product_explorer");
    expect(ids).not.toContain("seven_day_streak_guardian");
  });
});

describe("achievement conditions", () => {
  it("observes each condition from its own counter and nothing else", () => {
    for (const entry of listAchievementDefinitions()) {
      const observed = observeCondition(entry, onlyCounter(COUNTER_FOR_CONDITION[entry.condition.type], 12));
      expect(observed).toBe(12);

      // No other counter may leak into this rule.
      for (const other of listAchievementDefinitions()) {
        if (other.condition.type === entry.condition.type) continue;
        expect(observeCondition(other, onlyCounter(COUNTER_FOR_CONDITION[entry.condition.type], 12))).toBe(0);
      }
    }
  });

  it("observes nothing for a new user", () => {
    for (const entry of listAchievementDefinitions()) {
      expect(observeCondition(entry, context())).toBe(0);
      expect(isUnlocked(entry, context())).toBe(false);
    }
  });

  it("is not eligible one short of the target and eligible exactly at it", () => {
    const entry = definition("food_explorer");
    expect(isUnlocked(entry, context({ uniqueProductsScanned: entry.condition.target - 1 }))).toBe(false);
    expect(isUnlocked(entry, context({ uniqueProductsScanned: entry.condition.target }))).toBe(true);
  });

  it("stays eligible past the target", () => {
    // Progress past a milestone is normal; the record, not eligibility, is what
    // makes an achievement unlocked.
    const entry = definition("streak_of_three");
    expect(isUnlocked(entry, context({ longestStreak: 30 }))).toBe(true);
    expect(progressRatio(entry, context({ longestStreak: 30 }))).toBe(1);
  });

  it("yields nothing for a definition whose condition is unmet", () => {
    expect(pendingUnlocks(context())).toEqual([]);
  });
});

describe("achievement progress ratios", () => {
  it("reports the real fraction toward the target", () => {
    expect(progressRatio(definition("food_explorer"), context({ uniqueProductsScanned: 5 }))).toBe(0.5);
    expect(progressRatio(definition("century_club"), context({ totalXp: 125 }))).toBe(0.25);
  });

  it("clamps the bar to 0..1", () => {
    expect(progressRatio(definition("first_scan"), context())).toBe(0);
    expect(progressRatio(definition("first_scan"), context({ uniqueProductsScanned: 99 }))).toBe(1);
    for (const entry of listAchievementDefinitions()) {
      const ratio = progressRatio(entry, context({ totalXp: 10_000, longestStreak: 400, uniqueProductsScanned: 400, ingredientViews: 400, meaningfulChats: 400, challengesCompleted: 400 }));
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
    }
  });

  it("reads as complete rather than dividing by a zero target", () => {
    const broken = { ...definition("first_scan"), condition: { type: "TOTAL_XP" as const, target: 0 } };
    expect(progressRatio(broken, context())).toBe(1);
  });
});

describe("achievement views", () => {
  it("shows a locked achievement with real progress and no unlock time", () => {
    const view = toAchievementView(
      definition("curious_mind"),
      context({ meaningfulChats: 2 }),
    );
    expect(view).toMatchObject({
      achievement_id: "curious_mind",
      condition_type: "MEANINGFUL_CHATS",
      target: 5,
      progress: 2,
      progress_ratio: 0.4,
      reward_xp: 20,
      unlocked: false,
      unlocked_at: null,
    });
  });

  it("never reports a met condition as unlocked before it is recorded", () => {
    // The engine decides; the store records. A view built from a met condition
    // with no record must still read as locked, so a definition can never put an
    // entry in a user's collection on its own.
    const met = context({ uniqueProductsScanned: 1 });
    expect(isUnlocked(definition("first_scan"), met)).toBe(true);
    expect(toAchievementView(definition("first_scan"), met).unlocked).toBe(false);
  });

  it("surfaces a recorded unlock with the time it happened", () => {
    const view = toAchievementView(
      definition("first_scan"),
      context({ uniqueProductsScanned: 1, unlocked: [record("first_scan")] }),
    );
    expect(view.unlocked).toBe(true);
    expect(view.unlocked_at).toBe("2026-09-20T12:00:00.000Z");
    expect(view.progress_ratio).toBe(1);
  });

  it("covers every configured achievement in the reported list", () => {
    const views = achievementViews(context({ uniqueProductsScanned: 1, unlocked: [record("first_scan")] }));
    expect(views.map((view) => view.achievement_id)).toEqual(
      listAchievementDefinitions().map((entry) => entry.id),
    );
    const summary = summarizeAchievements(views);
    expect(summary.total).toBe(listAchievementDefinitions().length);
    expect(summary.unlocked).toBe(1);
  });
});

describe("pending unlocks", () => {
  it("reports a genuinely reached achievement that is not recorded yet", () => {
    const pending = pendingUnlocks(context({ uniqueProductsScanned: 1 }));
    expect(pending.map((entry) => entry.id)).toEqual(["first_scan"]);
  });

  it("excludes an id the user already holds", () => {
    const pending = pendingUnlocks(
      context({ uniqueProductsScanned: 1, unlocked: [record("first_scan")] }),
    );
    expect(pending.map((entry) => entry.id)).not.toContain("first_scan");
    expect(pending).toEqual([]);
  });

  it("reports every reached achievement in one pass", () => {
    const pending = pendingUnlocks(
      context({ uniqueProductsScanned: 1, longestStreak: 7, challengesCompleted: 5 }),
    );
    expect(pending.map((entry) => entry.id).sort()).toEqual([
      "challenge_champion",
      "first_scan",
      "streak_of_seven",
      "streak_of_three",
    ]);
    expect(pending.map((entry) => entry.rewardXp).reduce((sum, xp) => sum + xp, 0)).toBe(100);
  });

  it("relies on the caller to scope records to the user", () => {
    // The engine evaluates whatever rows the caller hands it and never re-filters
    // by `userId`, so a foreign record in that list would suppress this user's
    // unlock. Both stores query `where: { userId }` before building the context;
    // this pins that dependency rather than hiding it.
    const pending = pendingUnlocks(
      context({
        uniqueProductsScanned: 1,
        unlocked: [record("first_scan", { userId: "user-2" })],
      }),
    );
    expect(pending.map((entry) => entry.id)).toEqual([]);
  });
});

describe("level projection across an XP change", () => {
  it("reports a level-up only when the level actually changes", () => {
    expect(levelUpBetween(0, 99)).toMatchObject({ leveledUp: false });
    expect(levelUpBetween(99, 100)).toMatchObject({
      leveledUp: true,
      from: { level: 1 },
      to: { level: 2 },
    });
  });

  it("detects a jump that skips several levels at once", () => {
    const jump = levelUpBetween(0, 700);
    expect(jump.leveledUp).toBe(true);
    expect(jump.from.level).toBe(1);
    expect(jump.to.level).toBe(5);
  });

  it("does not report a level-up for an unchanged total", () => {
    expect(levelUpBetween(105, 105).leveledUp).toBe(false);
  });

  it("projects a level view whose total is the XP that earned it", () => {
    const view = toLevelView(levelUpBetween(0, 260).to);
    expect(view).toMatchObject({
      level: 3,
      total_xp: 260,
      level_xp: 250,
      next_level_xp: 450,
      current_level_xp: 10,
      xp_to_next_level: 190,
    });
  });
});
