/**
 * Alternative Ingredients — Phase 7: Dataset builder service.
 *
 * Converts Phase 6 feedback history into a clean, reproducible ML-ready
 * dataset. The output of Phase 7 is DATA, NOT a model.
 *
 * Guarantees:
 * - Deterministic: same store input → same dataset (examples sorted by
 *   timestamp, then record id; stable key order in features).
 * - No data leakage: features contain only recommendation-time information;
 *   the temporal split keeps future behaviour in the test partition.
 * - Duplicates are preserved per Phase 6 semantics (no global deduplication).
 * - Missing nutrition is represented explicitly (null), never as zero.
 * - Explicit UserPreference is kept separate from behavioural labels.
 *
 * Phase 7 prepares data only. It does NOT modify production ranking.
 * ML training was NOT implemented. Phase 8 is responsible for the actual
 * ML ranking experiment.
 */
import { getStore } from "@/lib/store";
import { ALTERNATIVE_FEEDBACK_SOURCE } from "@/lib/alternative-feedback";
import type { AlternativeFeedbackEvent, AlternativeFeedbackEventRecord } from "@/lib/alternative-feedback";
import { CHARACTERISTIC_KEYS } from "@/lib/alternative-characteristics";
import { classifyProductFamily, familyCompatibility } from "@/lib/product-family";
import type { NutritionFacts } from "@/types/domain";
import {
  extractAlternativeFeatures,
  toAlternativeLabel,
} from "@/lib/alternative-dataset";
import type { AlternativeTrainingExample } from "@/lib/alternative-dataset";

/**
 * Documented engineering threshold: minimum number of valid examples before a
 * train/validation/test split is produced. Configurable via
 * FOODGAURD_ML_MIN_EXAMPLES. This is an engineering guard, not a scientific
 * minimum.
 */
