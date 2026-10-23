/**
 * FoodGuard Module 4 persistence helpers for the Prisma store.
 *
 * Everything here runs inside a caller-supplied transaction. The caller is
 * responsible for taking the per-user row lock, which is what makes concurrent
 * protection consumption and reward granting safe.
 */

import type { Prisma } from "@prisma/client";
import { streakProtectionConfig, PROTECTION_REASONS } from "@/gamification/protection/config";
import { applyProtectionCap, decideProtection } from "@/gamification/protection/protection.engine";
import { listRewardDefinitions } from "@/gamification/rewards/config";
import { milestoneKeyFor, observeCondition } from "@/gamification/rewards/reward.engine";
import type {
  RewardEvaluationContext,
  StreakProtectionStatus,
  StreakProtectionUsageRecord,
} from "@/gamification/models/rewards";
import type { GamificationProfileRecord } from "@/gamification/models/gamification";

export type Module4State = {
  availableCount: number;
  usedCount: number;
  protectedDates: string[];
  usage: StreakProtectionUsageRecord[];
};

export function rewardDefinitionRow(definition: ReturnType<typeof listRewardDefinitions>[number]) {
  return {
    rewardId: definition.id,
    name: definition.name,
    description: definition.description,
    rewardType: definition.rewardType,
    conditionType: definition.condition.type,
    targetValue: definition.condition.target,
    rewardValue: definition.rewardValue,
    autoClaim: definition.autoClaim,
    enabled: true,
  };
}

/**
 * Mirror the configured reward set into storage. Configuration only.
 *
 * Reconciliation runs on every profile/challenge read, so writing all reward
 * rows unconditionally made concurrent dashboard requests contend for the same
 * rows and intermittently fail with a serialization conflict. Comparing first
 * keeps the steady state read-only: rows are only written when they are
 * missing or when the configuration actually changed.
 */
export async function syncRewardDefinitionsTx(tx: Prisma.TransactionClient): Promise<void> {
  const definitions = listRewardDefinitions();
  const rows = definitions.map(rewardDefinitionRow);
  const existing = await tx.rewardDefinition.findMany({
    where: { rewardId: { in: rows.map((row) => row.rewardId) } },
  });
  const byId = new Map(existing.map((row) => [row.rewardId, row]));

  for (const row of rows) {
    const current = byId.get(row.rewardId);
    if (!current) {
      await tx.rewardDefinition.create({ data: row });
      continue;
    }
    if (
      current.name === row.name &&
      current.description === row.description &&
      current.rewardType === row.rewardType &&
      current.conditionType === row.conditionType &&
      current.targetValue === row.targetValue &&
      current.rewardValue === row.rewardValue &&
      current.autoClaim === row.autoClaim
    ) {
      continue;
    }
    await tx.rewardDefinition.update({
      where: { rewardId: row.rewardId },
      data: {
        name: row.name,
        description: row.description,
        rewardType: row.rewardType,
        conditionType: row.conditionType,
        targetValue: row.targetValue,
        rewardValue: row.rewardValue,
        autoClaim: row.autoClaim,
      },
    });
  }
}

export async function readProtectionStateTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<Module4State> {
  const [protectionRow, usageRows] = await Promise.all([
    tx.userStreakProtection.findUnique({ where: { userId } }),
    tx.streakProtectionUsage.findMany({
      where: { userId },
      orderBy: { usedAt: "desc" },
    }),
  ]);
  return {
    availableCount: protectionRow?.availableCount ?? 0,
    usedCount: protectionRow?.usedCount ?? 0,
    protectedDates: usageRows.map((row) => row.protectedDate),
    usage: usageRows.map((row) => ({
      usageId: row.id,
      userId: row.userId,
      protectedDate: row.protectedDate,
      streakBefore: row.streakBefore,
      streakAfter: row.streakAfter,
      usedAt: row.usedAt.toISOString(),
      reason: row.reason,
    })),
  };
}

type RewardOutcome = { rewardId: string; granted: boolean; capReached: boolean };

/**
 * Grant every reward milestone the user has genuinely reached.
 *
 * Idempotency comes from the unique `(userId, milestoneKey)` index rather than
 * a read-then-write check, so two concurrent requests -- or a retry after a
 * restart -- cannot both create the same milestone.
 */
