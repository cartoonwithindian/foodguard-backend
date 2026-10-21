import { NextRequest } from "next/server";
import { jsonSuccess, jsonError, parseJsonBody } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { productImageUpdateSchema } from "@/schemas";

export const runtime = "nodejs";

/**
 * POST /api/admin/product-image
 *
 * Update a product's imageUrl. Body: { productId: string, imageUrl: http(s) URL }
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await requireAdmin(request);

    const parsed = productImageUpdateSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) {
      return jsonError(parsed.error, requestId);
    }
    const { productId, imageUrl } = parsed.data;

    const store = getStore();
    await store.updateProductImage(productId, imageUrl);

    return jsonSuccess(
      { ok: true, productId, imageUrl },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
