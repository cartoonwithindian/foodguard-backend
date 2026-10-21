import { AppError, ErrorCodes, errorToHttp } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type ApiEnvelope<T> = {
  success: true;
  data: T;
  error: null;
  meta: Record<string, unknown> | null;
};

/** Default JSON cap. Handlers that accept larger payloads opt in explicitly. */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;

function payloadTooLarge(maxBytes: number): AppError {
  return new AppError(
    ErrorCodes.PAYLOAD_TOO_LARGE,
    `Request body exceeds the ${Math.ceil(maxBytes / 1024)} KB limit`,
    413,
  );
}

/**
 * Reads a request body with a hard byte cap, so handlers that run outside the
 * Hono `bodyLimit` middleware (unit tests, alternative hosts) still cannot be
 * forced to buffer an unbounded payload. `content-length` is only a fast path;
 * the stream is counted as well because the header can be absent or lie.
 */
export async function readRequestBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw payloadTooLarge(maxBytes);
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw payloadTooLarge(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const merged = new Uint8Array(total) as Uint8Array<ArrayBuffer>;
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * Parses a JSON request body with a size cap.
 *
 * `request.json()` throws a `SyntaxError` on malformed JSON, which has no
 * mapping in `errorToHttp` and therefore surfaced as a 500 UNKNOWN_ERROR.
 * Route handlers should use this helper so a malformed body is a 400
 * VALIDATION_ERROR like any other bad input, and an oversized one is a 413.
 */
export async function parseJsonBody(
  request: Request,
  options: { maxBytes?: number } = {},
): Promise<unknown> {
  const bytes = await readRequestBytes(request, options.maxBytes ?? MAX_JSON_BODY_BYTES);
  const text = new TextDecoder().decode(bytes);
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Request body must be valid JSON", 400);
  }
}

/**
 * Parses `multipart/form-data` after buffering at most `maxBytes`. Node's
 * `request.formData()` buffers the whole body before any per-field size check,
 * so the cap has to be applied to the raw bytes first.
 */
export async function readFormDataLimited(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.toLowerCase().includes("multipart/form-data")) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      "Expected a multipart/form-data body with an image file (field 'image')",
    );
  }
  const bytes = await readRequestBytes(request, maxBytes);
  return await new Response(bytes, {
    headers: { "content-type": contentType },
  }).formData();
}

export function jsonSuccess<T>(data: T, meta: Record<string, unknown> | null = null): Response {
  return Response.json({ success: true, data, error: null, meta } satisfies ApiEnvelope<T>);
}

export function jsonError(error: unknown, requestId: string): Response {
  const { status, body } = errorToHttp(error);
  const meta = {
    ...(body.meta ? { details: body.meta } : {}),
    requestId,
  };
  const finalBody = {
    success: false,
    data: null,
    error: body.error,
    meta,
  };
  if (status >= 500) {
    logger.error("request_failed", {
      requestId,
      code: body.error.code,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return Response.json(finalBody, { status });
}

// We reference ErrorCodes here so consumers can import codes from this module too.
export { ErrorCodes };
