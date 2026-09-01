import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import type { NutritionFacts, ProductInfo } from "@/types/domain";
import { getStore } from "@/lib/store";
import { signToken } from "@/lib/auth";
import { POST as postFeedback } from "@/app/api/products/[id]/alternatives/feedback/route";
import { GET as getAlternatives } from "@/app/api/products/[id]/alternatives/route";
import {
  recordAlternativeFeedback,
  listAlternativeFeedback,
  getAlternativeFeedbackSummary,
  resolveAlternativeFeedbackContext,
} from "@/services/alternative-feedback.service";
import { findAlternativesForProduct } from "@/services/alternative-engine.service";

beforeAll(async () => {
  process.env.DATABASE_URL = ""; // force in-memory (mock) store
});

function nutrition(nutrients: Record<string, number>): NutritionFacts {
  return {
    basis: "PER_100G",
    nutrients: Object.fromEntries(
      Object.entries(nutrients).map(([k, value]) => [
        k,
        { value, unit: k === "sodium" || k === "salt" ? "mg" : "g", confidence: 0.9 },
      ]),
    ),
  };
}

function product(name: string, barcode: string, ingredientsRaw: string): ProductInfo {
  return {
    id: `p-${barcode}`,
    name,
    brand: "TestBrand",
    category: "food",
    barcode,
    ingredientsRaw,
    country: "IN",
    servingSize: null,
    imageUrl: null,
    ingredientsNormalized: [],
    source: "test",
    sourceUrl: null,
    verified: false,
    productDataConfidence: 0.8,
    isDemo: false,
  };
}

async function saveProduct(name: string, barcode: string, ingredientsRaw: string, nutr: NutritionFacts) {
  const store = getStore();
  const saved = await store.saveProductFromProvider({
    product: product(name, barcode, ingredientsRaw),
    nutrition: nutr,
    source: "test",
  });
  if (!saved.product) throw new Error("saveProductFromProvider returned no product");
  return saved.product;
}

