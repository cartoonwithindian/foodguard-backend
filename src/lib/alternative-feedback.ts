/**
 * Alternative Ingredients — Phase 6: Alternative feedback event model.
 *
 * The purpose of this module is DATA COLLECTION ONLY. It captures user
 * behaviour around alternatives (views, clicks, selections, rejections) so
 * future ML ranking can be trained on real interaction history.
 *
 * IMPORTANT:
 * - Feedback NEVER modifies ranking in Phase 6.
 * - No ML, no embeddings, no vector search, no LLM calls.
 * - No personal information is collected beyond the user id already known to
 *   the application. No OCR text, no raw ingredient text, no location, no
 *   demographics, no browsing history.
 */

export const ALTERNATIVE_FEEDBACK_EVENTS = ["VIEWED", "CLICKED", "SELECTED", "REJECTED"] as const;

export type AlternativeFeedbackEvent = (typeof ALTERNATIVE_FEEDBACK_EVENTS)[number];

/** HistoryEntry.source used to mark alternative feedback rows. */
export const ALTERNATIVE_FEEDBACK_SOURCE = "alternative_feedback";

export function isAlternativeFeedbackEvent(value: unknown): value is AlternativeFeedbackEvent {
  return (
    typeof value === "string" &&
    (ALTERNATIVE_FEEDBACK_EVENTS as readonly string[]).includes(value)
  );
}

/**
 * Duplicate / idempotency policy (Phase 6).
 *
 * The application currently has NO recommendation-session identifier. Per the
 * Phase 6 design, duplicates are therefore NEVER globally deduplicated:
 *
 * - VIEWED: repeats are expected (a card may become visible many times).
 * - CLICKED: repeats are legitimate (each open is a distinct interaction).
 * - SELECTED: a user may select an alternative for the same product in
 *   different sessions; without a session id we cannot distinguish accidental
 *   repeats, so every event is recorded.
 * - REJECTED: rejections may be valid across different sessions; every event
 *   is recorded.
 *
 * LIMITATION (documented, not worked around): once a recommendation-session /
 * context identifier exists in the UI, accidental-duplicate protection for
 * SELECTED/REJECTED can be added on that key. Inventing a session id here
 * would be speculative.
 */

/**
 * One stored alternative interaction.
 *
 * All context is derived SERVER-SIDE (see alternative-feedback.service.ts):
 * characteristics, issue keys, rank and score come from the trusted
 * alternatives context, never from the client.
 */
export type AlternativeFeedbackEventRecord = {
  id: string;
  userId: string;
  /** The current (scanned/source) product. */
  productId: string;
  /** The alternative product the user interacted with. */
  alternativeProductId: string;
  eventType: AlternativeFeedbackEvent;
  /** ISO timestamp of the interaction. */
  timestamp: string;
  /** Characteristic keys of the alternatives context (server-derived). */
  characteristicKeys: string[];
  /** Issue keys that produced the characteristics (server-derived). */
  sourceIssueKeys: string[];
  /** 1-based rank of the alternative in the context (server-derived). */
  rankPosition: number;
  /** Existing engine recommendation score (server-derived, never client). */
  recommendationScore: number;
  /** Snapshot of the criteria used for the context. */
  criteriaSnapshot: {
    preferredCharacteristics: string[];
    unsupported: string[];
  };
  /** Optional non-sensitive metadata (e.g. UI source of the interaction). */
  metadata?: Record<string, string | number | boolean | null>;
};