/**
 * Client-side canvas image preprocessing for OCR & Barcode recognition.
 */

export interface PreprocessOptions {
  grayscale?: boolean;
  contrast?: number; // e.g. 1.2 to 2.0
  threshold?: number; // 0..255 or null
  maxDimension?: number;
  rotation?: number; // 0, 90, 180, 270
}

/**
 * Loads an image (Blob / File / HTMLImageElement / URL string) into an HTMLCanvasElement
 * and applies preprocessing transformations.
 */
export async function preprocessImageCanvas(
  source: Blob | File | string | HTMLImageElement,
  options: PreprocessOptions = {}
): Promise<HTMLCanvasElement> {
  const {
    grayscale = true,
    contrast = 1.3,
    threshold,
    maxDimension = 1600,
    rotation = 0,
  } = options;

  let img: HTMLImageElement;
  let objectUrl: string | null = null;

  if (source instanceof HTMLImageElement) {
    img = source;
  } else {
    img = new Image();
    if (typeof source === "string") {
      img.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
  }

  // Determine scaled dimensions
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  // Handle canvas sizing under rotation
  const canvas = document.createElement("canvas");
  const isRotated90or270 = rotation === 90 || rotation === 270;
  canvas.width = isRotated90or270 ? height : width;
  canvas.height = isRotated90or270 ? width : height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw new Error("Could not get 2D canvas context for preprocessing.");
  }

  ctx.save();
  // Move origin to center for rotation
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(
    img,
    -width / 2,
    -height / 2,
    width,
    height
  );
  ctx.restore();

  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }

  // Apply pixel manipulation (grayscale, contrast, thresholding)
  if (grayscale || contrast !== 1.0 || threshold !== undefined) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (grayscale) {
        const avg = 0.299 * r + 0.587 * g + 0.114 * b;
        r = avg;
        g = avg;
        b = avg;
      }

      if (contrast !== 1.0) {
        r = factor * (r - 128) + 128;
        g = factor * (g - 128) + 128;
        b = factor * (b - 128) + 128;
      }

      if (threshold !== undefined) {
        const val = r > threshold ? 255 : 0;
        r = val;
        g = val;
        b = val;
      }

      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }

    ctx.putImageData(imgData, 0, 0);
  }

  return canvas;
}
