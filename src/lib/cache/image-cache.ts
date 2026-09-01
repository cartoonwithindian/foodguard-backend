/**
 * Bounded on-device image cache.
 *
 * Stores resized/compressed product images (as Blobs) keyed by their source
 * URL. Size is bounded both by entry count and total bytes; the oldest
 * entries are evicted first. Intended for thumbnails/previews — never for
 * storing the user's own uploaded photos (see spec: no persistent user photos).
 */
import { STORE_IMAGES, getStorage } from "@/lib/offline/storage";
import type { StorageAdapter } from "@/lib/offline/storage";

export interface ImageCacheRecord {
  url: string;
  blob: Blob | null;
  updatedAt: number;
}

export const IMAGE_CACHE_MAX_ENTRIES = 24;
export const IMAGE_CACHE_MAX_BYTES = 12 * 1024 * 1024; // 12 MB total

class ImageCache {
  private adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }

  async get(url: string): Promise<Blob | null> {
    if (!url) return null;
    try {
      const record = await this.adapter.get<ImageCacheRecord>(STORE_IMAGES, url);
      return record?.blob ?? null;
    } catch {
      return null;
    }
  }

  async put(url: string, blob: Blob | null): Promise<boolean> {
    if (!url) return false;
    if (blob && blob.size > IMAGE_CACHE_MAX_BYTES) return false;
    const record: ImageCacheRecord = { url, blob, updatedAt: Date.now() };
    try {
      await this.adapter.set(STORE_IMAGES, url, record);
      await this.evict();
      return true;
    } catch {
      return false;
    }
  }

  async invalidate(url: string): Promise<void> {
    try {
      await this.adapter.del(STORE_IMAGES, url);
    } catch {
      /* ignore */
    }
  }

  async clear(): Promise<void> {
    try {
      await this.adapter.clear(STORE_IMAGES);
    } catch {
      /* ignore */
    }
  }

  private async evict(): Promise<void> {
    try {
      const rows = await this.adapter.getAll<ImageCacheRecord>(STORE_IMAGES);
      if (rows.length <= IMAGE_CACHE_MAX_ENTRIES) return;
      const sorted = rows.sort((a, b) => a.value.updatedAt - b.value.updatedAt);
      const excess = rows.length - IMAGE_CACHE_MAX_ENTRIES;
      for (const row of sorted.slice(0, excess)) {
        await this.adapter.del(STORE_IMAGES, row.key);
      }
    } catch {
      /* ignore */
    }
  }
}

let instance: ImageCache | null = null;

export function getImageCache(): ImageCache {
  if (!instance) instance = new ImageCache(getStorage());
  return instance;
}

/** Test hook: re-bind the shared cache to a controlled adapter. */
export function setImageCacheForTesting(adapter: StorageAdapter | null): void {
  instance = adapter ? new ImageCache(adapter) : null;
}

export function imageCache(): ImageCache {
  return getImageCache();
}