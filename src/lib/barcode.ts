/**
 * Stable public API for barcode functionality.
 * Facade for low-level decoder implementation.
 */

import {
  decodeBarcodeFromImage as lowLevelDecode,
  validateBarcode as lowLevelValidate,
  isSupportedBarcodeFormat as lowLevelIsSupported
} from "./barcode/decoder";

/**
 * Validates checksums and structure for standard barcodes (EAN-13, EAN-8, UPC-A, UPC-E).
 */
export const validateBarcode = lowLevelValidate;

/**
 * Checks if the format is supported by FoodGaurd.
 */
export const isSupportedBarcodeFormat = lowLevelIsSupported;

/**
 * Decodes barcode from an image file/blob.
 */
export const decodeBarcodeFromImage = lowLevelDecode;

/**
 * Supported barcode formats for display/config.
 */
export const SUPPORTED_FORMATS = [
  "EAN_13",
  "EAN_8",
  "UPC_A",
  "UPC_E",
  "CODE_128",
  "QR_CODE"
];

/**
 * Dynamic import for ZXing browser reader to keep bundle size small
 * and avoid server-side issues.
 */
export async function getBarcodeReader() {
  if (typeof window === "undefined") return null;
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

  return new BrowserMultiFormatReader(hints);
}
