/**
 * Centralized achievement definitions (Module 2).
 *
 * An achievement is a server-owned rule: a real milestone and what it pays.
 * Definitions are static configuration and describe only *what* qualifies, so a
 * definition can never put an entry in a user's collection on its own.
 *
 * Every condition here is backed by data this backend already persists:
 * Module 1 XP and streaks, Module 3 challenge completions, and the real
 * activity rows behind scans, ingredient views, and meaningful questions. A
 * condition with no backing data is deliberately absent rather than shipped as
 * a rule that could never complete.
 */

export const ACHIEVEMENT_CONDITION_TYPES = [
  /** Distinct products the user has successfully scanned. */
  "UNIQUE_PRODUCTS_SCANNED",
  /** Lifetime XP total. */
  "TOTAL_XP",
  /** Longest daily streak reached. */
  "LONGEST_STREAK",
  /** Products whose ingredient information the user opened. */
  "INGREDIENT_VIEWS",
  /** Meaningful product questions the user asked. */
  "MEANINGFUL_CHATS",
  /** Challenges completed across all periods. */
  "CHALLENGES_COMPLETED",
] as const;
export type AchievementConditionType = (typeof ACHIEVEMENT_CONDITION_TYPES)[number];

export type AchievementDefinition = {
  id: string;
  name: string;
  description: string;
  /** Short label for the UI; never carries state. */
  icon: string;
  condition: { type: AchievementConditionType; target: number };
  /** XP paid once on unlock, through the Module 1 XP service. */
  rewardXp: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function definition(input: Omit<AchievementDefinition, "icon"> & { icon?: string }): AchievementDefinition {
  return Object.freeze({
    ...input,
    icon: input.icon ?? "🏅",
    condition: Object.freeze({ ...input.condition }),
  });
}

/**
 * Initial achievement set. Each one rewards a behaviour that genuinely builds
 * food awareness, and the ladder escalates from first steps to sustained use.
 */
const initialAchievementDefinitions: readonly AchievementDefinition[] = Object.freeze([
  definition({
    id: "first_scan",
    name: "First Look",
    description: "Scan your first food product",
    icon: "🔍",
    condition: { type: "UNIQUE_PRODUCTS_SCANNED", target: 1 },
    rewardXp: 10,
  }),
  definition({
    id: "food_explorer",
    name: "Food Explorer",
    description: "Scan 10 different food products",
    icon: "🌎",
    condition: { type: "UNIQUE_PRODUCTS_SCANNED", target: 10 },
    rewardXp: 25,
  }),
  definition({
    id: "ingredient_inspector",
    name: "Ingredient Inspector",
    description: "Check ingredients on 5 different products",
    icon: "🔬",
    condition: { type: "INGREDIENT_VIEWS", target: 5 },
    rewardXp: 20,
  }),
  definition({
    id: "curious_mind",
    name: "Curious Mind",
    description: "Ask 5 meaningful questions about food products",
    icon: "💡",
    condition: { type: "MEANINGFUL_CHATS", target: 5 },
    rewardXp: 20,
  }),
  definition({
    id: "streak_of_three",
    name: "Getting Into It",
    description: "Reach a 3 day FoodGuard streak",
    icon: "🔥",
    condition: { type: "LONGEST_STREAK", target: 3 },
    rewardXp: 15,
  }),
  definition({
    id: "streak_of_seven",
    name: "Week Strong",
    description: "Reach a 7 day FoodGuard streak",
    icon: "📅",
    condition: { type: "LONGEST_STREAK", target: 7 },
    rewardXp: 35,
  }),
  definition({
    id: "challenge_champion",
    name: "Challenge Champion",
    description: "Complete 5 FoodGuard challenges",
    icon: "🎯",
    condition: { type: "CHALLENGES_COMPLETED", target: 5 },
    rewardXp: 40,
  }),
  definition({
    id: "century_club",
    name: "Century Club",
    description: "Earn 500 XP",
    condition: { type: "TOTAL_XP", target: positiveInteger(process.env.ACHIEVEMENT_CENTURY_XP, 500) },
    rewardXp: 0,
  }),
]);

export const achievementConfig = Object.freeze({
  definitions: initialAchievementDefinitions,
  supportedConditionTypes: ACHIEVEMENT_CONDITION_TYPES,
});

export function listAchievementDefinitions(): AchievementDefinition[] {
  return [...achievementConfig.definitions];
}

export function getAchievementDefinition(id: string): AchievementDefinition | null {
  const key = id?.trim();
  if (!key) return null;
  return achievementConfig.definitions.find((entry) => entry.id === key) ?? null;
}
