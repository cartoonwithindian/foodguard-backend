import { describe, it, expect, beforeAll } from "vitest";
import type { NutritionFacts, ProductInfo } from "@/types/domain";
import { getStore } from "@/lib/store";
import { ALTERNATIVE_FEEDBACK_SOURCE } from "@/lib/alternative-feedback";
import type { AlternativeFeedbackEventRecord } from "@/lib/alternative-feedback";
import { recordAlternativeFeedback } from "@/services/alternative-feedback.service";
import {
  buildAlternativeTrainingDataset,
  splitAlternativeDataset,
  computeDatasetStats,
  exportAlternativeDatasetJsonl,
  getMinDatasetExamples,
} from "@/services/alternative-dataset.service";
import { toAlternativeLabel, extractNutrientFeatures } from "@/lib/alternative-dataset";

beforeAll(async () => {
  process.env.DATABASE_URL = ""; // force in-memory (mock) store
});

function nutrition(nutrients: Record<string, number>, basis: "PER_100G" | "PER_SERVING" = "PER_100G", servingSize?: string): NutritionFacts {
  return {
    basis,
    servingSize,
    nutrients: Object.fromEntries(
      Object.entries(nutrients).map(([k, value]) => [
        k,
        { value, unit: k === "sodium" || k === "salt" ? "mg" : "g", confidence: 0.9 },
      ]),
    ),
  };
}