export function getMinDatasetExamples(): number {
  const fromEnv = Number.parseInt(process.env.FOODGAURD_ML_MIN_EXAMPLES ?? "", 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 30;
}

export type DatasetSplit = {
  train: AlternativeTrainingExample[];
  validation: AlternativeTrainingExample[];
  test: AlternativeTrainingExample[];
  strategy: "temporal_70_15_15";
  splitPoint: {
    validationFrom: string;
    testFrom: string;
  };
  /** Unique-user overlap counts across partitions (informational). */
  userOverlap: {
    trainValidation: number;
    trainTest: number;
    validationTest: number;
    allThree: number;
  };
};

export type AlternativeDatasetStats = {
  totalExamples: number;
  uniqueUsers: number;
  uniqueProducts: number;
  uniqueAlternatives: number;
  eventCounts: Record<AlternativeFeedbackEvent, number>;
  characteristicCounts: Record<string, number>;
  missingNutritionCount: number;
  missingPreferenceCount: number;
  invalidRecordCount: number;
  trainCount: number;
  validationCount: number;
  testCount: number;
  temporalRange: { earliest: string | null; latest: string | null };
};

export type DatasetReadiness =
  | { readyForMlExperiment: true; reason?: undefined }
  | { readyForMlExperiment: false; reason: string };

export type AlternativeDatasetBuildResult = {
  examples: AlternativeTrainingExample[];
  stats: AlternativeDatasetStats;
  split: DatasetSplit | null;
  readiness: DatasetReadiness;
};

export type BuildAlternativeDatasetOptions = {
  /** Override the minimum example threshold (default: getMinDatasetExamples()). */
  minExamples?: number;
};

/**
 * Build the ML-ready dataset from all stored alternative feedback.
 * Deterministic; reads products/nutrition/preferences via the store.
 */
export async function buildAlternativeTrainingDataset(
  options: BuildAlternativeDatasetOptions = {},
): Promise<AlternativeDatasetBuildResult> {
  const store = getStore();
  const allUsers = await store.listUsers();
  const records: AlternativeFeedbackEventRecord[] = [];
  let invalidRecordCount = 0;

  for (const user of allUsers) {
    const history = await store.listHistory(user.id);
    for (const entry of history) {
      if (entry.source !== ALTERNATIVE_FEEDBACK_SOURCE) continue;
      const snapshot = entry.assessmentSnapshot as unknown;
      if (!isValidFeedbackRecord(snapshot)) {
        invalidRecordCount += 1;
        continue;
      }
      records.push(snapshot as AlternativeFeedbackEventRecord);
    }
  }

  const examples = await examplesFromRecords(records);
  invalidRecordCount += records.length - examples.length;

  const missingNutritionCount = examples.filter((e) =>
    Object.values(e.features.nutrition).every((v) => v === null),
  ).length;
  const missingPreferenceCount = examples.filter((e) => e.explicitPreferences.pref_missing === 1).length;

  const split = splitAlternativeDataset(examples, options);
  const stats = computeDatasetStats(examples, missingNutritionCount, missingPreferenceCount, invalidRecordCount, split);
  const readiness = deriveReadiness(stats, split, options.minExamples ?? getMinDatasetExamples());

  return { examples, stats, split, readiness };
}

/** Load examples for a set of records (deterministic, cached lookups). */
async function examplesFromRecords(records: AlternativeFeedbackEventRecord[]): Promise<AlternativeTrainingExample[]> {
  const store = getStore();
  const productCache = new Map<string, { product: import("@/types/domain").ProductInfo; nutrition: NutritionFacts | null }>();
  const preferenceCache = new Map<string, import("@/lib/store/types").UserPreferencesRecord | null>();

  async function loadProduct(id: string) {
    const cached = productCache.get(id);
    if (cached) return cached;
    const product = await store.getProductById(id);
    const nutrition = product ? await store.getNutritionForProduct(id) : null;
    const value = product ? { product, nutrition } : null;
    if (value) productCache.set(id, value);
    return value;
  }

  async function loadPreferences(userId: string) {
    if (!preferenceCache.has(userId)) {
      preferenceCache.set(userId, await store.getUserPreferences(userId));
    }
    return preferenceCache.get(userId) ?? null;
  }

  const examples: AlternativeTrainingExample[] = [];

  for (const record of [...records].sort((a, b) => {
    const byTime = a.timestamp.localeCompare(b.timestamp);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  })) {
    const source = await loadProduct(record.productId);
    const candidate = await loadProduct(record.alternativeProductId);
    if (!source || !candidate) continue; // missing product context → skipped (invalid)

    const sourceFamily = classifyProductFamily(source.product);
    const candidateFamily = classifyProductFamily(candidate.product);
    const sameFamily = sourceFamily.family !== null && sourceFamily.family === candidateFamily.family;
    const sameSuperfamily =
      sourceFamily.superfamily !== null && sourceFamily.superfamily === candidateFamily.superfamily;
    const categoryCompatible = familyCompatibility(sourceFamily, candidateFamily).kind !== "incompatible";

    const { features, explicitPreferences } = extractAlternativeFeatures({
      sourceProduct: source.product,
      candidateProduct: candidate.product,
      sourceNutrition: source.nutrition,
      candidateNutrition: candidate.nutrition,
      record,
      sameFamily,
      sameSuperfamily,
      categoryCompatible,
      preferences: await loadPreferences(record.userId),
    });

    examples.push({
      userId: record.userId,
      productId: record.productId,
      alternativeProductId: record.alternativeProductId,
      eventType: record.eventType,
      label: toAlternativeLabel(record.eventType),
      rankPosition: record.rankPosition,
      recommendationScore: record.recommendationScore,
      characteristicKeys: [...record.characteristicKeys],
      sourceIssueKeys: [...record.sourceIssueKeys],
      criteriaSnapshot: record.criteriaSnapshot,
      explicitPreferences,
      features,
      timestamp: record.timestamp,
      sourceRecordId: record.id,
    });
  }

  return examples;
}

function isValidFeedbackRecord(value: unknown): value is AlternativeFeedbackEventRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<AlternativeFeedbackEventRecord>;
  if (typeof r.id !== "string" || typeof r.userId !== "string") return false;
  if (typeof r.productId !== "string" || typeof r.alternativeProductId !== "string") return false;
  if (typeof r.timestamp !== "string" || Number.isNaN(Date.parse(r.timestamp))) return false;
  if (r.eventType !== "VIEWED" && r.eventType !== "CLICKED" && r.eventType !== "SELECTED" && r.eventType !== "REJECTED") {
    return false; // unknown event type → skipped
  }
  if (typeof r.rankPosition !== "number" || typeof r.recommendationScore !== "number") return false;
  if (!Array.isArray(r.characteristicKeys)) return false;
  const vocabulary = new Set<string>(Object.values(CHARACTERISTIC_KEYS));
  for (const key of r.characteristicKeys) {
    if (typeof key !== "string" || !vocabulary.has(key)) return false; // invalid characteristic → skipped
  }
  return true;
}

/**
 * Deterministic TEMPORAL split: oldest 70% → train, next 15% → validation,
 * newest 15% → test. Examples are already sorted by (timestamp, record id).
 *
 * Future behaviour can never leak into earlier features: each example's
 * features are built from its own record, and later events land in later
 * partitions. Same user across partitions is possible with temporal splits —
 * reported via `userOverlap`, never silently claimed leakage-free.
 */
