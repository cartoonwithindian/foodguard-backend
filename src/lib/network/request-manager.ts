/**
 * HTTP helpers for the local-first resolution layer:
 * per-request timeouts, transient retries, and in-flight dedup so the same
 * barcode / search / photo request is never fired twice concurrently.
 */
import { isRetryableStatus, isTransientError, backoffDelayMs, sleep } from "./retry";

/** Thrown when a request exceeds its timeout (as opposed to user-cancelled). */
export class RequestTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export type HttpRequestOptions = {
  timeoutMs?: number;
  retries?: number;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  signal?: AbortSignal;
  /** When set, concurrent identical requests share the same in-flight promise. */
  dedupeKey?: string;
};

export function fetchWithTimeout(
  url: string | URL | Request,
  init: RequestInit = {},
  timeoutMs: number,
): Promise<Response> {
  // Plain GET (no body/headers/custom signal): keep the fetch() call in its
  // single-argument form and enforce the timeout via a race instead of a
  // signal — callers that need cancellation pass an external signal or body.
  const bare =
    (init.method === undefined || init.method === "GET") &&
    init.body === undefined &&
    init.headers === undefined &&
    init.signal === undefined;
  if (bare) {
    if (timeoutMs <= 0) return fetch(url);
    const fetchLeg = fetch(url);
    fetchLeg.catch(() => undefined); // swallow late rejections after race loses
    return Promise.race([
      fetchLeg,
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new RequestTimeoutError(timeoutMs)), timeoutMs),
      ),
    ]);
  }

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const external = init.signal ?? undefined;

  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return fetch(url, { ...init, signal: controller.signal })
    .catch((error) => {
      if (controller.signal.aborted && !external?.aborted) {
        throw new RequestTimeoutError(timeoutMs);
      }
      throw error;
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}

const inflight = new Map<string, Promise<unknown>>();

export function withDedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

export function cancelInflight(key: string): void {
  inflight.delete(key);
}

export function hasInflight(key: string): boolean {
  return inflight.has(key);
}

export type HttpOptions = {
  timeoutMs?: number;
  retries?: number;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  signal?: AbortSignal;
  dedupeKey?: string;
};

/**
 * GET/POST helper with timeout + transient retry + optional dedup.
 * Returns the final Response (`.ok` / `.status` reflect the last attempt).
 */
export async function httpJson(url: string | URL, options: HttpOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const retries = options.retries ?? 1;
  const maxAttempts = retries + 1;
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body,
    signal: options.signal,
  };

  const run = () => fetchWithTimeout(url, init, timeoutMs);

  const attempt = async (): Promise<Response> => {
    let lastError: unknown = null;
    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
      try {
        const response = await run();
        if (
          response.status < 400 ||
          !isRetryableStatus(response.status) ||
          attemptNumber >= maxAttempts
        ) {
          return response;
        }
        lastError = new Error(`Retryable status ${response.status}`);
        await sleep(backoffDelayMs(attemptNumber));
      } catch (error) {
        lastError = error;
        if (!isTransientError(error) || attemptNumber >= maxAttempts) throw error;
        await sleep(backoffDelayMs(attemptNumber));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };

  return options.dedupeKey ? withDedup(options.dedupeKey, attempt) : attempt();
}