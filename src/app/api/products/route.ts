import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { AppError, ErrorCodes } from "@/lib/errors";
import { listCatalog } from "@/services/catalog.service";

export const runtime = "nodejs";

const SORT_KEYS = ["new", "name_asc", "name_desc", "brand", "rating"];

/**
 * GET /api/products
 * Server-side paginated FoodGuard catalog.
 *
 * Query params:
 *   search   - name / brand / barcode substring (FoodGuard DB)
 *   category - browsing category from the database-derived list (see CATALOG_CATEGORIES)
 *   sort     - new | name_asc | name_desc | brand | rating
 *   page     - 1-based page number
 *   limit    - 1..50 (default 24)
 *
 * Response: { products, total, dbTotal, page, limit, hasMore, categories }
 * Never ships the whole database to the browser; the DB stays server-side.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const category = url.searchParams.get("category")?.trim() ?? "all";
    const sort = url.searchParams.get("sort") ?? "new";
    const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "24", 10) || 24, 1), 50);

    if (sort && !SORT_KEYS.includes(sort)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, `Invalid sort "${sort}"`);
    }

    const offset = (page - 1) * limit;
    const data = await listCatalog({ search, category, sort, offset, limit });

    return jsonSuccess(
      {
        products: data.products,
        total: data.total,
        dbTotal: data.dbTotal,
        page,
        limit,
        hasMore: offset + data.products.length < data.total,
        categories: data.categories,
      },
      { requestId, query: search, category, sort },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}