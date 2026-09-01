import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { AppError, ErrorCodes } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * POST /api/admin/product-image
 *
 * Update a product's imageUrl. Body: { productId: string, imageUrl: string }
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await requireAdmin(request);

    const body = await request.json();
    const { productId, imageUrl } = body as {
      productId?: string;
      imageUrl?: string;
    };

    if (!productId || typeof productId !== "string") {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "productId is required",
      );
    }
    if (!imageUrl || typeof imageUrl !== "string") {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "imageUrl is required",
      );
    }

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
