import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminListProducts } from "@/services/admin.service";

export const runtime = "nodejs";

/** GET /api/admin/products?q= - list products for management. */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const products = await adminListProducts(q);
    return jsonSuccess({ products, total: products.length }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
