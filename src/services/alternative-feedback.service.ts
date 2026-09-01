/**
 * Alternative Ingredients — Phase 6: Feedback recording + aggregation.
 *
 * Behavioural data layer. Reuses the EXISTING HistoryEntry model (via
 * DataStore.addHistoryEntry with source "alternative_feedback") — no new
 * database, no schema changes.
 *
 * Trust rules:
 * - Product identity: loaded from the store by id — never trusted from client.
 * - Characteristics / issue keys: recomputed server-side with the Phase 1–4
 *   pipeline — never trusted from client.
 * - rankPosition / recommendationScore: taken from the recomputed alternatives
 *   context for the current product. Client values are never accepted.
 * - The alternative must actually belong to the alternatives context of the
 *   current product; otherwise the event is rejected.
 *
 * Feedback does NOT modify ranking in Phase 6.
 */
import { AppError, ErrorCodes } from "@/lib/errors";
import { getStore } from "@/lib/store";
import type { UserPreferencesRecord } from "@/lib/store/types";
import { getCache } from "@/lib/cache";
import { findAlternativesForProduct } from "@/services/alternative-engine.service";
import { getCharacteristicByKey } from "@/lib/alternative-characteristics";
import type { AlternativeCharacteristicInfo } from "@/lib/alternative-characteristics";
import {
  ALTERNATIVE_FEEDBACK_EVENTS,
  ALTERNATIVE_FEEDBACK_SOURCE,
  isAlternativeFeedbackEvent,
} from "@/lib/alternative-feedback";
import type { AlternativeFeedbackEvent, AlternativeFeedbackEventRecord } from "@/lib/alternative-feedback";
import { logger } from "@/lib/logger";

const CONTEXT_CACHE_TTL_SECONDS = 600;

export type AlternativeFeedbackContext = {
  productId: string;
  characteristics: AlternativeCharacteristicInfo[];
  sourceIssueKeys: string[];
  criteria: {
    preferredCharacteristics: string[];
    unsupported: string[];
  };
  /** Ranked alternatives (1-based) with their trusted engine scores. */
  alternatives: Array<{ productId: string; rankPosition: number; recommendationScore: number }>;
};

/** Build userPreferences from the existing explicit preference record. */
function preferencesFromRecord(record: UserPreferencesRecord | null) {
  if (!record) return null;
  return {
    vegetarian: record.vegetarian,
    vegan: record.vegan,
    allergies: record.allergies,
    dietaryRestrictions: record.dietaryRestrictions,
    avoidIngredients: record.avoidIngredients,
    healthGoals: record.healthGoals,
  };
}

/**
 * Resolve the trusted alternatives context for (userId, productId) by running
 * the existing Phase 1–4 pipeline. Results are cached briefly so a page of
 * simultaneous VIEWED events performs one recompute, not five.
 */
export async function resolveAlternativeFeedbackContext(input: {
  userId: string;
  productId: string;
}): Promise<AlternativeFeedbackContext> {
  const cache = getCache();
  const cacheKey = `alt-fb-ctx:${input.userId}:${input.productId}`;
  const cached = await cache.get<AlternativeFeedbackContext>(cacheKey);
  if (cached) return cached;

  const store = getStore();
  const product = await store.getProductById(input.productId);
  if (!product) {
    throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product could not be found", 404);
  }
  const nutrition = await store.getNutritionForProduct(input.productId);
  const prefsRecord = await store.getUserPreferences(input.userId);
  const pipeline = await findAlternativesForProduct({
    product,
    nutrition,
    userPreferences: preferencesFromRecord(prefsRecord),
    limit: 8,
  });

  const context: AlternativeFeedbackContext = {
    productId: input.productId,
    characteristics: pipeline.characteristics,
    sourceIssueKeys: pipeline.characteristics.map((c) => c.issueKey),
    criteria: {
      preferredCharacteristics: pipeline.criteria.preferredCharacteristics,
      unsupported: pipeline.criteria.unsupported,
    },
    alternatives: pipeline.alternatives.map((alt, index) => ({
      productId: alt.product.id,
      rankPosition: index + 1,
      recommendationScore: alt.recommendationScore,
    })),
  };

  await cache.set(cacheKey, context, CONTEXT_CACHE_TTL_SECONDS);
  return context;
}

/**
 * Record one alternative interaction. Validates everything server-side and
 * stores it in the existing history model (source "alternative_feedback").
 *
 * Duplicate policy (Phase 6): no global deduplication. VIEWED/CLICKED repeat
 * legitimately; SELECTED/REJECTED may recur across sessions and the app has no
 * recommendation-session identifier to distinguish accidental repeats, so every
 * event is recorded (see the documented limitation in alternative-feedback.ts).
 */