describe("Phase 6 alternative feedback", () => {
  let user: Awaited<ReturnType<ReturnType<typeof getStore>["createUser"]>>;
  let token: string;
  let source: ProductInfo;
  let altB: ProductInfo;
  let altC: ProductInfo;
  let altD: ProductInfo;

  beforeAll(async () => {
    const store = getStore();
    user = await store.createUser({
      email: "feedback@test.local",
      name: "Feedback User",
      passwordHash: null,
    });
    token = await signToken({ id: user.id, email: user.email, name: user.name, role: "USER", language: "EN" });

    // STEP 15 scenario: Cereal A with sodium + added sugar + palm oil issues.
    source = await saveProduct(
      "Cereal A",
      "7000000000001",
      "Ingredients: Corn, Palm Oil, Sugar, Salt.",
      nutrition({ sodium: 800, addedSugars: 30, sugars: 35 }),
    );
    altB = await saveProduct(
      "Cereal B",
      "7000000000002",
      "Ingredients: Corn, Sugar, Salt.",
      nutrition({ sodium: 400, addedSugars: 10, sugars: 12 }),
    );
    altC = await saveProduct(
      "Cereal C",
      "7000000000003",
      "Ingredients: Corn, Sugar, Salt.",
      nutrition({ sodium: 500, addedSugars: 15, sugars: 18 }),
    );
    altD = await saveProduct(
      "Cereal D",
      "7000000000004",
      "Ingredients: Corn, Sugar, Salt.",
      nutrition({ sodium: 600, addedSugars: 20, sugars: 22 }),
    );
  });

  const record = (eventType: string, opts?: { characteristicKeys?: string[]; alternativeProductId?: string; productId?: string }) =>
    recordAlternativeFeedback({
      userId: user.id,
      productId: opts?.productId ?? source.id,
      alternativeProductId: opts?.alternativeProductId ?? altB.id,
      eventType,
      characteristicKeys: opts?.characteristicKeys,
    });

  const post = (productId: string, body: unknown) =>
    postFeedback(
      new NextRequest(`http://localhost/api/products/${productId}/alternatives/feedback`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: productId }) },
    );

  it("1. VIEWED event can be recorded", async () => {
    const result = await record("VIEWED");
    expect(result.recorded).toBe(true);
    expect(result.record?.eventType).toBe("VIEWED");
    expect(result.record?.alternativeProductId).toBe(altB.id);
    expect(result.record?.productId).toBe(source.id);
    expect(typeof result.record?.timestamp).toBe("string");
  });

  it("2. CLICKED event can be recorded", async () => {
    const result = await record("CLICKED");
    expect(result.recorded).toBe(true);
    expect(result.record?.eventType).toBe("CLICKED");
  });

  it("3. SELECTED event can be recorded", async () => {
    const result = await record("SELECTED");
    expect(result.recorded).toBe(true);
    expect(result.record?.eventType).toBe("SELECTED");
  });

  it("4. REJECTED event can be recorded", async () => {
    const result = await record("REJECTED", { alternativeProductId: altC.id });
    expect(result.recorded).toBe(true);
    expect(result.record?.eventType).toBe("REJECTED");
  });

  it("5. invalid event type is rejected", async () => {
    const res = await post(source.id, { alternativeProductId: altB.id, eventType: "HOVERED" });
    expect(res.status).toBe(400);
    await expect(record("HOVERED")).rejects.toThrow();
  });

  it("6. missing alternativeProductId is rejected", async () => {
    const res = await post(source.id, { eventType: "VIEWED" });
    expect(res.status).toBe(400);
  });

  it("7. missing product context is rejected", async () => {
    const res = await post("does-not-exist", { alternativeProductId: altB.id, eventType: "VIEWED" });
    expect(res.status).toBe(404);
    await expect(record("VIEWED", { productId: "does-not-exist" })).rejects.toThrow();
    // Alternative must differ from the current product.
    await expect(record("VIEWED", { productId: source.id, alternativeProductId: source.id })).rejects.toThrow();
  });

  it("8. characteristic keys are validated", async () => {
    const ok = await record("VIEWED", { characteristicKeys: ["LOWER_SODIUM"] });
    expect(ok.recorded).toBe(true);
    await expect(record("VIEWED", { characteristicKeys: ["NOT_A_CHARACTERISTIC"] })).rejects.toThrow();
  });

  it("9. client cannot inject arbitrary recommendation scores", async () => {
    // Strict schema: a client-supplied recommendationScore is rejected
    // outright — it can never reach the stored record.
    const res = await post(source.id, {
      alternativeProductId: altB.id,
      eventType: "VIEWED",
      recommendationScore: 9999,
    });
    expect(res.status).toBe(400);

    // rankPosition is accepted by the API shape but NEVER trusted: the stored
    // rank always comes from the server-derived context.
    const res2 = await post(source.id, {
      alternativeProductId: altB.id,
      eventType: "VIEWED",
      rankPosition: 99,
    });
    expect(res2.status).toBe(200);
    const context = await resolveAlternativeFeedbackContext({ userId: user.id, productId: source.id });
    const ctxB = context.alternatives.find((a) => a.productId === altB.id);
    const stored = (await listAlternativeFeedback(user.id)).filter(
      (r) => r.eventType === "VIEWED" && r.alternativeProductId === altB.id,
    );
    const latest = stored[stored.length - 1];
    expect(latest.rankPosition).toBe(ctxB?.rankPosition);
    expect(latest.rankPosition).not.toBe(99);
    expect(latest.recommendationScore).toBe(ctxB?.recommendationScore);
  });

  it("10. client cannot invent unsupported characteristics", async () => {
    // WHOLE_GRAIN is not derivable from Cereal A (no maida) — must be rejected.
    const res = await post(source.id, {
      alternativeProductId: altB.id,
      eventType: "VIEWED",
      characteristicKeys: ["WHOLE_GRAIN"],
    });
    expect(res.status).toBe(400);
  });

  it("11. client cannot inject another user's identity", async () => {
    // Strict schema: a client-supplied userId is rejected outright.
    const res = await post(source.id, {
      alternativeProductId: altB.id,
      eventType: "VIEWED",
      userId: "someone-else",
    });
    expect(res.status).toBe(400);
    // The recorded userId always comes from the session token, never the body.
    const stored = await listAlternativeFeedback(user.id);
    expect(stored.every((r) => r.userId === user.id)).toBe(true);
  });

  it("11b. client cannot impersonate another user (users are isolated)", async () => {
    const other = await getStore().createUser({
      email: "feedback-other@test.local",
      name: "Other User",
      passwordHash: null,
    });
    const otherToken = await signToken({ id: other.id, email: other.email, name: other.name, role: "USER", language: "EN" });
    const res = await postFeedback(
      new NextRequest("http://localhost/api/products/x/alternatives/feedback", {
        method: "POST",
        headers: { Authorization: `Bearer ${otherToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ alternativeProductId: altB.id, eventType: "VIEWED" }),
      }),
      { params: Promise.resolve({ id: source.id }) },
    );
    expect(res.status).toBe(200);
    const otherRecords = await listAlternativeFeedback(other.id);
    expect(otherRecords).toHaveLength(1);
    expect(otherRecords[0].userId).toBe(other.id);
    // None of "other" user's events leaked into the first user's history.
    const own = await listAlternativeFeedback(user.id);
    expect(own.every((r) => r.userId === user.id)).toBe(true);
  });

  it("11c. client cannot create feedback for an unrelated alternative", async () => {
    // Cereal E has WORSE nutrition than Cereal A (more sodium/sugar) — it
    // fails the criteria validation gate, so it is NOT part of the trusted
    // alternatives context. Feedback for it must be rejected (422).
    const worse = await saveProduct(
      "Cereal E",
      "7000000000005",
      "Ingredients: Corn, Palm Oil, Sugar, Salt.",
      nutrition({ sodium: 900, addedSugars: 40, sugars: 45 }),
    );
    const res = await post(source.id, { alternativeProductId: worse.id, eventType: "VIEWED" });
    expect(res.status).toBe(422);
  });

  it("12. duplicate VIEWED events behave correctly (VIEWED may repeat)", async () => {
    const before = (await listAlternativeFeedback(user.id)).filter(
      (r) => r.eventType === "VIEWED" && r.alternativeProductId === altD.id,
    ).length;
    const first = await record("VIEWED", { alternativeProductId: altD.id });
    const second = await record("VIEWED", { alternativeProductId: altD.id });
    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(true);
    const after = (await listAlternativeFeedback(user.id)).filter(
      (r) => r.eventType === "VIEWED" && r.alternativeProductId === altD.id,
    ).length;
    expect(after - before).toBe(2);
  });

  it("12b. SELECTED duplicates are NOT globally deduplicated (no session id)", async () => {
    // Phase 6 policy: without a recommendation-session identifier every
    // SELECTED event is recorded; accidental-duplicate protection is a
    // documented limitation, not a global dedupe.
    const before = (await listAlternativeFeedback(user.id)).filter(
      (r) => r.eventType === "SELECTED" && r.alternativeProductId === altC.id,
    ).length;
    const first = await record("SELECTED", { alternativeProductId: altC.id });
    const second = await record("SELECTED", { alternativeProductId: altC.id });
    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(true);
    const after = (await listAlternativeFeedback(user.id)).filter(
      (r) => r.eventType === "SELECTED" && r.alternativeProductId === altC.id,
    ).length;
    expect(after - before).toBe(2);
  });

  it("12c. REJECTED duplicates are allowed (may be valid across sessions)", async () => {
    const before = (await listAlternativeFeedback(user.id)).filter(
      (r) => r.eventType === "REJECTED" && r.alternativeProductId === altC.id,
    ).length;
    const first = await record("REJECTED", { alternativeProductId: altC.id });
    const second = await record("REJECTED", { alternativeProductId: altC.id });
    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(true);
    const after = (await listAlternativeFeedback(user.id)).filter(
      (r) => r.eventType === "REJECTED" && r.alternativeProductId === altC.id,
    ).length;
    expect(after - before).toBe(2);
  });

  it("13. existing alternatives API still works", async () => {
    const res = await getAlternatives(
      new NextRequest("http://localhost/api/products/x/alternatives"),
      { params: Promise.resolve({ id: source.id }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data.alternatives)).toBe(true);
    expect(body.data.alternativeCharacteristics.length).toBeGreaterThanOrEqual(3);
  });

  it("16. feedback failure does not break frontend alternatives", async () => {
    // A malformed feedback attempt fails loudly...
    await expect(record("NOPE")).rejects.toThrow();
    // ...but the alternatives pipeline is fully independent and still works.
    const pipeline = await findAlternativesForProduct({
      product: source,
      nutrition: nutrition({ sodium: 800, addedSugars: 30, sugars: 35 }),
    });
    expect(pipeline.alternatives.length).toBeGreaterThan(0);
    expect(pipeline.characteristics.map((c) => c.key)).toContain("LOWER_SODIUM");
  });

  it("STEP 15 data quality: interaction history preserves full context", async () => {
    // User: views B, clicks B, selects B, views C, rejects C.
    // Expected ranks (STEP 18): B → rank 1, C → rank 2, D → rank 3.
    const user2 = await getStore().createUser({
      email: "feedback2@test.local",
      name: "Feedback User 2",
      passwordHash: null,
    });

    await recordAlternativeFeedback({ userId: user2.id, productId: source.id, alternativeProductId: altB.id, eventType: "VIEWED" });
    await recordAlternativeFeedback({ userId: user2.id, productId: source.id, alternativeProductId: altB.id, eventType: "CLICKED" });
    await recordAlternativeFeedback({ userId: user2.id, productId: source.id, alternativeProductId: altB.id, eventType: "SELECTED" });
    await recordAlternativeFeedback({ userId: user2.id, productId: source.id, alternativeProductId: altC.id, eventType: "VIEWED" });
    await recordAlternativeFeedback({ userId: user2.id, productId: source.id, alternativeProductId: altC.id, eventType: "REJECTED" });

    const records = await listAlternativeFeedback(user2.id);
    expect(records).toHaveLength(5);

    // Exact rank context (STEP 18): B → 1, C → 2, D → 3.
    const rankOf = (productId: string) =>
      records.find((r) => r.alternativeProductId === productId)?.rankPosition;
    expect(rankOf(altB.id)).toBe(1);
    expect(rankOf(altC.id)).toBe(2);

    const selectB = records.find((r) => r.eventType === "SELECTED");
    expect(selectB).toBeDefined();
    if (!selectB) return;
    expect(selectB.productId).toBe(source.id);
    expect(selectB.alternativeProductId).toBe(altB.id);
    expect(selectB.rankPosition).toBe(1);
    expect(selectB.recommendationScore).toBeGreaterThan(0);
    expect(selectB.characteristicKeys).toContain("LOWER_SODIUM");
    expect(selectB.characteristicKeys).toContain("LOWER_ADDED_SUGAR");
    expect(selectB.characteristicKeys).toContain("PALM_OIL_FREE");
    expect(selectB.sourceIssueKeys).toContain("sodium");
    expect(Number.isNaN(Date.parse(selectB.timestamp))).toBe(false);

    // The full interaction trail (STEP 18 dataset), order-independent —
    // storage order is store-specific (in-memory returns newest first).
    const trail = records
      .map((r) => `${r.productId}|${r.alternativeProductId}|${r.eventType}|${r.rankPosition}`)
      .sort();
    expect(trail).toEqual(
      [
        `${source.id}|${altB.id}|VIEWED|1`,
        `${source.id}|${altB.id}|CLICKED|1`,
        `${source.id}|${altB.id}|SELECTED|1`,
        `${source.id}|${altC.id}|VIEWED|2`,
        `${source.id}|${altC.id}|REJECTED|2`,
      ].sort(),
    );

    // Rank must match the trusted server-derived context.
    const context = await resolveAlternativeFeedbackContext({ userId: user2.id, productId: source.id });
    const ctxB = context.alternatives.find((a) => a.productId === altB.id);
    expect(ctxB?.rankPosition).toBe(selectB.rankPosition);
    expect(ctxB?.recommendationScore).toBe(selectB.recommendationScore);

    // Summary aggregates behaviour per characteristic.
    const summary = await getAlternativeFeedbackSummary(user2.id);
    expect(summary.LOWER_SODIUM).toEqual({ views: 2, clicks: 1, selections: 1, rejections: 1 });
    expect(summary.PALM_OIL_FREE).toEqual({ views: 2, clicks: 1, selections: 1, rejections: 1 });
  });
});