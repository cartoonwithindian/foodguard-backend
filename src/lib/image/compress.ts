/**
 * Client-side image compression for uploads.
 *
 * Shrinks + re-encodes photos on the device so slow/unstable connections are
 * not flooded with multi-MB camera frames, while keeping enough detail for the
 * OCR / barcode pipeline. Target size is adaptive to the current network
 * quality (see spec §8: ~500-800KB good, ~200-400KB slow, ~100-250KB very
 * slow). When no DOM/canvas exists (SSR, tests) the original blob passes
 * through untouched.
 */
import { getNetworkQuality, type NetworkQuality } from "@/lib/network/network-status";

export type CompressionTarget = {
  maxKb: number;
  maxDimension: number;
};

export const COMPRESSION_TARGETS: Record<NetworkQuality, CompressionTarget> = {
  fast: { maxKb: 800, maxDimension: 1600 },
  normal: { maxKb: 800, maxDimension: 1600 },
  slow: { maxKb: 400, maxDimension: 1200 },
  offline: { maxKb: 250, maxDimension: 1000 },
};

export const DEFAULT_COMPRESSION_TARGET: CompressionTarget = COMPRESSION_TARGETS.normal;

export function compressionTargetFor(quality?: NetworkQuality): CompressionTarget {
  return COMPRESSION_TARGETS[quality ?? getNetworkQuality()];
}

/** True when canvas-based compression is possible in this environment. */
export function canCompressClientSide(): boolean {
  return typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined";
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for compression"));
    };
    img.src = url;
  });
}

function drawScaled(img: HTMLImageElement, maxDimension: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Compress `blob` down to an estimated byte budget. Prefers JPEG output.
 * Returns the original blob when compression isn't possible.
 */
export async function compressImage(
  blob: Blob,
  target: CompressionTarget = DEFAULT_COMPRESSION_TARGET,
): Promise<Blob> {
  if (!canCompressClientSide() || blob.size <= target.maxKb * 1024) return blob;
  try {
    const img = await loadImage(blob);
    const canvas = drawScaled(img, target.maxDimension);

    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const out = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (out && out.size <= target.maxKb * 1024) return out;
    }

    const smallest = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.4),
    );
    return smallest ?? blob;
  } catch {
    return blob;
  }
}

/** Compress a photo for upload using the current connection quality. */
export async function compressImageForUpload(
  blob: Blob,
  quality?: NetworkQuality,
): Promise<Blob> {
  return compressImage(blob, compressionTargetFor(quality));
}