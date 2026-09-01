import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

class MemoryCache implements Cache {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
    try {
      return JSON.parse(hit.value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value: JSON.stringify(value), expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

let redis: import("ioredis").Redis | null = null;
let redisFailed = false;

async function redisClient(): Promise<import("ioredis").Redis | null> {
  if (!config.redisUrl) return null;
  if (redis) return redis;
  if (redisFailed) return null;
  try {
    const { default: Redis } = await import("ioredis");
    redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
    await redis.connect();
    return redis;
  } catch (error) {
    redisFailed = true;
    logger.warn("redis_unavailable_falling_back_to_memory", { error: String(error) });
    return null;
  }
}

class RedisCache implements Cache {
  private memory = new MemoryCache();

  async get<T>(key: string): Promise<T | null> {
    const client = await redisClient();
    if (!client) return this.memory.get<T>(key);
    try {
      const raw = await client.get(`fg:${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return this.memory.get<T>(key);
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = await redisClient();
    if (!client) return this.memory.set(key, value, ttlSeconds);
    try {
      await client.set(`fg:${key}`, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      this.memory.set(key, value, ttlSeconds);
    }
  }

  async del(key: string): Promise<void> {
    const client = await redisClient();
    if (!client) return this.memory.del(key);
    try {
      await client.del(`fg:${key}`);
    } catch {
      this.memory.del(key);
    }
  }
}

let instance: Cache | null = null;

export function getCache(): Cache {
  if (!instance) instance = config.redisUrl ? new RedisCache() : new MemoryCache();
  return instance;
}
