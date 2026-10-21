/**
 * POST /api/regulatory/analyze
 * 
 * Performs comprehensive FSSAI regulatory analysis for a product.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonSuccess, jsonError, parseJsonBody } from "@/lib/http";
import { nutritionInputSchema } from "@/schemas";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { FSSAIAnalyzer } from "@/services/regulatory/fssai";

const analyzeSchema = z.object({
  product: z.object({
    name: z.string().trim().max(200).optional(),
    category: z.string().trim().max(80).optional(),
    barcode: z.string().trim().max(32).optional(),
  }).optional(),
  // Bounded so an unauthenticated caller cannot push unbounded work/JSON into
  // the analyzer (or use `nutrition: z.any()` as an arbitrary-payload sink).
  ingredients: z.array(z.string().trim().min(1).max(300)).max(200).optional(),
  nutrition: nutritionInputSchema,
  claims: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  labelData: z.object({
    hasIngredientsList: z.boolean().optional(),
    hasNutritionInfo: z.boolean().optional(),
    hasAllergenDeclaration: z.boolean().optional(),
    hasNetQuantity: z.boolean().optional(),
    hasManufacturerInfo: z.boolean().optional(),
    hasFssaiLicense: z.boolean().optional(),
    hasVegetarianDeclaration: z.boolean().optional(),
    hasDateMarking: z.boolean().optional(),
    hasBatchLotId: z.boolean().optional(),
    hasStorageInstructions: z.boolean().optional(),
    hasCountryOfOrigin: z.boolean().optional(),
    hasMrp: z.boolean().optional(),
  }).optional(),
  category: z.string().trim().max(80).optional(),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const start = Date.now();

  try {
    await enforceRateLimit(`regulatory:${clientIp(request)}`);
    
    const body = await parseJsonBody(request);
    const parsed = analyzeSchema.safeParse(body);
    
    if (!parsed.success) {
      return jsonError(parsed.error, requestId);
    }

    const input = parsed.data;

    const analyzer = FSSAIAnalyzer.singleton();
    const result = await analyzer.analyze(input);

    logger.info("regulatory_analysis_completed", {
      requestId,
      durationMs: Date.now() - start,
      overallStatus: result.overallStatus,
      confidence: result.confidence,
    });

    return jsonSuccess(result, {
      requestId,
      durationMs: Date.now() - start,
    });
  } catch (error) {
    logger.error("regulatory_analysis_failed", { requestId, error: String(error) });
    return jsonError(error, requestId);
  }
}