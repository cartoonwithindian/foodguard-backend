import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { AppError, ErrorCodes } from "@/lib/errors";

export type OCRProgressCallback = (status: string, progress?: number) => void;

export type OCRResult = {
  rawText: string;
  confidence: number | null; // 0..1 or null when provider doesn't report confidence
  needsReview: boolean;
  /** Which provider actually produced the result */
  provider: string;
  /** True when the primary provider failed and fallback was used */
  fallbackUsed: boolean;
};

export interface OCRProvider {
  extractText(
    image: Blob | Uint8Array,
    mimeType: string,
    onProgress?: OCRProgressCallback
  ): Promise<OCRResult>;
}

const MIME_WHITELIST = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/bmp",
];

export function validateImageMime(mimeType: string): boolean {
  return MIME_WHITELIST.includes(mimeType.toLowerCase());
}

export function maxImageBytes(): number {
  return config.limits.maxBodyMb * 1024 * 1024;
}

/* ------------------------------------------------------------------ */
/*  Validation helpers (shared by all providers)                       */
/* ------------------------------------------------------------------ */

function validateInput(image: Blob | Uint8Array, mimeType: string): void {
  if (mimeType && !validateImageMime(mimeType)) {
    throw new AppError(ErrorCodes.OCR_FAILED, "Unsupported image format", 422);
  }
  const size = image instanceof Blob ? image.size : image.byteLength;
  if (size > maxImageBytes()) {
    throw new AppError(ErrorCodes.OCR_FAILED, "Image exceeds the maximum allowed size", 422);
  }
}

/* ------------------------------------------------------------------ */
/*  MockOCRProvider                                                    */
/* ------------------------------------------------------------------ */

class MockOCRProvider implements OCRProvider {
  private cannedTexts: Record<string, string>;

  constructor() {
    this.cannedTexts = {
      "8901000000001":
        "Ingredients: Corn Flour, Palm Oil, Refined Wheat Flour (Maida), Salt, Sugar, Spices, Monosodium Glutamate (INS 621), Tartrazine (E102), Sunset Yellow (E110), TBHQ (E319). May contain traces of peanuts.",
      "8901234567891":
        "Ingredients: Oats, Soy Lecithin, Sugar, Sodium Chloride, Caffeine, Vitamin B12, Iron, Potassium.",
      "8901234567897":
        "Ingredients: Water, Sugar, High Fructose Corn Syrup, Caffeine, Taurine, Vitamin B12, Artificial Colours, Sodium Benzoate, Parfum.",
    };
  }

