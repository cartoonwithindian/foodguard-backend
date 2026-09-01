import { z } from "zod";
import { getStore } from "@/lib/store";
import { parseIngredientText } from "@/lib/ingredients/parse";
import type { ToolResult, ProductComparison, CompareProductsToolArgs } from "@/types/chat-tools";
import { resolveProductId } from "./search-product";

const inputSchema = z
  .object({
    product_a: z.string().trim().min(1).max(64).optional(),
    product_b: z.string().trim().min(1).max(64).optional(),
  })
  .refine((v) => Boolean(v.product_a && v.product_b), "two products required");

export async function compareProductsTool(
  args: CompareProductsToolArgs,
): Promise<ToolResult<ProductComparison | { notFound: true }>> {
  const parsed = inputSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }
  try {
    const store = getStore();
    const aId = await resolveProductId({ product_id: parsed.data.product_a });
    const bId = await resolveProductId({ product_id: parsed.data.product_b });
    if (!aId || !bId) return { ok: true, data: { notFound: true } };

    const [a, b] = await Promise.all([store.getProductById(aId), store.getProductById(bId)]);
    if (!a || !b) return { ok: true, data: { notFound: true } };

    const nutritionA = await store.getNutritionForProduct(a.id);
    const nutritionB = await store.getNutritionForProduct(b.id);

    const details = (p: typeof a) => ({
      id: p!.id,
      name: p!.name,
      brand: p!.brand,
      barcode: p!.barcode,
      category: p!.category,
      ingredientsRaw: p!.ingredientsRaw.slice(0, 1500),
      source: p!.source,
      verified: p!.verified,
      productDataConfidence: p!.productDataConfidence,
    });

    const ingredientsOf = (raw: string) =>
      parseIngredientText(raw).ingredients.join(", ") || "No ingredient list";

    const nutritionRow = (n: typeof nutritionA, field: string) => {
      const v = n?.nutrients[field];
      return v ? `${v.value} ${v.unit}` : "Not available";
    };

    return {
      ok: true,
      data: {
        product_a: details(a),
        product_b: details(b),
        rows: [
          { field: "ingredients", a: ingredientsOf(a.ingredientsRaw), b: ingredientsOf(b.ingredientsRaw) },
          { field: "calories", a: nutritionRow(nutritionA, "calories"), b: nutritionRow(nutritionB, "calories") },
          { field: "sugars", a: nutritionRow(nutritionA, "sugars"), b: nutritionRow(nutritionB, "sugars") },
          { field: "sodium", a: nutritionRow(nutritionA, "sodium"), b: nutritionRow(nutritionB, "sodium") },
          { field: "saturatedFat", a: nutritionRow(nutritionA, "saturatedFat"), b: nutritionRow(nutritionB, "saturatedFat") },
        ],
        concern_a: "See FoodGuard analysis",
        concern_b: "See FoodGuard analysis",
      },
    };
  } catch {
    return { ok: false, error: "compare_failed" };
  }
}