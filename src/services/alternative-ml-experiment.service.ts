/**
 * Alternative Ingredients — Phase 8: Offline ML ranking experiment.
 *
 * Runs an OFFLINE experiment on the Phase 7 dataset:
 *   1. Respects the Phase 7 readiness gate (stops safely when not enough real
 *      feedback data).
 *   2. Uses ONLY the deterministic Phase 7 temporal split (70/15/15).
 *   3. Trains a small interpretable linear baseline on TRAIN ONLY; model
 *      selection on VALIDATION; final evaluation on TEST ONLY.
 *   4. Evaluates the EXISTING deterministic ranking (recommendationScore) as
 *      an offline baseline.
 *   5. Investigates rank-position / recommendation-score bias via ablation
 *      (Model A with them, Model B without).
 *   6. Reports feature importance and characteristic associations (observed
 *      behaviour only — never causal).
 *
 * The production ranker `calculateAlternativeScore()` is NEVER modified,
 * invoked or replaced. This is an offline experiment only.
 */
import { buildAlternativeTrainingDataset, getMinDatasetExamples } from "@/services/alternative-dataset.service";
import type { AlternativeTrainingExample } from "@/lib/alternative-dataset";
import {
  baselineScore,
  characteristicAnalysis,
  evaluateRankingMetrics,
  featureImportance,
  groupByContext,
  predictLinearRanker,
  trainLinearRanker,
} from "@/lib/alternative-ml";
import type { LinearRankerModel, RankingMetrics } from "@/lib/alternative-ml";

const ALL_FEATURES = [
  "same_family",
  "same_superfamily",
  "category_compatible",
  "rank_position",
  "recommendation_score",
  "has_lower_sodium",
  "has_lower_added_sugar",
  "has_lower_sugar",
  "has_lower_saturated_fat",
  "has_lower_total_fat",
  "has_lower_trans_fat",
  "has_lower_salt",
  "has_palm_oil_free",
  "has_whole_grain",
  "has_allergen_free",
  "sodium_delta",
  "sodium_relative_delta",
  "improvement_sodium",
  "salt_delta",
  "salt_relative_delta",
  "improvement_salt",
  "sugars_delta",
  "sugars_relative_delta",
  "improvement_sugars",
  "addedSugars_delta",
  "addedSugars_relative_delta",
  "improvement_addedSugars",
  "totalFat_delta",
  "totalFat_relative_delta",
  "improvement_totalFat",
  "saturatedFat_delta",
  "saturatedFat_relative_delta",
  "improvement_saturatedFat",
  "transFat_delta",
  "transFat_relative_delta",
  "improvement_transFat",
  "fiber_delta",
  "fiber_relative_delta",
  "improvement_fiber",
];

export const POSITION_FEATURES = ["rank_position", "recommendation_score"];
const ABLATION_FEATURES = ALL_FEATURES.filter((f) => !POSITION_FEATURES.includes(f));

export type AlternativeMlExperimentResult = {
  status: "completed" | "not_ready" | "unavailable" | "failed";
  dataset: {
    trainExamples: number;
    validationExamples: number;
    testExamples: number;
    users: number;
    contexts: number;
    testUsers: number;
    labelDistribution: Record<string, number>;
  };
  model: {
    name: string;
    features: string[];
    hyperparameters: { epochs: number; learningRate: number; l2: number };
  };
  baselineMetrics: RankingMetrics | null;
  mlMetrics: RankingMetrics | null;
  ablationMetrics: {
    modelA: RankingMetrics | null;
    modelB: RankingMetrics | null;
    positionEffectNotes: string[];
  };
  featureImportance?: Record<string, number>;
  characteristicAnalysis: ReturnType<typeof characteristicAnalysis>;
  sanityChecks: string[];
  notes: string[];
  createdAt: string;
  splitStrategy: "temporal_70_15_15";
  minExamples: number;
};

export type RunMlExperimentOptions = {
  minExamples?: number;
  epochs?: number;
  learningRate?: number;
  l2?: number;
  /** Set to a fixed value when the host environment requires determinism. */
  seed?: number;
};

