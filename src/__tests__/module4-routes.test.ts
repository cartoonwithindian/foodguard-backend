/**
 * Module 4 HTTP API.
 *
 * These go through the real route handlers with a real signed session, so they
 * cover the parts the store tests cannot: authentication, the response
 * envelope, and the claim endpoint's rejection of an unearned reward.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { signToken, type SessionUser } from "@/lib/auth";
import { GET as getStreakProtection } from "@/app/api/gamification/streak-protection/route";
import { GET as getProtectionHistory } from "@/app/api/gamification/streak-protection/history/route";
import { GET as getRewards } from "@/app/api/gamification/rewards/route";
import { GET as getRewardHistory } from "@/app/api/gamification/rewards/history/route";
import { POST as claimReward } from "@/app/api/gamification/rewards/claim/route";
import { GET as getOverview } from "@/app/api/gamification/overview/route";
import type { ProductInfo } from "@/types/domain";
import { gamificationConfig } from "@/gamification/config";
import { xpService } from "@/gamification/services/xp.service";
import { streakService } from "@/gamification/services/streak.service";
import type { GamificationRules } from "@/gamification/models/gamification";

type Envelope<T> = { success: boolean; data: T; error?: unknown };

function productFixture(barcode: string, name: string): ProductInfo {
  return {
    id: "",
    barcode,
    name,
    brand: "Module 4 Route Brand",
    category: "food",
    country: "IN",
    servingSize: null,
    imageUrl: null,
    ingredientsRaw: "Water, Salt",
    ingredientsNormalized: ["water", "salt"],
    source: "module4_route_provider",
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
    product: productFixture(`66${String(barcodeCounter).padStart(11, "0")}${Date.now()}`, name),
    nutrition: null,
    source: "module4_route_provider",
  });
  return saved.product!.id;
}

async function setup() {
  const store = getStore();
  const user = await store.createUser({
    email: `m4-route-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`,
    name: "Module 4 Route User",
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

function request(url: string, body?: unknown, token?: string): NextRequest {
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const BASE = "http://localhost/api/gamification";

/**
 * Records `count` real scans on consecutive days ending today.
 *
 * The route handlers read the system clock, so a multi-day streak cannot be
 * produced by calling the HTTP activity endpoint in a loop. Instead the scans
 * are written through the store with their own server-owned timestamps -- real
 * persisted rows, one per day, each against a real product. The routes then
 * report whatever that real state implies.
 */
async function earnDays(userId: string, count: number) {
  const store = getStore();
  const rules: GamificationRules = {
    now: () => new Date(),
    duplicateRequestWindowMs: gamificationConfig.duplicateRequestWindowMs,
    xpService,
    streakService,
  };
  for (let index = 0; index < count; index += 1) {
    const productId = await saveProduct(`Route Streak Product ${index}-${Date.now()}`);
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - (count - 1 - index));
    await store.recordSuccessfulProductScan(
      {
        userId,
        actionType: "product_scan",
        productId,
        timestamp: new Date(`${day.toISOString().slice(0, 10)}T12:00:00.000Z`),
        eventId: `m4-route-backdated-${index}-${Date.now()}`,
        eventIdProvided: true,
      },
      rules,
    );
  }
}

