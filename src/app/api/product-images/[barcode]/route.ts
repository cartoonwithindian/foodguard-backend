/**
 * Barcoded product images are served from Cloudflare R2.
 *
 * When `R2_PUBLIC_IMAGES_URL` is configured we 302-redirect to
 * `<R2_PUBLIC_IMAGES_URL>/<barcode>.webp` (object names follow the legacy
 * `product-viewer/images/<barcode>.<ext>` layout). Without it we return 404 —
 * the 1.8GB of images live in R2, never in the backend repo.
 */
const R2_PUBLIC_IMAGES_URL = (process.env.R2_PUBLIC_IMAGES_URL || "").replace(/\/+$/, "");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ barcode: string }> },
): Promise<Response> {
  const { barcode } = await params;

  if (!barcode || barcode.length < 3) {
    return Response.json({ error: "Invalid barcode" }, { status: 400 });
  }

  if (R2_PUBLIC_IMAGES_URL) {
    return Response.redirect(
      `${R2_PUBLIC_IMAGES_URL}/${encodeURIComponent(barcode)}.webp`,
      302,
    );
  }

  return Response.json({ error: "Image not found" }, { status: 404 });
}
