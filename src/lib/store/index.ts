import { createRequire } from "node:module";
import type { DataStore } from "./types";
import type * as PrismaStoreModule from "./prisma";
import { InMemoryStore } from "./memory";
import { isMockMode, config } from "@/lib/config";
import { logger } from "@/lib/logger";

let instance: DataStore | null = null;

/**
 * Loads the Prisma store module.
 *
 * The production bundle injects a `require` (see the tsup banner) and esbuild
 * resolves the literal call below at build time. Plain ESM — the `tsx` dev
 * server — has no `require`, so fall back to a module-scoped one bound to
 * this file.
 */
function loadPrismaModule(): typeof PrismaStoreModule {
  if (typeof require === "function") {
    return require("./prisma") as typeof PrismaStoreModule;
  }
  return createRequire(import.meta.url)("./prisma") as typeof PrismaStoreModule;
}

/**
 * Returns the active data store.
 *  - PRODUCTION (DATABASE_URL set): PostgreSQL via Prisma (Supabase)
 *  - In-memory fixtures are available only to tests.
 */
export function getStore(): DataStore {
  if (instance) return instance;
  if (process.env.NODE_ENV === "test") {
    logger.info("test_fixture_store_active");
    instance = new InMemoryStore();
  } else {
    if (!config.databaseUrl) {
      throw new Error("Product database is not configured. Set DATABASE_URL to a real database.");
    }
    const mod = loadPrismaModule();
    instance = new mod.PrismaStore();
  }
  return instance;
}

export async function ensureDemoUsers(): Promise<void> {
  // Demo accounts carry a published admin password. Never create them in
  // production, even if SEED_DEMO_DATA was left enabled by mistake.
  if (process.env.NODE_ENV === "production") return;
  if (!isMockMode() && config.seed.enabled) {
    try {
      // Lazy-load Prisma client
      
      const { prisma } = loadPrismaModule();
      const existing = await prisma.user.count();
      if (existing === 0) {
        const { hashPassword } = await import("@/lib/auth");
        const admin = await prisma.user.create({
          data: {
            email: config.seed.adminEmail.toLowerCase(),
            name: "FoodGaurd Admin",
            passwordHash: await hashPassword(config.seed.adminPassword),
            role: "ADMIN",
          },
        });
        await prisma.user.create({
          data: {
            email: config.seed.userEmail.toLowerCase(),
            name: "Demo User",
            passwordHash: await hashPassword(config.seed.userPassword),
            role: "USER",
          },
        });
        logger.info("demo_users_created", { adminId: admin.id });
      }
    } catch (error) {
      logger.warn("demo_users_creation_skipped", { error: String(error) });
    }
  }
}
