import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { signToken, type SessionUser } from "@/lib/auth";
import { POST as recordActivity } from "@/app/api/gamification/activity/route";
import { GET as getProfile } from "@/app/api/gamification/profile/route";
import type { ProductInfo } from "@/types/domain";
import { gamificationConfig } from "@/gamification/config";

function productFixture(barcode: string): ProductInfo {
  return {
    id: "",
    barcode,
    name: "Route Test Food",
    brand: "Route Test Brand",
    category: "food",
    country: "IN",
    servingSize: null,
    imageUrl: null,
    ingredientsRaw: "Water, Salt",
    ingredientsNormalized: ["water", "salt"],
    source: "route_test_provider",
    sourceUrl: null,
    verified: true,
    productDataConfidence: 0.95,
    isDemo: false,
  };
}

async function setupUserAndProduct() {
  const store = getStore();
  const user = await store.createUser({
    email: `route-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`,
    name: "Route Test User",
    passwordHash: null,
    timezone: "UTC",
  });
  const saved = await store.saveProductFromProvider({
    product: productFixture(`9${Date.now()}`.slice(0, 13)),
    nutrition: null,
    source: "route_test_provider",
  });
  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
  };
  return { user, productId: saved.product!.id, token: await signToken(session) };
}

function jsonRequest(url: string, body: unknown, token?: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("gamification HTTP API", () => {
  let token: string;
  let productId: string;

  beforeEach(async () => {
    ({ token, productId } = await setupUserAndProduct());
  });

  it("returns zero values for a new user's profile", async () => {
    const response = await getProfile(
      new NextRequest("http://localhost/api/gamification/profile", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const body = (await response.json()) as { success: boolean; data: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      total_xp: 0,
      current_streak: 0,
      longest_streak: 0,
      last_activity_date: null,
    });
  });

  it("records a validated activity and returns authoritative values", async () => {
    const response = await recordActivity(
      jsonRequest(
        "http://localhost/api/gamification/activity",
        { action_type: "product_scan", product_id: productId, event_id: "route-event-001" },
        token,
      ),
    );
    const body = (await response.json()) as { success: boolean; data: Record<string, number | string | boolean> };
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    const firstXp = gamificationConfig.successfulScanXp + gamificationConfig.uniqueProductXp;
    expect(body.data.xp_awarded).toBe(firstXp);
    expect(body.data.total_xp).toBe(firstXp);
    expect(body.data.current_streak).toBe(1);
    expect(body.data.longest_streak).toBe(1);
  });

  it("does not accept a client-supplied XP field", async () => {
    const response = await recordActivity(
      jsonRequest(
        "http://localhost/api/gamification/activity",
        { action_type: "product_scan", product_id: productId, xp: 1000 },
        token,
      ),
    );
    expect(response.status).toBe(400);
  });

  it("rejects an unauthenticated activity", async () => {
    const response = await recordActivity(
      jsonRequest("http://localhost/api/gamification/activity", {
        action_type: "product_scan",
        product_id: productId,
      }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects an unknown product without creating progress", async () => {
    const response = await recordActivity(
      jsonRequest(
        "http://localhost/api/gamification/activity",
        { action_type: "product_scan", product_id: "not-a-real-product", event_id: "unknown-product-event" },
        token,
      ),
    );
    expect(response.status).toBe(404);
    const profileResponse = await getProfile(
      new NextRequest("http://localhost/api/gamification/profile", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const profile = (await profileResponse.json()) as { data: { total_xp: number } };
    expect(profile.data.total_xp).toBe(0);
  });

  it("returns the existing result for a duplicate event id", async () => {
    const first = await recordActivity(
      jsonRequest(
        "http://localhost/api/gamification/activity",
        { action_type: "product_scan", product_id: productId, event_id: "same-route-event" },
        token,
      ),
    );
    const second = await recordActivity(
      jsonRequest(
        "http://localhost/api/gamification/activity",
        { action_type: "product_scan", product_id: productId, event_id: "same-route-event" },
        token,
      ),
    );
    const firstBody = (await first.json()) as { data: { total_xp: number; idempotent: boolean } };
    const secondBody = (await second.json()) as { data: { total_xp: number; idempotent: boolean } };
    expect(secondBody.data.idempotent).toBe(true);
    expect(secondBody.data.total_xp).toBe(firstBody.data.total_xp);
  });
});
