import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminListUsers } from "@/services/admin.service";

export const runtime = "nodejs";

/** GET /api/admin/users - list users for management. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await requireAdmin(request);
    const users = await adminListUsers();
    return jsonSuccess({ users, total: users.length }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
