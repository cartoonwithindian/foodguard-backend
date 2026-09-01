import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { AppError, ErrorCodes } from "@/lib/errors";
import { searchUsdaFoods } from "@/lib/external/usda";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/external/usda/search?query=banana&pageSize=2
 * USDA FoodData Central food search. Requires USDA_FDC_API_KEY.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`external:usda:${clientIp(request)}`);
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim() ?? "";
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? 10), 1), 50);
    const dataType = url.searchParams.get("dataType")?.split(",").filter(Boolean);

    if (!query) {
      return jsonError(new AppError(ErrorCodes.VALIDATION_ERROR, "query is required"), requestId);
    }

    const data = await searchUsdaFoods({ query, pageSize, dataType });
    return jsonSuccess(data, { requestId, provider: "usda_fdc", query, pageSize });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
