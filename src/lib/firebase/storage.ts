/**
 * Firebase Storage helpers (browser only). Scan/uploaded images are stored at
 * scans/{uid}/{timestamp}.jpg and protected by storage.rules.
 */

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  type FirebaseStorage,
} from "firebase/storage";
import { getFirebaseApp } from "./client";

function storage(): FirebaseStorage | null {
  if (typeof window === "undefined") return null;
  const app = getFirebaseApp();
  return app ? getStorage(app) : null;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Upload an image Blob/File to the user's scan folder and return its URL. */
export async function firebaseUploadScanImage(
  uid: string,
  blob: Blob,
): Promise<string | null> {
  const s = storage();
  if (!s) return null;
  const ext = EXT_BY_MIME[blob.type] ?? "jpg";
  const path = `scans/${uid}/${Date.now()}.${ext}`;
  const fileRef = ref(s, path);
  await uploadBytes(fileRef, blob, { contentType: blob.type || "image/jpeg" });
  return getDownloadURL(fileRef);
}