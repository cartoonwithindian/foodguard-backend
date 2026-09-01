/**
 * Client-side persistence layer (IndexedDB in the browser, in-memory in
 * tests / non-browser environments).
 *
 * This module is safe to import anywhere: it never touches the `indexedDB`
 * global at module-evaluation time. The IndexedDB adapter is only created on
 * first use, in a browser context, and cache callers must tolerate errors
 * (e.g. private-mode IndexedDB failures) by falling back to memory or by
 * degrading gracefully to the network path.
 *
 * Keep this isolated from server-only modules (`import "node:crypto"`, `fs`,
 * Prisma) so it can be bundled into client components.
 */

export interface StorageRecord {
  /** Epoch ms of the last write. */
  updatedAt: number;
  /** Epoch ms after which the record must not be served. */
  expiresAt: number;
  /** Schema/format version for invalidation. */
  version: number;
}

export interface StorageAdapter {
  get<T>(store: string, key: string): Promise<T | null>;
  set<T>(store: string, key: string, value: T): Promise<void>;
  del(store: string, key: string): Promise<void>;
  getAll<T>(store: string): Promise<Array<{ key: string; value: T }>>;
  clear(store: string): Promise<void>;
  /** Whether durable persistence is available in this environment. */
  supported(): boolean;
}

export const DB_NAME = "foodguard-cache";
export const DB_VERSION = 2;
export const STORE_PRODUCTS = "products";
export const STORE_ANALYSIS = "analysis";
export const STORE_IMAGES = "images";
export const STORE_QUEUE = "queue";
export const STORE_CATALOG = "catalog";
export const STORES = [STORE_PRODUCTS, STORE_ANALYSIS, STORE_IMAGES, STORE_QUEUE, STORE_CATALOG];

/** In-memory adapter. Used by tests and as a fallback when IndexedDB is unavailable. */
export class MemoryStorageAdapter implements StorageAdapter {
  private db = new Map<string, Map<string, unknown>>();
  private durable: boolean;

  /**
   * `durable` mirrors IndexedDB semantics: only durable storage should power
   * the local-first resolution cache, so the default (non-durable) memory
   * fallback keeps the network path in non-browser environments. Tests opt in
   * by constructing `new MemoryStorageAdapter(true)`.
   */
  constructor(durable = false) {
    this.durable = durable;
  }

  private store(name: string): Map<string, unknown> {
    let s = this.db.get(name);
    if (!s) {
      s = new Map<string, unknown>();
      this.db.set(name, s);
    }
    return s;
  }

  async get<T>(store: string, key: string): Promise<T | null> {
    const value = this.store(store).get(key);
    return (value as T) ?? null;
  }

  async set<T>(store: string, key: string, value: T): Promise<void> {
    this.store(store).set(key, value);
  }

  async del(store: string, key: string): Promise<void> {
    this.store(store).delete(key);
  }

  async getAll<T>(store: string): Promise<Array<{ key: string; value: T }>> {
    const s = this.store(store);
    return Array.from(s.entries()).map(([key, value]) => ({ key, value: value as T }));
  }

  async clear(store: string): Promise<void> {
    this.store(store).clear();
  }

  supported(): boolean {
    return this.durable;
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Durable IndexedDB adapter for browsers. */
export class IndexedDBStorageAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;

  supported(): boolean {
    return typeof indexedDB !== "undefined";
  }

  private open(): Promise<IDBDatabase> {
    if (!this.supported()) {
      return Promise.reject(new Error("IndexedDB is not available in this environment"));
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of STORES) {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name);
            }
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
      });
    }
    return this.dbPromise;
  }

  async withStore<T>(
    storeName: string,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | undefined,
  ): Promise<T | undefined> {
    const db = await this.open();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = fn(store);
      Promise.all([transactionDone(tx), req ? requestToPromise(req) : Promise.resolve(undefined)])
        .then(() => resolve(req === undefined ? undefined : (req.result as T)))
        .catch(reject);
    });
  }

  async get<T>(store: string, key: string): Promise<T | null> {
    const result = (await this.withStore<T>(store, "readonly", (s) => s.get(key))) as T | undefined;
    return result ?? null;
  }

  async set<T>(store: string, key: string, value: T): Promise<void> {
    await this.withStore(store, "readwrite", (s) => s.put(value, key));
  }

  async del(store: string, key: string): Promise<void> {
    await this.withStore(store, "readwrite", (s) => s.delete(key));
  }

  async getAll<T>(store: string): Promise<Array<{ key: string; value: T }>> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      const keysReq = tx.objectStore(store).getAllKeys();
      Promise.all([transactionDone(tx), requestToPromise(req), requestToPromise(keysReq)])
        .then(() => {
          const values = (req.result as unknown[]) ?? [];
          const keys = (keysReq.result as unknown[]) ?? [];
          resolve(values.map((value, i) => ({ key: String(keys[i]), value: value as T })));
        })
        .catch(reject);
    });
  }

  async clear(store: string): Promise<void> {
    await this.withStore(store, "readwrite", (s) => s.clear());
  }
}

let adapter: StorageAdapter | null = null;

const memoryFallback = new MemoryStorageAdapter();

/**
 * Get the active storage adapter. In browsers this is IndexedDB (with a
 * durable in-memory fallback if IndexedDB is unavailable or broken); anywhere
 * else it is the memory adapter.
 */
export function getStorage(): StorageAdapter {
  if (adapter) return adapter;
  if (typeof indexedDB !== "undefined") {
    adapter = new IndexedDBStorageAdapter();
  } else {
    adapter = memoryFallback;
  }
  return adapter;
}

/** Test hook: inject a controlled adapter (e.g. MemoryStorageAdapter). */
export function setStorageForTesting(next: StorageAdapter | null): void {
  adapter = next;
}

/** Test hook: reset to the default browser/memory behavior. */
export function resetStorageForTesting(): void {
  adapter = null;
}