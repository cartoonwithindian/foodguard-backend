-- FoodGuard Module 4: streak protection + rewards.
-- This migration creates storage only. It inserts no protections, no usage
-- rows, and no rewards: a new user must start with a genuinely empty
-- inventory, and nothing here may fabricate one.

CREATE TABLE IF NOT EXISTS "UserStreakProtection" (
    "userId" TEXT NOT NULL,
    "availableCount" INTEGER NOT NULL DEFAULT 0,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserStreakProtection_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "StreakProtectionUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "protectedDate" TEXT NOT NULL,
    "streakBefore" INTEGER NOT NULL,
    "streakAfter" INTEGER NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    CONSTRAINT "StreakProtectionUsage_pkey" PRIMARY KEY ("id")
);

-- A protection is consumed at most once per missed calendar date. This is the
-- database-level guarantee behind idempotent protection usage: a retry, a
-- refresh, or two concurrent requests cannot both bridge the same day.
CREATE UNIQUE INDEX IF NOT EXISTS "StreakProtectionUsage_userId_protectedDate_key"
    ON "StreakProtectionUsage"("userId", "protectedDate");

CREATE INDEX IF NOT EXISTS "StreakProtectionUsage_userId_idx"
    ON "StreakProtectionUsage"("userId");

CREATE INDEX IF NOT EXISTS "StreakProtectionUsage_userId_usedAt_idx"
    ON "StreakProtectionUsage"("userId", "usedAt");

CREATE TABLE IF NOT EXISTS "RewardDefinition" (
    "rewardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "rewardValue" INTEGER NOT NULL,
    "autoClaim" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RewardDefinition_pkey" PRIMARY KEY ("rewardId")
);

CREATE TABLE IF NOT EXISTS "UserReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "milestoneKey" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserReward_pkey" PRIMARY KEY ("id")
);

-- One row per user per milestone. A one-time reward uses the reward id as its
-- milestone key; a repeatable one appends the value reached, so re-earning the
-- same milestone is a no-op while a genuinely new milestone still records.
CREATE UNIQUE INDEX IF NOT EXISTS "UserReward_userId_milestoneKey_key"
    ON "UserReward"("userId", "milestoneKey");

CREATE INDEX IF NOT EXISTS "UserReward_userId_earnedAt_idx"
    ON "UserReward"("userId", "earnedAt");

CREATE INDEX IF NOT EXISTS "UserReward_userId_rewardId_idx"
    ON "UserReward"("userId", "rewardId");

ALTER TABLE "UserStreakProtection"
    ADD CONSTRAINT "UserStreakProtection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StreakProtectionUsage"
    ADD CONSTRAINT "StreakProtectionUsage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserReward"
    ADD CONSTRAINT "UserReward_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
