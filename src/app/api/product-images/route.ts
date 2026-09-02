import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import path from "path";

export const runtime = "nodejs";

const DB_PATH = path.resolve(process.cwd(), "../data/foodguard/foodguard.db");

/**
 * POST /api/product-images
 *
 * Accepts JSON with a list of product names and returns matching product
 * images from the local foodguard database.
 *
 * Body: { names: string[] }
 * Returns: { images: Record<string, string> }  (name → image_url)
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    const names = body?.names;

    if (!Array.isArray(names) || names.length === 0) {
      return Response.json(
        { success: false, error: "No product names provided" },
        { status: 400 },
      );
    }

    const db = new Database(DB_PATH, { readonly: true });
    try {
      const images: Record<string, string> = {};

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

        // Fuzzy match: try each significant word
        const words = name.split(/\s+/).filter((w: string) => w.length > 3);
        for (const word of words) {
          const row = stmtFuzzy.get(`%${word}%`) as { name: string; image_url: string } | undefined;
          if (row) {
            images[name] = row.image_url;
            break;
          }
        }
      }

      return Response.json({ success: true, images });
    } finally {
      db.close();
    }
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
