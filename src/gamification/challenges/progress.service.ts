import {
  isSupportedChallengeConditionType,
  type ChallengeCondition,
  type ChallengeDefinition,
} from "@/gamification/challenges/config";

/**
 * Pure challenge progress calculation.
 *
 * Every count is derived from rows the caller has already read from the
 * database and filtered to the challenge window. This module never queries,
 * persists, or invents activity: a missing row simply means no progress.
 *
 * Counting rules differ per condition type so that replays and repeated views
 * cannot inflate progress:
 *  - UNIQUE_PRODUCT_COUNT  – distinct products among validated product scans.
 *  - PRODUCT_SCAN_COUNT    – replay-safe count of product scans.
 *  - INGREDIENT_VIEW_COUNT – distinct ingredients, replays collapsed.
 *  - MEANINGFUL_CHAT_COUNT – distinct products the user asked about.
 *  - STREAK_DAYS           – the authoritative streak length from the profile.
 *
 * Any condition type outside the supported set evaluates to 0.
 */

/** Activity vocabulary a store maps persisted rows onto. */
export const CHALLENGE_ACTIVITY_TYPES = [
  "product_scan",
  "ingredient_view",
  "meaningful_chat",
] as const;

export type ChallengeActivityType = (typeof CHALLENGE_ACTIVITY_TYPES)[number];

/**
 * One qualifying activity row inside a challenge window. `activityDate` is the
 * local date key already filtered to the window by the caller.
 */
export type ChallengeActivityRow = {
  activityType: ChallengeActivityType | string;
  activityDate: string;
  productId?: string | null;
  ingredientId?: string | null;
  /** Idempotency key; replays sharing an event id never count twice. */
  eventId?: string | null;
};

export type ChallengeProgressInput = {
  activities?: readonly ChallengeActivityRow[] | null;
  /** Authoritative current streak length in days from the profile record. */
  currentStreakDays?: number | null;
};

export type ChallengeProgressState = {
  progress: number;
  target: number;
  /** progress / target clamped to 0..1; 0 when the target is 0. */
  ratio: number;
  completed: boolean;
  remaining: number;
};

export type ChallengeEvaluation = ChallengeProgressState & {
  definition: ChallengeDefinition;
};

function normalized(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function rowsOfType(
  activities: readonly ChallengeActivityRow[] | null | undefined,
  activityType: ChallengeActivityType,
): ChallengeActivityRow[] {
  if (!activities?.length) return [];
  return activities.filter((row) => row?.activityType === activityType);
}

/**
 * Collapses HTTP/replay duplicates. Rows without an event id cannot be matched
 * to a replay, so they are kept as-is rather than guessed at.
 */
function withoutReplays(rows: readonly ChallengeActivityRow[]): ChallengeActivityRow[] {
  const seen = new Set<string>();
  const result: ChallengeActivityRow[] = [];
  for (const row of rows) {
    const eventId = normalized(row.eventId);
    if (!eventId) {
      result.push(row);
      continue;
    }
    if (seen.has(eventId)) continue;
    seen.add(eventId);
    result.push(row);
  }
  return result;
}

function distinctCount(rows: readonly ChallengeActivityRow[], key: (row: ChallengeActivityRow) => string): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (value) seen.add(value);
  }
  return seen.size;
}

export function countUniqueProducts(activities: ChallengeProgressInput["activities"]): number {
  return distinctCount(
    withoutReplays(rowsOfType(activities, "product_scan")),
    (row) => normalized(row.productId),
  );
}

export function countProductScans(activities: ChallengeProgressInput["activities"]): number {
  return withoutReplays(rowsOfType(activities, "product_scan")).length;
}

export function countIngredientViews(activities: ChallengeProgressInput["activities"]): number {
  return distinctCount(
    withoutReplays(rowsOfType(activities, "ingredient_view")),
    (row) => normalized(row.ingredientId) || normalized(row.productId),
  );
}

export function countMeaningfulChats(activities: ChallengeProgressInput["activities"]): number {
  // A meaningful question is one tied to a product; greetings and product-less
  // messages never advance the challenge.
  return distinctCount(
    withoutReplays(rowsOfType(activities, "meaningful_chat")),
    (row) => normalized(row.productId),
  );
}

export function countStreakDays(currentStreakDays: number | null | undefined): number {
  if (typeof currentStreakDays !== "number" || !Number.isFinite(currentStreakDays)) return 0;
  return Math.max(0, Math.floor(currentStreakDays));
}

function safeTarget(target: number | null | undefined): number {
  if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) return 0;
  return Math.floor(target);
}

/** True only for a known condition type with a usable positive target. */
export function isSupportedChallengeCondition(
  condition: ChallengeCondition | null | undefined,
): condition is ChallengeCondition {
  return (
    Boolean(condition) &&
    isSupportedChallengeConditionType(condition?.type) &&
    safeTarget(condition?.target) > 0
  );
}

/**
 * Units of progress toward a challenge, capped at its target so a streak or
 * scan count beyond the goal still reads as complete. Unsupported conditions
 * return 0.
 */
export function calculateChallengeProgress(
  condition: ChallengeCondition | null | undefined,
  input: ChallengeProgressInput = {},
): number {
  if (!isSupportedChallengeCondition(condition)) return 0;
  const { type, target } = condition;
  const activities = input.activities ?? [];

  let progress: number;
  switch (type) {
    case "UNIQUE_PRODUCT_COUNT":
      progress = countUniqueProducts(activities);
      break;
    case "PRODUCT_SCAN_COUNT":
      progress = countProductScans(activities);
      break;
    case "INGREDIENT_VIEW_COUNT":
      progress = countIngredientViews(activities);
      break;
    case "MEANINGFUL_CHAT_COUNT":
      progress = countMeaningfulChats(activities);
      break;
    case "STREAK_DAYS":
      progress = countStreakDays(input.currentStreakDays);
      break;
    default:
      return 0;
  }

  return Math.min(progress, safeTarget(target));
}

export function toProgressState(
  condition: ChallengeCondition | null | undefined,
  input: ChallengeProgressInput = {},
): ChallengeProgressState {
  const target = isSupportedChallengeCondition(condition)
    ? safeTarget(condition?.target)
    : 0;
  const progress = calculateChallengeProgress(condition, input);
  return {
    progress,
    target,
    ratio: target > 0 ? Math.min(1, progress / target) : 0,
    completed: target > 0 && progress >= target,
    remaining: Math.max(0, target - progress),
  };
}

export function evaluateChallenge(
  definition: ChallengeDefinition,
  input: ChallengeProgressInput = {},
): ChallengeEvaluation {
  return { definition, ...toProgressState(definition.condition, input) };
}

/** Evaluates a set of definitions against one window's activity. */
export function evaluateChallenges(
  definitions: readonly ChallengeDefinition[],
  input: ChallengeProgressInput = {},
): ChallengeEvaluation[] {
  return definitions.map((definition) => evaluateChallenge(definition, input));
}
