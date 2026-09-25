/**
 * Module 2 HTTP API.
 *
 * These go through the real route handler with a real signed session and a real
 * store, so they cover what the store tests cannot: authentication, the
 * response envelope, the `filter` query parameter, and the catalogue a client
 * needs in order to label progress without hardcoding reward amounts.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { signToken, type SessionUser } from "@/lib/auth";
import { GET as getAchievements } from "@/app/api/gamification/achievements/route";
import { GamificationService } from "@/gamification/services/gamification.service";
import { ChallengeService } from "@/gamification/challenges/challenge.service";
import { getAchievementDefinition, listAchievementDefinitions } from "@/gamification/achievements/config";
import { gamificationConfig } from "@/gamification/config";
import type { ProductInfo } from "@/types/domain";

type AchievementViewPayload = {
  achievement_id: string;
  target: number;
  progress: number;
  progress_ratio: number;
  reward_xp: number;
  unlocked: boolean;
  unlocked_at: string | null;
};

type AchievementsPayload = {
  level: {
    level: number;
    total_xp: number;
    level_xp: number;
    next_level_xp: number | null;
    xp_to_next_level: number;
    progress: number;
    is_max_level: boolean;
  };
  achievements: AchievementViewPayload[];
  unlocked: number;
  total: number;
  filter: string;
  catalogue: Array<{
    achievement_id: string;
    name: string;
    target: number;
    reward_xp: number;
  }>;
  leveled_up: boolean;
  level_up: { from_level: number; to_level: number; total_xp: number } | null;
  newly_unlocked: string[];
};

type Envelope<T> = { success: boolean; data: T; error?: unknown };

const BASE = "http://localhost/api/gamification/achievements";

function productFixture(barcode: string, name: string): ProductInfo {
  return {
    id: "",
    barcode,
    name,
    brand: "Module 2 Route Brand",
    category: "food",
    country: "IN",
    servingSize: null,
    imageUrl: null,
    ingredientsRaw: "Water, Salt",
    ingredientsNormalized: ["water", "salt"],
    source: "module2_route_provider",
    sourceUrl: null,
    verified: true,
    productDataConfidence: 0.99,
    isDemo: false,
  };
}

let barcodeCounter = 0;
async function saveProduct(name: string): Promise<string> {
  barcodeCounter += 1;
  const saved = await getStore().saveProductFromProvider({
    product: productFixture(`44${String(barcodeCounter).padStart(11, "0")}`, name),
    nutrition: null,
    source: "module2_route_provider",
  });
  return saved.product!.id;
}

async function setup() {
  const store = getStore();
  const user = await store.createUser({
    email: `m2-route-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`,
    name: "Module 2 Route User",
    passwordHash: null,
    timezone: "UTC",
  });
  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
  };
  return { userId: user.id, token: await signToken(session) };
}

function request(query = "", token?: string): NextRequest {
  return new NextRequest(`${BASE}${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function read(query = "", token?: string) {
  const response = await getAchievements(request(query, token));
  return {
    status: response.status,
    body: (await response.json()) as Envelope<AchievementsPayload>,
  };
}

describe("Module 2 HTTP API", () => {
  let token: string;
  let userId: string;
  let now: Date;

  beforeEach(async () => {
    ({ token, userId } = await setup());
    now = new Date("2026-09-20T12:00:00.000Z");
  });

  it("requires authentication", async () => {
    const response = await getAchievements(request());
    expect(response.status).toBe(401);
  });

  it("rejects an invalid session", async () => {
    const response = await getAchievements(request("", "not-a-real-token"));
    expect(response.status).toBe(401);
  });

  it("returns level 1 and every achievement locked for a new user", async () => {
    const { status, body } = await read("", token);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.level).toMatchObject({
      level: 1,
      total_xp: 0,
      level_xp: 0,
      next_level_xp: 100,
      xp_to_next_level: 100,
      progress: 0,
      is_max_level: false,
    });
    expect(body.data.achievements).toHaveLength(listAchievementDefinitions().length);
    expect(body.data.unlocked).toBe(0);
    expect(body.data.total).toBe(8);
    expect(body.data.filter).toBe("all");
    expect(body.data.achievements.every((view) => !view.unlocked && view.unlocked_at === null)).toBe(true);
  });

  it("returns the level and achievements a real scan genuinely earned", async () => {
    const service = new GamificationService(getStore(), () => now);
    await service.recordProductScan({
      userId,
      productId: await saveProduct("Module 2 Route Product"),
      eventId: "module-2-route-scan",
    });

    const { status, body } = await read("", token);
    expect(status).toBe(200);
    const firstScanReward = getAchievementDefinition("first_scan")!.rewardXp;
    const expectedTotal =
      gamificationConfig.successfulScanXp + gamificationConfig.uniqueProductXp + firstScanReward;
    expect(body.data.level.total_xp).toBe(expectedTotal);
    expect(body.data.unlocked).toBe(1);
    expect(body.data.newly_unlocked).toEqual([]);

    const firstScan = body.data.achievements.find(
      (view) => view.achievement_id === "first_scan",
    )!;
    expect(firstScan).toMatchObject({
      unlocked: true,
      progress: 1,
      progress_ratio: 1,
      reward_xp: firstScanReward,
    });
    expect(firstScan.unlocked_at).not.toBeNull();

    // A locked achievement stays visible with honest progress.
    const explorer = body.data.achievements.find(
      (view) => view.achievement_id === "food_explorer",
    )!;
    expect(explorer).toMatchObject({
      unlocked: false,
      progress: 1,
      target: 10,
      progress_ratio: 0.1,
      unlocked_at: null,
    });
  });

  it("reports an unlock and its payout from a read that genuinely earned it", async () => {
    // Real questions do not reconcile achievements where they are recorded, so
    // the milestone is genuinely outstanding until the achievements read.
    const products: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      products.push(await saveProduct(`Module 2 Chat Product ${index}`));
    }
    const gamification = new GamificationService(getStore(), () => now);
    const challenges = new ChallengeService(getStore(), () => now);
    await gamification.recordProductScan({
      userId,
      productId: products[0],
      eventId: "module-2-route-chat-scan",
    });
    for (let index = 0; index < 5; index += 1) {
      await challenges.recordMeaningfulChat({
        userId,
        productId: products[index],
        message: `Is product ${index} safe to eat every day?`,
      });
    }

    const { body } = await read("", token);
    const curiousMind = getAchievementDefinition("curious_mind")!;
    expect(body.data.newly_unlocked).toEqual(["curious_mind"]);
    expect(body.data.unlocked).toBe(2);
    expect(body.data.level.total_xp).toBeGreaterThanOrEqual(curiousMind.condition.target);
    const view = body.data.achievements.find(
      (entry) => entry.achievement_id === "curious_mind",
    )!;
    expect(view).toMatchObject({ unlocked: true, progress: 5, reward_xp: curiousMind.rewardXp });
    expect(view.unlocked_at).not.toBeNull();

    // The unlock is paid once: a second read reports the same total and nothing
    // newly unlocked.
    const again = await read("", token);
    expect(again.body.data.newly_unlocked).toEqual([]);
    expect(again.body.data.level.total_xp).toBe(body.data.level.total_xp);
    expect(again.body.data.unlocked).toBe(2);
  });

  it("reports a level-up when the payout that crossed the boundary is this read", async () => {
    const products: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      products.push(await saveProduct(`Module 2 Level Product ${index}`));
    }
    const gamification = new GamificationService(getStore(), () => now);
    const challenges = new ChallengeService(getStore(), () => now);
    await gamification.recordProductScan({
      userId,
      productId: products[0],
      eventId: "module-2-route-level-scan",
    });
    for (let index = 0; index < 3; index += 1) {
      await challenges.recordMeaningfulChat({
        userId,
        productId: products[index],
        message: `Is product ${index} safe to eat every day?`,
      });
    }

    // A second local day so the daily challenge pays again, plus the two
    // ingredient views that complete the other daily challenge.
    now = new Date("2026-09-21T12:00:00.000Z");
    for (let index = 3; index < 5; index += 1) {
      await challenges.recordMeaningfulChat({
        userId,
        productId: products[index],
        message: `Does product ${index} contain added sugar?`,
      });
    }
    for (let index = 0; index < 2; index += 1) {
      await challenges.recordIngredientView({
        userId,
        productId: products[index],
        eventId: `module-2-route-level-view-${index}`,
      });
    }

    const { body } = await read("", token);
    expect(body.data.newly_unlocked).toEqual(["curious_mind"]);
    expect(body.data.leveled_up).toBe(true);
    expect(body.data.level_up).toMatchObject({ from_level: 1, to_level: 2 });
    expect(body.data.level_up?.total_xp).toBe(body.data.level.total_xp);
    expect(body.data.level.level).toBe(2);
    expect(body.data.level.level_xp).toBe(100);

    // Only the read that crossed the boundary may report it.
    const again = await read("", token);
    expect(again.body.data.leveled_up).toBe(false);
    expect(again.body.data.level_up).toBeNull();
    expect(again.body.data.level.total_xp).toBe(body.data.level.total_xp);
  });

  it("filters the list to unlocked achievements", async () => {
    await new GamificationService(getStore(), () => now).recordProductScan({
      userId,
      productId: await saveProduct("Module 2 Route Product"),
      eventId: "module-2-route-filter-scan",
    });

    const { status, body } = await read("?filter=unlocked", token);
    expect(status).toBe(200);
    expect(body.data.filter).toBe("unlocked");
    expect(body.data.achievements).toHaveLength(1);
    expect(body.data.achievements[0].achievement_id).toBe("first_scan");
    expect(body.data.achievements.every((view) => view.unlocked)).toBe(true);
    // Filtering narrows the list, not the totals a client renders.
    expect(body.data.unlocked).toBe(1);
    expect(body.data.total).toBe(8);
  });

  it("filters the list to locked achievements", async () => {
    await new GamificationService(getStore(), () => now).recordProductScan({
      userId,
      productId: await saveProduct("Module 2 Route Product"),
      eventId: "module-2-route-filter-locked-scan",
    });

    const { status, body } = await read("?filter=locked", token);
    expect(status).toBe(200);
    expect(body.data.filter).toBe("locked");
    expect(body.data.achievements).toHaveLength(7);
    expect(body.data.achievements.every((view) => !view.unlocked)).toBe(true);
    expect(body.data.achievements.map((view) => view.achievement_id)).not.toContain("first_scan");
    expect(body.data.unlocked).toBe(1);
  });

  it("falls back to the full list for an unknown filter value", async () => {
    const { status, body } = await read("?filter=not-a-real-filter", token);
    expect(status).toBe(200);
    expect(body.data.filter).toBe("all");
    expect(body.data.achievements).toHaveLength(8);
    expect(body.data.total).toBe(8);
  });

  it("matches the filter case-insensitively", async () => {
    const { status, body } = await read("?filter=UNLOCKED", token);
    expect(status).toBe(200);
    expect(body.data.filter).toBe("unlocked");
    expect(body.data.achievements.every((view) => view.unlocked)).toBe(true);
  });

  it("includes the catalogue with the configured reward XP", async () => {
    const { body } = await read("", token);
    expect(body.data.catalogue).toHaveLength(listAchievementDefinitions().length);
    expect(body.data.catalogue.map((entry) => entry.achievement_id)).toEqual(
      listAchievementDefinitions().map((entry) => entry.id),
    );
    for (const entry of body.data.catalogue) {
      const definition = getAchievementDefinition(entry.achievement_id)!;
      expect(entry.name).toBe(definition.name);
      expect(entry.target).toBe(definition.condition.target);
      expect(entry.reward_xp).toBe(definition.rewardXp);
    }
    const byId = new Map(body.data.catalogue.map((entry) => [entry.achievement_id, entry]));
    expect(byId.get("first_scan")?.reward_xp).toBe(10);
    expect(byId.get("challenge_champion")?.reward_xp).toBe(40);
    // A milestone that only marks progress pays nothing.
    expect(byId.get("century_club")?.reward_xp).toBe(0);
  });

  it("ignores a client-supplied level or XP total", async () => {
    const { status, body } = await read("?level=20&total_xp=999999&xp_to_next_level=0&unlocked=8", token);
    expect(status).toBe(200);
    expect(body.data.level.level).toBe(1);
    expect(body.data.level.total_xp).toBe(0);
    expect(body.data.level.xp_to_next_level).toBe(100);
    expect(body.data.unlocked).toBe(0);
  });
});
