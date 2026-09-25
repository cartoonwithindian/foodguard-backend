import { NextRequest } from "next/server";
import { analyzeSchema } from "@/schemas";
import { jsonSuccess, jsonError } from "@/lib/http";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { runAnalysis } from "@/services/analysis.service";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { gamificationService } from "@/gamification/services/gamification.service";

export const runtime = "nodejs";

/**
 * POST /api/analyze
 * The main end-to-end endpoint. Accepts a barcode and/or ingredients text
 * and/or nutrition and/or OCR text, then runs the full pipeline.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const start = Date.now();
  try {
    await enforceRateLimit(`analyze:${clientIp(request)}`);
    const body = await request.json();
    const parsed = analyzeSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error, requestId);
    }

    const session = await getSession(request);
    const input = parsed.data;

    const { frontend, meta } = await runAnalysis({
      barcode: input.barcode,
      productName: input.productName,
      brand: input.brand,
      ingredientsText: input.ingredientsText,
      nutrition: input.nutrition,
      ocrText: input.ocrText,
      ocrConfidence: input.ocrConfidence,
      imageAvailable: false,
      // Never trust a body-supplied userId for identity or rewards.
      userId: session?.id ?? null,
      language: input.language,
    });

    // This is the canonical successful-product event. It runs only after a
    // completed, identified analysis; manual/unidentified analyses and cached
    // client state never reach this block. The store transaction owns XP,
    // duplicate detection, activity persistence, and streak calculation.
    let gamification: {
      xp_awarded: number;
      total_xp: number;
      current_streak: number;
      longest_streak: number;
      activity_date: string;
      idempotent: boolean;
      completed_challenges: Array<{
        challenge_id: string;
        name: string;
        description: string;
        xp_reward: number;
      }>;
    } | null = null;
    if (
      session &&
      input.scan_event_id &&
      meta.product?.id &&
      meta.product.id !== "manual" &&
      !meta.product.isDemo
    ) {
      try {
        const reward = await gamificationService.recordProductScan({
          userId: session.id,
          productId: meta.product.id,
          eventId: input.scan_event_id,
        });
        gamification = {
          xp_awarded: reward.activity.xpAwarded,
          total_xp: reward.profile.totalXp,
          current_streak: reward.profile.currentStreak,
          longest_streak: reward.profile.longestStreak,
          activity_date: reward.activity.activityDate,
          idempotent: reward.idempotent,
          completed_challenges: reward.completedChallenges ?? [],
        };
      } catch (error) {
        // Analysis remains available if the optional gamification migration has
        // not been deployed yet; the failed transaction cannot partially award.
        logger.error("gamification_record_failed", {
          requestId,
          userId: session.id,
          error: String(error),
        });
      }
    }

    logger.info("analyze_completed", { requestId, durationMs: Date.now() - start, product: frontend.name });

    return jsonSuccess(frontend, {
      confidence: meta.confidence,
      warnings: meta.warnings,
      needsReview: meta.needsReview,
      assessmentFactors: meta.assessmentFactors,
      ingredients: meta.ingredients,
      unknownIngredients: meta.unknownIngredients,
      allergens: meta.allergens,
      nutrition: meta.nutrition,
      personalization: meta.personalization,
      evidence: meta.evidence,
      alternatives: meta.alternatives,
      product: meta.product,
      productSource: meta.productSource,
      webResearch: meta.webResearch,
      aiAnalysis: meta.aiAnalysis,
      gamification,
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
