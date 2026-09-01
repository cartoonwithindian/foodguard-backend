/**
 * Server-only (Node) barcode decode tier using zxing-wasm + sharp.
 *
 * This module deliberately imports `server-only` and native `sharp` so it can
 * never be pulled into a client browser bundle. The browser-only decoder
 * (@zxing/browser) returns null in Node, so server routes like
 * /api/scan/label could never decode barcodes from uploaded images. This tier
 * mirrors the barcode-benchmark approach (WASM decode on raw RGBA pixels) so
 * decoding also works in the Node backend, without a DOM.
 */
import "server-only";

import { readBarcodes } from "zxing-wasm/reader";

export interface NodeBarcodeResult {
  value: string;
  format: string;
}

/**
 * Maps zxing-wasm canonical format names to the underscore-style
 * BarcodeFormat names produced by @zxing/browser, so the Node decode tier
 * returns formats consistent with the browser decode tier.
 */
const ZXING_WASM_FORMAT_MAP: Record<string, string> = {
  EAN8: "EAN_8",
  EAN13: "EAN_13",
  UPCA: "UPC_A",
  UPCE: "UPC_E",
  Code39: "CODE_39",
  Code93: "CODE_93",
  Code128: "CODE_128",
  ITF: "ITF",
  Codabar: "CODABAR",
  QRCode: "QR_CODE",
  DataMatrix: "DATA_MATRIX",
  PDF417: "PDF_417",
  Aztec: "AZTEC",
};

function isSupportedBarcodeFormat(formatName: string): boolean {
  const upper = formatName.toUpperCase();
  return (
    upper.includes("EAN_13") ||
    upper.includes("EAN_8") ||
    upper.includes("UPC_A") ||
    upper.includes("UPC_E") ||
    upper.includes("CODE_128") ||
    upper.includes("QR_CODE") ||
    upper.includes("EAN-13") ||
    upper.includes("EAN-8") ||
    upper.includes("UPC-A") ||
    upper.includes("UPC-E") ||
    upper.includes("CODE-128")
  );
}

/**
 * Decodes a barcode from an image blob/file/data URL/remote URL in Node using
 * sharp (to rasterize to raw RGBA pixels) and zxing-wasm (to decode).
 * Returns null on any failure — never throws.
 */
export async function decodeBarcodeInNode(
  imageSource: Blob | File | string
): Promise<NodeBarcodeResult | null> {
  try {
    const sharpPromise = import("sharp");
    const sharp = (await sharpPromise).default;

    // Resolve the input to a buffer (blob/file or data URL / remote URL).
    let buffer: Buffer;
    if (typeof imageSource === "string") {
      if (imageSource.startsWith("data:")) {
        const base64 = imageSource.slice(imageSource.indexOf(",") + 1);
        buffer = Buffer.from(base64, "base64");
      } else {
        const res = await fetch(imageSource);
        if (!res.ok) return null;
        buffer = Buffer.from(await res.arrayBuffer());
      }
    } else {
      buffer = Buffer.from(await imageSource.arrayBuffer());
    }

    // Decode to raw RGBA pixels with sharp (rasterizes PNG/JPEG/WebP/AVIF/SVG).
    const { data, info } = await sharp(buffer)
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const frame = {
      data,
      width: info.width,
      height: info.height,
      colorSpace: "srgb",
    } as unknown as ImageData;

    const results = await readBarcodes(frame, { tryHarder: true });

    for (const result of results) {
      const value = result.text?.trim();
      if (!value) continue;
      const format = ZXING_WASM_FORMAT_MAP[result.format] ?? result.format;
      if (isSupportedBarcodeFormat(format)) {
        return { value, format };
      }
    }
    return null;
  } catch (err) {
    console.error("[BarcodeDecoder] Node barcode decode error:", err);
    return null;
  }
}
