import { getCache } from "@/lib/cache";
import { fetchExternalJson } from "@/lib/external/client";

/**
 * Best-effort product image lookup against Open Food Facts.
 *
 * The bundled Indian dataset carries no image URLs, so alternative cards
 * resolve images by barcode at response time. Results are cached for a week
 * (negative lookups for a day) so the OFF API is hit at most once per
 * product. Every failure path resolves to null — images are decorative and
 * must never break the alternatives pipeline.
 */

type OffImageResponse = {
  status?: number;
  product?: {
    image_front_url?: string | null;
    image_url?: string | null;
  };
};

const NEGATIVE = "-";

export async function fetchOffImageUrl(barcode: string): Promise<string | null> {
  if (!barcode || !/^\d{4,32}$/.test(barcode.trim())) return null;

  const cache = getCache();
  const key = `off-img:${barcode}`;
  const cached = await cache.get<string>(key);
  if (cached) return cached === NEGATIVE ? null : cached;

  try {
    const data = await fetchExternalJson<OffImageResponse>(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode.trim())}.json?fields=image_front_url,image_url`,
      { timeoutMs: 4000 },
    );
    const url =
      data.product?.image_front_url ?? data.product?.image_url ?? null;
    await cache.set(key, url ?? NEGATIVE, url ? 7 * 24 * 3600 : 24 * 3600);
    return url;
  } catch {
    // Unreachable provider / missing product — no image, no error surfaced.
    return null;
  }
}
