import { z } from "zod";
import { getStore } from "@/lib/store";
import type { ToolResult, SearchProductHit, SearchProductToolArgs } from "@/types/chat-tools";
import { searchProducts } from "@/services/product.service";

const CATEGORIES = ["food", "cosmetics", "personal_care", "household", "other", "all"] as const;

const inputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  category: z.enum(CATEGORIES).optional(),
});

export async function searchProductTool(args: SearchProductToolArgs): Promise<ToolResult<SearchProductHit[]>> {
  const parsed = inputSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }
  try {
    const results = await searchProducts(parsed.data.query, parsed.data.category);
    return {
      ok: true,
      data: results.products.slice(0, 5).map((r) => ({
        id: r.id,
        name: r.name,
        brand: r.brand,
        barcode: r.barcode,
        category: r.category,
      })),
    };
  } catch {
    return { ok: false, error: "search_failed" };
  }
}

export async function resolveProductId(args: { product_id?: string; barcode?: string }): Promise<string | null> {
  const store = getStore();
  if (args.product_id) {
    const product = await store.getProductById(args.product_id);
    return product?.id ?? null;
  }
  if (args.barcode) {
    const product = await store.getProductByBarcode(args.barcode);
    return product?.id ?? null;
  }
  return null;
}