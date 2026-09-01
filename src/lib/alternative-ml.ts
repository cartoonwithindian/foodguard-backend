/**
 * Alternative Ingredients — Phase 8: Offline ML ranking experiment helpers.
 *
 * This module implements a small, interpretable, DEPENDENCY-FREE linear
 * baseline model and deterministic ranking metrics. It exists ONLY to run an
 * OFFLINE experiment on the Phase 7 dataset.
 *
 * Guarantees:
 * - Deterministic: zero-init weights, fixed epochs/learning rate, no random
 *   numbers → the same data always yields the same model and metrics.
 * - No leakage: feature standardization statistics are computed from TRAIN
 *   ONLY; validation/test features are transformed with those statistics.
 * - The production ranker (`calculateAlternativeScore`) is never invoked,
 *   never modified and never replaced here.
 *
 * Phase 8 is an OFFLINE ML experiment only. Production ranking was NOT
 * changed. `calculateAlternativeScore()` remains the production ranking
 * system. ML was NOT deployed to production.
 */
import type { AlternativeTrainingExample } from "@/lib/alternative-dataset";
import type { AlternativeFeedbackEvent } from "@/lib/alternative-feedback";

/** Graded relevance mapping from Phase 7 behavioural labels. */
export function relevanceOf(label: number): number {
  if (label >= 2) return 2; // SELECTED
  if (label >= 1) return 1; // CLICKED
  if (label >= 0) return 0.5; // VIEWED
  return 0; // REJECTED
}

export type RecommendationContext = {
  contextId: string;
  items: AlternativeTrainingExample[];
};

/** Group examples by recommendation context (userId + productId). */
export function groupByContext(examples: AlternativeTrainingExample[]): RecommendationContext[] {
  const map = new Map<string, AlternativeTrainingExample[]>();
  for (const example of examples) {
    const key = `${example.userId}|${example.productId}`;
    const list = map.get(key) ?? [];
    list.push(example);
    map.set(key, list);
  }
  return [...map.entries()].map(([contextId, items]) => ({
    contextId,
    items: [...items].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.sourceRecordId.localeCompare(b.sourceRecordId)),
  }));
}

export type RankingMetrics = {
  ndcgAt1: number | null;
  ndcgAt3: number | null;
  ndcgAt5: number | null;
  mrr: number | null;
  hitAt1: number | null;
  hitAt3: number | null;
  numContexts: number;
  numEvaluableContexts: number;
  numExamples: number;
  labelDistribution: Record<AlternativeFeedbackEvent, number>;
};

function dcgAt(ordered: number[], k: number): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ordered.length); i += 1) {
    const rel = ordered[i];
    if (rel <= 0) continue;
    dcg += rel / Math.log2(i + 2);
  }
  return dcg;
}

function idealDcgAt(relevanceValues: number[], k: number): number {
  const sorted = [...relevanceValues].filter((r) => r > 0).sort((a, b) => b - a);
  return dcgAt(sorted, k);
}

export type RankedItem = { example: AlternativeTrainingExample; score: number; relevance: number };

/**
 * Evaluate ranking metrics for a set of contexts given a deterministic score
 * function. Contexts with fewer than 2 items cannot be ranked and are
 * reported in `numContexts` but excluded from the metrics.
 */
