import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryStore } from "@/lib/store/memory";
import { GamificationService } from "@/gamification/services/gamification.service";
import { ChallengeService, isMeaningfulProductQuestion } from "@/gamification/challenges/challenge.service";
import { gamificationConfig } from "@/gamification/config";
import type { ProductInfo } from "@/types/domain";

function fixtureProduct(barcode: string, name: string): ProductInfo {
  return {
    id: "",
    barcode,
    name,
    brand: "Challenge Test Brand",
    category: "food",
    country: "IN",
    servingSize: null,
    imageUrl: null,
    ingredientsRaw: "Water, Salt",
    ingredientsNormalized: ["water", "salt"],
    source: "challenge_test_provider",
    sourceUrl: null,
    verified: true,
    productDataConfidence: 0.99,
    isDemo: false,
  };
}

describe("FoodGuard daily and weekly challenges", () => {
  let store: InMemoryStore;
  let gamification: GamificationService;
  let challenges: ChallengeService;
  let now: Date;
  let userId: string;
  let products: string[];

  beforeEach(async () => {
    store = new InMemoryStore();
    now = new Date("2026-09-25T12:00:00.000Z");
    gamification = new GamificationService(store, () => now);
    challenges = new ChallengeService(store, () => now);
    const user = await store.createUser({
      email: `challenge-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`,
      name: "Challenge Test User",
      passwordHash: null,
      timezone: "UTC",
    });
    userId = user.id;
    products = [];
    for (let index = 0; index < 4; index += 1) {
      const saved = await store.saveProductFromProvider({
        product: fixtureProduct(`88${String(index).padStart(11, "0")}`, `Challenge Product ${index}`),
        nutrition: null,
        source: "challenge_test_provider",
      });
      products.push(saved.product!.id);
    }
  });

  async function dailyProductChallenge() {
    const result = await challenges.getChallenges(userId);
    return result.daily.find((entry) => entry.challenge_id === "daily_product_explorer")!;
  }

  async function weeklyProductChallenge() {
    const result = await challenges.getChallenges(userId);
    return result.weekly.find((entry) => entry.challenge_id === "weekly_product_explorer")!;
  }

  it("creates real zero-progress daily and weekly instances for a new user", async () => {
    const result = await challenges.getChallenges(userId);
    expect(result.daily).toHaveLength(3);
    expect(result.weekly).toHaveLength(3);
    expect(await dailyProductChallenge()).toMatchObject({ progress: 0, completed: false });
  });

  it("increments a unique-product challenge after the first real scan", async () => {
    await gamification.recordProductScan({ userId, productId: products[0], eventId: "challenge-first-scan" });
    expect(await dailyProductChallenge()).toMatchObject({ progress: 1, completed: false });
  });

  it("does not count the same product twice toward a unique-product challenge", async () => {
    await gamification.recordProductScan({ userId, productId: products[0], eventId: "challenge-same-a" });
    await gamification.recordProductScan({ userId, productId: products[0], eventId: "challenge-same-b" });
    expect(await dailyProductChallenge()).toMatchObject({ progress: 1, completed: false });
  });

  it("completes a challenge and grants its configured XP exactly once", async () => {
    await gamification.recordProductScan({ userId, productId: products[0], eventId: "challenge-complete-a" });
    await gamification.recordProductScan({ userId, productId: products[1], eventId: "challenge-complete-b" });
    const result = await gamification.recordProductScan({ userId, productId: products[2], eventId: "challenge-complete-c" });
    const challenge = (await challenges.getChallenges(userId)).daily.find((entry) => entry.challenge_id === "daily_product_explorer")!;
    expect(challenge).toMatchObject({ progress: 3, completed: true, reward_claimed: true });
    expect(result.completedChallenges?.[0]?.challenge_id).toBe("daily_product_explorer");
    expect(result.profile.totalXp).toBe(
      gamificationConfig.successfulScanXp * 3 + gamificationConfig.uniqueProductXp * 3 + 25,
    );
  });

  it("does not grant a second reward for a duplicate completion request", async () => {
    await gamification.recordProductScan({ userId, productId: products[0], eventId: "challenge-once-a" });
    await gamification.recordProductScan({ userId, productId: products[1], eventId: "challenge-once-b" });
    const completed = await gamification.recordProductScan({ userId, productId: products[2], eventId: "challenge-once-c" });
    const totalAfterCompletion = completed.profile.totalXp;
    const repeated = await gamification.recordProductScan({ userId, productId: products[2], eventId: "challenge-once-c" });
    expect(repeated.idempotent).toBe(true);
    expect(repeated.profile.totalXp).toBe(totalAfterCompletion);
    expect(repeated.completedChallenges).toEqual([]);
  });

  it("archives the previous daily instance and creates a fresh one at a local-day boundary", async () => {
    await gamification.recordProductScan({ userId, productId: products[0], eventId: "challenge-day-one" });
    now = new Date("2026-09-26T12:00:00.000Z");
    const result = await challenges.getChallenges(userId);
    expect(result.daily.find((entry) => entry.challenge_id === "daily_product_explorer")).toMatchObject({
      period_start: "2026-09-26",
      progress: 0,
      completed: false,
    });
    expect(result.history.some((entry) => entry.period_start === "2026-09-25" && entry.status === "active")).toBe(false);
  });

  it("archives the previous weekly instance and creates a fresh one at a week boundary", async () => {
    await gamification.recordProductScan({ userId, productId: products[0], eventId: "challenge-week-one" });
    now = new Date("2026-10-01T12:00:00.000Z");
    const result = await challenges.getChallenges(userId);
    expect(result.weekly.find((entry) => entry.challenge_id === "weekly_product_explorer")?.period_start).toBe("2026-09-28");
    expect(result.history.some((entry) => entry.challenge_id === "weekly_product_explorer" && entry.status === "expired")).toBe(true);
  });

  it("counts only real ingredient-information events", async () => {
    await challenges.recordIngredientView({ userId, productId: products[0], eventId: "ingredient-view-a" });
    await challenges.recordIngredientView({ userId, productId: products[0], eventId: "ingredient-view-a-duplicate-product" });
    let result = await challenges.getChallenges(userId);
    expect(result.daily.find((entry) => entry.challenge_id === "daily_ingredient_check")?.progress).toBe(1);
    await challenges.recordIngredientView({ userId, productId: products[1], eventId: "ingredient-view-b" });
    result = await challenges.getChallenges(userId);
    expect(result.daily.find((entry) => entry.challenge_id === "daily_ingredient_check")).toMatchObject({
      progress: 2,
      completed: true,
    });
  });

  it("rejects greetings and product-less chat but records a meaningful product question", async () => {
    expect(isMeaningfulProductQuestion("hi", products[0])).toBe(false);
    expect(isMeaningfulProductQuestion("What is in this product?", null)).toBe(false);
    const result = await challenges.recordMeaningfulChat({
      userId,
      productId: products[0],
      message: "Does this product contain milk?",
    });
    expect(result?.completedChallenges?.[0]?.challenge_id).toBe("daily_foodguard_question");
    const chat = (await challenges.getChallenges(userId)).daily.find((entry) => entry.challenge_id === "daily_foodguard_question");
    expect(chat).toMatchObject({ progress: 1, completed: true });
  });

  it("uses the Module 1 streak state for a streak challenge without recalculating it", async () => {
    for (let day = 0; day < 7; day += 1) {
      now = new Date(`2026-09-${String(19 + day).padStart(2, "0")}T12:00:00.000Z`);
      await gamification.recordProductScan({
        userId,
        productId: products[0],
        eventId: `streak-day-${day}`,
      });
    }
    const result = await challenges.getChallenges(userId);
    expect(result.weekly.find((entry) => entry.challenge_id === "weekly_seven_day_streak")).toMatchObject({
      progress: 7,
      completed: true,
    });
  });

  it("returns the XP delta for the existing level consumer after a challenge reward", async () => {
    await gamification.recordProductScan({ userId, productId: products[0], eventId: "level-delta-a" });
    await gamification.recordProductScan({ userId, productId: products[1], eventId: "level-delta-b" });
    const before = (await gamification.getProfile(userId)).totalXp;
    const result = await gamification.recordProductScan({ userId, productId: products[2], eventId: "level-delta-c" });
    expect(result.profile.totalXp - before).toBe(
      gamificationConfig.successfulScanXp + gamificationConfig.uniqueProductXp + 25,
    );
    expect(result.completedChallenges?.[0]?.xp_reward).toBe(25);
  });

  it("serializes concurrent scans into one completion and one reward", async () => {
    const results = await Promise.all([
      gamification.recordProductScan({ userId, productId: products[0], eventId: "concurrent-challenge-a" }),
      gamification.recordProductScan({ userId, productId: products[1], eventId: "concurrent-challenge-b" }),
      gamification.recordProductScan({ userId, productId: products[2], eventId: "concurrent-challenge-c" }),
    ]);
    const completions = results.flatMap((result) => result.completedChallenges ?? []);
    expect(completions.filter((entry) => entry.challenge_id === "daily_product_explorer")).toHaveLength(1);
    const challenge = (await challenges.getChallenges(userId)).daily.find((entry) => entry.challenge_id === "daily_product_explorer")!;
    expect(challenge.completed).toBe(true);
  });

  it("keeps challenge progress when the service is recreated", async () => {
    await gamification.recordProductScan({ userId, productId: products[0], eventId: "restart-challenge-a" });
    const recreated = new ChallengeService(store, () => now);
    expect((await recreated.getChallenges(userId)).daily[0].progress).toBeGreaterThanOrEqual(0);
    expect((await recreated.getChallenges(userId)).daily.find((entry) => entry.challenge_id === "daily_product_explorer")?.progress).toBe(1);
  });

  it("isolates challenge state by authenticated user", async () => {
    await gamification.recordProductScan({ userId, productId: products[0], eventId: "isolation-challenge-a" });
    const other = await store.createUser({
      email: `other-challenge-${Date.now()}@test.invalid`,
      name: "Other Challenge User",
      passwordHash: null,
      timezone: "UTC",
    });
    const otherResult = await challenges.getChallenges(other.id);
    expect(otherResult.daily.every((entry) => entry.progress === 0 && !entry.completed)).toBe(true);
  });
});
