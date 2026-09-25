/**
 * Centralized configuration for FoodGuard gamification.
 *
 * Reward values and policies are intentionally defined in one place. The
 * environment variables make the initial policy changeable without touching
 * calculation or persistence code.
 */

export type DuplicateProductPolicy = "base_only" | "no_xp" | "once_per_day";
export type StreakResetPolicy = "reset_on_missed_day";

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function duplicatePolicy(value: string | undefined): DuplicateProductPolicy {
  if (value === "no_xp" || value === "once_per_day" || value === "base_only") {
    return value;
  }
  return "base_only";
}

function resetPolicy(value: string | undefined): StreakResetPolicy {
  return value === "reset_on_missed_day" ? value : "reset_on_missed_day";
}

export const gamificationConfig = Object.freeze({
  successfulScanXp: nonNegativeInteger(process.env.GAMIFICATION_SUCCESSFUL_SCAN_XP, 10),
  uniqueProductXp: nonNegativeInteger(process.env.GAMIFICATION_UNIQUE_PRODUCT_XP, 15),
  duplicateProductPolicy: duplicatePolicy(process.env.GAMIFICATION_DUPLICATE_PRODUCT_POLICY),
  streakResetPolicy: resetPolicy(process.env.GAMIFICATION_STREAK_RESET_POLICY),
  defaultTimezone: process.env.GAMIFICATION_DEFAULT_TIMEZONE?.trim() || "UTC",
  /**
   * A short compatibility window protects older clients which did not send an
   * event id from accidental HTTP retries. New clients always send one.
   */
  duplicateRequestWindowMs: nonNegativeInteger(
    process.env.GAMIFICATION_DUPLICATE_REQUEST_WINDOW_MS,
    30_000,
  ),
});

export type GamificationConfig = typeof gamificationConfig;
