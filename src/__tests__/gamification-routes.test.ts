import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { signToken, type SessionUser } from "@/lib/auth";
import { POST as recordActivity } from "@/app/api/gamification/activity/route";
import { GET as getProfile } from "@/app/api/gamification/profile/route";
import type { ProductInfo } from "@/types/domain";
import { gamificationConfig } from "@/gamification/config";
import { gamificationService } from "@/gamification/services/gamification.service";

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
  return {
    user,
    userId: user.id,
    productId: saved.product!.id,
    token: await signToken(session),
  };
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

async function readProfile(token: string) {
  const res = await getProfile(
    new NextRequest("http://localhost/api/gamification/profile", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  const body = (await res.json()) as {
    data: { total_xp: number; current_streak: number; longest_streak: number };
  };
  return body.data;
}

describe("gamification HTTP API", () => {
  let token: string;
  let productId: string;
  let userId: string;

  beforeEach(async () => {
    ({ token, productId, userId } = await setupUserAndProduct());
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

  it("retires self-service product_scan and awards no XP", async () => {
    // A client asserting "I scanned this" with a fresh event id used to mint
    // unlimited XP. Rewards now come only from POST /api/analyze.
    const response = await recordActivity(
      jsonRequest(
        "http://localhost/api/gamification/activity",
        { action_type: "product_scan", product_id: productId, event_id: "route-event-001" },
        token,
      ),
    );
    const body = (await response.json()) as { success: boolean; error: { message: string } };
    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.message).toMatch(/scan_event_id/i);

    const profile = await readProfile(token);
    expect(profile.total_xp).toBe(0);
    expect(profile.current_streak).toBe(0);
  });

  it("records a validated scan through the service that /api/analyze uses", async () => {
    const result = await gamificationService.recordProductScan({
      userId: userId,
      productId,
      eventId: "route-event-001",
    });
    const firstXp = gamificationConfig.successfulScanXp + gamificationConfig.uniqueProductXp;
    expect(result.activity.xpAwarded).toBe(firstXp);
    expect(result.profile.totalXp).toBe(firstXp);
    expect(result.profile.currentStreak).toBe(1);
    expect(result.profile.longestStreak).toBe(1);
  });

  it("does not accept a client-supplied XP field", async () => {
    const response = await recordActivity(
      jsonRequest(
        "http://localhost/api/gamification/activity",
        { action_type: "product_scan", product_id: productId, xp: 1000 },
        token,
      ),
    );
    expect(response.status).toBe(403);
    expect((await readProfile(token)).total_xp).toBe(0);
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
    await expect(
      gamificationService.recordProductScan({
        userId,
        productId: "not-a-real-product",
        eventId: "unknown-product-event",
      }),
    ).rejects.toThrow();
    expect((await readProfile(token)).total_xp).toBe(0);
  });

  it("returns the existing result for a duplicate event id", async () => {
    const first = await gamificationService.recordProductScan({
      userId,
      productId,
      eventId: "same-route-event",
    });
    const second = await gamificationService.recordProductScan({
      userId,
      productId,
      eventId: "same-route-event",
    });
    expect(second.idempotent).toBe(true);
    expect(second.profile.totalXp).toBe(first.profile.totalXp);
  });
});
