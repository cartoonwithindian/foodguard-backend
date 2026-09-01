import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { writeBarcode } from "zxing-wasm/writer";
import type { WriteInputBarcodeFormat } from "zxing-wasm/writer";
import { decodeBarcodeInNode } from "@/lib/barcode/node-decoder";
import {
  validateBarcode,
  isSupportedBarcodeFormat,
} from "@/lib/barcode/decoder";

/**
 * Exercises the server-side Node decode tier (decodeBarcodeInNode) which runs
 * zxing-wasm + sharp on raw RGBA pixels — the barcode-benchmark-inspired
 * multi-engine approach ported to the backend. Real barcode images are
 * generated with zxing-wasm/writer and rasterized with sharp, then decoded
 * back in a pure Node environment (no DOM).
 */
async function rasterizeBarcode(
  text: string,
  format: WriteInputBarcodeFormat,
): Promise<Blob> {
  const w = await writeBarcode(text, {
    format,
    scale: format === "QRCode" ? 8 : 4,
    addQuietZones: true,
  });
  const png = await sharp(Buffer.from(w.svg)).png().toBuffer();
  return new Blob([png], { type: "image/png" });
}

describe("decodeBarcodeInNode (server-side tier)", () => {
  it("guards the server-side branch (no window in node env)", () => {
    expect(typeof window).toBe("undefined");
  });

  it("decodes an EAN-13 barcode from a PNG blob", async () => {
    const blob = await rasterizeBarcode("5901234123457", "EAN13");
    const result = await decodeBarcodeInNode(blob);
    expect(result).not.toBeNull();
    expect(result?.value).toBe("5901234123457");
    expect(result?.format).toBe("EAN_13");
  });

  it("decodes a Code128 barcode (alphanumeric)", async () => {
    const blob = await rasterizeBarcode("Hello AccessData 42", "Code128");
    const result = await decodeBarcodeInNode(blob);
    expect(result?.value).toBe("Hello AccessData 42");
    expect(result?.format).toBe("CODE_128");
  });

  it("decodes a QR code", async () => {
    const blob = await rasterizeBarcode("https://example.com/p", "QRCode");
    const result = await decodeBarcodeInNode(blob);
    expect(result?.value).toBe("https://example.com/p");
    expect(result?.format).toBe("QR_CODE");
  });

  it("returns null for a non-image blob without throwing", async () => {
    const blob = new Blob([Buffer.from("definitely not an image")]);
    await expect(decodeBarcodeInNode(blob)).resolves.toBeNull();
  });

  it("returns null for an image with no barcode", async () => {
    const png = await sharp({
      create: {
        width: 300,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();
    const blob = new Blob([png], { type: "image/png" });
    await expect(decodeBarcodeInNode(blob)).resolves.toBeNull();
  });
});

describe("validateBarcode", () => {
  it("accepts valid EAN-13 checksum", () => {
    expect(validateBarcode("5901234123457")).toBe(true);
  });

  it("rejects a bad checksum", () => {
    expect(validateBarcode("5901234123450")).toBe(false);
  });

  it("rejects non-numeric / out-of-range input", () => {
    expect(validateBarcode("hello")).toBe(false);
    expect(validateBarcode("123")).toBe(false);
  });
});

describe("isSupportedBarcodeFormat", () => {
  it("accepts the underscored format names used by the Node tier", () => {
    for (const f of ["EAN_13", "EAN_8", "UPC_A", "UPC_E", "CODE_128", "QR_CODE"]) {
      expect(isSupportedBarcodeFormat(f)).toBe(true);
    }
  });

  it("rejects unsupported formats", () => {
    expect(isSupportedBarcodeFormat("DATAMATRIX")).toBe(false);
  });
});
