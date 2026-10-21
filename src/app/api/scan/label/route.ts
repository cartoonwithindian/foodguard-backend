import { NextRequest } from "next/server";
import { jsonSuccess, jsonError, readFormDataLimited } from "@/lib/http";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { getOCRProvider, validateImageMime, maxImageBytes } from "@/lib/ocr";
import { AppError, ErrorCodes } from "@/lib/errors";
import { parseIngredientText } from "@/lib/ingredients/parse";
import { parseNutritionTable } from "@/lib/nutrition/parse";
import { decodeBarcodeFromImage, validateBarcode } from "@/lib/barcode";
import { decodeBarcodeInNode } from "@/lib/barcode/node-decoder";
import { lookupProductByBarcode } from "@/lib/product-lookup";
import { searchByVector, searchSimilarByImage } from "@/lib/visual-search";
import { storeTempImage } from "@/lib/temp-images";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/**
 * The visual search service is called with the uploaded bytes as multipart
 * form data, so it never has to reach back into this process. An earlier
 * version instead hosted the photo at a short-lived `GET /api/temp/:id` URL and
 * handed that URL over, which silently returned zero matches whenever this
 * process was not publicly reachable (e.g. `localhost`).
 */

/** Filename extension for an upload mime, used for the multipart filename. */
function extFor(mimeType: string): string {
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("gif")) return ".gif";
  return ".jpg";
}

/**
 * POST /api/scan/label
 * Accepts a multipart image (and optional barcode/productName fields),
 * runs OCR + Barcode detection in parallel, supporting partial success.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`scan:${clientIp(request)}`);

    // Cap the raw multipart body before Node buffers it: `formData()` alone
    // would accept everything the global middleware allows (and handlers used
    // outside that middleware have no limit at all).
    let form: FormData;
    try {
      form = await readFormDataLimited(request, maxImageBytes() + 1024 * 1024);
    } catch (error) {
      if (error instanceof AppError) throw error;
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

    // Host the upload for a short window (10-minute TTL) at a stable,
    // same-origin URL. The visual-search service fetches the absolute form,
    // and the browser displays the relative form on the analysis page so the
    // user sees the exact photo they scanned. The TTL sweep owns cleanup.
    const tempId = storeTempImage(buffer, mimeType);
    const tempImageUrl = `/api/temp/${tempId}`;

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
        const storedProduct = await getStore().getProductByBarcode(p.barcode);
        productObj = {
          id: storedProduct?.id ?? "",
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

    // 1b. Visual-similarity fallback. When the image has a detectable barcode
    // but no product could be matched (or no barcode at all), ask the visual
    // search service for top-K similar products so the caller can still
    // suggest candidates. Browser CLIP embeddings go to `search_by_vector`;
    // otherwise the raw bytes are streamed to `search` as multipart.
    //
    // The bytes are uploaded directly rather than handing over a URL, because a
    // URL can only work if this process is reachable from the visual-search
    // service. That is true behind a public tunnel but false for `localhost`
    // (and for any private/internal host), where the remote service would get
    // an address it cannot fetch and the whole feature would silently return
    // zero matches. Never throws and never blocks the scan.
    if (!productObj && buffer) {
      try {
        const vis = embedding
          ? await searchByVector(embedding, 5)
          : await searchSimilarByImage(buffer, `upload${extFor(mimeType)}`, mimeType, 5);
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

    // 3. Partial success validation: If both barcode and OCR failed, return a
    //    clear 422 error — UNLESS the visual search produced similar-product
    //    candidates. A photo with no readable barcode/ingredient text can
    //    still be rescued by "did you mean one of these?" visual matches, so
    //    those results must not be discarded.
    const hasVisualCandidates = Array.isArray(similarProducts) && similarProducts.length > 0;
    if (barcodeStatus !== "success" && ocrStatus !== "success" && !hasVisualCandidates) {
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
        // Same-origin URL of the uploaded photo (10-minute TTL) so the UI can
        // show the user the exact image they scanned.
        imageUrl: tempImageUrl,
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
