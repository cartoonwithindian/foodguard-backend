import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { getMe } from "@/services/user.service";

export const runtime = "nodejs";

/** GET /api/auth/me - validate the JWT and return the current user. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const me = await getMe(session);
    return jsonSuccess(me, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
