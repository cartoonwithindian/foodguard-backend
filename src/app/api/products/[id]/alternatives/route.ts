import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonSuccess, jsonError, parseJsonBody } from "@/lib/http";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { AppError, ErrorCodes } from "@/lib/errors";
import { getStore } from "@/lib/store";
import { findAlternativesForProduct } from "@/services/alternative-engine.service";
import { toAlternativeCharacteristicInfo } from "@/lib/alternative-characteristics";
import type { PreferenceGoal } from "@/services/recommendation.service";

export const runtime = "nodejs";

const GOALS = ["lower_sodium", "lower_sugar", "lower_calories", "higher_protein", "higher_fiber", "fewer_additives", "lower_saturated_fat"] as const;

const preferencesSchema = z.object({
  goals: z.array(z.enum(GOALS)).max(5).optional(),
  avoidIngredients: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

/**
 * Map the public preference goals to the enhanced engine's health-goal
 * vocabulary. The enhanced engine aligns preference reasons against these
 * named goals (improve_nutrition, weight_loss, heart_health, fewer_additives).
 */
function toHealthGoals(goals: PreferenceGoal[] | undefined): string[] | undefined {
  if (!goals || goals.length === 0) return undefined;
  const map: Record<PreferenceGoal, string> = {
    lower_sodium: "improve_nutrition",
    lower_sugar: "weight_loss",
    lower_calories: "improve_nutrition",
    higher_protein: "improve_nutrition",
    higher_fiber: "improve_nutrition",
    fewer_additives: "fewer_additives",
    lower_saturated_fat: "heart_health",
  };
  return [...new Set(goals.map((g) => map[g]))];
}

/**
 * POST /api/products/:id/alternatives
 * Transparent, objective alternative ranking with optional user preferences.
 * Never commercial. Data-driven only.
 *
 * Phase 5: runs the full Phase 1–4 pipeline (issue detection →
 * characteristics → search criteria → candidate retrieval + validation →
 * existing ranking). Responses carry `alternativeCharacteristics` and
 * `alternativeCriteria` (including unsupported characteristics) so clients
 * can render "What to look for" and only claim what was validated.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const { id } = await params;
    const store = getStore();
    const product = await store.getProductById(id);
    if (!product) {
      throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product could not be found", 404);
    }

    await enforceRateLimit(`alternatives:${clientIp(request)}`);
    // An invalid preferences object must not be silently dropped: the caller
    // would get a 200 whose ranking ignored what they asked for.
    const parsed = preferencesSchema.safeParse((await parseJsonBody(request)) ?? {});
    if (!parsed.success) {
      return jsonError(parsed.error, requestId);
    }
    const userPreferences = {
      healthGoals: toHealthGoals(parsed.data.goals as PreferenceGoal[] | undefined),
      avoidIngredients: parsed.data.avoidIngredients,
    };

    const nutrition = await store.getNutritionForProduct(product.id);
    const result = await findAlternativesForProduct({
      product,
      nutrition,
      userPreferences,
      limit: 5,
    });

    return jsonSuccess({
      currentProduct: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        barcode: product.barcode,
      },
      preferences: parsed.data,
      alternatives: result.alternatives,
      alternativeCharacteristics: result.characteristics.map(toAlternativeCharacteristicInfo),
      alternativeCriteria: {
        preferredCharacteristics: result.criteria.preferredCharacteristics,
        unsupported: result.criteria.unsupported,
      },
    }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

/**
 * GET /api/products/:id/alternatives
 * Transparent, objective alternative ranking (no preferences).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`alternatives:${clientIp(_request)}`);
    const { id } = await params;
    const store = getStore();
    const product = await store.getProductById(id);
    if (!product) {
      throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product could not be found", 404);
    }
    const nutrition = await store.getNutritionForProduct(product.id);
    const result = await findAlternativesForProduct({
      product,
      nutrition,
      userPreferences: null,
      limit: 5,
    });
    return jsonSuccess({
      product,
      alternatives: result.alternatives,
      alternativeCharacteristics: result.characteristics.map(toAlternativeCharacteristicInfo),
      alternativeCriteria: {
        preferredCharacteristics: result.criteria.preferredCharacteristics,
        unsupported: result.criteria.unsupported,
      },
    }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