function product(name: string, barcode: string, ingredientsRaw: string, category = "food"): ProductInfo {
  return {
    id: `p-${barcode}`,
    name,
    brand: "TestBrand",
    category: category as ProductInfo["category"],
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

async function saveProduct(name: string, barcode: string, ingredientsRaw: string, nutr?: NutritionFacts, category = "food") {
  const store = getStore();
  const saved = await store.saveProductFromProvider({
    product: product(name, barcode, ingredientsRaw, category),
    nutrition: nutr ?? null,
    source: "test",
  });
  if (!saved.product) throw new Error("saveProductFromProvider returned no product");
  return saved.product;
}

function makeRecord(overrides: Partial<AlternativeFeedbackEventRecord>): AlternativeFeedbackEventRecord {
  return {
    id: crypto.randomUUID(),
    userId: "u1",
    productId: "source",
    alternativeProductId: "candidate",
    eventType: "VIEWED",
    timestamp: "2026-01-01T00:00:00.000Z",
    characteristicKeys: ["LOWER_SODIUM"],
    sourceIssueKeys: ["sodium"],
    rankPosition: 1,
    recommendationScore: 85,
    criteriaSnapshot: { preferredCharacteristics: ["LOWER_SODIUM"], unsupported: [] },
    ...overrides,
  };
}

async function seedHistory(record: AlternativeFeedbackEventRecord) {
  await getStore().addHistoryEntry(record.userId, {
    productId: record.productId,
    assessmentSnapshot: record,
    source: ALTERNATIVE_FEEDBACK_SOURCE,
  });
}

describe("Phase 7 alternative dataset", () => {
  let userA: Awaited<ReturnType<ReturnType<typeof getStore>["createUser"]>>;
  let userB: Awaited<ReturnType<ReturnType<typeof getStore>["createUser"]>>;
  let source: ProductInfo;
  let altB: ProductInfo;
  let altC: ProductInfo;

  beforeAll(async () => {
    const store = getStore();
    userA = await store.createUser({ email: "ds-a@test.local", name: "A", passwordHash: null });
    userB = await store.createUser({ email: "ds-b@test.local", name: "B", passwordHash: null });

    source = await saveProduct(
      "Cereal A", "7000000000001", "Ingredients: Corn, Palm Oil, Sugar, Salt.",
      nutrition({ sodium: 800, addedSugars: 30, sugars: 35 }),
    );
    altB = await saveProduct(
      "Cereal B", "7000000000002", "Ingredients: Corn, Sugar, Salt.",
      nutrition({ sodium: 400, addedSugars: 10, sugars: 12 }),
    );
    altC = await saveProduct(
      "Cereal C", "7000000000003", "Ingredients: Corn, Sugar, Salt.",
      nutrition({ sodium: 500, addedSugars: 15, sugars: 18 }),
    );
  });

  it("1–4. each event type maps to the correct deterministic label", () => {
    expect(toAlternativeLabel("VIEWED")).toBe(0);
    expect(toAlternativeLabel("CLICKED")).toBe(1);
    expect(toAlternativeLabel("SELECTED")).toBe(2);
    expect(toAlternativeLabel("REJECTED")).toBe(-1);
  });

  it("5. characteristic features are correct for the feedback context", async () => {
    await seedHistory(makeRecord({
      userId: userA.id, productId: source.id, alternativeProductId: altB.id,
      eventType: "SELECTED", timestamp: "2026-01-01T00:00:01.000Z",
      characteristicKeys: ["LOWER_SODIUM", "LOWER_ADDED_SUGAR", "PALM_OIL_FREE"],
      sourceIssueKeys: ["sodium", "addedSugars", "palm_oil"],
    }));
    const { examples } = await buildAlternativeTrainingDataset();
    const ex = examples.find((e) => e.eventType === "SELECTED" && e.alternativeProductId === altB.id);
    expect(ex).toBeDefined();
    if (!ex) return;
    expect(ex.features.has_lower_sodium).toBe(1);
    expect(ex.features.has_lower_added_sugar).toBe(1);
    expect(ex.features.has_palm_oil_free).toBe(1);
    expect(ex.features.has_whole_grain).toBe(0);
    expect(ex.features.has_allergen_free).toBe(0);
  });

  it("6. absolute nutrition delta is computed correctly", () => {
    const n = extractNutrientFeatures(
      "sodium",
      nutrition({ sodium: 800 }),
      nutrition({ sodium: 400 }),
    );
    expect(n.delta).toBe(-400);
    expect(n.source).toBe(800);
    expect(n.candidate).toBe(400);
    expect(n.improvement).toBe(1); // lower sodium → improved
  });

  it("7. relative nutrition delta is correct (not treated as zero)", () => {
    const n = extractNutrientFeatures(
      "sodium",
      nutrition({ sodium: 800 }),
      nutrition({ sodium: 400 }),
    );
    expect(n.relativeDelta).toBeCloseTo(-0.5, 5);
    const worse = extractNutrientFeatures("sodium", nutrition({ sodium: 400 }), nutrition({ sodium: 800 }));
    expect(worse.relativeDelta).toBeCloseTo(1, 5);
    expect(worse.improvement).toBe(-1);
  });

  it("8. missing nutrition is explicit null, never zero", () => {
    const n = extractNutrientFeatures("sodium", nutrition({ sodium: 800 }), nutrition({ addedSugars: 5 }));
    expect(n.source).toBe(800);
    expect(n.candidate).toBeNull();
    expect(n.delta).toBeNull();
    expect(n.relativeDelta).toBeNull();
    expect(n.improvement).toBeNull();
  });

  it("9. incompatible nutrition bases are not compared", () => {
    const a = nutrition({ sodium: 800 }, "PER_100G");
    const b = nutrition({ sodium: 400 }, "PER_SERVING", "30g");
    const n = extractNutrientFeatures("sodium", a, b);
    expect(n.delta).toBeNull();
    expect(n.candidate).toBeNull();
    // Matching serving sizes ARE comparable.
    const sameSize = extractNutrientFeatures("sodium", nutrition({ sodium: 800 }, "PER_SERVING", "30g"), nutrition({ sodium: 400 }, "PER_SERVING", "30g"));
    expect(sameSize.delta).toBe(-400);
  });

  it("10–11. existing recommendation score and rank are preserved verbatim", async () => {
    await recordAlternativeFeedback({ userId: userA.id, productId: source.id, alternativeProductId: altB.id, eventType: "VIEWED" });
    const { examples } = await buildAlternativeTrainingDataset();
    const latest = examples
      .filter((e) => e.eventType === "VIEWED" && e.alternativeProductId === altB.id)
      .sort((x, y) => y.timestamp.localeCompare(x.timestamp))[0];
    expect(latest.rankPosition).toBe(1);
    expect(latest.recommendationScore).toBeGreaterThan(0);
    const { features } = latest;
    expect(features.rank_position).toBe(latest.rankPosition);
    expect(features.recommendation_score).toBe(latest.recommendationScore);
  });

  it("12. unknown characteristic is rejected safely (record skipped + counted)", async () => {
    const before = (await buildAlternativeTrainingDataset()).stats.invalidRecordCount;
    await seedHistory(makeRecord({
      userId: userA.id, productId: source.id, alternativeProductId: altB.id,
      eventType: "VIEWED", timestamp: "2026-02-01T00:00:00.000Z",
      characteristicKeys: ["BEST_PRODUCT"],
    }));
    const after = await buildAlternativeTrainingDataset();
    expect(after.stats.invalidRecordCount).toBe(before + 1);
    expect(after.examples.some((e) => e.characteristicKeys.includes("BEST_PRODUCT"))).toBe(false);
  });

  it("13. invalid feedback records are skipped and reported", async () => {
    const before = (await buildAlternativeTrainingDataset()).stats.invalidRecordCount;
    await seedHistory(makeRecord({
      userId: userA.id, productId: source.id, alternativeProductId: altB.id,
      eventType: "HOVERED" as AlternativeFeedbackEventRecord["eventType"],
      timestamp: "2026-03-01T00:00:00.000Z",
    }));
    await seedHistory(makeRecord({
      userId: userA.id, productId: source.id, alternativeProductId: "missing-product",
      eventType: "VIEWED", timestamp: "2026-03-02T00:00:00.000Z",
    }));
    const after = await buildAlternativeTrainingDataset();
    expect(after.stats.invalidRecordCount).toBe(before + 2);
    const validEvents = new Set(["VIEWED", "CLICKED", "SELECTED", "REJECTED"]);
    expect(after.examples.some((e) => !validEvents.has(e.eventType))).toBe(false);
    expect(after.examples.some((e) => e.alternativeProductId === "missing-product")).toBe(false);
  });

  it("14. future event data cannot leak into earlier example features", async () => {
    const first = await buildAlternativeTrainingDataset();
    const earliestExample = [...first.examples].sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
    expect(earliestExample).toBeDefined();

    // A future SELECTED event for the same pair happens AFTER the earlier event.
    await seedHistory(makeRecord({
      userId: userA.id, productId: source.id, alternativeProductId: altB.id,
      eventType: "SELECTED", timestamp: "2026-12-31T23:59:59.000Z",
      characteristicKeys: ["LOWER_SODIUM"],
    }));

    const second = await buildAlternativeTrainingDataset();
    const again = second.examples.find((e) => e.sourceRecordId === earliestExample.sourceRecordId);
    expect(again).toBeDefined();
    if (!again) return;
    // The earlier example is byte-for-byte unchanged: features/label are built
    // only from recommendation-time data, never aggregated from later events.
    expect(again).toEqual(earliestExample);
    // The feature schema contains no aggregate/behavioural features at all.
    expect("has_select" in again.features).toBe(false);
    expect(again.label).toBe(earliestExample.label);
  });

  it("15. explicit user preference is kept separate from the behavioural label", async () => {
    const store = getStore();
    await store.upsertUserPreferences(userA.id, {
      vegetarian: true,
      vegan: false,
      allergies: ["peanut"],
      dietaryRestrictions: ["low_sodium"],
      avoidIngredients: [],
      preferredIngredients: [],
      healthGoals: ["heart_health"],
      sensitivityPreferences: [],
    });
    const { examples } = await buildAlternativeTrainingDataset();
    const ex = examples.find((e) => e.userId === userA.id);
    expect(ex?.explicitPreferences.pref_vegetarian).toBe(1);
    expect(ex?.explicitPreferences.pref_allergy_count).toBe(1);
    expect(ex?.explicitPreferences.pref_health_goal_count).toBe(1);
    // Explicit preference features and the behavioural label are separate fields.
    expect(ex?.label).toBeTypeOf("number");
    expect(ex?.explicitPreferences).not.toHaveProperty("label");
    // No raw sensitive values are stored.
    expect(JSON.stringify(ex?.explicitPreferences)).not.toContain("peanut");
    expect(JSON.stringify(ex?.explicitPreferences)).not.toContain("low_sodium");
  });

  it("16. repeated VIEWED events remain valid (no global dedupe)", async () => {
    await seedHistory(makeRecord({
      userId: userB.id, productId: source.id, alternativeProductId: altC.id,
      eventType: "VIEWED", timestamp: "2026-04-01T00:00:00.000Z",
    }));
    await seedHistory(makeRecord({
      userId: userB.id, productId: source.id, alternativeProductId: altC.id,
      eventType: "VIEWED", timestamp: "2026-04-02T00:00:00.000Z",
    }));
    const { examples } = await buildAlternativeTrainingDataset();
    const views = examples.filter((e) => e.eventType === "VIEWED" && e.alternativeProductId === altC.id);
    expect(views.length).toBeGreaterThanOrEqual(2);
  });

  it("17. repeated SELECTED events remain valid per Phase 6 semantics", async () => {
    await seedHistory(makeRecord({
      userId: userB.id, productId: source.id, alternativeProductId: altC.id,
      eventType: "SELECTED", timestamp: "2026-05-01T00:00:00.000Z",
    }));
    await seedHistory(makeRecord({
      userId: userB.id, productId: source.id, alternativeProductId: altC.id,
      eventType: "SELECTED", timestamp: "2026-05-02T00:00:00.000Z",
    }));
    const { examples } = await buildAlternativeTrainingDataset();
    const selects = examples.filter((e) => e.eventType === "SELECTED" && e.alternativeProductId === altC.id);
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  it("18. temporal train/validation/test split is deterministic and ordered", async () => {
    const { examples } = await buildAlternativeTrainingDataset({ minExamples: 2 });
    const split1 = splitAlternativeDataset(examples, { minExamples: 2 });
    const split2 = splitAlternativeDataset(examples, { minExamples: 2 });
    expect(split1).not.toBeNull();
    if (!split1) return;
    expect(split2?.train.map((e) => e.sourceRecordId)).toEqual(split1.train.map((e) => e.sourceRecordId));
    expect(split2?.validation.map((e) => e.sourceRecordId)).toEqual(split1.validation.map((e) => e.sourceRecordId));
    expect(split2?.test.map((e) => e.sourceRecordId)).toEqual(split1.test.map((e) => e.sourceRecordId));
    expect(split1.strategy).toBe("temporal_70_15_15");

    const sorted = [...examples].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.sourceRecordId.localeCompare(b.sourceRecordId));
    const validationFrom = Math.floor(sorted.length * 0.7);
    const testFrom = Math.floor(sorted.length * 0.85);
    expect(split1.train).toHaveLength(validationFrom);
    expect(split1.validation).toHaveLength(testFrom - validationFrom);
    expect(split1.test).toHaveLength(sorted.length - testFrom);
    expect(split1.train.every((e) => sorted.indexOf(e) < validationFrom)).toBe(true);
    expect(split1.test.every((e) => sorted.indexOf(e) >= testFrom)).toBe(true);
    // User overlap is reported, never silently assumed zero.
    expect(typeof split1.userOverlap.trainTest).toBe("number");
  });

  it("19. dataset statistics are correct", async () => {
    const { stats } = await buildAlternativeTrainingDataset();
    expect(stats.totalExamples).toBe(stats.eventCounts.VIEWED + stats.eventCounts.CLICKED + stats.eventCounts.SELECTED + stats.eventCounts.REJECTED);
    expect(stats.uniqueUsers).toBeGreaterThanOrEqual(2);
    expect(stats.uniqueProducts).toBeGreaterThanOrEqual(1);
    expect(stats.uniqueAlternatives).toBeGreaterThanOrEqual(1);
    expect(stats.characteristicCounts.LOWER_SODIUM).toBeGreaterThanOrEqual(1);
    expect(stats.missingNutritionCount).toBeGreaterThanOrEqual(0);
    expect(stats.missingPreferenceCount).toBeGreaterThanOrEqual(0);
    expect(typeof stats.invalidRecordCount).toBe("number");
    expect(typeof stats.temporalRange.earliest).toBe("string");
    expect(typeof stats.temporalRange.latest).toBe("string");
    expect(stats.trainCount + stats.validationCount + stats.testCount).toBeLessThanOrEqual(stats.totalExamples);
  });

  it("20. insufficient data is reported clearly (configurable threshold)", async () => {
    const res = await buildAlternativeTrainingDataset({ minExamples: 1_000_000 });
    expect(res.readiness.readyForMlExperiment).toBe(false);
    expect(res.readiness.reason).toMatch(/Insufficient interaction history/);
    expect(res.split).toBeNull();
    expect(getMinDatasetExamples()).toBeGreaterThan(0);
  });

  it("20b. sufficient data produces a ready dataset with a real split", async () => {
    const res = await buildAlternativeTrainingDataset({ minExamples: 2 });
    expect(res.readiness.readyForMlExperiment).toBe(true);
    expect(res.split).not.toBeNull();
    if (!res.split) return;
    expect(res.split.train.length).toBeGreaterThan(0);
    expect(res.split.validation.length).toBeGreaterThan(0);
    expect(res.split.test.length).toBeGreaterThan(0);
  });

  it("export: JSONL is deterministic, one row per example, minimal fields", async () => {
    const { examples } = await buildAlternativeTrainingDataset({ minExamples: 2 });
    const jsonl1 = exportAlternativeDatasetJsonl(examples);
    const jsonl2 = exportAlternativeDatasetJsonl(examples);
    expect(jsonl1).toBe(jsonl2);
    const rows = jsonl1.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(rows.length).toBe(examples.length);
    const first = rows[0];
    expect(typeof first.label).toBe("number");
    expect(typeof first.features.sodium_delta).toBe("number");
    expect(first.features.rank_position).toBe(first.rankPosition);
    // No raw ingredient/OCR text in the export.
    const serialized = jsonl1;
    expect(serialized).not.toContain("Ingredients:");
    expect(serialized).not.toContain("Corn");
  });

  it("dataset builder never calls the ML stack / never modifies ranking", async () => {
    // Phase 7 output is data only — no model artifacts, no score changes.
    const res = await buildAlternativeTrainingDataset({ minExamples: 2 });
    expect(res).not.toHaveProperty("model");
    expect(res).not.toHaveProperty("predictions");
    expect(res.split).not.toHaveProperty("trainedRanker");
  });
});

describe("Phase 7 dataset stats helper", () => {
  it("computeDatasetStats aggregates event counts and temporal range", () => {
    const a = makeRecord({ id: "a", timestamp: "2026-01-01T00:00:00.000Z" });
    const b = makeRecord({ id: "b", timestamp: "2026-06-01T00:00:00.000Z", eventType: "SELECTED" });
    const c = makeRecord({ id: "c", timestamp: "2026-12-01T00:00:00.000Z", eventType: "REJECTED" });
    const example = (r: AlternativeFeedbackEventRecord) => ({
      userId: r.userId,
      productId: r.productId,
      alternativeProductId: r.alternativeProductId,
      eventType: r.eventType,
      label: toAlternativeLabel(r.eventType),
      rankPosition: r.rankPosition,
      recommendationScore: r.recommendationScore,
      characteristicKeys: r.characteristicKeys,
      sourceIssueKeys: r.sourceIssueKeys,
      criteriaSnapshot: r.criteriaSnapshot,
      explicitPreferences: { pref_missing: 0, pref_vegetarian: 0, pref_vegan: 0, pref_allergy_count: 0, pref_dietary_restriction_count: 0, pref_avoid_ingredient_count: 0, pref_health_goal_count: 0 },
      features: {} as never,
      timestamp: r.timestamp,
      sourceRecordId: r.id,
    });
    const stats = computeDatasetStats([example(a), example(b), example(c)], 0, 0, 1);
    expect(stats.totalExamples).toBe(3);
    expect(stats.eventCounts).toEqual({ VIEWED: 1, CLICKED: 0, SELECTED: 1, REJECTED: 1 });
    expect(stats.temporalRange).toEqual({ earliest: "2026-01-01T00:00:00.000Z", latest: "2026-12-01T00:00:00.000Z" });
    expect(stats.invalidRecordCount).toBe(1);
  });
});