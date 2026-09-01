import { NextRequest } from "next/server";
import { analyzeSchema } from "@/schemas";
import { jsonSuccess, jsonError } from "@/lib/http";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { runAnalysis } from "@/services/analysis.service";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";

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
      userId: input.userId ?? session?.id ?? null,
      language: input.language,
    });

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
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
