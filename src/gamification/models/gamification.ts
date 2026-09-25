/**
 * Shared contracts for the FoodGuard XP + daily-streak module.
 *
 * The database remains authoritative. These types intentionally contain no
 * client-provided XP, streak, or activity-date fields.
 */

export const PRODUCT_SCAN_ACTION = "product_scan" as const;
export type ProductScanAction = typeof PRODUCT_SCAN_ACTION;

export type GamificationProfileRecord = {
  userId: string;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GamificationActivityRecord = {
  activityId: string;
  userId: string;
  actionType: string;
  productId: string;
  activityDate: string;
  timestamp: string;
  xpAwarded: number;
  eventId: string;
};

export type ValidatedGamificationActionType =
  | "product_scan"
  | "ingredient_view"
  | "meaningful_chat";

export type ValidatedGamificationActivityInput = {
  userId: string;
  actionType: ValidatedGamificationActionType;
  productId: string;
  ingredientId?: string | null;
  timestamp: Date;
  eventId: string;
  eventIdProvided: boolean;
};

export type SuccessfulProductScanInput = {
  userId: string;
  actionType: ProductScanAction;
  productId: string;
  /** Server-owned UTC instant. Never populated from an HTTP request body. */
  timestamp: Date;
  eventId: string;
  /** False for legacy clients that did not provide an idempotency key. */
  eventIdProvided: boolean;
};

export type GamificationActivityResult = {
  activity: GamificationActivityRecord;
  profile: GamificationProfileRecord;
  /** True when an existing event was returned without a second mutation. */
  idempotent: boolean;
  /** Present when challenge evaluation ran in the same transaction. */
  challenges?: import("@/gamification/challenges/models").ChallengeDefinitionView[];
  completedChallenges?: import("@/gamification/challenges/models").ChallengeCompletion[];
};

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
};

export type GamificationRules = {
  now: () => Date;
  duplicateRequestWindowMs: number;
  xpService: {
    calculateProductScanXp(input: {
      isNewProduct: boolean;
      hasPriorProductOnDate: boolean;
    }): number;
    calculateChallengeReward(rewardXp: number): number;
  };
  streakService: {
    activityDate(timestamp: Date, timezone: string): string;
    today(timezone: string, now: Date): string;
    calculateAfterActivity(activityDates: string[], activityDate: string): StreakState;
    calculateForProfile(activityDates: string[], today: string): StreakState;
  };
};
