import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { compareSchema } from "@/schemas";
import { compareProducts } from "@/services/product.service";

export const runtime = "nodejs";

/**
 * POST /api/products/compare
 * Side-by-side comparison of 2-5 products based on measurable data only.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const body = await request.json();
    const parsed = compareSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);
    const comparison = await compareProducts(parsed.data.productIds);
    return jsonSuccess({ products: comparison }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
