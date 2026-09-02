import { searchSimilarByImage } from "@/lib/visual-search";

export const runtime = "nodejs";

/**
 * POST /api/visual-search
 *
 * Accepts a multipart form with an "image" file, uploads it to the visual
 * search service, and returns top-K visually similar products.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!file || !(file instanceof File)) {
      return Response.json(
        {
          success: false,
          data: null,
          error: { code: "MISSING_IMAGE", message: "No image file provided" },
          meta: { requestId: "visual-search" },
        },
        { status: 400 },
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
          meta: { requestId: "visual-search" },
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
      meta: { requestId: "visual-search" },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        meta: { requestId: "visual-search" },
      },
      { status: 500 },
    );
  }
}
