import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { ingredientAnalyzeSchema } from "@/schemas";
import { analyzeIngredients } from "@/services/ingredient.service";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/ingredients/analyze
 * Analyzes a list of ingredient strings deterministically.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`ingredients:${clientIp(request)}`);
    const body = await request.json();
    const parsed = ingredientAnalyzeSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);

    const result = await analyzeIngredients({
      ingredients: parsed.data.ingredients,
      context: parsed.data.context ?? null,
      language: parsed.data.language,
    });

    return jsonSuccess(
      {
        ingredients: result.items,
        unknownIngredients: result.unknownIngredients,
        matchRate: result.matchRate,
        unresolvedCount: result.unresolvedCount,
        provenance: {
          regulatoryAuthority: "FSSAI (Food Safety and Standards Authority of India)",
          intelligenceSources: [
            {
              name: "Food Ingredient Intelligence Database",
              underlyingSource: "USDA FoodData Central",
              type: "ingredient_intelligence",
              regulatory: false,
            },
          ],
          note: "Ingredient classification/intelligence and FSSAI regulatory status are reported separately per ingredient. Intelligence data never establishes Indian regulatory compliance.",
        },
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
