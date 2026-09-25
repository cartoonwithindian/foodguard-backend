/**
 * Pure evaluation for FoodGuard achievements (Module 2).
 *
 * Everything here is a function of already-persisted state. It never reads a
 * request, never decides that a user "unlocked" anything, and never mutates:
 * the store applies the result inside its transaction. Keeping the decision
 * pure is what lets the Prisma and in-memory stores share one rule set.
 */

import {
  getAchievementDefinition,
  listAchievementDefinitions,
  type AchievementDefinition,
} from "@/gamification/achievements/config";
import { levelForXp, type LevelProgress } from "@/gamification/levels/level.service";
import type {
  AchievementListResult,
  AchievementRecord,
  AchievementView,
  LevelView,
} from "@/gamification/models/achievements";

/** Real, already-persisted counters an achievement may be evaluated against. */
export type AchievementContext = {
  userId: string;
  now: Date;
  totalXp: number;
  longestStreak: number;
  uniqueProductsScanned: number;
  ingredientViews: number;
  meaningfulChats: number;
  challengesCompleted: number;
  unlocked: readonly AchievementRecord[];
};

/** Observed value of an achievement's condition against real state. */
export function observeCondition(
  definition: AchievementDefinition,
  context: AchievementContext,
): number {
  switch (definition.condition.type) {
    case "UNIQUE_PRODUCTS_SCANNED":
      return context.uniqueProductsScanned;
    case "TOTAL_XP":
      return context.totalXp;
    case "LONGEST_STREAK":
      return context.longestStreak;
    case "INGREDIENT_VIEWS":
      return context.ingredientViews;
    case "MEANINGFUL_CHATS":
      return context.meaningfulChats;
    case "CHALLENGES_COMPLETED":
      return context.challengesCompleted;
    default:
      return 0;
  }
}

export function isUnlocked(
  definition: AchievementDefinition,
  context: AchievementContext,
): boolean {
  return observeCondition(definition, context) >= definition.condition.target;
}

/** Achievements the user has genuinely reached but that are not yet recorded. */
export function pendingUnlocks(context: AchievementContext): AchievementDefinition[] {
  const recorded = new Set(context.unlocked.map((entry) => entry.achievementId));
  return listAchievementDefinitions().filter(
    (definition) => !recorded.has(definition.id) && isUnlocked(definition, context),
  );
}

/** Clamped 0..1 bar width. Purely visual: the backend stays authoritative. */
export function progressRatio(definition: AchievementDefinition, context: AchievementContext): number {
  const target = definition.condition.target;
  if (target <= 0) return 1;
  return Math.max(0, Math.min(1, observeCondition(definition, context) / target));
}

export function toAchievementView(
  definition: AchievementDefinition,
  context: AchievementContext,
): AchievementView {
  const record = context.unlocked.find((entry) => entry.achievementId === definition.id) ?? null;
  const observed = observeCondition(definition, context);
  return {
    achievement_id: definition.id,
    name: definition.name,
    description: definition.description,
    icon: definition.icon,
    condition_type: definition.condition.type,
    target: definition.condition.target,
    progress: observed,
    progress_ratio: progressRatio(definition, context),
    reward_xp: definition.rewardXp,
    unlocked: record !== null,
    unlocked_at: record?.unlockedAt ?? null,
  };
}

export function achievementViews(context: AchievementContext): AchievementView[] {
  return listAchievementDefinitions().map((definition) => toAchievementView(definition, context));
}

export function summarizeAchievements(views: AchievementView[]): AchievementListResult {
  const unlocked = views.filter((view) => view.unlocked);
  return {
    achievements: views,
    unlocked: unlocked.length,
    total: views.length,
  };
}

/**
 * Project the level a new XP total would reach. Used to detect a level-up
 * across a single XP change without persisting a second source of truth.
 */
export function levelUpBetween(
  previousXp: number,
  nextXp: number,
): { from: LevelProgress; to: LevelProgress; leveledUp: boolean } {
  const from = levelForXp(previousXp);
  const to = levelForXp(nextXp);
  return { from, to, leveledUp: to.level > from.level };
}

export function toLevelView(progress: LevelProgress): LevelView {
  return {
    level: progress.level,
    total_xp: progress.levelXp + progress.currentLevelXp,
    level_xp: progress.levelXp,
    next_level_xp: progress.nextLevelXp,
    current_level_xp: progress.currentLevelXp,
    xp_to_next_level: progress.xpToNextLevel,
    progress: progress.progress,
    is_max_level: progress.isMaxLevel,
  };
}

export { getAchievementDefinition, listAchievementDefinitions };
