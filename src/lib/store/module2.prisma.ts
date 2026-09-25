/**
 * Module 2 persistence: levels and achievements.
 *
 * Store-specific code lives beside the other store helpers; the rules it applies
 * come from the pure engines in `gamification/`. Keeping them here is what lets
 * the Prisma and in-memory stores share one rule set instead of drifting.
 */

import type { Prisma } from "@prisma/client";
import {
  countIngredientViews,
  countMeaningfulChats,
  countUniqueProducts,
  type ChallengeActivityRow,
} from "@/gamification/challenges/progress.service";
import { listAchievementDefinitions } from "@/gamification/achievements/config";
import {
  pendingUnlocks,
  type AchievementContext,
} from "@/gamification/achievements/achievement.engine";
import { challengePeriodService } from "@/gamification/challenges/period.service";
import { listChallengeDefinitions } from "@/gamification/challenges/config";
import type { AchievementRecord } from "@/gamification/models/achievements";

export type AchievementCounters = {
  uniqueProductsScanned: number;
  ingredientViews: number;
  meaningfulChats: number;
  challengesCompleted: number;
};

/**
 * Completion counts for the user's current daily and weekly instances.
 *
 * Scoped to the *current* period rather than all time, so the overview's
 * challenge card reflects what is live today instead of a lifetime tally.
 */
export async function challengeCountsTx(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  timezone: string,
): Promise<{
  daily_completed: number;
  daily_total: number;
  weekly_completed: number;
  weekly_total: number;
}> {
  const rows = await tx.userChallenge.findMany({
    where: { userId },
    select: { challengeId: true, completed: true, periodStart: true },
  });
  // The period service owns the local-date and week-boundary rules, so the
  // overview can never disagree with Module 3 about what "today" means. The
  // period type comes from the configured definition, which is the same source
  // Module 3 reads.
  const periods = new Map(
    listChallengeDefinitions().map((definition) => [definition.id, definition.period]),
  );
  const dailyWindow = challengePeriodService.windowFor(now, timezone, "daily");
  const weeklyWindow = challengePeriodService.windowFor(now, timezone, "weekly");
  const live = rows.filter((row) => {
    const period = periods.get(row.challengeId);
    if (!period) return false;
    const window = period === "weekly" ? weeklyWindow : dailyWindow;
    const millis = row.periodStart.getTime();
    return (
      millis >= window.startInstant.getTime() && millis < window.endInstant.getTime()
    );
  });
  const isWeekly = (row: (typeof rows)[number]) =>
    periods.get(row.challengeId) === "weekly";
  return {
    daily_completed: live.filter((row) => !isWeekly(row) && row.completed).length,
    daily_total: live.filter((row) => !isWeekly(row)).length,
    weekly_completed: live.filter((row) => isWeekly(row) && row.completed).length,
    weekly_total: live.filter((row) => isWeekly(row)).length,
  };
}

/** Mirror the configured definitions into storage so they are inspectable. */
export async function syncAchievementDefinitionsTx(
  tx: Prisma.TransactionClient,
): Promise<void> {
  for (const definition of listAchievementDefinitions()) {
    await tx.achievementDefinition.upsert({
      where: { achievementId: definition.id },
      create: {
        achievementId: definition.id,
        name: definition.name,
        description: definition.description,
        icon: definition.icon,
        conditionType: definition.condition.type,
        targetValue: definition.condition.target,
        rewardXp: definition.rewardXp,
        enabled: true,
      },
      update: {
        name: definition.name,
        description: definition.description,
        icon: definition.icon,
        conditionType: definition.condition.type,
        targetValue: definition.condition.target,
        rewardXp: definition.rewardXp,
        enabled: true,
      },
    });
  }
}

/**
 * Counters derived from real activity rows.
 *
 * The counting helpers are the same ones Module 3 uses, so "unique product"
 * means exactly one thing across the whole gamification system: replayed event
 * ids never count twice, and a product is counted once per action type.
 */
export async function achievementCountersTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<AchievementCounters> {
  const activityRows = await tx.gamificationActivity.findMany({
    where: { userId },
    select: { actionType: true, productId: true, ingredientId: true, eventId: true },
  });
  const activities: ChallengeActivityRow[] = activityRows.map((row) => ({
    activityType: row.actionType,
    activityDate: "",
    productId: row.productId,
    ingredientId: row.ingredientId,
    eventId: row.eventId,
  }));
  const challengesCompleted = await tx.userChallenge.count({
    where: { userId, completed: true },
  });
  return {
    uniqueProductsScanned: countUniqueProducts(activities),
    ingredientViews: countIngredientViews(activities),
    meaningfulChats: countMeaningfulChats(activities),
    challengesCompleted,
  };
}

export async function readUnlockedTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<AchievementRecord[]> {
  const rows = await tx.userAchievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: "desc" },
  });
  return rows.map((row) => ({
    achievementId: row.achievementId,
    userId: row.userId,
    unlockedAt: row.unlockedAt.toISOString(),
    xpAwarded: row.xpAwarded,
  }));
}

/**
 * Record every achievement the user has genuinely reached and pay its XP.
 *
 * Idempotency comes from the unique (user, achievement) key. The row is
 * inserted with `skipDuplicates` -- ON CONFLICT DO NOTHING -- so a concurrent
 * request loses the race silently instead of aborting the transaction or
 * paying twice, and the XP is only added for a row that was really created.
 *
 * Eligibility is evaluated against the XP total as it stood when this call
 * began. If an unlock raises XP high enough to satisfy a further XP-based
 * achievement, that one is picked up on the next reconciliation rather than by
 * recursing here, which keeps the transaction bounded. XP only ever grows and
 * the definition set is finite, so this converges.
 *
 * Returns the ids unlocked here and the resulting XP total. Level detection
 * belongs to the caller, which compares the XP total before and after the whole
 * transaction -- that way a level-up from a scan, a challenge, or an
 * achievement is all caught in one place.
 */
export async function grantAchievementsTx(
  tx: Prisma.TransactionClient,
  context: AchievementContext,
): Promise<{ newlyUnlocked: string[]; totalXp: number }> {
  const pending = pendingUnlocks(context);
  if (pending.length === 0) {
    return { newlyUnlocked: [], totalXp: context.totalXp };
  }

  const newlyUnlocked: string[] = [];
  let awardedXp = 0;
  for (const definition of pending) {
    const inserted = await tx.userAchievement.createMany({
      data: [
        {
          userId: context.userId,
          achievementId: definition.id,
          xpAwarded: definition.rewardXp,
          unlockedAt: context.now,
        },
      ],
      skipDuplicates: true,
    });
    // Pay only for an unlock that was really recorded, so a duplicate never
    // inflates the XP total.
    if (inserted.count === 0) continue;
    newlyUnlocked.push(definition.id);
    awardedXp += definition.rewardXp;
  }

  if (awardedXp > 0) {
    // Payout goes through the same profile counter Modules 1 and 3 use, so
    // there is exactly one authoritative XP balance.
    await tx.userGamification.upsert({
      where: { userId: context.userId },
      create: { userId: context.userId, totalXp: context.totalXp + awardedXp },
      update: { totalXp: { increment: awardedXp } },
    });
  }

  return { newlyUnlocked, totalXp: context.totalXp + awardedXp };
}
