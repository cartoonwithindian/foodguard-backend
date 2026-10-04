-- FoodGuard Module 3: deterministic daily/weekly challenge instances.
-- This migration creates configuration and instance storage only. It inserts
-- no user progress, completions, or XP rows.

ALTER TABLE "GamificationActivity"
  ADD COLUMN IF NOT EXISTS "ingredientId" TEXT;

CREATE TABLE IF NOT EXISTS "ChallengeDefinition" (
    "challengeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "challengeType" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "xpReward" INTEGER NOT NULL,
    "startRule" TEXT NOT NULL,
    "endRule" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChallengeDefinition_pkey" PRIMARY KEY ("challengeId")
);

CREATE TABLE IF NOT EXISTS "UserChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "rewardClaimed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserChallenge_userId_challengeId_periodStart_key"
    ON "UserChallenge"("userId", "challengeId", "periodStart");
CREATE INDEX IF NOT EXISTS "UserChallenge_userId_completed_idx"
    ON "UserChallenge"("userId", "completed");
CREATE INDEX IF NOT EXISTS "UserChallenge_userId_periodStart_idx"
    ON "UserChallenge"("userId", "periodStart");
CREATE INDEX IF NOT EXISTS "UserChallenge_periodStart_periodEnd_idx"
    ON "UserChallenge"("periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "ChallengeDefinition_challengeType_enabled_idx"
    ON "ChallengeDefinition"("challengeType", "enabled");
CREATE INDEX IF NOT EXISTS "GamificationActivity_userId_ingredientId_idx"
    ON "GamificationActivity"("userId", "ingredientId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserChallenge_userId_fkey'
    ) THEN
        ALTER TABLE "UserChallenge"
            ADD CONSTRAINT "UserChallenge_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserChallenge_challengeId_fkey'
    ) THEN
        ALTER TABLE "UserChallenge"
            ADD CONSTRAINT "UserChallenge_challengeId_fkey"
            FOREIGN KEY ("challengeId") REFERENCES "ChallengeDefinition"("challengeId")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
