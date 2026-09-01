import { z } from "zod";
import type { ChatAssistantResponse } from "@/types/chat";
import { logger } from "@/lib/logger";

export const ChatActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("view_product"),
    label: z.string().min(1).max(60),
    payload: z.object({ product_id: z.string().min(1).max(64) }),
  }),
  z.object({
    type: z.literal("view_analysis"),
    label: z.string().min(1).max(60),
    payload: z.object({ product_id: z.string().min(1).max(64) }),
  }),
  z.object({
    type: z.literal("generate_report"),
    label: z.string().min(1).max(60),
    payload: z.object({ product_id: z.string().max(64).optional() }),
  }),
  z.object({
    type: z.literal("view_regulation"),
    label: z.string().min(1).max(60),
    payload: z.object({ url: z.string().url() }),
  }),
  z.object({
    type: z.literal("scan_another"),
    label: z.string().min(1).max(60),
    payload: z.record(z.string(), z.unknown()),
  }),
]);

export const ChatAssistantResponseSchema = z.object({
  answer: z.string().min(1).max(4000),
  sources: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        source: z.string().min(1).max(100),
        url: z.string().url().optional().nullable(),
      }),
    )
    .max(6)
    .default([]),
  actions: z.array(ChatActionSchema).max(4).default([]),
  metadata: z
    .object({
      intent: z.string().max(60).default("UNKNOWN"),
      model_version: z.string().max(60).default("unknown"),
    })
    .default({}),
});

export type GuardedResponse = { ok: true; response: ChatAssistantResponse; issues: string[] };

export type GuardFailure = { ok: false; response: ChatAssistantResponse; issues: string[] };

export type GuardOutcome = GuardedResponse | GuardFailure;

export const UNAVAILABLE_ANSWER =
  "Sorry, FoodGuard AI is temporarily unavailable. Please try again.";

export const PRELIMINARY_CAVEAT =
  "This is a preliminary FoodGuard assessment. Final determination should be made by the competent authority.";

/**
 * Phrases that must never appear in an assistant answer. If present, the
 * offending sentence is replaced with the standard preliminary-assessment
 * caveat so the answer stays truthful.
 */
const FORBIDDEN_PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  {
    re: /complaint has been submitted to fssai|submitted to fssai|fssai will act|confirmed violation/i,
    replacement: "FoodGuard prepares reports for your review; it does not submit complaints automatically.",
  },
  {
    re: /legally unsafe|violated the law|illegal product|definitely causes (cancer|disease|illness)/i,
    replacement: PRELIMINARY_CAVEAT,
  },
];

export function guardResponse(
  raw: string,
  ctx: { intent?: string; modelVersion?: string } = {},
): GuardOutcome {
  const issues: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Model returned plain text instead of JSON — wrap it in a valid response
    parsed = {
      answer: raw.slice(0, 4000),
      sources: [],
      actions: [],
      metadata: { intent: ctx.intent ?? "UNKNOWN", model_version: ctx.modelVersion ?? "unknown" },
    };
  }

  const result = ChatAssistantResponseSchema.safeParse(parsed);
  if (!result.success) {
    // Some errors are due to model-generated actions with invalid payloads.
    // Strip invalid actions and retry validation.
    if (parsed && typeof parsed === 'object' && 'actions' in parsed && Array.isArray((parsed as Record<string, unknown>).actions)) {
      const cleaned = { ...(parsed as Record<string, unknown>), actions: [] };
      const retry = ChatAssistantResponseSchema.safeParse(cleaned);
      if (retry.success) {
        logger.info("guard_cleaned_actions", { 
          originalActions: ((parsed as Record<string, unknown>).actions as unknown[]).length,
        });
        return { ok: true, issues: ["actions_cleaned"], response: retry.data as ChatAssistantResponse };
      }
    }
    logger.warn("guard_schema_mismatch", { 
      issues: result.error.issues.map(i => i.path.join('.')),
    });
    return {
      ok: false,
      issues: ["schema_mismatch", ...result.error.issues.map((i) => `path:${i.path.join(".")}`)],
      response: {
        answer: UNAVAILABLE_ANSWER,
        sources: [],
        actions: [],
        metadata: { intent: ctx.intent ?? "UNKNOWN", model_version: ctx.modelVersion ?? "unknown" },
      },
    };
  }

  const response = result.data as ChatAssistantResponse;
  let answer = response.answer;
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.re.test(answer)) {
      answer = answer.replace(pattern.re, pattern.replacement);
      issues.push("forbidden_phrase_replaced");
    }
  }
  if (issues.includes("forbidden_phrase_replaced") && !answer.includes(PRELIMINARY_CAVEAT)) {
    answer = `${answer}\n\n${PRELIMINARY_CAVEAT}`;
  }

  return {
    ok: true,
    issues,
    response: {
      ...response,
      answer,
      metadata: {
        ...response.metadata,
        intent: ctx.intent ?? response.metadata.intent,
        model_version: ctx.modelVersion ?? response.metadata.model_version,
      },
    },
  };
}