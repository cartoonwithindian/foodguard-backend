/**
 * Jev decision layer (server-only).
 *
 * Jev is a BOUNDED DECISION layer, not a source of product facts. The
 * deterministic rule engine, product database, OCR and nutrition extraction
 * remain the source of truth; Jev only classifies the already-computed
 * signals into three structured answers (see QUESTIONS below).
 *
 * Contract (https://thejevai.com/docs):
 *   POST {baseUrl}/systemone
 *   Authorization: Bearer <JEV_API_KEY>
 *   { state, model, questions: { <id>: { type, instructions, criteria } } }
 *
 * Failure policy (Phase 8): timeout / 5xx / malformed / invalid answers /
 * disabled / no key → the analysis NEVER crashes. `resolveJevDecision()`
 * falls back to the deterministic rule-engine result and marks
 * `decision_source = "rule_engine"` instead of pretending Jev responded.
 *
 * The API key stays server-side; it is never logged, never sent to the
 * browser, and never included in this module's structured logs.
 */
import { z } from "zod";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

export const JEV_QUESTION_VERSION = "foodguard.concern.v1";

const CONCERN_OPTIONS = ["low", "moderate", "high"] as const;
export const EXPLANATION_PRIORITIES = [
  "nutrition",
  "ingredients",
  "additives",
  "allergens",
  "goal_alignment",
  "general_awareness",
] as const;

export type JevConcernLevel = (typeof CONCERN_OPTIONS)[number];
export type JevExplanationPriority = (typeof EXPLANATION_PRIORITIES)[number];

/** Normalized Jev answers (Phase 7: signals — the backend owns actions). */
export type JevDecision = {
  concern_level: JevConcernLevel;
  /** Confidence for the concern answer, 0..1. */
  confidence: number;
  /** Noul probability that the supplied evidence suffices, 0..1. */
  evidence_sufficient: number;
  explanation_priority: JevExplanationPriority;
};

export type JevEvaluation = {
  decision: JevDecision;
  model: string;
  latencyMs: number;
};

/** True when the service is configured and enabled (Phase 34 flag). */
export function isJevAvailable(): boolean {
  return config.jev.enabled && !!config.jev.apiKey;
}

/** Minimal, non-sensitive state passed to Jev (Phase 5). */
export type JevStateInput = {
  analysisId: string;
  productName: string;
  category: string;
  ingredients: Array<{ name: string; assessment: string }>;
  allergens: string[];
  ruleEngine: {
    score: number;
    rating: string;
    assessment: string;
    confidence: number;
    needs_review: boolean;
    negative_factors: string[];
    missing_data: string[];
    unresolved_ingredients: number;
    has_nutrition: boolean;
    has_ingredients: boolean;
  };
  user: {
    goals: string[];
    avoid: string[];
  } | null;
};

/** The three decision questions (Phase 6). */
export function buildJevQuestions() {
  return {
    concern_level: {
      type: "choice" as const,
      instructions: [
        {
          question:
            "Classify the overall concern level of this food product for a general consumer, using ONLY the supplied evidence and rule-engine signals.",
          low: "No meaningful negative signals: no flagged ingredients of concern, no declared-allergen conflicts, favourable nutrition, and the supplied data is complete enough to support the classification.",
          moderate: "Some noteworthy signals exist (for example a few noteworthy ingredients, an unfavourable nutrient level, or minor data gaps), but nothing rises to a serious, well-evidenced risk.",
          high: "Multiple or serious negative signals exist: potentially concerning or allergenic ingredients, several unfavourable nutrition levels, or a poor rule-engine rating backed by the supplied evidence.",
          rule:
            "Base the choice strictly on `rule_engine` signals and the ingredient list in `product`. Never invent missing product facts; when evidence is thin, prefer `moderate` over `high` unless the signals themselves are serious.",
        },
      ],
      criteria: {
        low: "No meaningful negative signals in the supplied evidence.",
        moderate: "Some noteworthy negative signals, nothing serious or well-evidenced as a risk.",
        high: "Multiple or serious negative signals in the supplied evidence.",
      },
    },
    evidence_sufficient: {
      type: "noul" as const,
      instructions: [
        {
          question:
            "Is the supplied evidence sufficient to make the requested product assessment without inventing missing product facts?",
          true: "The product identity, ingredient analysis and/or nutrition signals cover the important aspects of the assessment.",
          false: "Key evidence is missing (no ingredient data, no nutrition data, many unresolved ingredients or missing fields), so a confident assessment would require guessing.",
        },
      ],
    },
    explanation_priority: {
      type: "choice" as const,
      instructions: [
        {
          question:
            "Which part of the analysis should the user-facing explanation emphasize, given the strongest signals in the supplied evidence?",
        },
      ],
      criteria: {
        nutrition: "Nutrition levels carry the strongest or most actionable signals.",
        ingredients: "Ingredient assessments carry the strongest signals.",
        additives: "Additives or processing signals dominate.",
        allergens: "Allergen declarations or conflicts dominate.",
        goal_alignment: "The user's stated goals or avoid-list drive the emphasis.",
        general_awareness: "Signals are weak or mixed; emphasize general awareness.",
      },
    },
  };
}

