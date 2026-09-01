/**
 * Helper to validate image upload inputs (MIME, size, empty files)
 */

export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/bmp",
];

export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export function validateImageFile(file: File | Blob): ImageValidationResult {
  if (!file || file.size === 0) {
    return { valid: false, error: "The selected file is empty or corrupted." };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { valid: false, error: "Image file exceeds maximum allowed size of 8 MB." };
  }

  const type = file.type?.toLowerCase() || "";
  const name = (file as File).name?.toLowerCase() || "";

  const isSupportedMime = SUPPORTED_IMAGE_TYPES.includes(type);
  const hasSupportedExt = /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/.test(name);

  if (!isSupportedMime && !hasSupportedExt && type !== "") {
    return {
      valid: false,
      error: "Unsupported image format. Please upload JPG, PNG, WEBP, or HEIC.",
    };
  }

  return { valid: true };
}
