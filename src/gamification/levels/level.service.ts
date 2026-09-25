/**
 * Level curve for FoodGuard (Module 2).
 *
 * A level is a pure function of lifetime XP. Nothing is persisted for it, which
 * removes any chance of the stored level drifting away from the XP that earned
 * it: the XP total is the only state, and this curve is the only rule. The
 * progress bar, the "10 XP to Level 4" caption, and the level-up event all
 * derive from the same function.
 */

import { gamificationConfig } from "@/gamification/config";

/**
 * XP required to reach each level, cumulative from zero.
 *
 * Index 0 is level 1, which every user starts at. The gap grows so early
 * levels arrive quickly and later ones stay meaningful, instead of a linear
 * ramp that makes level 20 a formality or an exponential wall that never opens.
 */
function buildLevelThresholds(): number[] {
  const base = gamificationConfig.levelBaseXp;
  const step = gamificationConfig.levelXpStep;
  const maxLevel = gamificationConfig.levelMax;
  const thresholds: number[] = [0];
  let total = 0;
  for (let level = 2; level <= maxLevel; level += 1) {
    total += base + step * (level - 2);
    thresholds.push(total);
  }
  return thresholds;
}

const thresholds = buildLevelThresholds();

export type LevelProgress = {
  level: number;
  /** XP required to reach `level` from zero. */
  levelXp: number;
  /** XP required to reach the next level, or null at the final level. */
  nextLevelXp: number | null;
  /** XP earned inside the current level. */
  currentLevelXp: number;
  /** XP still needed for the next level, or 0 at the final level. */
  xpToNextLevel: number;
  /** 0..1 progress through the current level, or 1 at the final level. */
  progress: number;
  isMaxLevel: boolean;
};

/**
 * Resolve a level from a lifetime XP total. XP below zero is treated as zero so
 * a corrupt value can never produce a nonsensical level.
 */
export function levelForXp(totalXp: number): LevelProgress {
  const xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  let level = 1;
  for (let index = 1; index < thresholds.length; index += 1) {
    if (xp < thresholds[index]) break;
    level = index + 1;
  }
  const levelXp = thresholds[level - 1];
  const nextLevelXp = level < thresholds.length ? thresholds[level] : null;
  const currentLevelXp = xp - levelXp;
  const span = nextLevelXp === null ? 0 : nextLevelXp - levelXp;
  const xpToNextLevel = nextLevelXp === null ? 0 : nextLevelXp - xp;
  return {
    level,
    levelXp,
    nextLevelXp,
    currentLevelXp,
    xpToNextLevel,
    progress: nextLevelXp === null ? 1 : span > 0 ? currentLevelXp / span : 1,
    isMaxLevel: nextLevelXp === null,
  };
}

export const levelConfig = Object.freeze({
  /** Highest level the curve defines. */
  maxLevel: gamificationConfig.levelMax,
  /** Cumulative XP required per level, for clients that want the whole ladder. */
  thresholds: Object.freeze([...thresholds]),
  levels: Object.freeze(
    thresholds.map((xp, index) => ({
      level: index + 1,
      level_xp: xp,
      next_level_xp: index + 1 < thresholds.length ? thresholds[index + 1] : null,
    })),
  ),
});

export const levelService = {
  forXp: levelForXp,
  config: levelConfig,
};
