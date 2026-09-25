-- FoodGuard Module 2: levels + achievements.
--
-- No level table: a level is a pure function of the existing lifetime XP
-- total, so the stored XP stays the single source of truth and the two cannot
-- drift apart.
CREATE TABLE "AchievementDefinition" (
    "achievementId" TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "description"   TEXT NOT NULL,
    "icon"          TEXT NOT NULL DEFAULT '🏅',
    "conditionType" TEXT NOT NULL,
    "targetValue"   INTEGER NOT NULL,
    "rewardXp"      INTEGER NOT NULL DEFAULT 0,
    "enabled"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementDefinition_pkey" PRIMARY KEY ("achievementId")
);

CREATE TABLE "UserAchievement" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "xpAwarded"     INTEGER NOT NULL DEFAULT 0,
    "unlockedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- Unlocking twice is impossible, so concurrent requests cannot pay the reward
-- twice. This is the idempotency anchor for the whole unlock flow.
CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key"
    ON "UserAchievement"("userId", "achievementId");

CREATE INDEX "UserAchievement_userId_unlockedAt_idx"
    ON "UserAchievement"("userId", "unlockedAt");

CREATE INDEX "AchievementDefinition_conditionType_enabled_idx"
    ON "AchievementDefinition"("conditionType", "enabled");

ALTER TABLE "UserAchievement"
    ADD CONSTRAINT "UserAchievement_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAchievement"
    ADD CONSTRAINT "UserAchievement_achievementId_fkey"
    FOREIGN KEY ("achievementId") REFERENCES "AchievementDefinition"("achievementId")
    ON DELETE CASCADE ON UPDATE CASCADE;