describe("Module 4 HTTP API", () => {
  let token: string;
  let userId: string;

  beforeEach(async () => {
    ({ token, userId } = await setup());
  });

  it("rejects every Module 4 route without a session", async () => {
    for (const [handler, url] of [
      [getStreakProtection, `${BASE}/streak-protection`],
      [getProtectionHistory, `${BASE}/streak-protection/history`],
      [getRewards, `${BASE}/rewards`],
      [getRewardHistory, `${BASE}/rewards/history`],
      [getOverview, `${BASE}/overview`],
    ] as const) {
      const response = await handler(request(url));
      expect(response.status).toBe(401);
    }
  });

  it("returns a new user with an empty protection inventory", async () => {
    const response = await getStreakProtection(
      request(`${BASE}/streak-protection`, undefined, token),
    );
    const body = (await response.json()) as Envelope<{
      available_count: number;
      used_count: number;
      max_available: number;
      last_protected: null;
    }>;
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.available_count).toBe(0);
    expect(body.data.used_count).toBe(0);
    expect(body.data.last_protected).toBeNull();
  });

  it("returns configured rewards with real progress, not fake completion", async () => {
    const response = await getRewards(request(`${BASE}/rewards`, undefined, token));
    const body = (await response.json()) as Envelope<{
      rewards: Array<{
        reward_id: string;
        user_reward_id: string | null;
        earned: boolean;
        progress: number;
        target: number;
        requires_claim: boolean;
      }>;
      available: number;
      earned: number;
    }>;
    expect(response.status).toBe(200);
    expect(body.data.rewards.length).toBeGreaterThan(0);
    for (const reward of body.data.rewards) {
      expect(reward.earned).toBe(false);
      expect(reward.user_reward_id ?? null).toBeNull();
      expect(reward.progress).toBeGreaterThanOrEqual(0);
    }
    expect(body.data.earned).toBe(0);
    expect(body.data.available).toBe(0);
  });

  it("awards a protection once the real streak milestone is reached", async () => {
    await earnDays(userId, 7);
    const response = await getStreakProtection(
      request(`${BASE}/streak-protection`, undefined, token),
    );
    const body = (await response.json()) as Envelope<{ available_count: number }>;
    expect(body.data.available_count).toBe(1);
  });

  it("returns an empty protection history for a user who has missed nothing", async () => {
    const response = await getProtectionHistory(
      request(`${BASE}/streak-protection/history`, undefined, token),
    );
    const body = (await response.json()) as Envelope<{ history: unknown[] }>;
    expect(response.status).toBe(200);
    expect(body.data.history).toEqual([]);
  });

  it("rejects a claim for a reward the user has not earned", async () => {
    const response = await claimReward(
      request(
        `${BASE}/rewards/claim`,
        { reward_id: "thirty_day_streak_bonus" },
        token,
      ),
    );
    // The 30-day milestone is not reached, so the server refuses to pay it.
    expect(response.status).toBeGreaterThanOrEqual(400);
    const body = (await response.json()) as Envelope<unknown>;
    expect(body.success).toBe(false);
  });

  it("rejects a claim for an unknown reward id", async () => {
    const response = await claimReward(
      request(`${BASE}/rewards/claim`, { reward_id: "not_a_real_reward" }, token),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a claim body that names no reward", async () => {
    const response = await claimReward(request(`${BASE}/rewards/claim`, {}, token));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a claim body carrying client-supplied XP or completion", async () => {
    // The schema must not accept a payout amount from the client at all.
    const response = await claimReward(
      request(
        `${BASE}/rewards/claim`,
        { reward_id: "thirty_day_streak_bonus", xp: 9999, completed: true },
        token,
      ),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a claim with no session", async () => {
    const response = await claimReward(
      request(`${BASE}/rewards/claim`, { reward_id: "thirty_day_streak_bonus" }),
    );
    expect(response.status).toBe(401);
  });

  it("returns an overview assembled from real persisted state", async () => {
    await earnDays(userId, 7);
    const response = await getOverview(request(`${BASE}/overview`, undefined, token));
    const body = (await response.json()) as Envelope<{
      total_xp: number;
      current_streak: number;
      longest_streak: number;
      streak_protection: { available_count: number; max_available: number };
      rewards: { available: number; earned: number };
    }>;
    expect(response.status).toBe(200);
    expect(body.data.current_streak).toBe(7);
    expect(body.data.longest_streak).toBe(7);
    expect(body.data.total_xp).toBeGreaterThan(0);
    expect(body.data.streak_protection.available_count).toBe(1);
    expect(body.data.rewards.earned).toBeGreaterThan(0);
  });

  it("serves reward history without duplicating reward calculation", async () => {
    await earnDays(userId, 7);
    const [list, history] = await Promise.all([
      getRewards(request(`${BASE}/rewards`, undefined, token)),
      getRewardHistory(request(`${BASE}/rewards/history`, undefined, token)),
    ]);
    const listBody = (await list.json()) as Envelope<{ earned: number }>;
    const historyBody = (await history.json()) as Envelope<{ earned: number }>;
    // Both endpoints read the same recorded milestones.
    expect(historyBody.data.earned).toBe(listBody.data.earned);
  });
});
