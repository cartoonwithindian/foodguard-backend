/**
 * Pure evaluation for FoodGuard streak protection (Module 4).
 *
 * Given real activity dates, the protections already spent, and the user's
 * current local date, this decides which missed days available protections may
 * bridge. It performs no I/O and mutates nothing: the store consumes the
 * decision inside its own transaction.
 */

import { streakProtectionConfig, PROTECTION_REASONS } from "@/gamification/protection/config";
import { missedDatesBetween } from "@/gamification/services/streak.service";

export type ProtectionDecisionInput = {
  /** Real qualifying local dates from Module 1. */
  activityDates: readonly string[];
  /** Local dates already bridged by a consumed protection. */
  protectedDates: readonly string[];
  /** The user's current local date. */
  today: string;
  availableCount: number;
};

export type ProtectionDeclineReason =
  | "no_activity"
  | "streak_not_current"
  | "no_missed_day"
  | "no_protection_available"
  | "insufficient_protections";

export type ProtectionDecision = {
  /**
   * Missed days to bridge, oldest first. Empty when nothing should be spent.
   * One entry per protection, because a single protection covers exactly one
   * missed day and consecutive missed days each need their own.
   */
  protectedDates: string[];
  /** Streak length immediately before the missed days. */
  streakBefore: number;
  /** Streak length once the missed days are bridged. */
  streakAfter: number;
  reason: string;
  /** Why nothing was spent -- surfaced for tests and diagnostics. */
  declined: ProtectionDeclineReason | null;
};

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** The real run of activity that ends at `anchor`, plus its length. */
function runEndingAt(
  activity: ReadonlySet<string>,
  anchor: string,
): { start: string; length: number } {
  let length = 1;
  while (activity.has(addDays(anchor, -length))) length += 1;
  return { start: addDays(anchor, -(length - 1)), length };
}

/** The latest activity date strictly before `date`, or null if there is none. */
function latestBefore(activity: ReadonlySet<string>, date: string): string | null {
  let latest: string | null = null;
  for (const candidate of activity) {
    if (candidate < date && (latest === null || candidate > latest)) latest = candidate;
  }
  return latest;
}

/**
 * Decide which available protections should be spent now.
 *
 * A protection is only spent when it genuinely saves the streak. A gap wider
 * than the protections on hand is left alone: covering part of it still resets
 * the streak, so consuming protections there would burn them for nothing. The
 * normal Module 1 reset then applies and the inventory stays intact.
 *
 * The gap is located relative to the run the user is currently building, not
 * relative to the last scan. When a user returns and scans *today*, today's
 * activity already exists, so measuring "days between the last scan and today"
 * would find no gap and the missed day would silently go unbridged. The
 * bridgeable gap is therefore the one immediately preceding the run ending
 * today; when the user is inactive, it is the gap between their last scan and
 * today.
 */
export function decideProtection(input: ProtectionDecisionInput): ProtectionDecision {
  const activity = new Set(input.activityDates);
  const protectedSet = new Set(input.protectedDates);
  const last = latestBefore(activity, "9999-12-31");
  if (!last) return decline("no_activity");

  let preserved: { start: string; length: number };
  let missed: string[];
  let trailingLength = 0;

  if (activity.has(input.today)) {
    // The user is active today, so the gap sits in front of today's run.
    const trailing = runEndingAt(activity, input.today);
    const before = latestBefore(activity, trailing.start);
    if (!before) return decline("no_missed_day", trailing.length);
    preserved = runEndingAt(activity, before);
    missed = missedDatesBetween(before, trailing.start);
    trailingLength = trailing.length;
  } else {
    // The user is away: the gap runs from their last scan up to today.
    preserved = runEndingAt(activity, last);
    missed = missedDatesBetween(last, input.today);
  }

  const bridgeable = missed.filter((date) => !protectedSet.has(date));
  if (bridgeable.length === 0) return decline("no_missed_day", preserved.length);
  if (input.availableCount <= 0) {
    return decline("no_protection_available", preserved.length);
  }
  if (bridgeable.length > input.availableCount) {
    return decline("insufficient_protections", preserved.length);
  }

  // One protection per missed day. A single protection never spans two days.
  // Bridging restores the preserved run; real days the user logged after the
  // gap still count, so the streak resumes rather than restarting.
  return {
    protectedDates: bridgeable.slice(
      0,
      Math.min(
        bridgeable.length,
        input.availableCount,
        streakProtectionConfig.usage.maxDaysCoveredPerProtection * input.availableCount,
      ),
    ),
    streakBefore: preserved.length,
    streakAfter: preserved.length + trailingLength,
    reason: PROTECTION_REASONS.missedActivityDay,
    declined: null,
  };
}

function decline(reason: ProtectionDeclineReason, streakBefore = 0): ProtectionDecision {
  return {
    protectedDates: [],
    streakBefore,
    // A bridged day is never a day the user used FoodGuard, so a protection
    // preserves the streak and never extends it by itself.
    streakAfter: streakBefore,
    reason: PROTECTION_REASONS.missedActivityDay,
    declined: reason,
  };
}

/**
 * Protections a user may hold. Earning past the cap is a no-op rather than an
 * error, and the surplus is never banked for later.
 */
export function applyProtectionCap(
  availableCount: number,
  earned: number,
  maxAvailable: number = streakProtectionConfig.maxAvailable,
): { availableCount: number; capped: boolean } {
  const next = Math.min(maxAvailable, Math.max(0, availableCount) + Math.max(0, earned));
  return { availableCount: next, capped: next >= maxAvailable };
}
