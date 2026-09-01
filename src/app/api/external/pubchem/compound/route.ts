import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { AppError, ErrorCodes } from "@/lib/errors";
import { pubchemCompoundByName, pubchemCompoundByCid } from "@/lib/external/pubchem";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/external/pubchem/compound?name=caffeine
 * GET /api/external/pubchem/compound?cid=2519
 * PubChem compound record by name or CID.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`external:pubchem:${clientIp(request)}`);
    const url = new URL(request.url);
    const name = url.searchParams.get("name")?.trim() ?? "";
    const cid = url.searchParams.get("cid")?.trim() ?? "";

    if (!name && !cid) {
      return jsonError(new AppError(ErrorCodes.VALIDATION_ERROR, "Provide name or cid"), requestId);
    }

    const data = cid
      ? await pubchemCompoundByCid(cid)
      : await pubchemCompoundByName(name);

    return jsonSuccess(data, { requestId, provider: "pubchem", name: name || undefined, cid: cid || undefined });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
