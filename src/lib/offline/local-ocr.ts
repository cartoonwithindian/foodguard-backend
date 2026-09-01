/**
 * Minimal pure-client OCR for the offline photo path.
 *
 * Uses Tesseract.js directly (no server dependency), with the same
 * preprocessing the server pipeline applies. Imported dynamically so the
 * heavy engine is only pulled in when a photo is actually processed offline.
 */

export type LocalOCRResult = {
  text: string;
  confidence: number;
  truncated: boolean;
};

export async function recognizeLocal(
  blob: Blob | File,
  onProgress?: (status: string, progress?: number) => void,
): Promise<LocalOCRResult | null> {
  if (typeof window === "undefined") return null;

  let text = "";
  let confidence = 0;
  try {
    onProgress?.("Preparing image");
    const { preprocessImageCanvas } = await import("@/lib/ocr/image-preprocess");
    let source: Blob | HTMLCanvasElement = blob;
    try {
      source = await preprocessImageCanvas(blob, {
        grayscale: true,
        contrast: 1.5,
        maxDimension: 1600,
      });
    } catch {
      source = blob;
    }

    onProgress?.("Loading OCR engine");
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") onProgress?.("Recognizing text", m.progress);
        else if (m.status === "loading tesseract core" || m.status === "loading language traineddata") {
          onProgress?.("Loading OCR engine");
        }
      },
    });
    try {
      onProgress?.("Extracting ingredients");
      const result = await worker.recognize(source);
      text = result.data.text ?? "";
      confidence = (result.data.confidence ?? 0) / 100;
    } finally {
      await worker.terminate().catch(() => undefined);
    }
  } catch {
    return null;
  }

  return {
    text,
    confidence: Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100,
    truncated: text.length > 4000,
  };
}