  async extractText(
    image: Blob | Uint8Array,
    mimeType: string,
    onProgress?: OCRProgressCallback
  ): Promise<OCRResult> {
    validateInput(image, mimeType);
    onProgress?.("Preparing image");
    onProgress?.("Loading OCR engine");
    onProgress?.("Recognizing text", 0.5);
    onProgress?.("Extracting ingredients", 0.9);
    onProgress?.("Complete", 1.0);

    return {
      rawText: "",
      confidence: 0.3,
      needsReview: true,
      provider: "mock",
      fallbackUsed: false,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  TesseractOCRProvider (Server-side Node.js fallback)                */
/* ------------------------------------------------------------------ */

class TesseractOCRProvider implements OCRProvider {
  async extractText(
    image: Blob | Uint8Array,
    mimeType: string,
    onProgress?: OCRProgressCallback
  ): Promise<OCRResult> {
    validateInput(image, mimeType);
    try {
      onProgress?.("Loading OCR engine");
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(config.ocr.lang);
      const buffer = image instanceof Blob ? Buffer.from(await image.arrayBuffer()) : Buffer.from(image);
      onProgress?.("Recognizing text");
      const result = await worker.recognize(buffer);
      await worker.terminate();
      onProgress?.("Complete");

      const confidence = (result.data.confidence || 0) / 100;
      return {
        rawText: result.data.text ?? "",
        confidence: Math.round(confidence * 100) / 100,
        needsReview: confidence < 0.6,
        provider: "tesseract",
        fallbackUsed: false,
      };
    } catch (error) {
      logger.error("ocr_tesseract_failed", { error: String(error) });
      throw new AppError(ErrorCodes.OCR_FAILED, "Tesseract OCR processing failed", 502);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  PuterOCRProvider                                                   */
/* ------------------------------------------------------------------ */

class PuterOCRProvider implements OCRProvider {
  async extractText(image: Blob | Uint8Array, mimeType: string): Promise<OCRResult> {
    validateInput(image, mimeType);

    if (!config.ocr.puterAuthToken) {
      throw new AppError(
        ErrorCodes.OCR_FAILED,
        "Puter OCR requires PUTER_AUTH_TOKEN environment variable",
        500
      );
    }

    try {
      // @ts-expect-error -- optional dependency, imported lazily at runtime
      const { init } = await import(/* webpackIgnore: true */ "@heyputer/puter.js");
      const puter = init(config.ocr.puterAuthToken);

      const buffer = image instanceof Blob ? Buffer.from(await image.arrayBuffer()) : Buffer.from(image);
      const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
      const file = new File([buffer], `label.${ext}`, { type: mimeType });

      const text = await puter.ai.img2txt(file);

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        logger.warn("ocr_puter_empty_result", { mimeType });
        return {
          rawText: "",
          confidence: null,
          needsReview: true,
          provider: "puter",
          fallbackUsed: false,
        };
      }

      return {
        rawText: text.trim(),
        confidence: null,
        needsReview: false,
        provider: "puter",
        fallbackUsed: false,
      };
    } catch (error) {
      const msg = String(error);
      logger.error("ocr_puter_failed", { error: msg });
      throw new AppError(ErrorCodes.OCR_FAILED, "Puter OCR failed", 502);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  OCRSpaceProvider (free API: https://ocr.space)                     */
/* ------------------------------------------------------------------ */

class OCRSpaceProvider implements OCRProvider {
  private readonly endpoint = "https://api.ocr.space/parse/image";

  async extractText(
    image: Blob | Uint8Array,
    mimeType: string,
    onProgress?: OCRProgressCallback
  ): Promise<OCRResult> {
    validateInput(image, mimeType);

    if (!config.ocr.apiKey) {
      throw new AppError(
        ErrorCodes.OCR_FAILED,
        "OCR.space requires OCR_API_KEY environment variable",
        500
      );
    }

    try {
      onProgress?.("Uploading image to OCR.space");
      const buffer =
        image instanceof Blob ? Buffer.from(await image.arrayBuffer()) : Buffer.from(image);

      const ext = mimeType.includes("png")
        ? "png"
        : mimeType.includes("webp")
          ? "webp"
          : "jpg";

      const form = new FormData();
      form.append("apikey", config.ocr.apiKey);
      form.append("file", new Blob([buffer], { type: mimeType }), `label.${ext}`);
      form.append("language", config.ocr.lang || "eng");
      form.append("OCREngine", "2");
      form.append("scale", "true");
      form.append("isTable", "false");
      form.append("isOverlayRequired", "false");

      const response = await fetch(this.endpoint, { method: "POST", body: form });
      const data = await response.json();

      if (!response.ok) {
        throw new AppError(
          ErrorCodes.OCR_FAILED,
          `OCR.space request failed (${response.status})`,
          502
        );
      }

      const exitCode = Number(data.OCRExitCode ?? 2);
      if (exitCode === 2) {
        const message = data.ErrorMessage?.[0]?.Message ?? "OCR.space processing failed";
        throw new AppError(ErrorCodes.OCR_FAILED, message, 502);
      }

      const parsed = data.ParsedResults?.[0];
      const text = (parsed?.ParsedText ?? "").trim();

      if (exitCode === 3 || !text) {
        return {
          rawText: "",
          confidence: null,
          needsReview: true,
          provider: "ocrspace",
          fallbackUsed: false,
        };
      }

      return {
        rawText: text,
        confidence: null,
        needsReview: false,
        provider: "ocrspace",
        fallbackUsed: false,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error("ocr_ocrspace_failed", { error: String(error) });
      throw new AppError(ErrorCodes.OCR_FAILED, "OCR.space processing failed", 502);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  FallbackOCRProvider                                                */
/* ------------------------------------------------------------------ */

class FallbackOCRProvider implements OCRProvider {
  constructor(
    private primary: OCRProvider,
    private fallback: OCRProvider,
    private primaryName: string,
    private fallbackName: string
  ) {}

  async extractText(
    image: Blob | Uint8Array,
    mimeType: string,
    onProgress?: OCRProgressCallback
  ): Promise<OCRResult> {
    let primaryResult: OCRResult | null = null;
    let primaryError: unknown = null;

    try {
      primaryResult = await this.primary.extractText(image, mimeType, onProgress);
    } catch (error) {
      if (error instanceof AppError && error.status === 422) {
        throw error;
      }
      primaryError = error;
    }

    const qualityInsufficient =
      !!primaryResult && (primaryResult.rawText ?? "").trim().length === 0;

    if (primaryResult && !qualityInsufficient) {
      return primaryResult;
    }

    if (qualityInsufficient) {
      logger.info("ocr_fallback_quality_triggered", {
        primary: this.primaryName,
        fallback: this.fallbackName,
      });
    } else {
      logger.info("ocr_fallback_triggered", {
        primary: this.primaryName,
        fallback: this.fallbackName,
        error: String(primaryError),
      });
    }

    try {
      const fallbackResult = await this.fallback.extractText(image, mimeType, onProgress);
      if ((fallbackResult.rawText ?? "").trim().length > 0) {
        return { ...fallbackResult, fallbackUsed: true };
      }
      // Fallback also produced nothing usable — keep the primary result if we have one.
      if (primaryResult) return primaryResult;
      throw primaryError ?? fallbackResult;
    } catch (fallbackError) {
      logger.error("ocr_fallback_also_failed", {
        fallback: this.fallbackName,
        error: String(fallbackError),
      });
      if (primaryResult) return primaryResult;
      throw primaryError ?? fallbackError;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Provider factory                                                   */
/* ------------------------------------------------------------------ */

let instance: OCRProvider | null = null;

function createOCRProvider(): OCRProvider {
  const provider = process.env.OCR_PROVIDER || config.ocr.provider || "mock";
  const fallback = process.env.OCR_FALLBACK || config.ocr.fallback || "tesseract";

  switch (provider) {
    case "tesseract": {
      const tesseractProvider = new TesseractOCRProvider();
      const fallbackProvider =
        fallback !== "tesseract" ? createFallbackProvider(fallback) : null;
      if (fallbackProvider) {
        return new FallbackOCRProvider(
          tesseractProvider,
          fallbackProvider,
          "tesseract",
          fallback
        );
      }
      return tesseractProvider;
    }
    case "ocrspace":
    case "ocr.space":
      return new OCRSpaceProvider();
    case "puter": {
      const puterProvider = new PuterOCRProvider();
      const fallbackProvider =
        fallback !== "puter" ? createFallbackProvider(fallback) : null;
      if (fallbackProvider) {
        return new FallbackOCRProvider(puterProvider, fallbackProvider, "puter", fallback);
      }
      return puterProvider;
    }
    case "mock":
    default:
      return new MockOCRProvider();
  }
}

function createFallbackProvider(name: string): OCRProvider | null {
  switch (name) {
    case "tesseract":
      return new TesseractOCRProvider();
    case "ocrspace":
    case "ocr.space":
      return new OCRSpaceProvider();
    case "mock":
      return new MockOCRProvider();
    default:
      return null;
  }
}

export function getOCRProvider(): OCRProvider {
  if (!instance) {
    instance = createOCRProvider();
  }
  return instance;
}

export function resetOCRProviderForTesting(): void {
  instance = null;
}

export function knownBarcodeText(barcode: string): string | null {
  if (config.ocr.provider !== "mock") return null;
  return new MockOCRProvider()["cannedTexts"][barcode] ?? null;
}