export async function recordAlternativeFeedback(input: {
  userId: string;
  productId: string;
  alternativeProductId: string;
  eventType: string;
  /** Client-supplied characteristic keys — validated against server-derived ones. */
  characteristicKeys?: string[];
  metadata?: AlternativeFeedbackEventRecord["metadata"];
}): Promise<{ recorded: boolean; record: AlternativeFeedbackEventRecord | null }> {
  if (!isAlternativeFeedbackEvent(input.eventType)) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Invalid eventType. Must be one of: ${ALTERNATIVE_FEEDBACK_EVENTS.join(", ")}`,
      400,
    );
  }
  if (!input.productId || !input.alternativeProductId) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "productId and alternativeProductId are required", 400);
  }
  if (input.productId === input.alternativeProductId) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "alternativeProductId must differ from productId", 400);
  }

  const store = getStore();
  const currentProduct = await store.getProductById(input.productId);
  if (!currentProduct) {
    throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product could not be found", 404);
  }
  const alternative = await store.getProductById(input.alternativeProductId);
  if (!alternative) {
    throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Alternative product could not be found", 404);
  }
  // Only real database records may be alternatives (same rule as the engine).
  if (alternative.isDemo || alternative.source === "web_search") {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Alternative product is not a valid alternative", 400);
  }

  // Trusted context: characteristics, issue keys, rank and score are all
  // derived here, never taken from the client.
  const context = await resolveAlternativeFeedbackContext({
    userId: input.userId,
    productId: input.productId,
  });

  // The alternative must actually belong to the alternatives context.
  const ranked = context.alternatives.find((a) => a.productId === input.alternativeProductId);
  if (!ranked) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      "Alternative product is not in the alternatives context for this product",
      422,
    );
  }

  // Client-supplied characteristic keys must be real and derivable from the
  // current product. Unsupported/invented characteristics are rejected.
  const derivedKeys = new Set(context.characteristics.map((c) => c.key));
  const requestedKeys = input.characteristicKeys ?? [];
  for (const key of requestedKeys) {
    if (!getCharacteristicByKey(key)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Unknown characteristic key: ${key}`, 400);
    }
    if (!derivedKeys.has(key)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Characteristic ${key} is not part of this alternatives context`, 400);
    }
  }

  const eventType = input.eventType as AlternativeFeedbackEvent;

  const record: AlternativeFeedbackEventRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    productId: input.productId,
    alternativeProductId: input.alternativeProductId,
    eventType,
    timestamp: new Date().toISOString(),
    characteristicKeys: context.characteristics.map((c) => c.key),
    sourceIssueKeys: context.sourceIssueKeys,
    rankPosition: ranked.rankPosition,
    recommendationScore: ranked.recommendationScore,
    criteriaSnapshot: context.criteria,
    metadata: input.metadata,
  };

  try {
    await store.addHistoryEntry(input.userId, {
      productId: input.productId,
      assessmentSnapshot: record,
      source: ALTERNATIVE_FEEDBACK_SOURCE,
    });
  } catch (error) {
    logger.warn("alternative_feedback_store_failed", { error: String(error) });
    throw new AppError(ErrorCodes.DATABASE_ERROR, "Failed to store alternative feedback", 500);
  }

  logger.info("alternative_feedback_recorded", {
    userId: input.userId,
    productId: input.productId,
    alternativeProductId: input.alternativeProductId,
    eventType,
    rankPosition: record.rankPosition,
  });

  return { recorded: true, record };
}

/** List the raw feedback records for a user (informational only). */
export async function listAlternativeFeedback(userId: string): Promise<AlternativeFeedbackEventRecord[]> {
  const history = await getStore().listHistory(userId);
  const records: AlternativeFeedbackEventRecord[] = [];
  for (const entry of history) {
    if (entry.source !== ALTERNATIVE_FEEDBACK_SOURCE) continue;
    const snapshot = entry.assessmentSnapshot as unknown as AlternativeFeedbackEventRecord | null;
    if (!snapshot || !snapshot.eventType || !snapshot.alternativeProductId) continue;
    records.push(snapshot);
  }
  return records;
}

/**
 * Aggregate historical behaviour per characteristic key.
 *
 *   {
 *     LOWER_SODIUM: { views: 12, clicks: 5, selections: 3, rejections: 1 },
 *     ...
 *   }
 *
 * Informational only — MUST NOT modify ranking in Phase 6.
 */
export async function getAlternativeFeedbackSummary(
  userId: string,
): Promise<Record<string, { views: number; clicks: number; selections: number; rejections: number }>> {
  const records = await listAlternativeFeedback(userId);
  const summary: Record<string, { views: number; clicks: number; selections: number; rejections: number }> = {};

  const ensure = (key: string) => {
    if (!summary[key]) summary[key] = { views: 0, clicks: 0, selections: 0, rejections: 0 };
    return summary[key];
  };

  for (const record of records) {
    for (const key of record.characteristicKeys) {
      const counts = ensure(key);
      if (record.eventType === "VIEWED") counts.views += 1;
      else if (record.eventType === "CLICKED") counts.clicks += 1;
      else if (record.eventType === "SELECTED") counts.selections += 1;
      else if (record.eventType === "REJECTED") counts.rejections += 1;
    }
  }

  return summary;
}