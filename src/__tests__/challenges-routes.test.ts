import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { signToken, type SessionUser } from "@/lib/auth";
import { GET as getCombinedChallenges } from "@/app/api/gamification/challenges/route";
import { GET as getDailyChallenges } from "@/app/api/gamification/challenges/daily/route";
import { GET as getWeeklyChallenges } from "@/app/api/gamification/challenges/weekly/route";
import { POST as recordIngredientView } from "@/app/api/gamification/activity/ingredient-view/route";
import { POST as recordProductScan } from "@/app/api/gamification/activity/route";
import type { ProductInfo } from "@/types/domain";

function productFixture(barcode: string, name: string): ProductInfo {
  return {
    id: "",
    barcode,
    name,
    brand: "Challenge Route Brand",
    category: "food",
    country: "IN",
    servingSize: null,
    imageUrl: null,
    ingredientsRaw: "Water, Salt",
    ingredientsNormalized: ["water", "salt"],
    source: "challenge_route_provider",
    sourceUrl: null,
    verified: true,
    productDataConfidence: 0.99,
    isDemo: false,
  };
}

async function setup() {
  const store = getStore();
  const user = await store.createUser({
    email: `challenge-route-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`,
    name: "Challenge Route User",
    passwordHash: null,
    timezone: "UTC",
  });
  const productIds: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const saved = await store.saveProductFromProvider({
      product: productFixture(`77${String(index).padStart(11, "0")}-${Date.now()}`, `Route Product ${index}`),
      nutrition: null,
      source: "challenge_route_provider",
    });
    productIds.push(saved.product!.id);
  }
  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
  };
  return { userId: user.id, productIds, token: await signToken(session) };
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

describe("challenge HTTP API", () => {
  let token: string;
  let productIds: string[];

  beforeEach(async () => {
    ({ token, productIds } = await setup());
  });

  it("returns real zero-progress daily and weekly challenges for a new user", async () => {
    const response = await getCombinedChallenges(request("http://localhost/api/gamification/challenges", undefined, token));
    const body = (await response.json()) as { success: boolean; data: { daily: unknown[]; weekly: unknown[] } };
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.daily).toHaveLength(3);
    expect(body.data.weekly).toHaveLength(3);
  });

  it("serves daily and weekly endpoints without duplicating calculation logic", async () => {
    const daily = await getDailyChallenges(request("http://localhost/api/gamification/challenges/daily", undefined, token));
    const weekly = await getWeeklyChallenges(request("http://localhost/api/gamification/challenges/weekly", undefined, token));
    expect(daily.status).toBe(200);
    expect(weekly.status).toBe(200);
    expect(((await daily.json()) as { data: { challenges: unknown[] } }).data.challenges).toHaveLength(3);
    expect(((await weekly.json()) as { data: { challenges: unknown[] } }).data.challenges).toHaveLength(3);
  });

  it("requires authentication", async () => {
    const response = await getCombinedChallenges(request("http://localhost/api/gamification/challenges"));
    expect(response.status).toBe(401);
  });

  it("rejects client-supplied progress, completion, and XP fields", async () => {
    const response = await recordIngredientView(
      request(
        "http://localhost/api/gamification/activity/ingredient-view",
        { product_id: productIds[0], event_id: "route-client-progress", progress: 99, completed: true, xp: 999 },
        token,
      ),
    );
    expect(response.status).toBe(400);
  });

  it("rejects an unknown product without creating challenge progress", async () => {
    const response = await recordIngredientView(
      request(
        "http://localhost/api/gamification/activity/ingredient-view",
        { product_id: "missing-challenge-product", event_id: "route-unknown-product" },
        token,
      ),
    );
    expect(response.status).toBe(404);
    const profile = await getCombinedChallenges(request("http://localhost/api/gamification/challenges", undefined, token));
    const body = (await profile.json()) as { data: { daily: Array<{ progress: number }> } };
    expect(body.data.daily[0].progress).toBe(0);
  });

  it("records real ingredient views and returns a one-time challenge completion reward", async () => {
    const first = await recordIngredientView(
      request(
        "http://localhost/api/gamification/activity/ingredient-view",
        { product_id: productIds[0], event_id: "route-ingredient-one" },
        token,
      ),
    );
    const second = await recordIngredientView(
      request(
        "http://localhost/api/gamification/activity/ingredient-view",
        { product_id: productIds[1], event_id: "route-ingredient-two" },
        token,
      ),
    );
    const firstBody = (await first.json()) as { data: { completed_challenges: unknown[] } };
    const secondBody = (await second.json()) as { data: { completed_challenges: Array<{ challenge_id: string }> } };
    expect(firstBody.data.completed_challenges).toHaveLength(0);
    expect(secondBody.data.completed_challenges[0]?.challenge_id).toBe("daily_ingredient_check");
  });

  it("does not award a challenge twice for a repeated scan event", async () => {
    const first = await recordProductScan(
      request(
        "http://localhost/api/gamification/activity",
        { action_type: "product_scan", product_id: productIds[0], event_id: "route-scan-once" },
        token,
      ),
    );
    const second = await recordProductScan(
      request(
        "http://localhost/api/gamification/activity",
        { action_type: "product_scan", product_id: productIds[0], event_id: "route-scan-once" },
        token,
      ),
    );
    const firstBody = (await first.json()) as { data: { total_xp: number } };
    const secondBody = (await second.json()) as { data: { total_xp: number; idempotent: boolean } };
    expect(secondBody.data.idempotent).toBe(true);
    expect(secondBody.data.total_xp).toBe(firstBody.data.total_xp);
  });
});
