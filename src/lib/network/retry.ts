/**
 * Transient-failure classification + retry with exponential backoff.
 *
 * Only transient failures are retried: connection resets/timeouts and
 * server-side temporary errors (408/429/5xx). Never retry client mistakes or
 * not-found conditions (4xx) — those are handled by the resolution layer.
 */

export function isTransientError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof Error && /abort/i.test(error.name)) return false;
  // fetch() rejects with TypeError on connection failure / DNS / reset.
  return true;
}

export function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export function backoffDelayMs(attempt: number, opts: RetryOptions = {}): number {
  const base = opts.baseDelayMs ?? 300;
  const max = opts.maxDelayMs ?? 3000;
  return Math.min(max, base * 2 ** Math.max(0, attempt - 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn`, retrying only transient failures up to `retries` additional
 * attempts with exponential backoff. Non-transient errors propagate
 * immediately.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions & { retries?: number } = {},
): Promise<T> {
  const { retries = 2 } = options;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (!isTransientError(error) || attempt >= retries) throw error;
      attempt++;
      await sleep(backoffDelayMs(attempt, options));
    }
  }
}