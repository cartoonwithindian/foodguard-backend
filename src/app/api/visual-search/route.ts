import { searchSimilarByImage } from "@/lib/visual-search";
import { AppError, ErrorCodes } from "@/lib/errors";
import { jsonError } from "@/lib/http";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { config } from "@/lib/config";

export const runtime = "nodejs";

/**
 * POST /api/visual-search
 *
 * Accepts a multipart form with an "image" file, uploads it to the visual
 * search service, and returns top-K visually similar products.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = "visual-search";
  try {
    await enforceRateLimit(`visualsearch:${clientIp(request)}`);

    const formData = await request.formData();
    const file = formData.get("image");

    if (!file || !(file instanceof File)) {
      return Response.json(
        {
          success: false,
          data: null,
          error: { code: "MISSING_IMAGE", message: "No image file provided" },
          meta: { requestId },
        },
        { status: 400 },
      );
    }

    if (file.size > config.limits.maxBodyMb * 1024 * 1024) {
      throw new AppError(
        ErrorCodes.PAYLOAD_TOO_LARGE,
        `Image exceeds the ${config.limits.maxBodyMb} MB limit`,
        413,
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const filename = file.name || "image.jpg";
    const mimeType = file.type || "image/jpeg";

    // Direct multipart upload to visual search service (more reliable than URL-based)
    const result = await searchSimilarByImage(arrayBuffer, filename, mimeType, 10);

    // Clean up temp image
    // Note: temp images auto-expire, but we could delete here if needed

    if (!result.ok) {
      return Response.json(
        {
          success: false,
          data: null,
          error: {
            code: result.code || "VISUAL_SEARCH_ERROR",
            message: result.message,
          },
          meta: { requestId },
        },
        { status: result.serviceUnavailable ? 503 : 500 },
      );
    }

    return Response.json({
      success: true,
      data: {
        results: result.results,
        query: result.query,
      },
      error: null,
      meta: { requestId },
    });
  } catch (error) {
    // jsonError maps AppError status/codes and never echoes raw exception
    // text (upstream URLs, tokens, SQL) back to the caller.
    return jsonError(error, requestId);
  }
}
