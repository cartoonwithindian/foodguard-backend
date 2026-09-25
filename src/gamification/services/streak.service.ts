import { gamificationConfig } from "@/gamification/config";
import type { StreakState } from "@/gamification/models/gamification";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDateKey(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function dateKeyToUtcMillis(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function millisToDateKey(millis: number): string {
  const date = new Date(millis);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: string, amount: number): string {
  return millisToDateKey(dateKeyToUtcMillis(value) + amount * 86_400_000);
}

function uniqueSortedDates(values: string[]): string[] {
  return [...new Set(values.filter(isDateKey))].sort();
}

function longestRun(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;
  let longest = 1;
  let run = 1;
  for (let index = 1; index < sortedDates.length; index += 1) {
    const previous = sortedDates[index - 1];
    const current = sortedDates[index];
    if (addDays(previous, 1) === current) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }
  return longest;
}

/**
 * Streak length of the covered run that ends on `referenceDate`.
 *
 * `coveredDates` are days that keep a streak alive -- real qualifying activity
 * plus any day a protection bridged. `countedDates` are the days that actually
 * lengthen it. Separating the two is what stops a protection from inflating a
 * streak: a bridged day holds the run together but is not a day the user
 * actually used FoodGuard, so it is never counted.
 */
function streakRunLength(
  coveredDates: string[],
  countedDates: string[],
  referenceDate: string,
): number {
  if (!coveredDates.includes(referenceDate)) return 0;
  const counted = new Set(countedDates);
  let length = 0;
  let cursor = referenceDate;
  // Bounded by the number of covered days, so a sparse history cannot spin.
  for (let step = 0; step <= coveredDates.length; step += 1) {
    if (counted.has(cursor)) length += 1;
    const previous = addDays(cursor, -1);
    if (!coveredDates.includes(previous)) break;
    cursor = previous;
  }
  return length;
}

/** Longest counted run across the whole history, ignoring protections. */
function longestCountedRun(coveredDates: string[], countedDates: string[]): number {
  let longest = 0;
  for (const date of countedDates) {
    if (!coveredDates.includes(date)) continue;
    longest = Math.max(longest, streakRunLength(coveredDates, countedDates, date));
  }
  return longest;
}

/**
 * Local calendar dates strictly between `from` and `to`. These are the days a
 * user could have qualified on and did not.
 */
export function missedDatesBetween(from: string, to: string): string[] {
  if (!isDateKey(from) || !isDateKey(to)) return [];
  const start = dateKeyToUtcMillis(from) + 86_400_000;
  const end = dateKeyToUtcMillis(to);
  if (end <= start) return [];
  const missed: string[] = [];
  for (let millis = start; millis < end; millis += 86_400_000) {
    missed.push(millisToDateKey(millis));
  }
  return missed;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeTimezone(timezone: string | null | undefined): string {
  const candidate = timezone?.trim() || gamificationConfig.defaultTimezone;
  return isValidTimezone(candidate) ? candidate : "UTC";
}

/**
 * Pure calendar/streak calculations. Timestamps are always supplied by the
 * server; only the stored user's IANA timezone is used to derive a date key.
 */
export class StreakService {
  activityDate(timestamp: Date, timezone: string): string {
    const safeTimezone = normalizeTimezone(timezone);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(timestamp)
      .reduce<Record<string, string>>((result, part) => {
        if (part.type === "year" || part.type === "month" || part.type === "day") {
          result[part.type] = part.value;
        }
        return result;
      }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  today(timezone: string, now: Date): string {
    return this.activityDate(now, timezone);
  }

  /**
   * @param protectedDates Local dates bridged by a consumed protection. They
   *   keep a run contiguous but never add to its length, so one protection can
   *   preserve a streak without inflating it.
   */
  calculateAfterActivity(
    activityDates: string[],
    activityDate: string,
    protectedDates: readonly string[] = [],
  ): StreakState {
    const counted = uniqueSortedDates([...activityDates, activityDate]);
    const covered = uniqueSortedDates([...counted, ...protectedDates]);
    const lastActivityDate = counted.at(-1) ?? null;
    return {
      currentStreak: streakRunLength(covered, counted, activityDate),
      longestStreak: Math.max(longestCountedRun(covered, counted), longestRun(counted)),
      lastActivityDate,
    };
  }

  calculateForProfile(
    activityDates: string[],
    today: string,
    protectedDates: readonly string[] = [],
  ): StreakState {
    const counted = uniqueSortedDates(activityDates);
    const lastActivityDate = counted.at(-1) ?? null;
    const covered = uniqueSortedDates([...counted, ...protectedDates]);
    const longestStreak = Math.max(longestCountedRun(covered, counted), longestRun(counted));
    if (!lastActivityDate) {
      return { currentStreak: 0, longestStreak, lastActivityDate: null };
    }

    // A streak survives only if every local day between its last qualifying
    // activity and today was either used or bridged by a protection. With no
    // protections this reduces to the original one-day grace: a single missed
    // day resets the streak.
    const resetOnMissedDay = gamificationConfig.streakResetPolicy === "reset_on_missed_day";
    const protectedSet = new Set(protectedDates.filter(isDateKey));
    const missed = resetOnMissedDay ? missedDatesBetween(lastActivityDate, today) : [];
    const isCurrent = missed.every((date) => protectedSet.has(date));
    return {
      currentStreak: isCurrent ? streakRunLength(covered, counted, lastActivityDate) : 0,
      longestStreak,
      lastActivityDate,
    };
  }
}

export const streakService = new StreakService();
export { normalizeTimezone };
