/**
 * Centralized configuration for FoodGuard challenges (Module 3).
 *
 * A challenge is a server-owned rule: the period it runs in, the activity that
 * satisfies it, and the XP it pays out. Definitions are static configuration.
 * Nothing in this file reads user data, and no activity is ever created here.
 */

export type ChallengePeriod = "daily" | "weekly";

/**
 * Week start as a JavaScript day index (0 = Sunday ... 6 = Saturday). A numeric
 * value keeps the setting configurable without parsing locale day names.
 */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Every condition type the progress calculator can evaluate. */
export const CHALLENGE_CONDITION_TYPES = [
  "UNIQUE_PRODUCT_COUNT",
  "PRODUCT_SCAN_COUNT",
  "INGREDIENT_VIEW_COUNT",
  "MEANINGFUL_CHAT_COUNT",
  "STREAK_DAYS",
] as const;

export type ChallengeConditionType = (typeof CHALLENGE_CONDITION_TYPES)[number];

export type ChallengeCondition = {
  type: ChallengeConditionType;
  /** Number of qualifying units required to complete the challenge. */
  target: number;
};

export type ChallengeDefinition = {
  id: string;
  title: string;
  description: string;
  period: ChallengePeriod;
  condition: ChallengeCondition;
  rewardXp: number;
  startRule: string;
  endRule: string;
};

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function weekStart(value: string | undefined): WeekStart {
  if (!value) return 1;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? (parsed as WeekStart) : 1;
}

/** Runtime guard: a condition type read from storage is only accepted if known. */
export function isSupportedChallengeConditionType(
  value: unknown,
): value is ChallengeConditionType {
  return (
    typeof value === "string" &&
    (CHALLENGE_CONDITION_TYPES as readonly string[]).includes(value)
  );
}

function definition(input: Omit<ChallengeDefinition, "startRule" | "endRule">): ChallengeDefinition {
  return Object.freeze({
    ...input,
    startRule: input.period === "daily" ? "local_day_start" : "local_week_start",
    endRule: input.period === "daily" ? "local_day_end" : "local_week_end",
    condition: Object.freeze({ ...input.condition }),
  });
}

/**
 * Initial challenge set. Rewards and targets are policy, so they live here
 * rather than in the period, progress, or persistence code.
 */
const initialChallengeDefinitions: readonly ChallengeDefinition[] = Object.freeze([
  definition({
    id: "daily_product_explorer",
    title: "Product Explorer",
    description: "Scan 3 different food products",
    period: "daily",
    condition: { type: "UNIQUE_PRODUCT_COUNT", target: 3 },
    rewardXp: 25,
  }),
  definition({
    id: "daily_ingredient_check",
    title: "Ingredient Check",
    description: "Check ingredients of 2 products",
    period: "daily",
    condition: { type: "INGREDIENT_VIEW_COUNT", target: 2 },
    rewardXp: 20,
  }),
  definition({
    id: "daily_foodguard_question",
    title: "FoodGuard Question",
    description: "Ask 1 meaningful question about a food product",
    period: "daily",
    condition: { type: "MEANINGFUL_CHAT_COUNT", target: 1 },
    rewardXp: 15,
  }),
  definition({
    id: "weekly_product_explorer",
    title: "Product Explorer",
    description: "Scan 10 different food products",
    period: "weekly",
    condition: { type: "UNIQUE_PRODUCT_COUNT", target: 10 },
    rewardXp: 75,
  }),
  definition({
    id: "weekly_ingredient_check",
    title: "Ingredient Check",
    description: "Check ingredients of 5 products",
    period: "weekly",
    condition: { type: "INGREDIENT_VIEW_COUNT", target: 5 },
    rewardXp: 50,
  }),
  definition({
    id: "weekly_seven_day_streak",
    title: "Seven Day Streak",
    description: "Stay active for 7 days in a row this week.",
    period: "weekly",
    condition: { type: "STREAK_DAYS", target: 7 },
    rewardXp: 100,
  }),
]);

export const challengesConfig = Object.freeze({
  weekStart: weekStart(process.env.CHALLENGES_WEEK_START),
  defaultTimezone: process.env.CHALLENGES_DEFAULT_TIMEZONE?.trim() || "UTC",
  supportedConditionTypes: CHALLENGE_CONDITION_TYPES,
  definitions: initialChallengeDefinitions,
});

export type ChallengesConfig = typeof challengesConfig;

export function listChallengeDefinitions(period?: ChallengePeriod): ChallengeDefinition[] {
  const all = [...challengesConfig.definitions];
  return period ? all.filter((entry) => entry.period === period) : all;
}

export function getChallengeDefinition(id: string): ChallengeDefinition | null {
  const key = id?.trim();
  if (!key) return null;
  return challengesConfig.definitions.find((entry) => entry.id === key) ?? null;
}

/** Every condition type used by the initial definitions, for validation. */
export function usedChallengeConditionTypes(): ChallengeConditionType[] {
  return [...new Set(challengesConfig.definitions.map((entry) => entry.condition.type))];
}
