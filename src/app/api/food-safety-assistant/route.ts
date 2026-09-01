// POST /api/food-safety-assistant
//
// Stateless conversational endpoint. The server never persists
// anything about a complaint — the conversation state lives on the
// client and is sent on every call. We accept a small product-context
// snapshot so the client can re-open the assistant after a fresh
// scan or label OCR.
//
// Behaviour:
//  • Validates the body with the assistantRequestSchema.
//  • Applies the standard per-IP rate limit (`assistant:<ip>`).
//  • Runs the orchestrator, returns the next state + assistant message.
//  • Logs only at info/error levels; never logs PII or full messages.
//
// We do NOT:
//  • Declare legal violations.
//  • Impersonate FSSAI.
//  • Submit complaints automatically.
//  • Personalise based on who logged in (safety helper is open).

import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonSuccess, jsonError } from "@/lib/http";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { assistantRequestSchema } from "@/schemas";
import { runAssistant } from "@/services/food-safety-assistant/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = Number(process.env.MAX_REQUEST_BODY_MB || 8) * 1024 * 1024;

function limitMessage(input: string, max = 4000): string {
  if (!input) return "";
  return input.length <= max ? input : `${input.slice(0, max)}…`;
}

// We accept a fully-validated request body and run the assistant.
async function handle(request: NextRequest): Promise<Response> {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`assistant:${clientIp(request)}`);
    const rawText = await request.text();
    if (rawText.length > MAX_REQUEST_BYTES) {
      return jsonError(
        {
          code: "VALIDATION_ERROR",
          message: "Assistant request body too large",
        },
        requestId,
      );
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      return jsonError(
        {
          code: "VALIDATION_ERROR",
          message: "Assistant request body must be valid JSON",
        },
        requestId,
      );
    }
    const parsed = assistantRequestSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return jsonError(parsed.error, requestId);
    }
    const body = parsed.data;

    // Defensive cap on free-text length even if the schema is bypassed.
    const message = limitMessage(body.message ?? "");
    const safeInput = {
      ...body,
      message: message.length > 0 ? message : null,
    };

    // Build the regulatory context strictly from what the client shared.
    // We do not call any external API from this endpoint.
    const regulatory = buildRegulatoryContext(body.productContext, body.state?.productSnapshot ?? null);

    const result = runAssistant({
      ...safeInput,
      regulatory,
    });

    // Trim assistant message history before returning to keep the
    // round-trip body compact; the client keeps the rest in memory.
    const trimmed: typeof result = {
      ...result,
      state: {
        ...result.state,
        assistantMessages: result.state.assistantMessages.slice(-20),
      },
    };

    logger.info("assistant_completed", {
      requestId,
      action: body.action,
      language: safeInput.language ?? "en",
      stage: result.state.stage,
      issueType: result.state.issueType,
    });

    return jsonSuccess(trimmed, {
      aiAvailable: trimmed.meta.aiAvailable,
      reportingUrlAvailable: trimmed.meta.reportingUrlAvailable,
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}

// Some clients may POST with text/plain; we still try to talk JSON.
export async function PUT(request: NextRequest): Promise<Response> {
  return handle(request);
}

function buildRegulatoryContext(
  fallback: z.infer<typeof assistantRequestSchema>["productContext"] | null | undefined,
  stateSnapshot: z.infer<typeof assistantRequestSchema>["productContext"] | null | undefined,
) {
  const p = fallback ?? stateSnapshot ?? null;
  if (!p) return null;
  return {
    country: "India",
    fssai: p.regulatorySummary
      ? {
          status: "reviewed",
          summary: p.regulatorySummary,
          findings: [],
          sources: [{ title: "FoodGuard Analysis", organization: "FoodGuard" }],
        }
      : null,
    ingredients: p.ingredients?.slice(0, 12).map((name) => ({
      name,
      assessment: (p.allergens ?? []).includes(name) ? "allergen" : "fact",
    })),
    nutritionConcerns: p.nutritionConcerns ?? [],
    allergensDecl: p.allergens ?? [],
  };
}
