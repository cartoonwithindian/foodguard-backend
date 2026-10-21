import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { z } from "zod";
import { jsonError, parseJsonBody } from "@/lib/http";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { AppError, ErrorCodes } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const DB_PATH = path.resolve(process.cwd(), "../data/foodguard/foodguard.db");

const requestSchema = z.object({
  names: z
    .array(z.string().trim().min(1).max(200))
    .min(1)
    .max(50),
});

/**
 * POST /api/product-images
 *
 * Accepts JSON with a list of product names and returns matching product
 * images from the local foodguard database.
 *
 * Body: { names: string[] }  (max 50 names, 200 chars each)
 * Returns: { success: true, images: Record<string, string> }
 *
 * The response intentionally keeps the legacy top-level `images` key (rather
 * than the standard `data` envelope) because the scanned-product UI reads it
 * directly. Errors use the standard envelope.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`product-images:${clientIp(request)}`);

    const parsed = requestSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "names must be an array of 1-50 non-empty product names (max 200 characters each)",
      );
    }

    const names = [...new Set(parsed.data.names)];
    const images: Record<string, string> = {};

    let db: Database.Database;
    try {
      db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    } catch (error) {
      logger.warn("product_images_db_unavailable", {
        path: DB_PATH,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError(
        ErrorCodes.DATABASE_ERROR,
        "Product image catalog is not available",
        503,
      );
    }

    try {
      // Try exact match first, then fuzzy LIKE match
      const stmtExact = db.prepare(
        "SELECT name, image_url FROM products WHERE name = ? AND image_url IS NOT NULL AND image_url != '' LIMIT 1",
      );
      const stmtFuzzy = db.prepare(
        "SELECT name, image_url FROM products WHERE name LIKE ? AND image_url IS NOT NULL AND image_url != '' LIMIT 1",
      );

      for (const name of names) {
        // Exact match
        const exact = stmtExact.get(name) as { name: string; image_url: string } | undefined;
        if (exact) {
          images[name] = exact.image_url;
          continue;
        }

        // Fuzzy match: try each significant word (bounded so one long name
        // cannot trigger hundreds of LIKE scans).
        const words = name
          .split(/\s+/)
          .filter((w: string) => w.length > 3)
          .slice(0, 5);
        for (const word of words) {
          const row = stmtFuzzy.get(`%${word}%`) as { name: string; image_url: string } | undefined;
          if (row) {
            images[name] = row.image_url;
            break;
          }
        }
      }
    } finally {
      db.close();
    }

    // Legacy response shape (top-level `images`); see doc comment above.
    return Response.json({ success: true, images });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
