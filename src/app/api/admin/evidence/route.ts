import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { evidenceCreateSchema } from "@/schemas";
import { adminAddEvidence } from "@/services/admin.service";

export const runtime = "nodejs";

/** POST /api/admin/evidence - attach a real reference to an ingredient. */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const parsed = evidenceCreateSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);

    await adminAddEvidence(admin.id, parsed.data);
    return jsonSuccess({ ok: true }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
