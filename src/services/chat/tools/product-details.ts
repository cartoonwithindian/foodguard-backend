import { z } from "zod";
import { getStore } from "@/lib/store";
import type { ToolResult, ProductDetails, ProductDetailsToolArgs } from "@/types/chat-tools";
import { resolveProductId } from "./search-product";

const inputSchema = z
  .object({
    product_id: z.string().trim().min(1).max(64).optional(),
    barcode: z.string().trim().min(1).max(32).optional(),
  })
  .refine((v) => Boolean(v.product_id || v.barcode), "product_id or barcode required");

export async function getProductDetailsTool(
  args: ProductDetailsToolArgs,
): Promise<ToolResult<ProductDetails | { notFound: true }>> {
  const parsed = inputSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }
  const store = getStore();
  try {
    const id = await resolveProductId(parsed.data);
    if (!id) return { ok: true, data: { notFound: true } };
    const product = await store.getProductById(id);
    if (!product) return { ok: true, data: { notFound: true } };
    return {
      ok: true,
      data: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        barcode: product.barcode,
        category: product.category,
        ingredientsRaw: product.ingredientsRaw.slice(0, 2000),
        source: product.source,
        verified: product.verified,
        productDataConfidence: product.productDataConfidence,
      },
    };
  } catch {
    return { ok: false, error: "lookup_failed" };
  }
}