import { config } from "@/lib/config";
import { AppError, ErrorCodes } from "@/lib/errors";
import { logger } from "@/lib/logger";

interface RateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number }>;
}

class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async check(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }
    if (bucket.count >= limit) {
      return { allowed: false, remaining: 0 };
    }
    bucket.count += 1;
    return { allowed: true, remaining: limit - bucket.count };
  }
}

let redis: import("ioredis").Redis | null = null;
let redisFailed = false;

class RedisRateLimiter implements RateLimiter {
  private memory = new MemoryRateLimiter();

  async check(key: string, limit: number, windowMs: number) {
    if (!config.redisUrl || redisFailed) return this.memory.check(key, limit, windowMs);
    try {
      if (!redis) {
        const { default: Redis } = await import("ioredis");
        redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
        await redis.connect();
      }
      const id = `fg:rl:${key}`;
      const current = await redis.incr(id);
      if (current === 1) await redis.pexpire(id, windowMs);
      if (current > limit) {
        await redis.pexpire(id, windowMs);
        return { allowed: false, remaining: 0 };
      }
      return { allowed: true, remaining: Math.max(0, limit - current) };
    } catch (error) {
      redisFailed = true;
      logger.warn("redis_rate_limit_fallback_memory", { error: String(error) });
      return this.memory.check(key, limit, windowMs);
    }
  }
}

let limiter: RateLimiter | null = null;

function getLimiter(): RateLimiter {
  if (!limiter) limiter = new RedisRateLimiter();
  return limiter;
}

/**
 * Applies the global rate limit for an identifier (usually the IP address).
 * Throws RATE_LIMITED when the limit is exceeded.
 */
export async function enforceRateLimit(key: string): Promise<void> {
  const result = await getLimiter().check(key, config.limits.rateLimitMax, config.limits.rateLimitWindowMs);
  if (!result.allowed) {
    throw new AppError(ErrorCodes.RATE_LIMITED, "Too many requests. Please try again shortly.", 429);
  }
}

/** @returns the client IP from a Next.js request, falling back to "unknown". */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
