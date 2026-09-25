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
  };
  streakService: {
    activityDate(timestamp: Date, timezone: string): string;
    today(timezone: string, now: Date): string;
    calculateAfterActivity(activityDates: string[], activityDate: string): StreakState;
    calculateForProfile(activityDates: string[], today: string): StreakState;
  };
};
