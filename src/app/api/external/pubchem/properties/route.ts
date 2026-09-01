import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { AppError, ErrorCodes } from "@/lib/errors";
import { pubchemCompoundProperties } from "@/lib/external/pubchem";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/external/pubchem/properties?name=aspirin&properties=MolecularFormula,MolecularWeight
 * Fetch selected PubChem properties for a named compound.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`external:pubchem:${clientIp(request)}`);
    const url = new URL(request.url);
    const name = url.searchParams.get("name")?.trim() ?? "";
    const properties = url.searchParams.get("properties")?.trim() ?? "MolecularFormula,MolecularWeight";

    if (!name) {
      return jsonError(new AppError(ErrorCodes.VALIDATION_ERROR, "name is required"), requestId);
    }

    const data = await pubchemCompoundProperties(name, properties);
    return jsonSuccess(data, { requestId, provider: "pubchem", name, properties });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
