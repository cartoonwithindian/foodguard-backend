import type { DataStore } from "./types";
import { InMemoryStore } from "./memory";
import { isMockMode, config } from "@/lib/config";
import { logger } from "@/lib/logger";

let instance: DataStore | null = null;

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