export function splitAlternativeDataset(
  examples: AlternativeTrainingExample[],
  options: BuildAlternativeDatasetOptions = {},
): DatasetSplit | null {
  const minExamples = options.minExamples ?? getMinDatasetExamples();
  if (examples.length < minExamples) return null;

  const sorted = [...examples].sort((a, b) => {
    const byTime = a.timestamp.localeCompare(b.timestamp);
    return byTime !== 0 ? byTime : a.sourceRecordId.localeCompare(b.sourceRecordId);
  });

  const validationFrom = Math.floor(sorted.length * 0.7);
  const testFrom = Math.floor(sorted.length * 0.85);
  if (validationFrom <= 0 || testFrom <= validationFrom || testFrom >= sorted.length) return null;

  const train = sorted.slice(0, validationFrom);
  const validation = sorted.slice(validationFrom, testFrom);
  const test = sorted.slice(testFrom);

  const usersOf = (partition: AlternativeTrainingExample[]) => new Set(partition.map((e) => e.userId));
  const trainUsers = usersOf(train);
  const validationUsers = usersOf(validation);
  const testUsers = usersOf(test);
  const overlapCount = (a: Set<string>, b: Set<string>) => [...a].filter((u) => b.has(u)).length;

  return {
    train,
    validation,
    test,
    strategy: "temporal_70_15_15",
    splitPoint: {
      validationFrom: validation[0]?.timestamp ?? "",
      testFrom: test[0]?.timestamp ?? "",
    },
    userOverlap: {
      trainValidation: overlapCount(trainUsers, validationUsers),
      trainTest: overlapCount(trainUsers, testUsers),
      validationTest: overlapCount(validationUsers, testUsers),
      allThree: [...trainUsers].filter((u) => validationUsers.has(u) && testUsers.has(u)).length,
    },
  };
}

export function computeDatasetStats(
  examples: AlternativeTrainingExample[],
  missingNutritionCount: number,
  missingPreferenceCount: number,
  invalidRecordCount: number,
  split?: DatasetSplit | null,
): AlternativeDatasetStats {
  const eventCounts: Record<AlternativeFeedbackEvent, number> = { VIEWED: 0, CLICKED: 0, SELECTED: 0, REJECTED: 0 };
  const characteristicCounts: Record<string, number> = {};
  const users = new Set<string>();
  const products = new Set<string>();
  const alternatives = new Set<string>();
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const example of examples) {
    eventCounts[example.eventType] += 1;
    users.add(example.userId);
    products.add(example.productId);
    alternatives.add(example.alternativeProductId);
    for (const key of example.characteristicKeys) {
      characteristicCounts[key] = (characteristicCounts[key] ?? 0) + 1;
    }
    if (earliest === null || example.timestamp < earliest) earliest = example.timestamp;
    if (latest === null || example.timestamp > latest) latest = example.timestamp;
  }

  const effectiveSplit = split ?? splitAlternativeDataset(examples);

  return {
    totalExamples: examples.length,
    uniqueUsers: users.size,
    uniqueProducts: products.size,
    uniqueAlternatives: alternatives.size,
    eventCounts,
    characteristicCounts,
    missingNutritionCount,
    missingPreferenceCount,
    invalidRecordCount,
    trainCount: effectiveSplit?.train.length ?? 0,
    validationCount: effectiveSplit?.validation.length ?? 0,
    testCount: effectiveSplit?.test.length ?? 0,
    temporalRange: { earliest, latest },
  };
}

function deriveReadiness(
  stats: AlternativeDatasetStats,
  split: DatasetSplit | null,
  minExamples: number,
): DatasetReadiness {
  if (stats.totalExamples === 0) {
    return { readyForMlExperiment: false, reason: "No alternative feedback history found" };
  }
  if (stats.totalExamples < minExamples) {
    return {
      readyForMlExperiment: false,
      reason: `Insufficient interaction history (${stats.totalExamples} examples; minimum ${minExamples})`,
    };
  }
  if (!split) {
    return { readyForMlExperiment: false, reason: "Interaction history too small for a deterministic split" };
  }
  if (stats.trainCount === 0 || stats.validationCount === 0 || stats.testCount === 0) {
    return { readyForMlExperiment: false, reason: "Not enough examples in every split partition" };
  }
  return { readyForMlExperiment: true };
}

/**
 * Deterministic JSONL export — one training example per line.
 * Never exports raw OCR/ingredient text, images or personal data beyond the
 * user id already known to the application.
 */
export function exportAlternativeDatasetJsonl(examples: AlternativeTrainingExample[]): string {
  const rows = [...examples]
    .sort((a, b) => {
      const byTime = a.timestamp.localeCompare(b.timestamp);
      return byTime !== 0 ? byTime : a.sourceRecordId.localeCompare(b.sourceRecordId);
    })
    .map((e) => {
      // Flatten nutrition features into the top-level features object so each
      // exported row is a flat feature vector (see Phase 7 spec example).
      const { nutrition, ...rest } = e.features;
      const row: Record<string, unknown> = {
        userId: e.userId,
        productId: e.productId,
        alternativeProductId: e.alternativeProductId,
        eventType: e.eventType,
        label: e.label,
        rankPosition: e.rankPosition,
        recommendationScore: e.recommendationScore,
        timestamp: e.timestamp,
        explicitPreferences: e.explicitPreferences,
        features: { ...rest, ...nutrition },
      };
      return JSON.stringify(row);
    });
  return rows.length > 0 ? `${rows.join("\n")}\n` : "";
}

export async function getAlternativeDatasetStatsAsync(): Promise<{
  stats: AlternativeDatasetStats;
  readiness: DatasetReadiness;
}> {
  const { stats, readiness } = await buildAlternativeTrainingDataset();
  return { stats, readiness };
}
