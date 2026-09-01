import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminStats } from "@/services/admin.service";

export const runtime = "nodejs";

/** GET /api/admin/dashboard - admin stats overview. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await requireAdmin(request);
    const stats = await adminStats();
    return jsonSuccess(stats, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
