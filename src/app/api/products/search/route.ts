import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { searchProducts } from "@/services/product.service";

export const runtime = "nodejs";

/**
 * GET /api/products/search?q=...&category=...
 * Ranked product search across name, brand, barcode and ingredients.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const category = url.searchParams.get("category") ?? "all";
    const data = await searchProducts(q, category);
    return jsonSuccess(data, { requestId, query: q, category });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
