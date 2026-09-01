import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminListUnknownIngredients, adminResolveUnknownIngredient } from "@/services/admin.service";
import { resolveUnknownSchema } from "@/schemas";

export const runtime = "nodejs";

/** GET /api/admin/reviews - the unknown-ingredient review queue. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await requireAdmin(request);
    const queue = await adminListUnknownIngredients();
    return jsonSuccess({ queue, total: queue.length }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

/**
 * POST /api/admin/reviews/:id/resolve
 * body: { status: "resolved" | "dismissed", resolvedIngredientId?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const admin = await requireAdmin(request);
    const { id } = await params;
    const body = await request.json();
    const parsed = resolveUnknownSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);

    await adminResolveUnknownIngredient(
      admin.id,
      id,
      parsed.data.status as "resolved" | "dismissed",
      parsed.data.resolvedIngredientId,
    );
    return jsonSuccess({ ok: true }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
