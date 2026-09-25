/**
 * Module 2 level curve.
 *
 * A level is derived from lifetime XP and nothing else, so the whole feature
 * rests on this one pure function: the progress bar, the "10 XP to Level 4"
 * caption, and the level-up event all read from it. These tests pin the curve
 * itself -- thresholds, boundaries, the cap, and the fact that it can never go
 * backwards -- because a drifting threshold silently rewrites stored history.
 */

import { describe, expect, it } from "vitest";
import {
  levelConfig,
  levelForXp,
  levelService,
} from "@/gamification/levels/level.service";
import { gamificationConfig } from "@/gamification/config";

const { thresholds } = levelConfig;

describe("FoodGuard level thresholds", () => {
  it("starts level 1 at zero and widens every gap after it", () => {
    expect(thresholds[0]).toBe(0);
    expect(thresholds[1]).toBe(100);
    expect(thresholds[2]).toBe(250);
    expect(thresholds[3]).toBe(450);
    expect(thresholds[4]).toBe(700);
  });

  it("derives every gap from the configured base and step", () => {
    // Each level costs `base + step * (level - 2)` more than the one before it,
    // so the curve is a policy change in config.ts rather than a code edit.
    for (let index = 1; index < thresholds.length; index += 1) {
      const gap = thresholds[index] - thresholds[index - 1];
      const expected =
        gamificationConfig.levelBaseXp + gamificationConfig.levelXpStep * (index - 1);
      expect(gap).toBe(expected);
    }
  });

  it("defines exactly the configured number of levels", () => {
    expect(thresholds).toHaveLength(gamificationConfig.levelMax);
    expect(levelConfig.levels).toHaveLength(gamificationConfig.levelMax);
    expect(levelConfig.maxLevel).toBe(gamificationConfig.levelMax);
  });

  it("describes the whole ladder for clients that want it", () => {
    expect(levelConfig.levels[0]).toEqual({
      level: 1,
      level_xp: 0,
      next_level_xp: 100,
    });
    // The final level has no next threshold, so a client cannot render a bar
    // toward a level that does not exist.
    expect(levelConfig.levels[levelConfig.levels.length - 1]).toEqual({
      level: gamificationConfig.levelMax,
      level_xp: thresholds[thresholds.length - 1],
      next_level_xp: null,
    });
  });

  it("keeps the thresholds ascending so no level is unreachable", () => {
    for (let index = 1; index < thresholds.length; index += 1) {
      expect(thresholds[index]).toBeGreaterThan(thresholds[index - 1]);
    }
  });
});

describe("FoodGuard level for an XP total", () => {
  it("starts every user at level 1 with no progress", () => {
    expect(levelForXp(0)).toMatchObject({
      level: 1,
      levelXp: 0,
      currentLevelXp: 0,
      xpToNextLevel: 100,
      progress: 0,
      isMaxLevel: false,
    });
  });

  it("promotes to the higher level exactly at the threshold", () => {
    // XP equal to a threshold earns that level: a user who hits 100 XP is on
    // level 2 with 0 XP into it, not level 1 with 1 XP to go.
    for (let index = 1; index < thresholds.length; index += 1) {
      const atThreshold = levelForXp(thresholds[index]);
      expect(atThreshold.level).toBe(index + 1);
      expect(atThreshold.currentLevelXp).toBe(0);
      expect(atThreshold.levelXp).toBe(thresholds[index]);
    }
  });

  it("holds the lower level one XP below every threshold", () => {
    for (let index = 1; index < thresholds.length; index += 1) {
      const justBelow = levelForXp(thresholds[index] - 1);
      expect(justBelow.level).toBe(index);
      expect(justBelow.nextLevelXp).toBe(thresholds[index]);
      expect(justBelow.xpToNextLevel).toBe(1);
    }
  });

  it("reports the XP still owed toward the next level", () => {
    const progress = levelForXp(60);
    expect(progress).toMatchObject({
      level: 1,
      levelXp: 0,
      nextLevelXp: 100,
      currentLevelXp: 60,
      xpToNextLevel: 40,
    });
    expect(progress.progress).toBeCloseTo(0.6, 10);
  });

  it("caps at the maximum level and stays there", () => {
    const finalThreshold = thresholds[thresholds.length - 1];
    expect(finalThreshold).toBe(10450);

    for (const totalXp of [finalThreshold, finalThreshold + 1, finalThreshold * 10]) {
      expect(levelForXp(totalXp)).toMatchObject({
        level: gamificationConfig.levelMax,
        nextLevelXp: null,
        xpToNextLevel: 0,
        progress: 1,
        isMaxLevel: true,
      });
    }
  });

  it("treats a negative, NaN, or non-finite total as zero", () => {
    // A corrupt XP value must not produce a nonsensical level or a NaN bar.
    for (const totalXp of [-1, -10_000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(levelForXp(totalXp)).toEqual(levelForXp(0));
    }
  });

  it("floors a fractional total so the curve stays whole-numbered", () => {
    expect(levelForXp(99.9)).toEqual(levelForXp(99));
    expect(levelForXp(100.5)).toEqual(levelForXp(100));
  });

  it("never lowers the level as XP grows", () => {
    let previous = levelForXp(0);
    for (let totalXp = 0; totalXp <= thresholds[thresholds.length - 1] + 500; totalXp += 7) {
      const current = levelForXp(totalXp);
      expect(current.level).toBeGreaterThanOrEqual(previous.level);
      expect(current.currentLevelXp).toBeGreaterThanOrEqual(0);
      expect(current.xpToNextLevel).toBeGreaterThanOrEqual(0);
      expect(current.progress).toBeGreaterThanOrEqual(0);
      expect(current.progress).toBeLessThanOrEqual(1);
      previous = current;
    }
  });

  it("keeps the reported progress consistent with the XP left in the level", () => {
    for (let totalXp = 0; totalXp <= 2000; totalXp += 13) {
      const progress = levelForXp(totalXp);
      if (progress.isMaxLevel) {
        expect(progress.progress).toBe(1);
        continue;
      }
      const span = progress.nextLevelXp! - progress.levelXp;
      expect(progress.progress).toBeCloseTo(progress.currentLevelXp / span, 10);
      expect(progress.xpToNextLevel).toBe(progress.nextLevelXp! - totalXp);
    }
  });

  it("exposes the same curve through the service facade", () => {
    expect(levelService.forXp).toBe(levelForXp);
    expect(levelService.config.thresholds).toEqual(thresholds);
  });
});