export function evaluateRankingMetrics(
  contexts: RecommendationContext[],
  scoreFn: (example: AlternativeTrainingExample) => number,
): RankingMetrics {
  const labelDistribution: Record<AlternativeFeedbackEvent, number> = { VIEWED: 0, CLICKED: 0, SELECTED: 0, REJECTED: 0 };
  let numExamples = 0;
  let numEvaluable = 0;
  const ndcg1: number[] = [];
  const ndcg3: number[] = [];
  const ndcg5: number[] = [];
  const mrr: number[] = [];
  const hit1: boolean[] = [];
  const hit3: boolean[] = [];

  for (const context of contexts) {
    for (const item of context.items) {
      labelDistribution[item.eventType] += 1;
      numExamples += 1;
    }
    if (context.items.length < 2) continue;
    numEvaluable += 1;

    const ranked: RankedItem[] = context.items
      .map((example) => ({ example, score: scoreFn(example), relevance: relevanceOf(example.label) }))
      .sort((a, b) => b.score - a.score || a.example.timestamp.localeCompare(b.example.timestamp));

    const orderedRelevance = ranked.map((r) => r.relevance);
    const allRelevance = context.items.map((i) => relevanceOf(i.label));

    ndcg1.push(dcgAt(orderedRelevance, 1) / Math.max(idealDcgAt(allRelevance, 1), 1e-9));
    ndcg3.push(dcgAt(orderedRelevance, 3) / Math.max(idealDcgAt(allRelevance, 3), 1e-9));
    ndcg5.push(dcgAt(orderedRelevance, 5) / Math.max(idealDcgAt(allRelevance, 5), 1e-9));

    const firstPositiveIndex = ranked.findIndex((r) => r.relevance >= 1);
    mrr.push(firstPositiveIndex >= 0 ? 1 / (firstPositiveIndex + 1) : 0);
    hit1.push(ranked[0]?.relevance >= 1);
    hit3.push(ranked.slice(0, 3).some((r) => r.relevance >= 1));
  }

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  return {
    ndcgAt1: avg(ndcg1),
    ndcgAt3: avg(ndcg3),
    ndcgAt5: avg(ndcg5),
    mrr: avg(mrr),
    hitAt1: hit1.length > 0 ? hit1.filter(Boolean).length / hit1.length : null,
    hitAt3: hit3.length > 0 ? hit3.filter(Boolean).length / hit3.length : null,
    numContexts: contexts.length,
    numEvaluableContexts: numEvaluable,
    numExamples,
    labelDistribution,
  };
}

export type FeatureColumn = { name: string; values: number[] };

/** Flatten a Phase 7 feature vector into named numeric columns. */
export function flattenFeatureVector(features: AlternativeTrainingExample["features"]): Record<string, number> {
  const out: Record<string, number> = {
    same_family: features.same_family,
    same_superfamily: features.same_superfamily,
    category_compatible: features.category_compatible,
    rank_position: features.rank_position,
    recommendation_score: features.recommendation_score,
    has_lower_sodium: features.has_lower_sodium,
    has_lower_added_sugar: features.has_lower_added_sugar,
    has_lower_sugar: features.has_lower_sugar,
    has_lower_saturated_fat: features.has_lower_saturated_fat,
    has_lower_total_fat: features.has_lower_total_fat,
    has_lower_trans_fat: features.has_lower_trans_fat,
    has_lower_salt: features.has_lower_salt,
    has_palm_oil_free: features.has_palm_oil_free,
    has_whole_grain: features.has_whole_grain,
    has_allergen_free: features.has_allergen_free,
  };
  for (const [key, value] of Object.entries(features.nutrition)) {
    out[key] = value === null ? 0 : value; // missing → imputed 0 (documented below)
  }
  return out;
}

export type StandardizationStats = { mean: number; std: number };

function stdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

/** Compute standardization stats from a set of examples. */
export function computeStandardization(examples: AlternativeTrainingExample[]): Record<string, StandardizationStats> {
  const columns: Record<string, number[]> = {};
  for (const example of examples) {
    const flat = flattenFeatureVector(example.features);
    for (const [key, value] of Object.entries(flat)) {
      (columns[key] ??= []).push(value);
    }
  }
  const stats: Record<string, StandardizationStats> = {};
  for (const [key, values] of Object.entries(columns)) {
    const mean = values.reduce((s, v) => s + v, 0) / Math.max(values.length, 1);
    stats[key] = { mean, std: stdDev(values, mean) || 1 };
  }
  return stats;
}

export type LinearRankerModel = {
  kind: "linear_rank_model";
  featureKeys: string[];
  weights: Record<string, number>;
  intercept: number;
  standardization: Record<string, StandardizationStats>;
  config: { epochs: number; learningRate: number; l2: number };
};

export type TrainLinearRankerOptions = {
  featureKeys: string[];
  epochs?: number;
  learningRate?: number;
  l2?: number;
};

