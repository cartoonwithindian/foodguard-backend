-- Align the gamification tables with Prisma's `@updatedAt` semantics.
--
-- The two hand-written gamification migrations created `updatedAt` with
-- `DEFAULT CURRENT_TIMESTAMP`, while schema.prisma declares `@updatedAt`
-- (Prisma writes the value in application code and generates the column
-- *without* a database default). On a fresh chain the baseline runs first and
-- those CREATE TABLE statements are no-ops, so this only bites databases
-- provisioned before the baseline migration — exactly the databases that ran
-- the old two-migration chain. Dropping the default is non-destructive and
-- safe to run on databases that never had it.

ALTER TABLE "UserGamification" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "ChallengeDefinition" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "UserChallenge" ALTER COLUMN "updatedAt" DROP DEFAULT;
