/**
 * FSSAI Analysis Result Cache
 *
 * Caches FSSAI regulatory analysis results to avoid redundant computation
 * when the alternative engine evaluates multiple candidate products.
 *
 * Cache key includes a knowledge-base version hash so stale results are
 * automatically invalidated when the FSSAI data files change.
 */

import { statSync } from "fs";
import { join } from "path";
import { getCache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import type { FSSAIAnalysisResult } from "@/services/regulatory/fssai";

const FSSAI_DIR = join(process.cwd(), "fssai-knowledge-base");

/** Files that define the FSSAI knowledge-base version. */
const KB_FILES = [
  "additives.json",
  "additive_permissions.json",
  "contaminants.json",
  "labelling_rules.json",
  "claim_rules.json",
  "packaging_rules.json",
  "special_food_rules.json",
];

const CACHE_PREFIX = "fssai-result:";
const CACHE_TTL = 24 * 3600; // 24 hours
const VERSION_CACHE_KEY = "fssai-kb-version";
const VERSION_CACHE_TTL = 3600; // recompute version every hour

/**
 * Compute a lightweight version fingerprint of the FSSAI knowledge base.
 * Uses file sizes and mtime rather than content hashing for speed.
 */
function computeKBVersion(): string {
  const parts: string[] = [];
  for (const file of KB_FILES) {
    try {
      const stat = statSync(join(FSSAI_DIR, file));
      parts.push(`${file}:${stat.size}:${Math.floor(stat.mtimeMs / 1000)}`);
    } catch {
      parts.push(`${file}:missing`);
    }
  }
  return parts.join("|");
}

/**
 * Get the current KB version, cached to avoid repeated stat calls.
 */
async function getKBVersion(): Promise<string> {
  const cache = getCache();
  const cached = await cache.get<string>(VERSION_CACHE_KEY);
  if (cached) return cached;

  const version = computeKBVersion();
  await cache.set(VERSION_CACHE_KEY, version, VERSION_CACHE_TTL);
  return version;
}

/**
 * Build a cache key for a specific product's FSSAI analysis.
 */
function buildCacheKey(productId: string, kbVersion: string): string {
  return `${CACHE_PREFIX}${productId}:${kbVersion}`;
}

/**
 * Try to retrieve a cached FSSAI result for a product.
 * Returns null on cache miss or version mismatch.
 */
export async function getCachedFSSAIResult(
  productId: string,
): Promise<FSSAIAnalysisResult | null> {
  try {
    const cache = getCache();
    const kbVersion = await getKBVersion();
    const key = buildCacheKey(productId, kbVersion);
    const result = await cache.get<FSSAIAnalysisResult>(key);
    if (result) {
      logger.debug("fssai_cache_hit", { productId });
    }
    return result;
  } catch (error) {
    logger.warn("fssai_cache_read_failed", { productId, error: String(error) });
    return null;
  }
}

/**
 * Store an FSSAI result in the cache.
 */
export async function setCachedFSSAIResult(
  productId: string,
  result: FSSAIAnalysisResult,
): Promise<void> {
  try {
    const cache = getCache();
    const kbVersion = await getKBVersion();
    const key = buildCacheKey(productId, kbVersion);
    await cache.set(key, result, CACHE_TTL);
    logger.debug("fssai_cache_set", { productId });
  } catch (error) {
    logger.warn("fssai_cache_write_failed", { productId, error: String(error) });
  }
}

/**
 * Invalidate all cached FSSAI results by clearing the version key.
 * Next access will recompute the version and miss all old caches.
 */
export async function invalidateFSSAICache(): Promise<void> {
  try {
    const cache = getCache();
    await cache.del(VERSION_CACHE_KEY);
    logger.info("fssai_cache_invalidated");
  } catch (error) {
    logger.warn("fssai_cache_invalidation_failed", { error: String(error) });
  }
}

/**
 * Get the current KB version string (for testing/debugging).
 */
export async function getFSSAIKBVersion(): Promise<string> {
  return getKBVersion();
}
