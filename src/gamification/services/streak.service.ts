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

function countBackFrom(sortedDates: string[], lastDate: string): number {
  let count = 1;
  for (let index = sortedDates.length - 1; index > 0; index -= 1) {
    if (addDays(sortedDates[index - 1], 1) !== sortedDates[index]) break;
    count += 1;
  }
  return lastDate ? count : 0;
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

  calculateAfterActivity(activityDates: string[], activityDate: string): StreakState {
    const sorted = uniqueSortedDates([...activityDates, activityDate]);
    const longestStreak = longestRun(sorted);
    const lastActivityDate = sorted.at(-1) ?? null;
    const currentStreak =
      lastActivityDate === activityDate ? countBackFrom(sorted, activityDate) : 0;
    return { currentStreak, longestStreak, lastActivityDate };
  }

  calculateForProfile(activityDates: string[], today: string): StreakState {
    const sorted = uniqueSortedDates(activityDates);
    const lastActivityDate = sorted.at(-1) ?? null;
    const longestStreak = longestRun(sorted);
    if (!lastActivityDate) {
      return { currentStreak: 0, longestStreak: 0, lastActivityDate: null };
    }

    // A streak remains current through the day immediately after its last
    // qualifying activity. Once a full local day is missed, it resets to zero.
    const resetOnMissedDay = gamificationConfig.streakResetPolicy === "reset_on_missed_day";
    const isCurrent =
      !resetOnMissedDay || lastActivityDate === today || lastActivityDate === addDays(today, -1);
    return {
      currentStreak: isCurrent ? countBackFrom(sorted, lastActivityDate) : 0,
      longestStreak,
      lastActivityDate,
    };
  }
}

export const streakService = new StreakService();
export { normalizeTimezone };
