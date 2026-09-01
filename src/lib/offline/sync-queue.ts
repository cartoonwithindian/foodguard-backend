/**
 * Offline sync queue for network-required operations.
 *
 * Ops that cannot run while offline are enqueued and replayed when the
 * connection returns. This deliberately excludes silent photo uploads — we
 * never auto-upload a user's picture (spec §14 / §25): the queue is for
 * explicit user actions (e.g. reporting a product, saving a scan) that they
 * asked to be persisted.
 */
import { STORE_QUEUE, getStorage } from "@/lib/offline/storage";
import type { StorageAdapter } from "@/lib/offline/storage";

export type QueuedOperation<T = unknown> = {
  id: string;
  type: string;
  payload: T;
  createdAt: number;
  attempts: number;
};

export type QueueProcessor = (
  op: QueuedOperation,
) => Promise<void> | void;

const MAX_ATTEMPTS = 5;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}`;
}

class SyncQueue {
  private adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  async enqueue<T>(type: string, payload: T): Promise<QueuedOperation<T>> {
    const op: QueuedOperation<T> = {
      id: nextId(),
      type,
      payload,
      createdAt: Date.now(),
      attempts: 0,
    };
    try {
      await this.adapter.set(STORE_QUEUE, op.id, op);
    } catch {
      /* swap queue persistence failure — op is dropped */
    }
    return op;
  }

  async list(): Promise<QueuedOperation[]> {
    try {
      const rows = await this.adapter.getAll<QueuedOperation>(STORE_QUEUE);
      return rows.map((r) => r.value);
    } catch {
      return [];
    }
  }

  async pending(): Promise<number> {
    return (await this.list()).length;
  }

  async process(processor: QueueProcessor): Promise<{ ok: number; failed: number }> {
    const ops = await this.list();
    let ok = 0;
    let failed = 0;
    for (const op of ops) {
      const success = await this.tryProcess(op, processor);
      if (success) ok++;
      else failed++;
    }
    return { ok, failed };
  }

  private async tryProcess(op: QueuedOperation, processor: QueueProcessor): Promise<boolean> {
    if (op.attempts >= MAX_ATTEMPTS) {
      await this.remove(op.id);
      return false;
    }
    try {
      await processor(op);
      await this.remove(op.id);
      return true;
    } catch {
      const updated = { ...op, attempts: op.attempts + 1 };
      try {
        await this.adapter.set(STORE_QUEUE, op.id, updated);
      } catch {
        /* ignore */
      }
      return false;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.adapter.del(STORE_QUEUE, id);
    } catch {
      /* ignore */
    }
  }

  async clear(): Promise<void> {
    try {
      await this.adapter.clear(STORE_QUEUE);
    } catch {
      /* ignore */
    }
  }
}

let instance: SyncQueue | null = null;

export function getSyncQueue(): SyncQueue {
  if (!instance) instance = new SyncQueue(getStorage());
  return instance;
}

/** Test hook: re-bind the shared queue to a controlled adapter. */
export function setSyncQueueForTesting(adapter: StorageAdapter | null): void {
  instance = adapter ? new SyncQueue(adapter) : null;
}

export function syncQueue(): SyncQueue {
  return getSyncQueue();
}