import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { getOCRProvider, validateImageMime, maxImageBytes } from "@/lib/ocr";
import { AppError, ErrorCodes } from "@/lib/errors";
import { parseIngredientText } from "@/lib/ingredients/parse";
import { parseNutritionTable } from "@/lib/nutrition/parse";
import { getSession } from "@/lib/auth";
import { decodeBarcodeFromImage, validateBarcode } from "@/lib/barcode";
import { decodeBarcodeInNode } from "@/lib/barcode/node-decoder";
import { lookupProductByBarcode } from "@/lib/product-lookup";
import { searchByVector, searchSimilarByImage } from "@/lib/visual-search";

export const runtime = "nodejs";

/**
 * POST /api/scan/label
 * Accepts a multipart image (and optional barcode/productName fields),
 * runs OCR + Barcode detection in parallel, supporting partial success.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`scan:${clientIp(request)}`);
    await getSession(request);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "Expected a multipart/form-data body with an image file (field 'image')"
      );
    }
    const image = form.get("image");
    // Optional client-side CLIP embedding (512 floats) for visual similarity
    // search. When present, the backend-only FAISS `search_by_vector` is used;
    // browser embedding keeps the FastAPI service free of torch/GPU.
    const rawEmbedding = (form.get("embedding") as string | null) ?? "";
    let embedding: number[] | null = null;
    if (rawEmbedding) {
      try {
        const parsed = JSON.parse(rawEmbedding);
        if (
          Array.isArray(parsed) &&
          parsed.length === 512 &&
          parsed.every((v) => typeof v === "number" && Number.isFinite(v))
        ) {
          embedding = parsed;
        }
      } catch {
        embedding = null; // ignore malformed embedding; skip visual search
      }
    }
    const inputBarcode = (form.get("barcode") as string | null)?.trim() || undefined;
    const productName = (form.get("productName") as string | null)?.trim() || undefined;
    const detectBarcodeParam = form.get("detectBarcode") !== "false";

    if (!image || typeof image === "string" || !("arrayBuffer" in image)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "An image file is required (field 'image')");
    }

    const mimeType = image.type || "application/octet-stream";
    if (!validateImageMime(mimeType)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        "Unsupported image type. Use JPEG, PNG, WEBP, or HEIC."
      );
    }
    if (image.size > maxImageBytes()) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Image exceeds the maximum allowed size");
    }

    // Prepare buffer
    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const blob = new Blob([buffer], { type: mimeType });

    // Pipeline results
    let detectedBarcodeValue: string | null = inputBarcode || null;
    let detectedBarcodeFormat: string | null = null;
    let barcodeStatus: "success" | "not_found" | "failed" = inputBarcode ? "success" : "not_found";

    let rawText = "";
    let confidence: number | null = null;
    let needsReview = false;
    let ocrProviderName = "mock";
    let fallbackUsed = false;
    let ocrStatus: "success" | "failed" = "failed";

    let ingredientsText: string | null = null;
    let nutritionText: string | null = null;
    let ingredients: string[] = [];
    let nutrition: Record<string, unknown> | null = null;
    let productObj: Record<string, unknown> | null = null;
    const sourcesSet = new Set<string>();
    // Visually-similar products (CLIP + FAISS), filled in as a fallback when a
    // barcode is present but cannot be matched to a product (or is absent).
    let similarProducts = null;

    // 1. Run Barcode Detection (if not provided and requested)
    if (detectBarcodeParam && !detectedBarcodeValue) {
      try {
        // Server-side Node decode (zxing-wasm + sharp). decodeBarcodeInNode
        // is server-only and never throws; falls back to the browser decoder
        // (which returns null in Node) if unavailable.
        const decoded =
          (await decodeBarcodeInNode(blob as Blob)) ??
          (await decodeBarcodeFromImage(blob));
        if (decoded && decoded.value) {
          detectedBarcodeValue = decoded.value;
          detectedBarcodeFormat = decoded.format;
          barcodeStatus = "success";
          sourcesSet.add("barcode");
        }
      } catch (err) {
        console.error("[LabelRoute] Barcode detection error:", err);
        barcodeStatus = "failed";
      }
    } else if (detectedBarcodeValue) {
      barcodeStatus = "success";
      sourcesSet.add("barcode");
    }

    // Product Lookup (independent of OCR) — uses the fallback chain and
    // passes OCR/product-name context so the last-resort OCR+google step
    // can attempt identification.
    if (detectedBarcodeValue && validateBarcode(detectedBarcodeValue)) {
      const outcome = await lookupProductByBarcode(detectedBarcodeValue, {
        context: { productName: productName ?? undefined },
      });
      if (outcome.success && outcome.product) {
        const p = outcome.product;
        productObj = {
          id: "",
          name: p.name ?? "",
          brand: p.brand ?? null,
          category: (p.category as "food" | "cosmetics" | "personal_care" | "household" | "other") ?? "food",
          barcode: p.barcode,
          source: p.source,
          confidence: p.confidence,
        };
        sourcesSet.add(outcome.source);
      }
    }

    // 1b. Visual-similarity fallback (browser CLIP embeds, backend FAISS
    // searches). When the image has a detectable barcode but no product could
    // be matched (or no barcode at all), ask the visual search service for
    // top-K similar products so the caller can still suggest candidates.
    // Never throws and never blocks the scan on an unavailable service.
    if (!productObj && blob) {
      try {
        const vis = embedding
          ? await searchByVector(embedding, 5)
          : await searchSimilarByImage(new Uint8Array(buffer), "label.png", mimeType, 5);
        if (vis.ok && vis.results.length > 0) {
          similarProducts = vis.results.slice(0, 5);
          sourcesSet.add("visual_search");
        }
      } catch (visErr) {
        console.error("[LabelRoute] Visual search error:", visErr);
      }
    }

    // 2. Run OCR Detection
    try {
      const provider = getOCRProvider();
      const ocrResult = await provider.extractText(blob, mimeType);
      rawText = ocrResult.rawText;
      confidence = ocrResult.confidence;
      needsReview = ocrResult.needsReview;
      ocrProviderName = ocrResult.provider;
      fallbackUsed = ocrResult.fallbackUsed;

      if (rawText && rawText.trim().length > 0) {
        ocrStatus = "success";
        sourcesSet.add("ocr");
        const parsed = parseIngredientText(rawText);
        ingredientsText = parsed.listText;
        ingredients = parsed.ingredients;
        const table = parseNutritionTable(rawText);
        nutritionText = table ? JSON.stringify(table.nutrients) : null;
        nutrition = table ? table.nutrients : null;
      }
    } catch (ocrErr) {
      console.error("[LabelRoute] OCR processing error:", ocrErr);
      ocrStatus = "failed";
    }

    // 3. Partial success validation: If both failed, return clear 422 error
    if (barcodeStatus !== "success" && ocrStatus !== "success") {
      throw new AppError(
        ErrorCodes.OCR_FAILED,
        "Neither barcode nor readable ingredient text could be detected from the provided image. Please try a clearer, well-lit photo.",
        422
      );
    }

    return jsonSuccess(
      {
        success: true,
        barcode: {
          value: detectedBarcodeValue,
          format: detectedBarcodeFormat,
          status: barcodeStatus,
        },
        ocr: {
          text: rawText,
          status: ocrStatus,
          confidence,
          needsReview,
          provider: ocrProviderName,
          fallbackUsed,
        },
        ingredients,
        nutrition,
        product: productObj,
        similarProducts,
        sources: Array.from(sourcesSet),
        productName: productName ?? null,
        // Legacy fields for backward compatibility
        rawText,
        ingredientsText,
        nutritionText,
      },
      { requestId }
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
