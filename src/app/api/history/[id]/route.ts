import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireAuth } from "@/lib/auth";
import { deleteHistoryEntry } from "@/services/history.service";

export const runtime = "nodejs";

/** DELETE /api/history/:id - remove one history entry. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    if (id.length > 120) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid history id");
    }
    await deleteHistoryEntry(session.id, id);
    return jsonSuccess({ deleted: true }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
