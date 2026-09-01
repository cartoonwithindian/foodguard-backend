import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { AppError, ErrorCodes } from "@/lib/errors";
import { searchFdaDrugLabels } from "@/lib/external/fda";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/external/fda/drug-labels?search=aspirin&limit=2
 * FDA drug product labels.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`external:fda:${clientIp(request)}`);
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 5), 1), 100);

    if (!search) {
      return jsonError(new AppError(ErrorCodes.VALIDATION_ERROR, "search is required"), requestId);
    }

    const data = await searchFdaDrugLabels(search, limit);
    return jsonSuccess(data, { requestId, provider: "fda_open", endpoint: "drug/label", search, limit });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