/**
 * Deterministic linear baseline trained on the Phase 7 labels (ordinal
 * regression-style target: label value). Zero-initialized weights, fixed
 * learning rate and epochs, L2 penalty. No randomness. The result is an
 * interpretable baseline model — it does NOT reproduce the production
 * weights and is NOT deployed.
 */
export function trainLinearRanker(
  train: AlternativeTrainingExample[],
  options: TrainLinearRankerOptions,
): LinearRankerModel {
  const epochs = options.epochs ?? 200;
  const learningRate = options.learningRate ?? 0.05;
  const l2 = options.l2 ?? 1e-4;

  const standardization = computeStandardization(train);
  const featureKeys = options.featureKeys.filter((k) => standardization[k] !== undefined);

  const rows = train.map((example) => {
    const flat = flattenFeatureVector(example.features);
    return { x: featureKeys.map((k) => (flat[k] - standardization[k].mean) / standardization[k].std), y: example.label };
  });

  const weights = new Array(featureKeys.length).fill(0) as number[];
  let intercept = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = new Array(featureKeys.length).fill(0) as number[];
    let gradB = 0;
    for (const row of rows) {
      const pred = row.x.reduce((s, v, i) => s + v * weights[i], 0) + intercept;
      const error = pred - row.y;
      for (let i = 0; i < row.x.length; i += 1) gradW[i] += error * row.x[i];
      gradB += error;
    }
    const n = Math.max(rows.length, 1);
    for (let i = 0; i < weights.length; i += 1) {
      weights[i] -= (learningRate / n) * (gradW[i] + l2 * weights[i]);
    }
    intercept -= (learningRate / n) * gradB;
  }

  const weightMap: Record<string, number> = {};
  featureKeys.forEach((key, i) => {
    weightMap[key] = weights[i];
  });

  return {
    kind: "linear_rank_model",
    featureKeys,
    weights: weightMap,
    intercept,
    standardization,
    config: { epochs, learningRate, l2 },
  };
}

export function predictLinearRanker(model: LinearRankerModel, example: AlternativeTrainingExample): number {
  const flat = flattenFeatureVector(example.features);
  let score = model.intercept;
  for (const key of model.featureKeys) {
    const s = model.standardization[key];
    score += model.weights[key] * ((flat[key] - s.mean) / s.std);
  }
  return score;
}

/** Deterministic feature importance from normalized coefficient magnitude. */
export function featureImportance(model: LinearRankerModel): Record<string, number> {
  const maxAbs = Math.max(...model.featureKeys.map((k) => Math.abs(model.weights[k])), 1e-9);
  const out: Record<string, number> = {};
  for (const key of model.featureKeys) {
    out[key] = Math.abs(model.weights[key]) / maxAbs;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

/** Baseline scorer: the EXISTING production recommendation score, verbatim. */
export function baselineScore(example: AlternativeTrainingExample): number {
  return example.recommendationScore;
}

export type CharacteristicBehavior = {
  characteristic: string;
  views: number;
  clicks: number;
  selections: number;
  rejections: number;
  total: number;
  /** Observed selection rate = selections / total interactions. Association only. */
  selectionRate: number | null;
};

/** Observed behavioural associations per characteristic (correlational only). */
export function characteristicAnalysis(examples: AlternativeTrainingExample[]): CharacteristicBehavior[] {
  const map = new Map<string, CharacteristicBehavior>();
  for (const example of examples) {
    for (const key of example.characteristicKeys) {
      const entry = map.get(key) ?? { characteristic: key, views: 0, clicks: 0, selections: 0, rejections: 0, total: 0, selectionRate: null };
      entry.total += 1;
      if (example.eventType === "VIEWED") entry.views += 1;
      else if (example.eventType === "CLICKED") entry.clicks += 1;
      else if (example.eventType === "SELECTED") entry.selections += 1;
      else if (example.eventType === "REJECTED") entry.rejections += 1;
      map.set(key, entry);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.total - a.total)
    .map((entry) => ({ ...entry, selectionRate: entry.total > 0 ? entry.selections / entry.total : null }));
}

export function uniquenessRatio(values: unknown[]): number {
  return new Set(values).size / Math.max(values.length, 1);
}