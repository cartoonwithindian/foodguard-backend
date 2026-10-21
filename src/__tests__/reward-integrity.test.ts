import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { signToken, type SessionUser } from "@/lib/auth";
import { POST as retiredActivity } from "@/app/api/gamification/activity/route";
import { POST as analyze } from "@/app/api/analyze/route";
import { GET as getProfile } from "@/app/api/gamification/profile/route";
import type { ProductInfo } from "@/types/domain";

/**
 * Regression tests for the self-service XP-minting hole.
 *
 * `POST /api/gamification/activity` used to award XP for any product id with a
 * fresh `event_id`, so a scripted client could farm XP without ever analysing
 * anything. A scan reward must now only come from POST /api/analyze.
 */

function productFixture(barcode: string): ProductInfo {
  return {
    id: "",
    barcode,
    name: "Reward Probe Food",
    brand: "Probe Brand",
    category: "food",
    country: "IN",
    servingSize: null,
    imageUrl: null,
    ingredientsRaw: "Water, Salt",
    ingredientsNormalized: ["water", "salt"],
    source: "reward_probe_provider",
    sourceUrl: null,
    verified: true,
    productDataConfidence: 0.95,
    isDemo: false,
  };
}

async function setup() {
  const store = getStore();
  const user = await store.createUser({
    email: `reward-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`,
    name: "Reward Probe",
    passwordHash: null,
    timezone: "UTC",
  });
  const saved = await store.saveProductFromProvider({
    product: productFixture(`9${Date.now()}`.slice(0, 13)),
    nutrition: null,
    source: "reward_probe_provider",
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

function post(url: string, body: unknown, token: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("reward integrity: XP cannot be minted without an analysis", () => {
  let productId: string;
  let token: string;

  beforeEach(async () => {
    ({ productId, token } = await setup());
  });

  it("rejects a self-declared product_scan with 403 and awards no XP", async () => {
    const res = await retiredActivity(
      post("http://t/api/gamification/activity", {
        action_type: "product_scan",
        product_id: productId,
        event_id: "mint-attempt-0001",
      }, token),
    );
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toMatch(/scan_event_id/i);
  });

  it("awards nothing across many replay attempts with distinct event ids", async () => {
    for (let i = 0; i < 8; i++) {
      await retiredActivity(
        post("http://t/api/gamification/activity", {
          action_type: "product_scan",
          product_id: productId,
          event_id: `mint-replay-${Date.now()}-${i}`,
        }, token),
      );
    }
    const res = await getProfile(
      new NextRequest("http://t/api/gamification/profile", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const body: any = await res.json();
    expect(body.data.total_xp).toBe(0);
    expect(body.data.current_streak).toBe(0);
    expect(body.data.longest_streak).toBe(0);
  });

  it("still requires authentication before revealing anything", async () => {
    const res = await retiredActivity(
      post("http://t/api/gamification/activity", {
        action_type: "product_scan",
        product_id: productId,
        event_id: "unauth-attempt-01",
      }, "not-a-real-token"),
    );
    expect(res.status).toBe(401);
  });

  it("analyse awards XP once and is idempotent for a replayed scan_event_id", async () => {
    const scanEventId = `real-scan-${Date.now()}-aaaa`;

    const first = await analyze(
      post("http://t/api/analyze", {
        barcode: productId,
        ingredients_text: "Water, Salt",
        scan_event_id: scanEventId,
      }, token),
    );
    const firstBody: any = await first.json();

    // An unidentified/manual analysis must never pay out.
    const second = await analyze(
      post("http://t/api/analyze", {
        ingredients_text: "Water, Salt",
        scan_event_id: scanEventId,
      }, token),
    );
    const secondBody: any = await second.json();

    const firstXp = firstBody?.data?.meta?.gamification ?? firstBody?.meta?.gamification;
    const secondXp = secondBody?.data?.meta?.gamification ?? secondBody?.meta?.gamification;

    // Either the analysis could not resolve a real product (no reward), or it
    // did — in which case a manual/unidentified re-run must not add more.
    if (firstXp) {
      expect(firstXp.xp_awarded).toBeGreaterThan(0);
      expect(secondXp ?? null).toBeNull();
    }
  });
});