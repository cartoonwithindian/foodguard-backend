import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { ALTERNATIVE_FEEDBACK_EVENTS } from "@/lib/alternative-feedback";
import { recordAlternativeFeedback } from "@/services/alternative-feedback.service";

export const runtime = "nodejs";

const feedbackSchema = z.object({
  alternativeProductId: z.string().trim().min(1).max(100),
  eventType: z.enum(ALTERNATIVE_FEEDBACK_EVENTS),
  rankPosition: z.number().int().min(1).optional(),
  characteristicKeys: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
}).strict();

/**
 * POST /api/products/:id/alternatives/feedback
 *
 * Records one behavioural alternative interaction (VIEWED / CLICKED /
 * SELECTED / REJECTED) for the current product.
 *
 * Trust rules:
 * - product id comes from the URL; user identity from the session — a
 *   client-supplied userId is impossible (schema is strict and has no field).
 * - alternative id, event type and characteristic keys are validated
 *   server-side.
 * - rank, score, characteristics, issue keys and criteria are DERIVED
 *   server-side from the trusted alternatives context. Client-supplied
 *   rankPosition / recommendationScore are never accepted.
 * - The alternative must belong to the alternatives context of the product.
 *
 * Response is minimal ({ recorded: true }) — internal recommendation data is
 * never exposed to the client.
 *
 * Feedback does NOT modify ranking in Phase 6.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error, requestId);
    }

    await recordAlternativeFeedback({
      userId: session.id,
      productId: id,
      alternativeProductId: parsed.data.alternativeProductId,
      eventType: parsed.data.eventType,
      characteristicKeys: parsed.data.characteristicKeys,
    });

    return jsonSuccess({ recorded: true }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}