import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { updatePreferences } from "@/services/user.service";
import { preferencesPatchSchema } from "@/schemas";

export const runtime = "nodejs";

/** PATCH /api/users/me/preferences - update dietary / allergy preferences. */
export async function PATCH(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const body = await request.json();
    const parsed = preferencesPatchSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);

    const preferences = await updatePreferences(session, parsed.data);
    return jsonSuccess({ preferences }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
