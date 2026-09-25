/**
 * Centralized configuration for FoodGuard streak protection (Module 4).
 *
 * Protection counts and earning rules are policy, so they live here rather
 * than in the service, persistence, or route code. Nothing in this file reads
 * user data, and no protection is ever granted by configuration alone: a rule
 * only describes *what* qualifies, never *that* a user qualified.
 */

/** Why a protection was consumed. Stored verbatim as the usage reason. */
export const PROTECTION_REASONS = {
  /** A qualifying local day was missed and an available protection covered it. */
  missedActivityDay: "missed_activity_day",
} as const;

export type ProtectionReason = (typeof PROTECTION_REASONS)[keyof typeof PROTECTION_REASONS];

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * The initial rule: a completed N-day FoodGuard streak earns one protection.
 * Raising this does not change the number of protections a user may hold at
 * once -- that is `maxAvailable` -- only how often one is earned.
 */
function earningRules(raw: string | undefined): { streakDays: number } {
  const parsed = Number(raw);
  return { streakDays: nonNegativeInteger(raw, 7) && parsed > 0 ? Number(raw) : 7 };
}

export const streakProtectionConfig = Object.freeze({
  /**
   * Protections a single user may hold at once. Earning past this cap is a
   * no-op rather than an error, and the surplus is never banked.
   */
  maxAvailable: nonNegativeInteger(process.env.STREAK_PROTECTION_MAX_AVAILABLE, 1),
  /**
   * New users start with nothing. A protection must be earned through a real
   * milestone so the UI can never show a fabricated inventory.
   */
  startingAvailable: nonNegativeInteger(
    process.env.STREAK_PROTECTION_STARTING_AVAILABLE,
    0,
  ),
  earning: earningRules(process.env.STREAK_PROTECTION_EARNING_STREAK_DAYS),
  usage: Object.freeze({
    /**
     * One protection covers exactly one missed qualifying day. It is never
     * allowed to span a multi-day gap, so consecutive missed days each need
     * their own protection.
     */
    maxDaysCoveredPerProtection: 1,
    /**
     * Protections are only spent on a streak that is genuinely at risk, so a
     * user with no active streak never consumes one.
     */
    requireActiveStreak: true,
  }),
  defaultTimezone: process.env.STREAK_PROTECTION_DEFAULT_TIMEZONE?.trim() || "UTC",
});

export type StreakProtectionConfig = typeof streakProtectionConfig;

export function maxAvailableProtections(): number {
  return streakProtectionConfig.maxAvailable;
}