/** Response schemas — typed per https://thejevai.com/docs (Answer types). */
const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number()).optional(),
});

const noulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: z.number().min(0).max(1),
});

const jevResponseSchema = z.object({
  model: z.string(),
  answers: z.object({
    concern_level: choiceAnswerSchema,
    evidence_sufficient: noulAnswerSchema,
    explanation_priority: choiceAnswerSchema,
  }),
});

/** Validate that returned choices are among the options we offered. */
function normalizeDecision(raw: z.infer<typeof jevResponseSchema>): JevDecision | null {
  const concern = raw.answers.concern_level.choice as JevConcernLevel;
  const priority = raw.answers.explanation_priority.choice as JevExplanationPriority;
  if (!CONCERN_OPTIONS.includes(concern)) return null;
  if (!EXPLANATION_PRIORITIES.includes(priority)) return null;
  if (!Number.isFinite(raw.answers.evidence_sufficient.noul)) return null;
  if (!Number.isFinite(raw.answers.concern_level.confidence)) return null;
  return {
    concern_level: concern,
    confidence: raw.answers.concern_level.confidence,
    evidence_sufficient: raw.answers.evidence_sufficient.noul,
    explanation_priority: priority,
  };
}

function buildState(input: JevStateInput): Record<string, unknown> {
  // Structured state; Jev reads it by field name. Contains product facts and
  // rule-engine signals only — no user identifiers, tokens or secrets.
  const state: Record<string, unknown> = {
    product: {
      name: input.productName,
      category: input.category,
      ingredients: input.ingredients.slice(0, 25).map((i) => `${i.name} (${i.assessment})`),
      allergens: input.allergens.slice(0, 10),
    },
    rule_engine: {
      score_0_to_5: input.ruleEngine.score,
      rating: input.ruleEngine.rating,
      assessment: input.ruleEngine.assessment,
      confidence: input.ruleEngine.confidence,
      needs_review: input.ruleEngine.needs_review,
      negative_factors: input.ruleEngine.negative_factors.slice(0, 8),
      missing_data: input.ruleEngine.missing_data.slice(0, 8),
      unresolved_ingredients: input.ruleEngine.unresolved_ingredients,
      has_nutrition: input.ruleEngine.has_nutrition,
      has_ingredients: input.ruleEngine.has_ingredients,
    },
  };
  if (input.user && (input.user.goals.length > 0 || input.user.avoid.length > 0)) {
    state.user = { goals: input.user.goals.slice(0, 5), avoid: input.user.avoid.slice(0, 10) };
  }
  return state;
}

/**
 * Call Jev with the three questions. Resolves `{ available: false }` for ANY
 * failure (disabled, no key, timeout, 5xx, malformed, invalid answers) —
 * callers must fall back to the rule engine instead of throwing.
 */
