import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { searchProducts } from "@/services/product.service";

export const runtime = "nodejs";

/**
 * GET /api/products/search?q=...&category=...
 * Ranked product search across name, brand, barcode and ingredients.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`catalog:${clientIp(request)}`);
    const url = new URL(request.url);
    // Clamp free-text so a multi-megabyte `q` cannot be pushed into the
    // ranking path (the global body limit does not apply to GET query strings).
    const q = (url.searchParams.get("q")?.trim() ?? "").slice(0, 120);
    const category = (url.searchParams.get("category") ?? "all").slice(0, 80);
    const data = await searchProducts(q, category);
    return jsonSuccess(data, { requestId, query: q, category });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
