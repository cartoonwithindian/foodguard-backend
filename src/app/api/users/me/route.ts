import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { getMe, updateProfile } from "@/services/user.service";
import { profilePatchSchema } from "@/schemas";

export const runtime = "nodejs";

/** GET /api/users/me - current user profile. */
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

/** PATCH /api/users/me - update name / language. */
export async function PATCH(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const body = await request.json();
    const parsed = profilePatchSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);
    const me = await updateProfile(session, parsed.data);
    return jsonSuccess(me, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
