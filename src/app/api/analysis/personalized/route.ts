import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { personalizedSchema } from "@/schemas";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireAuth } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { parseIngredientText } from "@/lib/ingredients/parse";
import { analyzeIngredients } from "@/services/ingredient.service";
import { detectAllergens } from "@/lib/allergens";
import { personalize } from "@/services/personalization.service";
import { GUEST_EMAIL } from "@/services/user.service";

export const runtime = "nodejs";

/**
 * POST /api/analysis/personalized
 * Compares a product against a user's preferences.
 * Objective facts are never changed - flags are computed on top of them.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const body = await request.json();
    const parsed = personalizedSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);

    const session = await requireAuth(request);
    const store = getStore();
    const { productId, userId } = parsed.data;
    const resolvedUserId = userId ?? session.id;

    const [product, user] = await Promise.all([
      store.getProductById(productId),
      store.getUserById(resolvedUserId),
    ]);
    if (!product) throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product could not be found", 404);
    // Guest sessions may not have a persisted record in this worker's store.
    // Fall back to a synthetic profile (same pattern as user.service.getMe).
    const resolvedUser =
      user ??
      (session.email === GUEST_EMAIL
        ? { id: session.id, language: session.language as "EN" | "HI" }
        : null);
    if (!resolvedUser) throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);

    const { ingredients } = parseIngredientText(product.ingredientsRaw);
    const analysis = await analyzeIngredients({
      ingredients,
      context: product.name,
      language: resolvedUser.language === "HI" ? "hi" : "en",
    });

    const allergens = detectAllergens(product.ingredientsRaw);
    const nutrition = await store.getNutritionForProduct(product.id);
    const personalized = await personalize(resolvedUserId, analysis.items, allergens, nutrition);

    return jsonSuccess(
      {
        productId: product.id,
        productName: product.name,
        personalizedFlags: personalized.flags.map((f) => ({
          type: f.type,
          ingredient: f.ingredient,
          severity: f.severity,
          message: f.message,
        })),
        compatible: personalized.compatible,
        summary: personalized.summary,
        objectiveAnalysis: {
          ingredientCount: analysis.items.length,
          unresolvedCount: analysis.unresolvedCount,
          allergens: allergens.map((a) => ({ allergen: a.allergen, type: a.type })),
        },
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
