import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { whoIndicators } from "@/lib/external/who";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/external/who/indicators?top=20
 * WHO Global Health Observatory indicators.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`external:who:${clientIp(request)}`);
    const url = new URL(request.url);
    const top = Number(url.searchParams.get("top") ?? 20);
    const data = await whoIndicators(top);
    return jsonSuccess(data, { requestId, provider: "who_gho", top });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
