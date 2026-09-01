import { getTempImage } from "@/lib/temp-images";

export const runtime = "nodejs";

/**
 * GET /api/temp/:id
 *
 * Serves a short-lived uploaded image (bytes stored during `/api/scan/label`)
 * so the visual search service can fetch it by URL. Entries are random-uuid,
 * expire after a few minutes, and are deleted by the scan that created them.
 * No auth — a guessable id is not discoverable (128-bit random).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<Record<string, string>> },
): Promise<Response> {
  const { id } = await params;
  const image = getTempImage(id);
  if (!image) {
    return Response.json(
      {
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Temp image expired or not found" },
        meta: { requestId: "temp-image" },
      },
      { status: 404 },
    );
  }
  return new Response(image.data, {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.data.byteLength),
      "Cache-Control": "private, max-age=120",
      "X-Content-Type-Options": "nosniff",
    },
  });
}