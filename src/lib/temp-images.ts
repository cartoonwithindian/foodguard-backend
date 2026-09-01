/**
 * Short-lived in-memory image host.
 *
 * The scan pipeline receives an uploaded product photo as a multipart buffer,
 * but the visual search service resolves candidates by fetching an image URL
 * (`/api/v1/search_by_url`). This module stores the raw bytes for a few
 * minutes behind an opaque random id so the backend can expose a public
 * `GET /api/temp/:id` URL that the visual search service can fetch.
 *
 * Entries live in process memory (single Render instance), expire via a lazy
 * TTL sweep, and are deleted as soon as the scan finishes using them.
 */

const TTL_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

// The data is always a fresh `new Uint8Array(...)` view over ArrayBuffer, so
// type it as such to satisfy Response's BodyInit.
interface TempImage {
  data: Uint8Array<ArrayBuffer>;
  mimeType: string;
  expiresAt: number;
}

const images = new Map<string, TempImage>();

function sweep(): void {
  const now = Date.now();
  for (const [id, entry] of images) {
    if (entry.expiresAt <= now) images.delete(id);
  }
}

// `unref` so the timer never keeps the process alive on its own.
const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
if (typeof timer.unref === "function") timer.unref();

/** Store image bytes and return the random id (NOT yet a full URL). */
export function storeTempImage(data: ArrayBuffer | Uint8Array, mimeType: string): string {
  sweep();
  const id = crypto.randomUUID();
  // Defensive copy into an exact ArrayBuffer-backed view (Buffer-safe).
  const source = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
  const bytes = new Uint8Array(new ArrayBuffer(source.byteLength));
  bytes.set(source);
  images.set(id, { data: bytes, mimeType: mimeType || "application/octet-stream", expiresAt: Date.now() + TTL_MS });
  return id;
}

/** Resolve a stored temp image, or undefined once expired/cleaned up. */
export function getTempImage(id: string): { data: Uint8Array<ArrayBuffer>; mimeType: string } | undefined {
  const entry = images.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    images.delete(id);
    return undefined;
  }
  return { data: entry.data, mimeType: entry.mimeType };
}

/** Remove a stored temp image (called once the scan is done with it). */
export function deleteTempImage(id: string): void {
  images.delete(id);
}