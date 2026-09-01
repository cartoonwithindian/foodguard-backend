import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminListUnknownIngredients } from "@/services/admin.service";

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
