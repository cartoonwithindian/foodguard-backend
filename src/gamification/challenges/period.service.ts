import {
  challengesConfig,
  type ChallengePeriod,
  type WeekStart,
} from "@/gamification/challenges/config";
import { isValidTimezone } from "@/gamification/services/streak.service";

/**
 * Timezone-aware period boundaries for challenges.
 *
 * Daily and weekly challenges reset on the user's local calendar boundaries, not
 * on UTC midnight, so every calculation is derived from the stored user's IANA
 * timezone. A missing or invalid timezone falls back to UTC.
 *
 * Windows are half-open: `startInstant` is inclusive and `endInstant` is
 * exclusive, so consecutive windows tile the timeline without overlap. The
 * matching local date keys use the same convention: `startDate` is the first
 * day in the period and `endDate` is the day after the period.
 */

export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type ChallengePeriodWindow = {
  period: ChallengePeriod;
  /** Validated IANA timezone the window was computed in. */
  timezone: string;
  weekStart: WeekStart;
  /** Local date key (YYYY-MM-DD) of the first day in the period, inclusive. */
  startDate: string;
  /** Local date key (YYYY-MM-DD) of the day after the period, exclusive. */
  endDate: string;
  /** Exact instant the period opens, inclusive. */
  startInstant: Date;
  /** Exact instant the period closes, exclusive. */
  endInstant: Date;
  /** Number of local days the period spans. */
  dayCount: number;
  /** Local date key of the instant the window was resolved for. */
  referenceDate: string;
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MILLIS_PER_DAY = 86_400_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(timezone, created);
  return created;
}

function localParts(instant: Date, timezone: string): LocalDateParts {
  const values: Record<string, number> = {};
  for (const part of formatter(timezone).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    // Some locales report midnight as hour 24 even under the h23 hour cycle.
    hour: values.hour % 24,
    minute: values.minute,
    second: values.second,
  };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function isDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function dateKeyToCalendarMillis(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDaysToDateKey(value: string, amount: number): string {
  const date = new Date(dateKeyToCalendarMillis(value) + amount * MILLIS_PER_DAY);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Day of week (0 = Sunday ... 6 = Saturday) of a local date key. A date key is
 * a plain calendar date, so its weekday is independent of any timezone.
 */
export function dayOfWeek(value: string): number {
  return new Date(dateKeyToCalendarMillis(value)).getUTCDay();
}

export function isDateKeyBefore(a: string, b: string): boolean {
  return dateKeyToCalendarMillis(a) < dateKeyToCalendarMillis(b);
}

/**
 * Offset of `timezone` at `instant`, in milliseconds east of UTC. Computed by
 * reading the local wall clock back as if it were UTC.
 */
function zoneOffsetMillis(instant: Date, timezone: string): number {
  const parts = localParts(instant, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // Period boundaries are second-precision; drop sub-second noise so the
  // offset is stable across the two-pass resolution below.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Exact instant of local midnight starting `dateKey`. Two passes handle zones
 * whose offset differs between the naive guess and the resolved instant (DST
 * transitions), which is why a single subtraction can be off by an hour.
 */
function startOfLocalDay(dateKey: string, timezone: string): Date {
  const naive = dateKeyToCalendarMillis(dateKey);
  const firstOffset = zoneOffsetMillis(new Date(naive), timezone);
  let millis = naive - firstOffset;
  const secondOffset = zoneOffsetMillis(new Date(millis), timezone);
  if (secondOffset !== firstOffset) {
    millis = naive - secondOffset;
  }
  return new Date(millis);
}

/**
 * Pure calendar math for challenge periods. The only inputs are the server
 * clock and the user's stored IANA timezone.
 */
export class ChallengePeriodService {
  /** Validates a user timezone, falling back to the configured default. */
  resolveTimezone(timezone: string | null | undefined): string {
    const candidate = timezone?.trim() || challengesConfig.defaultTimezone;
    if (isValidTimezone(candidate)) return candidate;
    return isValidTimezone(challengesConfig.defaultTimezone)
      ? challengesConfig.defaultTimezone
      : "UTC";
  }

  /** Local calendar date key (YYYY-MM-DD) of an instant in a timezone. */
  localDateKey(instant: Date, timezone: string | null | undefined): string {
    const parts = localParts(instant, this.resolveTimezone(timezone));
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }

  startOfLocalDay(dateKey: string, timezone: string | null | undefined): Date {
    return startOfLocalDay(dateKey, this.resolveTimezone(timezone));
  }

  /** First local date key of the week containing `dateKey`. */
  weekStartDateKey(dateKey: string, weekStart: WeekStart = challengesConfig.weekStart): string {
    const shift = (dayOfWeek(dateKey) - weekStart + 7) % 7;
    return addDaysToDateKey(dateKey, -shift);
  }

  dailyWindow(
    now: Date,
    timezone: string | null | undefined,
  ): ChallengePeriodWindow {
    return this.windowFor(now, timezone, "daily");
  }

  weeklyWindow(
    now: Date,
    timezone: string | null | undefined,
  ): ChallengePeriodWindow {
    return this.windowFor(now, timezone, "weekly");
  }

  windowFor(
    now: Date,
    timezone: string | null | undefined,
    period: ChallengePeriod,
  ): ChallengePeriodWindow {
    const safeTimezone = this.resolveTimezone(timezone);
    const referenceDate = this.localDateKey(now, safeTimezone);
    const weekStart = challengesConfig.weekStart;
    const startDate =
      period === "daily"
        ? referenceDate
        : this.weekStartDateKey(referenceDate, weekStart);
    const dayCount = period === "daily" ? 1 : 7;
    const endDate = addDaysToDateKey(startDate, dayCount);

    return {
      period,
      timezone: safeTimezone,
      weekStart,
      startDate,
      endDate,
      startInstant: startOfLocalDay(startDate, safeTimezone),
      endInstant: startOfLocalDay(endDate, safeTimezone),
      dayCount,
      referenceDate,
    };
  }

  /** Inclusive start, exclusive end. */
  containsInstant(window: ChallengePeriodWindow, instant: Date): boolean {
    const millis = instant.getTime();
    return millis >= window.startInstant.getTime() && millis < window.endInstant.getTime();
  }

  /** Inclusive start date, exclusive end date. */
  containsDateKey(window: ChallengePeriodWindow, dateKey: string): boolean {
    if (!isDateKey(dateKey)) return false;
    const millis = dateKeyToCalendarMillis(dateKey);
    return (
      millis >= dateKeyToCalendarMillis(window.startDate) &&
      millis < dateKeyToCalendarMillis(window.endDate)
    );
  }
}

export const challengePeriodService = new ChallengePeriodService();
