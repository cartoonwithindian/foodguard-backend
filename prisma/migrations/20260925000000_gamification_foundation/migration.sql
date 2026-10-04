-- FoodGuard Module 1: durable XP + daily streak state.
-- This migration adds no seed/activity rows. Rows are created only by a
-- validated successful product-scan transaction.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS "UserGamification" (
    "userId" TEXT NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGamification_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "GamificationActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "activityDate" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "GamificationActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserGamification_lastActivityDate_idx"
    ON "UserGamification"("lastActivityDate");
CREATE UNIQUE INDEX IF NOT EXISTS "GamificationActivity_userId_eventId_key"
    ON "GamificationActivity"("userId", "eventId");
CREATE INDEX IF NOT EXISTS "GamificationActivity_userId_activityDate_idx"
    ON "GamificationActivity"("userId", "activityDate");
CREATE INDEX IF NOT EXISTS "GamificationActivity_userId_productId_idx"
    ON "GamificationActivity"("userId", "productId");
CREATE INDEX IF NOT EXISTS "GamificationActivity_userId_actionType_idx"
    ON "GamificationActivity"("userId", "actionType");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserGamification_userId_fkey'
    ) THEN
        ALTER TABLE "UserGamification"
            ADD CONSTRAINT "UserGamification_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'GamificationActivity_userId_fkey'
    ) THEN
        ALTER TABLE "GamificationActivity"
            ADD CONSTRAINT "GamificationActivity_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'GamificationActivity_productId_fkey'
    ) THEN
        ALTER TABLE "GamificationActivity"
            ADD CONSTRAINT "GamificationActivity_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
