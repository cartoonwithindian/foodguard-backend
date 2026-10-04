import { searchByImageUrl } from "@/lib/visual-search";
import { assertPublicHttpUrl, clampInt } from "@/lib/url-guard";
import { AppError, ErrorCodes } from "@/lib/errors";
import { jsonError } from "@/lib/http";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/visual-search-url
 *
 * Accepts JSON with an "image_url" field and returns top-K visually similar
 * products using the hosted visual search service.
 *
 * The URL is client-supplied and gets fetched server-side (directly, or by the
 * visual-search service on our behalf), so it is validated before use: http(s)
 * only, public hosts only, credentials rejected, and `top_k` clamped.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = "visual-search-url";
  try {
    await enforceRateLimit(`visualsearch:${clientIp(request)}`);

    const body = (await request.json().catch(() => null)) as {
      image_url?: unknown;
      top_k?: unknown;
    } | null;

    if (!body?.image_url || typeof body.image_url !== "string") {
      return Response.json(
        {
          success: false,
          data: null,
          error: { code: "MISSING_URL", message: "No image_url provided" },
          meta: { requestId },
        },
        { status: 400 },
      );
    }

    assertPublicHttpUrl(body.image_url, "image_url");
    const topK = clampInt(body.top_k, 10, 1, 50);

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
    if (error instanceof AppError) return jsonError(error, requestId);
    // Never echo raw exception text — it can carry upstream URLs and tokens.
    return jsonError(new AppError(ErrorCodes.UNKNOWN_ERROR, "Visual search failed", 500), requestId);
  }
}
