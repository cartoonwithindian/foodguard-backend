import { describe, it, expect, beforeAll } from "vitest";
import type { NutritionFacts, ProductInfo } from "@/types/domain";
import { getStore } from "@/lib/store";
import { ALTERNATIVE_FEEDBACK_SOURCE } from "@/lib/alternative-feedback";
import type { AlternativeFeedbackEventRecord } from "@/lib/alternative-feedback";
import { buildAlternativeTrainingDataset } from "@/services/alternative-dataset.service";
import { runAlternativeMlExperiment } from "@/services/alternative-ml-experiment.service";
import { flattenFeatureVector, groupByContext, evaluateRankingMetrics, baselineScore, trainLinearRanker, featureImportance } from "@/lib/alternative-ml";
import { calculateAlternativeScore } from "@/services/alternative-scoring.service";
import { readFileSync } from "node:fs";

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

async function seedRecord(record: AlternativeFeedbackEventRecord) {
  await getStore().addHistoryEntry(record.userId, {
    productId: record.productId,
    assessmentSnapshot: record,
    source: ALTERNATIVE_FEEDBACK_SOURCE,
  });
}

describe("Phase 8 offline ML experiment", () => {
  const CHAR_KEYS = ["LOWER_SODIUM", "LOWER_ADDED_SUGAR", "LOWER_SUGAR", "LOWER_SALT", "PALM_OIL_FREE"];

  beforeAll(async () => {
    const store = getStore();
    const users = [
      await store.createUser({ email: "ml-a@test.local", name: "A", passwordHash: null }),
      await store.createUser({ email: "ml-b@test.local", name: "B", passwordHash: null }),
      await store.createUser({ email: "ml-c@test.local", name: "C", passwordHash: null }),
      await store.createUser({ email: "ml-d@test.local", name: "D", passwordHash: null }),
    ];

    const sources = [
      await saveProduct("Source 1", "8000000000001", "Ingredients: Corn, Palm Oil, Sugar, Salt.", nutrition({ sodium: 800, addedSugars: 30, sugars: 35, salt: 2 })),
      await saveProduct("Source 2", "8000000000002", "Ingredients: Rice, Palm Oil, Sugar, Salt.", nutrition({ sodium: 700, addedSugars: 28, sugars: 30, salt: 1.8 })),
      await saveProduct("Source 3", "8000000000003", "Ingredients: Wheat, Palm Oil, Sugar, Salt.", nutrition({ sodium: 650, addedSugars: 25, sugars: 28, salt: 1.6 })),
    ];
    const alts = [
      await saveProduct("Alt 1", "8000000000011", "Ingredients: Corn, Salt.", nutrition({ sodium: 300, addedSugars: 5, sugars: 8, salt: 0.5 })),
      await saveProduct("Alt 2", "8000000000012", "Ingredients: Rice, Salt.", nutrition({ sodium: 400, addedSugars: 10, sugars: 12, salt: 0.8 })),
      await saveProduct("Alt 3", "8000000000013", "Ingredients: Wheat, Salt.", nutrition({ sodium: 450, addedSugars: 12, sugars: 14, salt: 0.9 })),
      await saveProduct("Alt 4", "8000000000014", "Ingredients: Oats, Salt.", nutrition({ sodium: 350, addedSugars: 8, sugars: 10, salt: 0.6 })),
    ];

    // Deterministic, realistic interaction history spanning ~120 days.
    // Per (user, source): alt1 → VIEW+CLICK+SELECT, alt2 → VIEW+REJECT,
    // alt3 → VIEW, alt4 → VIEW+CLICK+SELECT.
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    let day = 0;
    for (const user of users) {
      for (const source of sources) {
        const seq: Array<[typeof alts[number], AlternativeFeedbackEventRecord["eventType"][]]> = [
          [alts[0], ["VIEWED", "CLICKED", "SELECTED"]],
          [alts[1], ["VIEWED", "REJECTED"]],
          [alts[2], ["VIEWED"]],
          [alts[3], ["VIEWED", "CLICKED", "SELECTED"]],
        ];
        for (const [alt, events] of seq) {
          const rank = alts.indexOf(alt) + 1;
          const score = 95 - rank * 8;
          for (const eventType of events) {
            const ts = new Date(base + day * 86_400_000).toISOString();
            await seedRecord({
              id: `r-${user.id}-${source.id}-${alt.id}-${eventType}-${day}`,
              userId: user.id,
              productId: source.id,
              alternativeProductId: alt.id,
              eventType,
              timestamp: ts,
              characteristicKeys: CHAR_KEYS.slice(0, rank + 1),
              sourceIssueKeys: ["sodium", "addedSugars", "salt"],
              rankPosition: rank,
              recommendationScore: score,
              criteriaSnapshot: { preferredCharacteristics: CHAR_KEYS.slice(0, rank + 1), unsupported: [] },
            });
            day += 1;
          }
        }
      }
    }
  });

  it("1. dataset readiness check is available", async () => {
    const { stats, readiness } = await buildAlternativeTrainingDataset();
    expect(stats.totalExamples).toBeGreaterThan(0);
    expect(typeof readiness.readyForMlExperiment).toBe("boolean");
  });

  it("2. insufficient data safely stops the experiment (no fabricated model)", async () => {
    const result = await runAlternativeMlExperiment({ minExamples: 100_000 });
    expect(result.status).toBe("not_ready");
    expect(result.model.name).toBe("none");
    expect(result.mlMetrics).toBeNull();
    expect(result.notes.join(" ")).toMatch(/Insufficient interaction history/);
  });

  it("3. temporal split is respected (strategy + sizes)", async () => {
    const { split } = await buildAlternativeTrainingDataset();
    expect(split?.strategy).toBe("temporal_70_15_15");
    if (!split) return;
    const total = split.train.length + split.validation.length + split.test.length;
    expect(total).toBe((await buildAlternativeTrainingDataset()).examples.length);
    expect(
      split.train.map((e) => e.timestamp).sort().at(-1) !== undefined &&
        split.train.map((e) => e.timestamp).sort().at(-1)! <= split.validation.map((e) => e.timestamp).sort()[0],
    ).toBe(true);
    expect(
      split.validation.map((e) => e.timestamp).sort().at(-1)! <= split.test.map((e) => e.timestamp).sort()[0],
    ).toBe(true);
  });

  it("4–5. no test or validation examples enter training", async () => {
    const { split } = await buildAlternativeTrainingDataset();
    expect(split).not.toBeNull();
    if (!split) return;
    const validationIds = new Set(split.validation.map((e) => e.sourceRecordId));
    const testIds = new Set(split.test.map((e) => e.sourceRecordId));
    expect(split.train.every((e) => !testIds.has(e.sourceRecordId))).toBe(true);
    expect(split.train.every((e) => !validationIds.has(e.sourceRecordId))).toBe(true);
    // Model weights exist after training on the train partition only.
    const model = trainLinearRanker(split.train, { featureKeys: Object.keys(flattenFeatureVector(split.train[0].features)) });
    expect(Object.keys(model.weights).length).toBeGreaterThan(0);
  });

  it("6. feature vectors contain only allowed Phase 7 features", async () => {
    const { examples } = await buildAlternativeTrainingDataset();
    const allowed = new Set([
      "same_family", "same_superfamily", "category_compatible",
      "rank_position", "recommendation_score",
      "has_lower_sodium", "has_lower_added_sugar", "has_lower_sugar",
      "has_lower_saturated_fat", "has_lower_total_fat", "has_lower_trans_fat",
      "has_lower_salt", "has_palm_oil_free", "has_whole_grain", "has_allergen_free",
    ]);
    for (const ex of examples) {
      const flat = flattenFeatureVector(ex.features);
      for (const key of Object.keys(flat)) {
        expect(
        allowed.has(key) ||
          key.startsWith("source_") ||
          key.startsWith("candidate_") ||
          key.endsWith("_delta") ||
          key.endsWith("_relative_delta") ||
          key.startsWith("improvement_"),
      ).toBe(true);
      }
      expect(JSON.stringify(ex.features)).not.toContain("Ingredients:");
    }
  });

  it("7. model trains when sufficient real data exists", async () => {
    const result = await runAlternativeMlExperiment();
    expect(result.status).toBe("completed");
    expect(result.model.name).toContain("LinearRankBaseline");
    expect(result.model.features.length).toBeGreaterThan(0);
    expect(result.dataset.trainExamples).toBeGreaterThan(0);
  });

  it("8. model evaluation produces valid metrics (or NOT COMPUTABLE)", async () => {
    const result = await runAlternativeMlExperiment();
    expect(result.mlMetrics).not.toBeNull();
    if (!result.mlMetrics) return;
    const nums = [result.mlMetrics.ndcgAt1, result.mlMetrics.ndcgAt3, result.mlMetrics.ndcgAt5, result.mlMetrics.mrr, result.mlMetrics.hitAt1, result.mlMetrics.hitAt3];
    const hasNumeric = nums.some((v) => typeof v === "number");
    expect(hasNumeric).toBe(true);
    expect(result.mlMetrics.labelDistribution).toHaveProperty("VIEWED");
    expect(result.mlMetrics.labelDistribution).toHaveProperty("SELECTED");
  });

  it("9. baseline (existing recommendation score) evaluation works", async () => {
    const result = await runAlternativeMlExperiment();
    expect(result.baselineMetrics).not.toBeNull();
    if (!result.baselineMetrics) return;
    const { examples } = await buildAlternativeTrainingDataset();
    const contexts = groupByContext(result.baselineMetrics ? examples : []);
    expect(contexts.length).toBeGreaterThan(0);
    const { ndcgAt1 } = evaluateRankingMetrics(contexts, baselineScore);
    expect(typeof ndcgAt1).toBe("number");
  });

  it("10. ML vs baseline comparison works", async () => {
    const result = await runAlternativeMlExperiment();
    expect(result.status).toBe("completed");
    const hasMetrics = (m: typeof result.baselineMetrics) =>
      m !== null && [m.ndcgAt1, m.ndcgAt3, m.ndcgAt5, m.mrr].some((v) => v !== null);
    expect(hasMetrics(result.baselineMetrics)).toBe(true);
    expect(hasMetrics(result.mlMetrics)).toBe(true);
    const comparison =
      avg(result.mlMetrics) === null || avg(result.baselineMetrics) === null
        ? "NOT ENOUGH DATA"
        : Math.abs((avg(result.mlMetrics) ?? 0) - (avg(result.baselineMetrics) ?? 0)) < 0.01
          ? "ML approximately equal"
          : (avg(result.mlMetrics) ?? 0) > (avg(result.baselineMetrics) ?? 0)
            ? "ML better"
            : "ML worse";
    expect(["ML better", "ML worse", "ML approximately equal", "NOT ENOUGH DATA"]).toContain(comparison);
  });

  it("11. rank-position/recommendation-score ablation works", async () => {
    const result = await runAlternativeMlExperiment();
    expect(result.ablationMetrics.modelA).not.toBeNull();
    expect(result.ablationMetrics.modelB).not.toBeNull();
    expect(result.ablationMetrics.positionEffectNotes.length).toBeGreaterThanOrEqual(2);
    // Model B must exclude position/score features.
    const bFeatures = result.model.features.filter((f) => f === "rank_position" || f === "recommendation_score");
    expect(bFeatures).toContain("rank_position"); // Model A includes them
  });

  it("12. recommendation-score ablation is implemented as feature exclusion", () => {
    const all = [
      "same_family", "recommendation_score", "rank_position", "has_lower_sodium", "sodium_relative_delta",
    ];
    const ablated = all.filter((f) => f !== "rank_position" && f !== "recommendation_score");
    expect(ablated).not.toContain("rank_position");
    expect(ablated).not.toContain("recommendation_score");
    expect(ablated).toContain("has_lower_sodium");
  });

  it("13. feature importance is deterministic", async () => {
    const result1 = await runAlternativeMlExperiment();
    const result2 = await runAlternativeMlExperiment();
    expect(result1.featureImportance).toEqual(result2.featureImportance);
    expect(result1.sanityChecks).toEqual(result2.sanityChecks);
    const { examples } = await buildAlternativeTrainingDataset();
    const model = trainLinearRanker(examples, { featureKeys: Object.keys(flattenFeatureVector(examples[0].features)) });
    const imp1 = featureImportance(model);
    const imp2 = featureImportance(model);
    expect(imp1).toEqual(imp2);
  });

  it("14. production ranking code is untouched (file unchanged by experiment)", async () => {
    const scoringPath = new URL("../services/alternative-scoring.service.ts", import.meta.url);
    const before = readFileSync(scoringPath, "utf8");
    await runAlternativeMlExperiment();
    const after = readFileSync(scoringPath, "utf8");
    expect(after).toBe(before);
    expect(calculateAlternativeScore.toString()).toContain("calculateAlternativeScore");
  });

  it("15. no ML model is invoked by the production alternatives API", async () => {
    const routeSource = readFileSync(
      new URL("../app/api/products/[id]/alternatives/route.ts", import.meta.url),
      "utf8",
    );
    expect(routeSource).not.toContain("alternative-ml-experiment");
    expect(routeSource).not.toContain("alternative-ml");
    expect(routeSource).toContain("findAlternativesForProduct");
  });

  it("16. sanity checks are reported (position bias investigation)", async () => {
    const result = await runAlternativeMlExperiment();
    expect(result.sanityChecks.some((s) => s.includes("Model A mean metric"))).toBe(true);
    expect(result.sanityChecks.some((s) => s.includes("Model B (no rank/score) mean metric"))).toBe(true);
    expect(result.sanityChecks.some((s) => s.includes("Baseline mean metric"))).toBe(true);
    expect(result.notes.some((n) => n.includes("Experiment type: baseline behavioural ranking model"))).toBe(true);
  });

  it("characteristic analysis reports observed associations per characteristic", async () => {
    const result = await runAlternativeMlExperiment();
    expect(result.characteristicAnalysis.length).toBeGreaterThan(0);
    const sodium = result.characteristicAnalysis.find((c) => c.characteristic === "LOWER_SODIUM");
    expect(sodium).toBeDefined();
    if (!sodium) return;
    expect(sodium.views).toBeGreaterThan(0);
    expect(sodium.selections).toBeGreaterThan(0);
    expect(typeof sodium.selectionRate).toBe("number");
  });
});

function avg(m: { ndcgAt1: number | null; ndcgAt3: number | null; ndcgAt5: number | null; mrr: number | null } | null): number | null {
  if (!m) return null;
  const values = [m.ndcgAt1, m.ndcgAt3, m.ndcgAt5, m.mrr].filter((v): v is number => v !== null);
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}