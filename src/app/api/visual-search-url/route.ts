import { searchByImageUrl } from "@/lib/visual-search";

export const runtime = "nodejs";

/**
 * POST /api/visual-search-url
 *
 * Accepts JSON with an "image_url" field and returns top-K visually similar
 * products using the hosted visual search service.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);

    if (!body?.image_url) {
      return Response.json(
        {
          success: false,
          data: null,
          error: { code: "MISSING_URL", message: "No image_url provided" },
          meta: { requestId: "visual-search-url" },
        },
        { status: 400 },
      );
    }

    const topK = typeof body.top_k === "number" ? body.top_k : 10;
    const result = await searchByImageUrl(body.image_url, topK);

    if (!result.ok) {
      return Response.json(
        {
          success: false,
          data: null,
          error: {
            code: result.code || "VISUAL_SEARCH_ERROR",
            message: result.message,
          },
          meta: { requestId: "visual-search-url" },
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
      meta: { requestId: "visual-search-url" },
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
        meta: { requestId: "visual-search-url" },
      },
      { status: 500 },
    );
  }
}
