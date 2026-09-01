import type { DataStore } from "./types";
import { InMemoryStore } from "./memory";
import { isMockMode, config } from "@/lib/config";
import { logger } from "@/lib/logger";

let instance: DataStore | null = null;

/**
 * Returns the active data store.
 *  - PRODUCTION (DATABASE_URL set): PostgreSQL via Prisma (Supabase)
 *  - MOCK MODE (no DATABASE_URL): seeded in-memory store
 */
export function getStore(): DataStore {
  if (instance) return instance;
  if (isMockMode()) {
    logger.info("mock_mode_in_memory_store", { reason: "DATABASE_URL not set" });
    instance = new InMemoryStore();
  } else {
    // Lazy-load PrismaStore to avoid schema validation when using mock mode
    
    const mod = require("./prisma") as { PrismaStore: new () => DataStore };
    instance = new mod.PrismaStore();
  }
  return instance;
}

export async function ensureDemoUsers(): Promise<void> {
  if (!isMockMode() && config.seed.enabled) {
    try {
      // Lazy-load Prisma client
      
      const { prisma } = require("./prisma");
      const existing = await prisma.user.count();
      if (existing === 0) {
        const { hashPassword } = await import("@/lib/auth");
        const admin = await prisma.user.create({
          data: {
            email: config.seed.adminEmail,
            name: "FoodGaurd Admin",
            passwordHash: await hashPassword(config.seed.adminPassword),
            role: "ADMIN",
          },
        });
        await prisma.user.create({
          data: {
            email: config.seed.userEmail,
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
