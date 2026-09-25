import type { DataStore } from "@/lib/store/types";

/**
 * Persistence seam for gamification. The existing FoodGuard DataStore remains
 * the sole database abstraction; this type documents the two operations the
 * module needs without introducing another repository/database.
 */
export type GamificationRepository = Pick<
  DataStore,
  "getGamificationProfile" | "recordSuccessfulProductScan"
>;
