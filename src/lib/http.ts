import { ErrorCodes, errorToHttp } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type ApiEnvelope<T> = {
  success: true;
  data: T;
  error: null;
  meta: Record<string, unknown> | null;
};

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
