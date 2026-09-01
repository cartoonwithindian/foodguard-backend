import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { ingredientUpsertSchema } from "@/schemas";
import { adminListIngredients, adminUpsertIngredient } from "@/services/admin.service";

export const runtime = "nodejs";

/** GET /api/admin/ingredients - list the knowledge base. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await requireAdmin(request);
    const ingredients = await adminListIngredients();
    return jsonSuccess({ ingredients, total: ingredients.length }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

/** POST /api/admin/ingredients - add or update an ingredient record. */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const parsed = ingredientUpsertSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);

    await adminUpsertIngredient(admin.id, parsed.data as never);
    return jsonSuccess({ ok: true }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
