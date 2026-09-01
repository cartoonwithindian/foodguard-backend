/**
 * Sync manager: replays the offline queue when connectivity returns.
 *
 * Combines {@link Subscription} to network-quality changes with a processed
 * list of {@link processor}s. Listening starts/stopping is idempotent — safe
 * to call from components even when storage isn't available (e.g. SSR).
 */
import { subscribeNetwork } from "@/lib/network/network-status";
import { getSyncQueue } from "@/lib/offline/sync-queue";
import type { QueueProcessor, QueuedOperation } from "@/lib/offline/sync-queue";

const processors = new Map<string, QueueProcessor>();

export function registerProcessor(type: string, processor: QueueProcessor): void {
  processors.set(type, processor);
}

export function unregisterProcessor(type: string): void {
  processors.delete(type);
}

export function hasProcessor(type: string): boolean {
  return processors.has(type);
}

export function processorFor(type: string): QueueProcessor | undefined {
  return processors.get(type);
}

let unsubscribe: (() => void) | null = null;
let flushing = false;

function route(op: QueuedOperation): Promise<void> | void {
  const processor = processors.get(op.type);
  if (!processor) throw new Error(`No processor registered for "${op.type}"`);
  return processor(op);
}

export async function flushPending(): Promise<{ ok: number; failed: number }> {
  if (flushing) return { ok: 0, failed: 0 };
  flushing = true;
  try {
    return await getSyncQueue().process(route);
  } finally {
    flushing = false;
  }
}

/**
 * Start listening for reconnection and flush any queued ops. Idempotent.
 * Returns a stop function (safe to call).
 */
export function startSyncManager(): () => void {
  if (unsubscribe) return unsubscribe;
  unsubscribe = subscribeNetwork((quality) => {
    if (quality !== "offline") {
      void flushPending();
    }
  });
  // Flush anything queued on startup if we're already online.
  if (processors.size > 0) {
    void flushPending();
  }
  return () => {
    unsubscribe?.();
    unsubscribe = null;
  };
}

export function stopSyncManager(): void {
  unsubscribe?.();
  unsubscribe = null;
}