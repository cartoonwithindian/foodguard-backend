import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryStore } from "@/lib/store/memory";
import { GamificationService } from "@/gamification/services/gamification.service";
import { gamificationConfig } from "@/gamification/config";
import { getAchievementDefinition } from "@/gamification/achievements/config";
import { XPService } from "@/gamification/services/xp.service";
import type { ProductInfo } from "@/types/domain";

/**
 * A first successful scan also unlocks the Module 2 `first_scan` achievement,
 * so a lifetime total after one scan is scan XP + unique-product XP + this.
 */
const FIRST_SCAN_REWARD_XP = getAchievementDefinition("first_scan")!.rewardXp;

/**
 * These fixtures are isolated test records. Production never seeds users,
 * products, activities, XP, or streaks from this file.
 */
function testProduct(barcode: string, name: string): ProductInfo {
  return {
    id: "",
    barcode,
    name,
    brand: "Test brand",
    category: "food",
    country: "IN",
    servingSize: null,
    imageUrl: null,
    ingredientsRaw: "Water, Salt",
    ingredientsNormalized: ["water", "salt"],
    source: "test_provider",
    sourceUrl: null,
    verified: true,
    productDataConfidence: 0.95,
    isDemo: false,
  };
}

describe("FoodGuard XP + daily streak engine", () => {
  let store: InMemoryStore;
  let service: GamificationService;
  let userId: string;
  let productId: string;
  let now: Date;

  beforeEach(async () => {
    store = new InMemoryStore();
    now = new Date("2026-09-20T12:00:00.000Z");
    service = new GamificationService(store, () => now);
    const user = await store.createUser({
      email: `gamification-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`,
      name: "Test User",
      passwordHash: null,
      timezone: "UTC",
    });
    userId = user.id;
    const saved = await store.saveProductFromProvider({
      product: testProduct("9999999999999", "Test Food Product"),
      nutrition: null,
      source: "test_provider",
    });
    productId = saved.product!.id;
  });

  it("supports changing the duplicate policy without changing calculation code", () => {
    const noDuplicateXp = new XPService(
      gamificationConfig.successfulScanXp,
      gamificationConfig.uniqueProductXp,
      "no_xp",
    );
    const oncePerDay = new XPService(
      gamificationConfig.successfulScanXp,
      gamificationConfig.uniqueProductXp,
      "once_per_day",
    );

    expect(noDuplicateXp.calculateProductScanXp({ isNewProduct: false, hasPriorProductOnDate: false })).toBe(0);
    expect(oncePerDay.calculateProductScanXp({ isNewProduct: false, hasPriorProductOnDate: true })).toBe(0);
    expect(oncePerDay.calculateProductScanXp({ isNewProduct: false, hasPriorProductOnDate: false })).toBe(
      gamificationConfig.successfulScanXp,
    );
  });

  it("starts a new user at zero XP and zero streaks", async () => {
    const profile = await service.getProfile(userId);
    expect(profile).toMatchObject({
      totalXp: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
    });
  });

  it("awards configured scan + unique-product XP on the first successful scan", async () => {
    const result = await service.recordProductScan({
      userId,
      productId,
      eventId: "first-successful-scan",
    });

    expect(result.activity.xpAwarded).toBe(
      gamificationConfig.successfulScanXp + gamificationConfig.uniqueProductXp,
    );
    expect(result.profile).toMatchObject({
      totalXp: gamificationConfig.successfulScanXp + gamificationConfig.uniqueProductXp,
      currentStreak: 1,
      longestStreak: 1,
      lastActivityDate: "2026-09-20",
    });
  });

  it("keeps the streak at one for another scan on the same local day", async () => {
    await service.recordProductScan({ userId, productId, eventId: "same-day-first" });
    now = new Date("2026-09-20T18:00:00.000Z");
    const second = await service.recordProductScan({
      userId,
      productId,
      eventId: "same-day-second",
    });

    expect(second.activity.xpAwarded).toBe(gamificationConfig.successfulScanXp);
    expect(second.profile.currentStreak).toBe(1);
    expect(second.profile.longestStreak).toBe(1);
  });

  it("increments the streak on the immediately following local day", async () => {
    await service.recordProductScan({ userId, productId, eventId: "day-one-event" });
    now = new Date("2026-09-21T12:00:00.000Z");
    const second = await service.recordProductScan({
      userId,
      productId,
      eventId: "day-two-event",
    });

    expect(second.profile.currentStreak).toBe(2);
    expect(second.profile.longestStreak).toBe(2);
  });

  it("resets the current streak after a missed local day but preserves longest", async () => {
    await service.recordProductScan({ userId, productId, eventId: "day-one-event" });
    now = new Date("2026-09-21T12:00:00.000Z");
    await service.recordProductScan({ userId, productId, eventId: "day-two-event" });
    now = new Date("2026-09-23T12:00:00.000Z");
    const afterGap = await service.recordProductScan({
      userId,
      productId,
      eventId: "after-gap",
    });

    expect(afterGap.profile.currentStreak).toBe(1);
    expect(afterGap.profile.longestStreak).toBe(2);
  });

  it("reconciles a stale current streak when a full local day is missed", async () => {
    await service.recordProductScan({ userId, productId, eventId: "profile-day-one" });
    now = new Date("2026-09-21T12:00:00.000Z");
    await service.recordProductScan({ userId, productId, eventId: "profile-day-two" });
    now = new Date("2026-09-23T12:00:00.000Z");

    const profile = await service.getProfile(userId);
    expect(profile.currentStreak).toBe(0);
    expect(profile.longestStreak).toBe(2);
  });

  it("does not record XP, streak, or activity for an invalid product", async () => {
    await expect(
      service.recordProductScan({ userId, productId: "missing-product", eventId: "failed-scan" }),
    ).rejects.toThrow("Product was not found");

    const profile = await service.getProfile(userId);
    expect(profile.totalXp).toBe(0);
    expect(profile.currentStreak).toBe(0);
    expect(profile.lastActivityDate).toBe(null);
    expect(
      (store as unknown as { gamificationActivities: unknown[] }).gamificationActivities,
    ).toHaveLength(0);
  });

  it("makes a duplicate API event idempotent", async () => {
    const first = await service.recordProductScan({
      userId,
      productId,
      eventId: "duplicate-event-id",
    });
    const duplicate = await service.recordProductScan({
      userId,
      productId,
      eventId: "duplicate-event-id",
    });

    expect(duplicate.idempotent).toBe(true);
    expect(duplicate.activity.xpAwarded).toBe(first.activity.xpAwarded);
    // The scan response is written before the Module 2 reconciliation that paid
    // `first_scan` inside the same transaction, so the repeat is the first read
    // that sees the payout. It is paid once, and only once.
    expect(duplicate.profile.totalXp).toBe(first.profile.totalXp + FIRST_SCAN_REWARD_XP);
    expect(duplicate.profile.currentStreak).toBe(1);

    const third = await service.recordProductScan({
      userId,
      productId,
      eventId: "duplicate-event-id",
    });
    expect(third.idempotent).toBe(true);
    expect(third.profile.totalXp).toBe(duplicate.profile.totalXp);
  });

  it("deduplicates simultaneous retries of the same event", async () => {
    const [first, second] = await Promise.all([
      service.recordProductScan({ userId, productId, eventId: "same-concurrent-event" }),
      service.recordProductScan({ userId, productId, eventId: "same-concurrent-event" }),
    ]);
    expect(first.profile.totalXp).toBe(
      gamificationConfig.successfulScanXp + gamificationConfig.uniqueProductXp,
    );
    // Only the winner of the race paid scan XP; the loser is a pure replay plus
    // the one-time `first_scan` payout.
    expect(second.profile.totalXp).toBe(first.profile.totalXp + FIRST_SCAN_REWARD_XP);
    expect(second.idempotent).toBe(true);

    const profile = await service.getProfile(userId);
    expect(profile.totalXp).toBe(second.profile.totalXp);
  });

  it("serializes concurrent requests without losing XP or corrupting the streak", async () => {
    const [first, second] = await Promise.all([
      service.recordProductScan({ userId, productId, eventId: "concurrent-one" }),
      service.recordProductScan({ userId, productId, eventId: "concurrent-two" }),
    ]);

    // Two scans of the same product: both pay the base scan XP, one pays the
    // unique-product bonus, and `first_scan` pays once on top.
    const expectedTotal =
      gamificationConfig.successfulScanXp * 2 +
      gamificationConfig.uniqueProductXp +
      FIRST_SCAN_REWARD_XP;
    expect(first.profile.totalXp).toBeGreaterThan(0);
    expect(second.profile.totalXp).toBe(expectedTotal);
    const profile = await service.getProfile(userId);
    expect(profile.totalXp).toBe(expectedTotal);
    expect(profile.currentStreak).toBe(1);
  });

  it("keeps persisted progress when the request service is recreated", async () => {
    await service.recordProductScan({ userId, productId, eventId: "restart-event" });
    const recreated = new GamificationService(store, () => now);
    const profile = await recreated.getProfile(userId);
    // The persisted total includes the `first_scan` achievement the scan unlocked.
    expect(profile.totalXp).toBe(
      gamificationConfig.successfulScanXp + gamificationConfig.uniqueProductXp + FIRST_SCAN_REWARD_XP,
    );
    expect(profile.currentStreak).toBe(1);
  });

  it("isolates progress by authenticated user after another login", async () => {
    await service.recordProductScan({ userId, productId, eventId: "user-one-event" });
    const other = await store.createUser({
      email: `other-${Date.now()}@test.invalid`,
      name: "Other User",
      passwordHash: null,
      timezone: "UTC",
    });
    const otherProfile = await service.getProfile(other.id);
    expect(otherProfile.totalXp).toBe(0);
    expect(otherProfile.currentStreak).toBe(0);
  });

  it("derives activity dates in the user's configured timezone", async () => {
    const localUser = await store.createUser({
      email: `timezone-${Date.now()}@test.invalid`,
      name: "Timezone User",
      passwordHash: null,
      timezone: "Pacific/Honolulu",
    });
    now = new Date("2026-09-21T00:30:00.000Z");
    const first = await service.recordProductScan({
      userId: localUser.id,
      productId,
      eventId: "timezone-one",
    });
    now = new Date("2026-09-22T00:30:00.000Z");
    const second = await service.recordProductScan({
      userId: localUser.id,
      productId,
      eventId: "timezone-two",
    });

    expect(first.activity.activityDate).toBe("2026-09-20");
    expect(second.activity.activityDate).toBe("2026-09-21");
    expect(second.profile.currentStreak).toBe(2);
  });

  it("uses the legacy short retry window when an older client omits event_id", async () => {
    const first = await service.recordProductScan({ userId, productId });
    const duplicate = await service.recordProductScan({ userId, productId });

    expect(duplicate.idempotent).toBe(true);
    // Same as an explicit duplicate event id: no second scan XP, and the
    // one-time `first_scan` payout applied exactly once.
    expect(duplicate.profile.totalXp).toBe(first.profile.totalXp + FIRST_SCAN_REWARD_XP);

    const third = await service.recordProductScan({ userId, productId });
    expect(third.idempotent).toBe(true);
    expect(third.profile.totalXp).toBe(duplicate.profile.totalXp);
  });
});
