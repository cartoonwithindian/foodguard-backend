import { AppError, ErrorCodes } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Minimal JSON fetch helper for external public data providers.
 * Applies a timeout, a browser-like User-Agent, and maps transport /
 * HTTP failures to a typed EXTERNAL_PROVIDER_ERROR.
 *
 * API keys are never logged and never leaked to callers of these helpers;
 * they are embedded only in the outbound request.
 */
export async function fetchExternalJson<T>(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "FoodGaurdAI/0.1 (hackathon demo)",
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new AppError(
        ErrorCodes.EXTERNAL_PROVIDER_ERROR,
        `External provider returned HTTP ${response.status}`,
        502,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.warn("external_provider_fetch_failed", {
      url: redactUrl(url),
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(
      ErrorCodes.EXTERNAL_PROVIDER_ERROR,
      "External data provider is unreachable",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("api_key")) parsed.searchParams.set("api_key", "[REDACTED]");
    return parsed.toString();
  } catch {
    return "[unparseable]";
  }
}
