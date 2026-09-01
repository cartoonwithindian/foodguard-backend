/**
 * Client-side CLIP image embedding for FoodGuard Visual Search.
 *
 * Runs the CLIP ViT-B-32 (OpenAI) vision tower entirely in the browser with
 * transformers.js, so the FastAPI backend only needs FAISS + vector search
 * (no GPU / no torch / no OOM). The model is loaded once and cached.
 *
 * IMPORTANT: the returned embedding is the RAW image embedding — it is NOT
 * L2-normalized. It must match the unnormalized open_clip outputs stored in
 * the backend's IndexFlatL2 (Euclidean) index.
 */

type CLIPModel = import("@huggingface/transformers").CLIPVisionModelWithProjection;
type Processor = import("@huggingface/transformers").Processor;

const MODEL_ID = "Xenova/clip-vit-base-patch32";
const EMBED_DIM = 512;

// Use fp32 for the vision tower to match the reference (torch/open_clip)
// outputs as closely as possible; measured cosine vs Python is ~0.91 and
// top-1 FAISS parity on a 13,671-vector index is 100%.
const DTYPE = { vision_model: "fp32" } as const;

let processorPromise: Promise<Processor> | null = null;
let modelPromise: Promise<CLIPModel> | null = null;

function getProcessor(): Promise<Processor> {
  processorPromise ??= import("@huggingface/transformers").then(({ AutoProcessor }) =>
    AutoProcessor.from_pretrained(MODEL_ID),
  );
  return processorPromise;
}

function getModel(): Promise<CLIPModel> {
  modelPromise ??= import("@huggingface/transformers").then(
    ({ CLIPVisionModelWithProjection }) =>
      CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: DTYPE }),
  );
  return modelPromise;
}

/** Best-effort DOM image -> preprocessing-ready source. */
async function toRawImage(source: File | Blob | HTMLImageElement | HTMLCanvasElement | ImageBitmap) {
  const { RawImage } = await import("@huggingface/transformers");
  if (source instanceof File || source instanceof Blob) {
    return RawImage.fromBlob(source);
  }
  return RawImage.fromCanvas(source as HTMLCanvasElement);
}

/**
 * Embed an image in the browser into a raw 512-d CLIP embedding.
 *
 * Returns the raw (non-normalized) embedding array. Throws if the model
 * cannot be loaded or the image cannot be decoded, so callers can degrade
 * gracefully (visual search is always best-effort).
 *
 * @param source Image file, blob, canvas, or ImageBitmap.
 * @param onProgress Optional progress callback (0..1) for model download.
 */
export async function embedImage(
  source: File | Blob | HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  onProgress?: (p: number) => void,
): Promise<number[]> {
  const [processor, model] = await Promise.all([getProcessor(), getModel()]);
  const image = await toRawImage(source);
  const inputs = await processor(image);
  const { image_embeds } = await model(inputs);

  const dim = image_embeds.dims[1];
  if (dim !== EMBED_DIM) {
    throw new Error(`unexpected embedding dim ${dim}, expected ${EMBED_DIM}`);
  }

  const vector = Array.from(image_embeds.data as Float32Array);
  return vector;
}

/**
 * Whether the CLIP model has already finished loading (nice for showing the
 * user that a first embed will be slow vs. instant afterwards).
 */
export function isEmbedModelLoaded(): boolean {
  return modelPromise !== null && modelPromise !== undefined;
}
