/**
 * Barcode utilities: validation, format checking, and ZXing decoding pipeline.
 */

export interface BarcodeResult {
  value: string;
  format: string;
  confidence?: number;
}

/**
 * Validate checksums and structure for standard barcodes (EAN-13, EAN-8, UPC-A, UPC-E).
 */
export function validateBarcode(barcode: string): boolean {
  const clean = barcode.trim();
  if (!/^\d{8,14}$/.test(clean)) {
    return false;
  }

  // Checksum calculation for EAN/UPC GTIN formats
  if ([8, 12, 13, 14].includes(clean.length)) {
    const digits = clean.split("").map(Number);
    const checksum = digits.pop()!;
    let sum = 0;
    const len = digits.length;
    for (let i = 0; i < len; i++) {
      // From right to left, alternate weights 3 and 1
      const weight = (len - i) % 2 === 1 ? 3 : 1;
      sum += digits[i] * weight;
    }
    const calculated = (10 - (sum % 10)) % 10;
    return calculated === checksum;
  }

  return true;
}

/**
 * Formats supported by FoodGaurd scanner:
 * EAN-13, EAN-8, UPC-A, UPC-E, Code 128, QR Code
 */
export function isSupportedBarcodeFormat(formatName: string): boolean {
  const upper = formatName.toUpperCase();
  return (
    upper.includes("EAN_13") ||
    upper.includes("EAN_8") ||
    upper.includes("UPC_A") ||
    upper.includes("UPC_E") ||
    upper.includes("CODE_128") ||
    upper.includes("QR_CODE") ||
    upper.includes("QRCODE") ||
    upper.includes("EAN-13") ||
    upper.includes("EAN-8") ||
    upper.includes("UPC-A") ||
    upper.includes("UPC-E") ||
    upper.includes("CODE-128")
  );
}
/**
 * Server-side (Node) decode is handled by the separate server-only module
 * `./node-decoder` (zxing-wasm + sharp) and is only wired into server entry
 * points such as /api/scan/label. Keeping the native `sharp` dependency out of
 * this shared module guarantees the client browser bundle never traces it.
 */
export async function decodeBarcodeFromImage(
  imageSource: Blob | File | string
): Promise<BarcodeResult | null> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const { BrowserMultiFormatReader, BarcodeFormat } = await import("@zxing/browser");
    const { DecodeHintType } = await import("@zxing/library");

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.QR_CODE,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints);

    // Pass 1: Direct decode
    let imgElement: HTMLImageElement | null = null;
    let objectUrl: string | null = null;

    try {
      imgElement = new Image();
      if (typeof imageSource === "string") {
        imgElement.src = imageSource;
      } else {
        objectUrl = URL.createObjectURL(imageSource);
        imgElement.src = objectUrl;
      }

      await new Promise((resolve, reject) => {
        if (!imgElement) return reject(new Error("Image element not initialized"));
        imgElement.onload = resolve;
        imgElement.onerror = reject;
      });

      const res = await reader.decodeFromImageElement(imgElement);
      if (res && res.getText()) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return {
          value: res.getText(),
          format: res.getBarcodeFormat().toString(),
        };
      }
    } catch {
      // Direct decode failed, proceed to preprocessing passes
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }

    // Dynamic import preprocessing helper
    const { preprocessImageCanvas } = await import("../ocr/image-preprocess");

    // Pass retry configurations
    const retryConfigs = [
      { grayscale: true, contrast: 1.5, maxDimension: 1200, rotation: 0 },
      { grayscale: true, contrast: 2.0, threshold: 128, maxDimension: 1200, rotation: 0 },
      { grayscale: true, contrast: 1.3, maxDimension: 1200, rotation: 90 },
      { grayscale: true, contrast: 1.3, maxDimension: 1200, rotation: 270 },
      { grayscale: true, contrast: 1.3, maxDimension: 1200, rotation: 180 },
    ];

    for (const config of retryConfigs) {
      try {
        const canvas = await preprocessImageCanvas(imageSource, config);
        const res = await reader.decodeFromCanvas(canvas);
        if (res && res.getText()) {
          return {
            value: res.getText(),
            format: res.getBarcodeFormat().toString(),
          };
        }
      } catch {
        // Continue to next pass
      }
    }

    return null;
  } catch (err) {
    console.error("[BarcodeDecoder] Error during image barcode decode:", err);
    return null;
  }
}