export async function evaluateFoodProductDecision(
  input: JevStateInput,
): Promise<{ available: false } | { available: true; evaluation: JevEvaluation }> {
  if (!isJevAvailable()) {
    return { available: false };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.jev.timeoutMs);
  try {
    const response = await fetch(`${config.jev.baseUrl}/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.jev.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: buildState(input),
        model: config.jev.model,
        questions: buildJevQuestions(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("jev_decision_failed", {
        analysisId: input.analysisId,
        status: response.status,
        latencyMs: Date.now() - started,
      });
      return { available: false };
    }

    const json: unknown = await response.json().catch(() => null);
    const parsed = jevResponseSchema.safeParse(json);
    if (!parsed.success) {
      logger.warn("jev_decision_failed", {
        analysisId: input.analysisId,
        reason: "malformed_response",
        latencyMs: Date.now() - started,
      });
      return { available: false };
    }

    const decision = normalizeDecision(parsed.data);
    if (!decision) {
      logger.warn("jev_decision_failed", {
        analysisId: input.analysisId,
        reason: "invalid_answer_values",
        latencyMs: Date.now() - started,
      });
      return { available: false };
    }

    const latencyMs = Date.now() - started;
    logger.info("jev_decision", {
      analysisId: input.analysisId,
      model: parsed.data.model,
      question_version: JEV_QUESTION_VERSION,
      latencyMs,
      concern_level: decision.concern_level,
      evidence_sufficient: decision.evidence_sufficient,
    });
    return {
      available: true,
      evaluation: { decision, model: parsed.data.model, latencyMs },
    };
  } catch (error) {
    logger.warn("jev_decision_failed", {
      analysisId: input.analysisId,
      reason: "network_error",
      error: error instanceof Error ? error.name : String(error),
      latencyMs: Date.now() - started,
    });
    return { available: false };
  } finally {
    clearTimeout(timer);
  }
}

// ── Application decision logic (Phase 7: the BACKEND owns actions) ──

/** Public decision block consumed by the frontend (Phase 33 display). */
export type JevDecisionInfo = {
  concern_level: JevConcernLevel | "insufficient";
  confidence: number;
  /** Noul evidence probability; null when Jev did not answer. */
  evidence_sufficient: number | null;
  explanation_priority: JevExplanationPriority | null;
  status: "ready" | "review" | "insufficient_evidence";
  decision_source: "jev" | "rule_engine";
  model?: string;
  /** Stable identifier of the question set used (Phase 24 metadata). */
  question_version?: string;
};

export const JEV_EVIDENCE_THRESHOLD = 0.6;
export const JEV_CONFIDENCE_THRESHOLD = 0.5;

export type RuleEngineFallback = {
  assessment: "low" | "moderate" | "high" | "insufficient";
  confidence: number;
};

/**
 * Apply thresholds to Jev's answers (Phase 7). Jev returns signals; this
 * function — application code — decides the final status. Falls back to the
 * deterministic rule-engine result when Jev is unavailable (Phase 8).
 */
export function resolveJevDecision(
  evaluation: { available: false } | { available: true; evaluation: JevEvaluation },
  rule: RuleEngineFallback,
): JevDecisionInfo {
  if (!evaluation.available) {
    return {
      concern_level: rule.assessment,
      confidence: rule.confidence,
      evidence_sufficient: null,
      explanation_priority: null,
      status: rule.assessment === "insufficient" ? "insufficient_evidence" : "ready",
      decision_source: "rule_engine",
      question_version: JEV_QUESTION_VERSION,
    };
  }

  const { decision, model } = evaluation.evaluation;

  if (decision.evidence_sufficient < JEV_EVIDENCE_THRESHOLD) {
    return {
      concern_level: rule.assessment,
      confidence: rule.confidence,
      evidence_sufficient: decision.evidence_sufficient,
      explanation_priority: decision.explanation_priority,
      status: "insufficient_evidence",
      decision_source: "jev",
      model,
      question_version: JEV_QUESTION_VERSION,
    };
  }

  if (decision.confidence < JEV_CONFIDENCE_THRESHOLD) {
    return {
      concern_level: decision.concern_level,
      confidence: decision.confidence,
      evidence_sufficient: decision.evidence_sufficient,
      explanation_priority: decision.explanation_priority,
      status: "review",
      decision_source: "jev",
      model,
      question_version: JEV_QUESTION_VERSION,
    };
  }

  return {
    concern_level: decision.concern_level,
    confidence: decision.confidence,
    evidence_sufficient: decision.evidence_sufficient,
    explanation_priority: decision.explanation_priority,
    status: "ready",
    decision_source: "jev",
    model,
    question_version: JEV_QUESTION_VERSION,
  };
}
