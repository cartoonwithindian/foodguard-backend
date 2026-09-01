/**
 * Client-side browser-only OCR logic using Tesseract.js.
 * This module should only be imported in client components.
 */

import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { AppError, ErrorCodes } from "@/lib/errors";
import { OCRProvider, OCRResult, OCRProgressCallback, validateImageMime, maxImageBytes } from "./ocr";

export class ClientTesseractOCRProvider implements OCRProvider {
  async extractText(
    image: Blob | Uint8Array,
    mimeType: string,
    onProgress?: OCRProgressCallback
  ): Promise<OCRResult> {
    if (typeof window === "undefined") {
      throw new Error("ClientTesseractOCRProvider can only be used in the browser.");
    }

    // Basic validation
    if (mimeType && !validateImageMime(mimeType)) {
      throw new AppError(ErrorCodes.OCR_FAILED, "Unsupported image format", 422);
    }
    const size = image instanceof Blob ? image.size : image.byteLength;
    if (size > maxImageBytes()) {
      throw new AppError(ErrorCodes.OCR_FAILED, "Image exceeds the maximum allowed size", 422);
    }

    try {
      onProgress?.("Preparing image");
      let processSource: Blob | File | string | HTMLCanvasElement =
        image instanceof Blob ? image : new Blob([image.slice()], { type: mimeType });

      // Apply preprocessing
      try {
        const { preprocessImageCanvas } = await import("./ocr/image-preprocess");
        processSource = await preprocessImageCanvas(processSource, {
          grayscale: true,
          contrast: 1.5, // Improved contrast for OCR
          maxDimension: 1600,
        });
      } catch (e) {
        logger.warn("ocr_client_preprocessing_warning", { error: String(e) });
      }

      onProgress?.("Loading OCR engine");
      const { createWorker } = await import("tesseract.js");

      const lang = config.ocr.lang || "eng";
      const worker = await createWorker(lang, 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            onProgress?.("Recognizing text", m.progress);
          } else if (m.status === "loading tesseract core" || m.status === "loading language traineddata") {
            onProgress?.("Loading OCR engine");
          }
        },
      });

      onProgress?.("Extracting ingredients");
      const result = await worker.recognize(processSource);
      await worker.terminate();

      onProgress?.("Complete", 1);

      const confidence = (result.data.confidence || 0) / 100;
      return {
        rawText: result.data.text ?? "",
        confidence: Math.round(confidence * 100) / 100,
        needsReview: confidence < 0.6,
        provider: "tesseract-client",
        fallbackUsed: false,
      };
    } catch (error) {
      logger.error("ocr_client_tesseract_failed", { error: String(error) });
      throw new AppError(ErrorCodes.OCR_FAILED, "Client OCR recognition failed", 422);
    }
  }
}

/**
 * High-level client OCR scanner with fallback logic.
 */
export async function scanLabelClient(
  image: Blob | File,
  onProgress?: OCRProgressCallback
): Promise<OCRResult> {
  const provider = new ClientTesseractOCRProvider();
  try {
    return await provider.extractText(image, image.type, onProgress);
  } catch (err) {
    logger.warn("ocr_client_failed_falling_back_to_server", { error: String(err) });
    
    // Fallback to server API
    onProgress?.("Server fallback...");
    const formData = new FormData();
    formData.append("image", image);
    
    const response = await fetch("/api/scan/label", {
      method: "POST",
      body: formData,
    });
    
    if (!response.ok) {
      throw new AppError(ErrorCodes.OCR_FAILED, "OCR failed on both client and server");
    }
    
    const json = await response.json();
    if (!json.success || !json.ocr) {
      throw new AppError(ErrorCodes.OCR_FAILED, "Invalid server OCR response");
    }
    
    return {
      rawText: json.ocr.text,
      confidence: json.ocr.confidence,
      needsReview: json.ocr.needsReview,
      provider: json.ocr.provider + "-fallback",
      fallbackUsed: true,
    };
  }
}