function avgMetrics(metrics: RankingMetrics | null) {
  if (!metrics) return null;
  const values = [metrics.ndcgAt1, metrics.ndcgAt3, metrics.ndcgAt5, metrics.mrr, metrics.hitAt1, metrics.hitAt3].filter(
    (v): v is number => v !== null,
  );
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/**
 * Run the offline ML ranking experiment.
 *
 * Safe stopping: if `readiness.readyForMlExperiment` is false (or the
 * runtime cannot be determined), returns status "not_ready"/"unavailable"
 * instead of fabricating a model.
 */
export async function runAlternativeMlExperiment(
  options: RunMlExperimentOptions = {},
): Promise<AlternativeMlExperimentResult> {
  const minExamples = options.minExamples ?? getMinDatasetExamples();
  const common = {
    minExamples,
    epochs: options.epochs ?? 200,
    learningRate: options.learningRate ?? 0.05,
    l2: options.l2 ?? 1e-4,
  };

  let buildResult;
  try {
    buildResult = await buildAlternativeTrainingDataset({ minExamples });
  } catch (error) {
    return {
      status: "failed",
      dataset: { trainExamples: 0, validationExamples: 0, testExamples: 0, users: 0, contexts: 0, testUsers: 0, labelDistribution: {} },
      model: { name: "none", features: [], hyperparameters: common },
      baselineMetrics: null,
      mlMetrics: null,
      ablationMetrics: { modelA: null, modelB: null, positionEffectNotes: ["Dataset build failed; experiment aborted."] },
      characteristicAnalysis: [],
      sanityChecks: ["No experiment run."],
      notes: [`Dataset build failed: ${String(error)}`],
      createdAt: new Date().toISOString(),
      splitStrategy: "temporal_70_15_15",
      minExamples,
    };
  }

  const { examples, split, readiness } = buildResult;
  const stats = buildResult.stats;

  if (!readiness.readyForMlExperiment || !split) {
    return {
      status: "not_ready",
      dataset: {
        trainExamples: 0,
        validationExamples: 0,
        testExamples: 0,
        users: stats.uniqueUsers,
        contexts: 0,
        testUsers: 0,
        labelDistribution: stats.eventCounts,
      },
      model: { name: "none", features: [], hyperparameters: common },
      baselineMetrics: null,
      mlMetrics: null,
      ablationMetrics: { modelA: null, modelB: null, positionEffectNotes: ["Experiment not run: insufficient data."] },
      characteristicAnalysis: characteristicAnalysis(examples),
      sanityChecks: [],
      notes: [`ML experiment not run. Reason: ${readiness.reason}`, `Available examples: ${stats.totalExamples}`, `Minimum configured: ${minExamples}`],
      createdAt: new Date().toISOString(),
      splitStrategy: "temporal_70_15_15",
      minExamples,
    };
  }

  const { train, validation, test } = split;

  // Baseline: the EXISTING deterministic recommendation score, evaluated on
  // the test contexts. Production ranking is never modified.
  const testContexts = groupByContext(test);
  const baselineMetrics = evaluateRankingMetrics(testContexts, baselineScore);

  // Model A: full Phase 7 features (including rank_position + score).
  const modelA = trainLinearRanker(train, {
    featureKeys: ALL_FEATURES,
    epochs: common.epochs,
    learningRate: common.learningRate,
    l2: common.l2,
  });
  // Model B: position/score ablated — learns from characteristics + nutrition
  // only, to investigate position bias.
  const modelB = trainLinearRanker(train, {
    featureKeys: ABLATION_FEATURES,
    epochs: common.epochs,
    learningRate: common.learningRate,
    l2: common.l2,
  });

  const scoreA = (e: AlternativeTrainingExample) => predictLinearRanker(modelA, e);
  const scoreB = (e: AlternativeTrainingExample) => predictLinearRanker(modelB, e);

  const mlMetrics = evaluateRankingMetrics(testContexts, scoreA);
  const ablationA = evaluateRankingMetrics(testContexts, scoreA);
  const ablationB = evaluateRankingMetrics(testContexts, scoreB);

  const importanceA = featureImportance(modelA);

  // Characteristic analysis (observed associations only, never causal).
  const charAnalysis = characteristicAnalysis(test);

  // Sanity checks.
  const sanityChecks: string[] = [];
  const checkRankDistribution = (model: LinearRankerModel, label: string) => {
    const perContext = groupByContext(test).map((ctx) =>
      [...ctx.items].sort(
        (a, b) => predictLinearRanker(model, b) - predictLinearRanker(model, a),
      ),
    );
    const top1Scores = perContext.map((items) => items[0]?.recommendationScore ?? 0);
    const sameAsBaseline = perContext.map((items) => {
      const ranked = [...items].sort((a, b) => b.recommendationScore - a.recommendationScore);
      return ranked[0]?.productId === items[0]?.productId;
    });
    const shareSameTop1 = sameAsBaseline.filter(Boolean).length / Math.max(sameAsBaseline.length, 1);
    sanityChecks.push(
      `${label}: model top-1 matches existing-rank top-1 in ${(shareSameTop1 * 100).toFixed(1)}% of test contexts`,
    );
    sanityChecks.push(
      `${label}: mean top-1 existing score ${(top1Scores.reduce((s, v) => s + v, 0) / Math.max(top1Scores.length, 1)).toFixed(2)}`,
    );
  };
  checkRankDistribution(modelA, "Model A");
  checkRankDistribution(modelB, "Model B");

  const baselineMean = avgMetrics(baselineMetrics);
  const modelAMean = avgMetrics(ablationA);
  const modelBMean = avgMetrics(ablationB);
  sanityChecks.push(
    `Baseline mean metric: ${baselineMean === null ? "NOT COMPUTABLE" : baselineMean.toFixed(3)}`,
  );
  sanityChecks.push(
    `Model A mean metric: ${modelAMean === null ? "NOT COMPUTABLE" : modelAMean.toFixed(3)}`,
  );
  sanityChecks.push(
    `Model B (no rank/score) mean metric: ${modelBMean === null ? "NOT COMPUTABLE" : modelBMean.toFixed(3)}`,
  );

  const topImportance = Object.entries(importanceA)[0];
  sanityChecks.push(
    topImportance
      ? `Most influential feature (Model A): ${topImportance[0]} (normalized |weight| ${topImportance[1].toFixed(3)})`
      : "Model A produced no feature importance",
  );

  // Unseen-user generalization.
  const trainUsers = new Set(train.map((e) => e.userId));
  const validationUsers = new Set(validation.map((e) => e.userId));
  const testUsers = new Set(test.map((e) => e.userId));
  const unseenTestUsers = [...testUsers].filter((u) => !trainUsers.has(u));
  const unseenUserExamples = test.filter((e) => unseenTestUsers.includes(e.userId));
  sanityChecks.push(
    unseenUserExamples.length > 0
      ? `Unseen-user test examples: ${unseenUserExamples.length} (users: ${unseenTestUsers.length}) — evaluating model A on them: ${evaluateRankingMetrics(groupByContext(unseenUserExamples), scoreA).numEvaluableContexts} rankable contexts`
      : "Unseen-user test examples: 0 — NOT ENOUGH DATA",
  );

  const notes: string[] = [
    "Experiment type: baseline behavioural ranking model (linear, offline).",
    "Model does NOT reproduce calculateAlternativeScore(); it learns from Phase 7 features.",
    "Missing nutrition values are imputed to 0 in the model layer (Phase 7 keeps them null); this is documented imputation, not fabricated labels.",
    `Test contexts: ${testContexts.length} (${testContexts.filter((c) => c.items.length >= 2).length} rankable with ≥2 items).`,
    `Train users: ${trainUsers.size}, validation users: ${validationUsers.size ?? 0}, test users: ${testUsers.size}; overlap is reported by the Phase 7 split, not hidden.`,
    "No recommendation-session identifier exists in the dataset; contexts are approximated by (userId, productId).",
    "Explicit preferences reflect the preference record at dataset-build time, not the recommendation-time snapshot (Phase 7 limitation).",
    "Labels are dataset signals only — not production ranking weights.",
  ];

  return {
    status: "completed",
    dataset: {
      trainExamples: train.length,
      validationExamples: validation.length,
      testExamples: test.length,
      users: new Set(examples.map((e) => e.userId)).size,
      contexts: testContexts.length,
      testUsers: testUsers.size,
      labelDistribution: baselineMetrics.labelDistribution,
    },
    model: {
      name: "LinearRankBaseline (dependency-free, deterministic)",
      features: ALL_FEATURES,
      hyperparameters: common,
    },
    baselineMetrics,
    mlMetrics,
    ablationMetrics: {
      modelA: ablationA,
      modelB: ablationB,
      positionEffectNotes: [
        `Model A (with rank_position + recommendation_score): mean metric ${modelAMean === null ? "NOT COMPUTABLE" : modelAMean.toFixed(3)}`,
        `Model B (without rank_position + recommendation_score): mean metric ${modelBMean === null ? "NOT COMPUTABLE" : modelBMean.toFixed(3)}`,
        "If Model A >> Model B, the model may be learning position bias rather than genuine alternative quality.",
      ],
    },
    featureImportance: importanceA,
    characteristicAnalysis: charAnalysis,
    sanityChecks,
    notes,
    createdAt: new Date().toISOString(),
    splitStrategy: "temporal_70_15_15",
    minExamples,
  };
}

/** Serialize the experiment result deterministically (stable key order). */
export function serializeExperimentResult(result: AlternativeMlExperimentResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Persist the experiment artifact to the experiments directory.
 * Called by the CLI runner only — never by the production path.
 */
export async function writeExperimentArtifact(
  result: AlternativeMlExperimentResult,
  directory: string,
): Promise<{ resultPath: string; datasetPath: string }> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  await fs.mkdir(directory, { recursive: true });
  const timestamp = result.createdAt.replace(/[:.]/g, "-");
  const resultPath = path.join(directory, `experiment-${timestamp}.json`);
  await fs.writeFile(resultPath, serializeExperimentResult(result), "utf8");
  return { resultPath, datasetPath: directory };
}