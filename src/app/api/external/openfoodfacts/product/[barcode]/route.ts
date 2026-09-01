import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { AppError, ErrorCodes } from "@/lib/errors";
import { fetchExternalJson } from "@/lib/external/client";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

type OffProduct = {
  code?: string;
  product?: {
    product_name?: string;
    brands?: string;
    categories?: string;
    countries?: string;
    image_url?: string;
    serving_size?: string;
    ingredients_text?: string;
    additives_tags?: string[];
    allergens_tags?: string[];
    nutriments?: Record<string, number>;
    nutrient_levels?: Record<string, string>;
  };
  status?: number;
  status_verbose?: string;
};

/**
 * GET /api/external/openfoodfacts/product/:barcode
 * Open Food Facts product lookup (free, no key).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`external:off:${clientIp(request)}`);
    const { barcode } = await params;
    if (!/^\d{4,32}$/.test(barcode)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Invalid barcode format");
    }

    const data = await fetchExternalJson<OffProduct>(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    );

    if (!data.product || data.status !== 1) {
      throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product could not be found on Open Food Facts", 404);
    }

    return jsonSuccess(
      {
        barcode: data.code ?? barcode,
        product: {
          name: data.product.product_name ?? null,
          brand: data.product.brands ?? null,
          categories: data.product.categories ?? null,
          countries: data.product.countries ?? null,
          imageUrl: data.product.image_url ?? null,
          servingSize: data.product.serving_size ?? null,
          ingredientsText: data.product.ingredients_text ?? null,
          additivesTags: data.product.additives_tags ?? [],
          allergensTags: data.product.allergens_tags ?? [],
          nutriments: data.product.nutriments ?? {},
          nutrientLevels: data.product.nutrient_levels ?? {},
        },
      },
      { requestId, provider: "openfoodfacts", barcode },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
