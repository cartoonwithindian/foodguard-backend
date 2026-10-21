// Centralized typed error codes for the whole API.
export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  INGREDIENT_NOT_FOUND: "INGREDIENT_NOT_FOUND",
  BARCODE_NOT_FOUND: "BARCODE_NOT_FOUND",
  OCR_FAILED: "OCR_FAILED",
  AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR",
  EXTERNAL_PROVIDER_ERROR: "EXTERNAL_PROVIDER_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  DATABASE_ERROR: "DATABASE_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_EMAIL_EXISTS: "AUTH_EMAIL_EXISTS",
  CONFLICT: "CONFLICT",
  CONVERSATION_NOT_FOUND: "CONVERSATION_NOT_FOUND",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const STATUS_FOR_CODE: Record<ErrorCode, number> = {
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.PRODUCT_NOT_FOUND]: 404,
  [ErrorCodes.INGREDIENT_NOT_FOUND]: 404,
  [ErrorCodes.BARCODE_NOT_FOUND]: 404,
  [ErrorCodes.OCR_FAILED]: 422,
  [ErrorCodes.AI_PROVIDER_ERROR]: 502,
  [ErrorCodes.EXTERNAL_PROVIDER_ERROR]: 502,
  [ErrorCodes.RATE_LIMITED]: 429,
  [ErrorCodes.PAYLOAD_TOO_LARGE]: 413,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.UNKNOWN_ERROR]: 500,
  [ErrorCodes.AUTH_INVALID_CREDENTIALS]: 401,
  [ErrorCodes.AUTH_EMAIL_EXISTS]: 409,
  [ErrorCodes.CONFLICT]: 409,
  [ErrorCodes.CONVERSATION_NOT_FOUND]: 404,
};

export function errorToHttp(
  error: unknown,
): { status: number; body: { success: false; data: null; error: { code: string; message: string }; meta: unknown } } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        success: false,
        data: null,
        error: { code: error.code, message: error.message },
        meta: error.details ?? null,
      },
    };
  }

  // Prisma known request errors (P2002 unique violation etc.) are plain
  // objects with `code` + `message`, so they would otherwise fall into the
  // branch below and echo the raw driver message (table/column names) to the
  // caller. Map the ones we understand to stable API errors and hide the rest.
  if (
    error &&
    typeof error === "object" &&
    typeof (error as { code?: unknown }).code === "string" &&
    /^P\d{4}$/.test((error as { code: string }).code)
  ) {
    const code = (error as { code: string }).code;
    if (code === "P2002") {
      return {
        status: 409,
        body: {
          success: false,
          data: null,
          error: { code: ErrorCodes.CONFLICT, message: "A record with these details already exists" },
          meta: null,
        },
      };
    }
    return {
      status: 500,
      body: {
        success: false,
        data: null,
        error: { code: ErrorCodes.DATABASE_ERROR, message: "A database error occurred" },
        meta: null,
      },
    };
  }

  // Plain { code, message } objects (used by route-level validation helpers).
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    const plain = error as { code: ErrorCode | string; message: string };
    const known = Object.values(ErrorCodes).includes(plain.code as ErrorCode);
    return {
      status: known ? STATUS_FOR_CODE[plain.code as ErrorCode] : 400,
      body: {
        success: false,
        data: null,
        error: { code: plain.code, message: plain.message },
        meta: null,
      },
    };
  }

  // Zod validation errors
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: Array<{ path: (string | number)[]; message: string }> }).issues ?? [];
    const message =
      issues.length > 0
        ? issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid request payload";
    return {
      status: 400,
      body: {
        success: false,
        data: null,
        error: { code: ErrorCodes.VALIDATION_ERROR, message },
        meta: null,
      },
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      data: null,
      error: { code: ErrorCodes.UNKNOWN_ERROR, message: "An unexpected error occurred" },
      meta: null,
    },
  };
}