export async function grantEarnedRewardsTx(
  tx: Prisma.TransactionClient,
  userId: string,
  context: RewardEvaluationContext,
  protection: Module4State,
): Promise<{ state: Module4State; outcomes: RewardOutcome[] }> {
  await syncRewardDefinitionsTx(tx);

  const recorded = await tx.userReward.findMany({
    where: { userId },
    select: { milestoneKey: true, rewardId: true },
  });
  const recordedKeys = new Set(recorded.map((row) => row.milestoneKey));

  const outcomes: RewardOutcome[] = [];
  let availableCount = protection.availableCount;
  let usedCount = protection.usedCount;
  let capReached = false;

  for (const definition of listRewardDefinitions()) {
    const milestoneValue = observeCondition(definition, context);
    if (milestoneValue === null || milestoneValue < definition.condition.target) {
      outcomes.push({ rewardId: definition.id, granted: false, capReached: false });
      continue;
    }
    const milestoneKey = milestoneKeyFor(definition, milestoneValue);
    if (recordedKeys.has(milestoneKey)) {
      outcomes.push({ rewardId: definition.id, granted: false, capReached: false });
      continue;
    }

    // The unique milestone key is the idempotency gate, so the record is
    // inserted first and the payout is applied only when a row was really
    // created. `skipDuplicates` lowers to ON CONFLICT DO NOTHING, which makes a
    // concurrent duplicate a no-op *without* aborting the transaction -- a
    // caught unique violation would poison every later statement in it.
    const inserted = await tx.userReward.createMany({
      data: [
        {
          userId,
          rewardId: definition.id,
          milestoneKey,
          earnedAt: context.now,
          // Only a reward whose effect was actually applied counts as claimed.
          claimed: definition.autoClaim,
          claimedAt: definition.autoClaim ? context.now : null,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count === 0) {
      outcomes.push({ rewardId: definition.id, granted: false, capReached: false });
      continue;
    }

    // A STREAK_PROTECTION reward is applied immediately and marked claimed in
    // the same transaction: a protection the user has to remember to claim
    // would let the very streak it protects lapse in the meantime. An XP bonus
    // pays through the same totalXp counter Module 1 and Module 3 use, so
    // there is exactly one authoritative XP balance.
    if (definition.autoClaim && definition.rewardType === "STREAK_PROTECTION") {
      const capped = applyProtectionCap(availableCount, definition.rewardValue);
      capReached = capReached || capped.capped;
      availableCount = capped.availableCount;
    }
    if (definition.autoClaim && definition.rewardType === "XP_BONUS") {
      await tx.userGamification.upsert({
        where: { userId },
        create: { userId, totalXp: definition.rewardValue },
        update: { totalXp: { increment: definition.rewardValue } },
      });
    }

    recordedKeys.add(milestoneKey);
    outcomes.push({ rewardId: definition.id, granted: true, capReached });
  }

  // Only persist when this pass actually moved the counters. A brand-new user
  // reading their profile must not acquire a protection row as a side effect.
  if (availableCount !== protection.availableCount || usedCount !== protection.usedCount) {
    return {
      state: await writeProtectionStateTx(tx, userId, availableCount, usedCount),
      outcomes,
    };
  }
  return { state: protection, outcomes };
}


/** Create the protection row on first write only; a read never creates one. */
async function writeProtectionStateTx(
  tx: Prisma.TransactionClient,
  userId: string,
  availableCount: number,
  usedCount: number,
): Promise<Module4State> {
  const row = await tx.userStreakProtection.upsert({
    where: { userId },
    create: { userId, availableCount, usedCount },
    update: { availableCount, usedCount },
  });
  const usageRows = await tx.streakProtectionUsage.findMany({
    where: { userId },
    orderBy: { usedAt: "desc" },
  });
  return {
    availableCount: row.availableCount,
    usedCount: row.usedCount,
    protectedDates: usageRows.map((usage) => usage.protectedDate),
    usage: usageRows.map((usage) => ({
      usageId: usage.id,
      userId: usage.userId,
      protectedDate: usage.protectedDate,
      streakBefore: usage.streakBefore,
      streakAfter: usage.streakAfter,
      usedAt: usage.usedAt.toISOString(),
      reason: usage.reason,
    })),
  };
}

/**
 * Spend protections on genuinely missed qualifying days.
 *
 * One protection per missed day, and only when the protections on hand cover
 * the whole gap -- a partial cover still resets the streak, so spending them
 * there would burn them for nothing. The unique `(userId, protectedDate)` index
 * makes a repeated or concurrent attempt for the same day a no-op.
 */
export async function consumeProtectionsTx(
  tx: Prisma.TransactionClient,
  userId: string,
  input: {
    activityDates: readonly string[];
    today: string;
    now: Date;
  },
  state: Module4State,
): Promise<Module4State> {
  const decision = decideProtection({
    activityDates: input.activityDates,
    protectedDates: state.protectedDates,
    today: input.today,
    availableCount: state.availableCount,
  });
  if (decision.declined || decision.protectedDates.length === 0) {
    return state;
  }

  let availableCount = state.availableCount;
  let usedCount = state.usedCount;
  for (const protectedDate of decision.protectedDates) {
    if (availableCount <= 0) break;
    // The unique (user, date) rule makes the bridge a no-op if a concurrent
    // request already recorded it. As with rewards, ON CONFLICT DO NOTHING is
    // used rather than a caught unique violation, because an aborted
    // transaction cannot continue issuing statements.
    const inserted = await tx.streakProtectionUsage.createMany({
      data: [
        {
          userId,
          protectedDate,
          streakBefore: decision.streakBefore,
          streakAfter: decision.streakAfter,
          usedAt: input.now,
          reason: PROTECTION_REASONS.missedActivityDay,
        },
      ],
      skipDuplicates: true,
    });
    // Spend only for a bridge that was really created, so a protection is never
    // consumed without protecting a day.
    if (inserted.count === 0) continue;
    availableCount -= 1;
    usedCount += 1;
  }
  if (availableCount === state.availableCount && usedCount === state.usedCount) {
    return state;
  }
  return writeProtectionStateTx(tx, userId, availableCount, usedCount);
}

export function protectionStatus(
  state: Module4State,
  currentStreak: number,
  maxAvailable: number = streakProtectionConfig.maxAvailable,
): StreakProtectionStatus {
  const latest = state.usage[0] ?? null;
  return {
    available_count: state.availableCount,
    used_count: state.usedCount,
    max_available: maxAvailable,
    current_streak: currentStreak,
    last_protected: latest
      ? {
          protected_date: latest.protectedDate,
          used_at: latest.usedAt,
          reason: latest.reason,
        }
      : null,
  };
}

export type { GamificationProfileRecord };
