-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "Language" AS ENUM ('EN', 'HI');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "NutrientBasis" AS ENUM ('PER_100G', 'PER_SERVING');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "DocumentType" AS ENUM ('REGULATION', 'COMPENDIUM', 'AMENDMENT', 'CORRIGENDUM', 'GAZETTE_NOTIFICATION', 'DIRECTION', 'GUIDELINE', 'MANUAL', 'DRAFT', 'ADMINISTRATIVE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "DocumentRelevance" AS ENUM ('CORE', 'SPECIALIZED', 'SUPPORTING', 'ADMINISTRATIVE', 'IRRELEVANT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "DocumentStatus" AS ENUM ('CURRENT', 'AMENDED', 'SUPERSEDED', 'DRAFT', 'HISTORICAL', 'CORRIGENDUM', 'REFERENCE', 'UNKNOWN');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "AdditivePermissionStatus" AS ENUM ('PERMITTED', 'PERMITTED_WITH_CONDITIONS', 'RESTRICTED', 'NOT_PERMITTED', 'NOT_SPECIFIED', 'UNCLEAR');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "ContaminantSubstanceType" AS ENUM ('HEAVY_METAL', 'MYCOTOXIN', 'PESTICIDE_RESIDUE', 'VETERINARY_DRUG_RESIDUE', 'NATURAL_TOXIN', 'CONTAMINANT', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "authProviderId" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "language" "Language" NOT NULL DEFAULT 'EN',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vegetarian" BOOLEAN NOT NULL DEFAULT false,
    "vegan" BOOLEAN NOT NULL DEFAULT false,
    "allergies" TEXT[],
    "dietaryRestrictions" TEXT[],
    "avoidIngredients" TEXT[],
    "preferredIngredients" TEXT[],
    "healthGoals" TEXT[],
    "sensitivityPreferences" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT NOT NULL DEFAULT 'food',
    "country" TEXT,
    "servingSize" TEXT,
    "imageUrl" TEXT,
    "ingredientsRaw" TEXT NOT NULL,
    "ingredientsNormalized" TEXT[],
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "productDataConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Nutrition" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "servingSize" TEXT,
    "servingsPerContainer" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nutrition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NutritionNutrient" (
    "id" TEXT NOT NULL,
    "nutritionId" TEXT NOT NULL,
    "nutrientKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "basis" "NutrientBasis" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,

    CONSTRAINT "NutritionNutrient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Ingredient" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "insCode" TEXT,
    "eNumber" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "function" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "allergenStatus" TEXT,
    "dietaryStatus" TEXT[],
    "regulatoryStatus" TEXT NOT NULL DEFAULT 'permitted',
    "regulatoryNotes" TEXT,
    "evidenceLevel" TEXT NOT NULL DEFAULT 'insufficient',
    "isAdditive" BOOLEAN NOT NULL DEFAULT false,
    "hindiName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IngredientAlias" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasType" TEXT NOT NULL,

    CONSTRAINT "IngredientAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Evidence" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "url" TEXT,
    "sourceType" TEXT NOT NULL,
    "publicationDate" TEXT,
    "evidenceLevel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HistoryEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessmentSnapshot" JSON NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'barcode',

    CONSTRAINT "HistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserGamification" (
    "userId" TEXT NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGamification_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GamificationActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "activityDate" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "GamificationActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeDefinition_pkey" PRIMARY KEY ("challengeId")
);

-- CreateTable
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UnknownIngredient" (
    "id" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "normalizedAttempt" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedIngredientId" TEXT,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnknownIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminAction" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RegulatoryDocument" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "relevance" "DocumentRelevance" NOT NULL,
    "regulationName" TEXT,
    "regulationYear" INTEGER,
    "publicationDate" TIMESTAMP(3),
    "notificationDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "version" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "language" TEXT NOT NULL DEFAULT 'en',
    "sourceUrl" TEXT,
    "supersedes" TEXT[],
    "supersededBy" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RegulationSection" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sectionNumber" TEXT,
    "regulationNumber" TEXT,
    "tableNumber" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulationSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FoodCategory" (
    "id" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "description" TEXT,
    "chapter" TEXT,
    "regulationName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FoodProduct" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sectionNumber" TEXT,
    "categoryId" TEXT NOT NULL,
    "standardDefinition" TEXT,
    "compositionRequirements" JSONB,
    "qualityParameters" JSONB,
    "identityRequirements" JSONB,
    "purityRequirements" JSONB,
    "permittedIngredients" JSONB,
    "permittedAdditives" JSONB,
    "maximumLimits" JSONB,
    "processingRequirements" JSONB,
    "storageRequirements" JSONB,
    "packagingRequirements" JSONB,
    "labellingRequirements" JSONB,
    "exceptions" JSONB,
    "notes" JSONB,
    "sourceDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Additive" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "insNumber" TEXT,
    "additiveClass" TEXT,
    "functionalClass" TEXT[],
    "synonyms" TEXT[],
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Additive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdditivePermission" (
    "id" TEXT NOT NULL,
    "additiveId" TEXT NOT NULL,
    "foodCategoryId" TEXT,
    "status" "AdditivePermissionStatus" NOT NULL,
    "maximumLevel" TEXT,
    "unit" TEXT,
    "conditions" TEXT,
    "restrictions" TEXT[],
    "exceptions" TEXT[],
    "regulationReference" TEXT,
    "sourceDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdditivePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ContaminantLimit" (
    "id" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "substanceType" "ContaminantSubstanceType" NOT NULL,
    "foodCategory" TEXT,
    "maximumLimit" TEXT,
    "unit" TEXT,
    "samplingRequirement" TEXT,
    "applicableConditions" TEXT,
    "exceptions" TEXT[],
    "regulationReference" TEXT,
    "tableReference" TEXT,
    "sourceDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaminantLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LabellingRule" (
    "id" TEXT NOT NULL,
    "labelElement" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "appliesTo" TEXT[],
    "conditions" TEXT,
    "exceptions" TEXT[],
    "regulationReference" TEXT,
    "sectionReference" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "sourceDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabellingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClaimRule" (
    "id" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "claimType" TEXT,
    "status" TEXT,
    "conditions" TEXT[],
    "thresholds" TEXT[],
    "requiredDeclaration" TEXT,
    "prohibitedContexts" TEXT[],
    "applicableFoodCategories" TEXT[],
    "regulationReference" TEXT,
    "sourceDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PackagingRule" (
    "id" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "details" TEXT,
    "foodCategory" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "conditions" TEXT,
    "exceptions" TEXT[],
    "regulationReference" TEXT,
    "sourceDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SpecialFoodRule" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "requirement" TEXT NOT NULL,
    "foodCategoryId" TEXT,
    "conditions" TEXT,
    "exceptions" TEXT[],
    "regulationReference" TEXT,
    "sourceDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialFoodRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Amendment" (
    "id" TEXT NOT NULL,
    "originalRegulation" TEXT,
    "amendmentDocument" TEXT,
    "amendmentDate" TIMESTAMP(3),
    "notificationNumber" TEXT,
    "affectedSection" TEXT,
    "changeType" TEXT,
    "oldText" TEXT,
    "newText" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "sourceDocument" TEXT,
    "needsHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Amendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SourceReference" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "sectionId" TEXT,
    "documentType" TEXT,
    "regulation" TEXT,
    "chapter" TEXT,
    "sectionNumber" TEXT,
    "regulationNumber" TEXT,
    "tableNumber" TEXT,
    "page" TEXT,
    "paragraph" TEXT,
    "notificationNumber" TEXT,
    "notificationDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExtractionIssue" (
    "id" TEXT NOT NULL,
    "documentFilename" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "needsHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Nutrition_productId_key" ON "Nutrition"("productId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NutritionNutrient_nutritionId_nutrientKey_basis_key" ON "NutritionNutrient"("nutritionId", "nutrientKey", "basis");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Ingredient_canonicalName_key" ON "Ingredient"("canonicalName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Ingredient_eNumber_idx" ON "Ingredient"("eNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Ingredient_insCode_idx" ON "Ingredient"("insCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IngredientAlias_alias_idx" ON "IngredientAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IngredientAlias_ingredientId_alias_key" ON "IngredientAlias"("ingredientId", "alias");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Evidence_ingredientId_idx" ON "Evidence"("ingredientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HistoryEntry_userId_scannedAt_idx" ON "HistoryEntry"("userId", "scannedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserGamification_lastActivityDate_idx" ON "UserGamification"("lastActivityDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GamificationActivity_userId_activityDate_idx" ON "GamificationActivity"("userId", "activityDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GamificationActivity_userId_productId_idx" ON "GamificationActivity"("userId", "productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GamificationActivity_userId_actionType_idx" ON "GamificationActivity"("userId", "actionType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GamificationActivity_userId_ingredientId_idx" ON "GamificationActivity"("userId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GamificationActivity_userId_eventId_key" ON "GamificationActivity"("userId", "eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChallengeDefinition_challengeType_enabled_idx" ON "ChallengeDefinition"("challengeType", "enabled");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserChallenge_userId_completed_idx" ON "UserChallenge"("userId", "completed");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserChallenge_userId_periodStart_idx" ON "UserChallenge"("userId", "periodStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserChallenge_periodStart_periodEnd_idx" ON "UserChallenge"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserChallenge_userId_challengeId_periodStart_key" ON "UserChallenge"("userId", "challengeId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RegulatoryDocument_filename_key" ON "RegulatoryDocument"("filename");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegulatoryDocument_documentType_idx" ON "RegulatoryDocument"("documentType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegulatoryDocument_relevance_idx" ON "RegulatoryDocument"("relevance");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegulatoryDocument_status_idx" ON "RegulatoryDocument"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegulatoryDocument_regulationName_idx" ON "RegulatoryDocument"("regulationName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegulationSection_documentId_idx" ON "RegulationSection"("documentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegulationSection_sectionNumber_idx" ON "RegulationSection"("sectionNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FoodCategory_categoryName_key" ON "FoodCategory"("categoryName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FoodCategory_categoryName_idx" ON "FoodCategory"("categoryName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FoodProduct_categoryId_idx" ON "FoodProduct"("categoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FoodProduct_productName_idx" ON "FoodProduct"("productName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FoodProduct_sectionNumber_idx" ON "FoodProduct"("sectionNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Additive_insNumber_key" ON "Additive"("insNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Additive_name_idx" ON "Additive"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Additive_insNumber_idx" ON "Additive"("insNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Additive_additiveClass_idx" ON "Additive"("additiveClass");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdditivePermission_additiveId_idx" ON "AdditivePermission"("additiveId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdditivePermission_foodCategoryId_idx" ON "AdditivePermission"("foodCategoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdditivePermission_status_idx" ON "AdditivePermission"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AdditivePermission_additiveId_foodCategoryId_key" ON "AdditivePermission"("additiveId", "foodCategoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContaminantLimit_substance_idx" ON "ContaminantLimit"("substance");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContaminantLimit_substanceType_idx" ON "ContaminantLimit"("substanceType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContaminantLimit_foodCategory_idx" ON "ContaminantLimit"("foodCategory");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LabellingRule_labelElement_idx" ON "LabellingRule"("labelElement");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LabellingRule_mandatory_idx" ON "LabellingRule"("mandatory");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClaimRule_claim_idx" ON "ClaimRule"("claim");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClaimRule_claimType_idx" ON "ClaimRule"("claimType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClaimRule_status_idx" ON "ClaimRule"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PackagingRule_foodCategory_idx" ON "PackagingRule"("foodCategory");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PackagingRule_mandatory_idx" ON "PackagingRule"("mandatory");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SpecialFoodRule_category_idx" ON "SpecialFoodRule"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SpecialFoodRule_foodCategoryId_idx" ON "SpecialFoodRule"("foodCategoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SpecialFoodRule_subcategory_idx" ON "SpecialFoodRule"("subcategory");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Amendment_originalRegulation_idx" ON "Amendment"("originalRegulation");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Amendment_amendmentDate_idx" ON "Amendment"("amendmentDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Amendment_needsHumanReview_idx" ON "Amendment"("needsHumanReview");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SourceReference_documentId_idx" ON "SourceReference"("documentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SourceReference_sectionId_idx" ON "SourceReference"("sectionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SourceReference_regulation_idx" ON "SourceReference"("regulation");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExtractionIssue_documentFilename_idx" ON "ExtractionIssue"("documentFilename");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExtractionIssue_needsHumanReview_idx" ON "ExtractionIssue"("needsHumanReview");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExtractionIssue_resolvedAt_idx" ON "ExtractionIssue"("resolvedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatConversation_userId_updatedAt_idx" ON "ChatConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_category_idx" ON "KnowledgeDocument"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserPreference_userId_fkey'
    ) THEN
        ALTER TABLE "UserPreference"
            ADD CONSTRAINT "UserPreference_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Nutrition_productId_fkey'
    ) THEN
        ALTER TABLE "Nutrition"
            ADD CONSTRAINT "Nutrition_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NutritionNutrient_nutritionId_fkey'
    ) THEN
        ALTER TABLE "NutritionNutrient"
            ADD CONSTRAINT "NutritionNutrient_nutritionId_fkey"
            FOREIGN KEY ("nutritionId") REFERENCES "Nutrition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'IngredientAlias_ingredientId_fkey'
    ) THEN
        ALTER TABLE "IngredientAlias"
            ADD CONSTRAINT "IngredientAlias_ingredientId_fkey"
            FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Evidence_ingredientId_fkey'
    ) THEN
        ALTER TABLE "Evidence"
            ADD CONSTRAINT "Evidence_ingredientId_fkey"
            FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'HistoryEntry_userId_fkey'
    ) THEN
        ALTER TABLE "HistoryEntry"
            ADD CONSTRAINT "HistoryEntry_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'HistoryEntry_productId_fkey'
    ) THEN
        ALTER TABLE "HistoryEntry"
            ADD CONSTRAINT "HistoryEntry_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserGamification_userId_fkey'
    ) THEN
        ALTER TABLE "UserGamification"
            ADD CONSTRAINT "UserGamification_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'GamificationActivity_userId_fkey'
    ) THEN
        ALTER TABLE "GamificationActivity"
            ADD CONSTRAINT "GamificationActivity_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'GamificationActivity_productId_fkey'
    ) THEN
        ALTER TABLE "GamificationActivity"
            ADD CONSTRAINT "GamificationActivity_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserChallenge_userId_fkey'
    ) THEN
        ALTER TABLE "UserChallenge"
            ADD CONSTRAINT "UserChallenge_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserChallenge_challengeId_fkey'
    ) THEN
        ALTER TABLE "UserChallenge"
            ADD CONSTRAINT "UserChallenge_challengeId_fkey"
            FOREIGN KEY ("challengeId") REFERENCES "ChallengeDefinition"("challengeId") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AdminAction_adminId_fkey'
    ) THEN
        ALTER TABLE "AdminAction"
            ADD CONSTRAINT "AdminAction_adminId_fkey"
            FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RegulationSection_documentId_fkey'
    ) THEN
        ALTER TABLE "RegulationSection"
            ADD CONSTRAINT "RegulationSection_documentId_fkey"
            FOREIGN KEY ("documentId") REFERENCES "RegulatoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FoodProduct_categoryId_fkey'
    ) THEN
        ALTER TABLE "FoodProduct"
            ADD CONSTRAINT "FoodProduct_categoryId_fkey"
            FOREIGN KEY ("categoryId") REFERENCES "FoodCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AdditivePermission_additiveId_fkey'
    ) THEN
        ALTER TABLE "AdditivePermission"
            ADD CONSTRAINT "AdditivePermission_additiveId_fkey"
            FOREIGN KEY ("additiveId") REFERENCES "Additive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AdditivePermission_foodCategoryId_fkey'
    ) THEN
        ALTER TABLE "AdditivePermission"
            ADD CONSTRAINT "AdditivePermission_foodCategoryId_fkey"
            FOREIGN KEY ("foodCategoryId") REFERENCES "FoodCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SpecialFoodRule_foodCategoryId_fkey'
    ) THEN
        ALTER TABLE "SpecialFoodRule"
            ADD CONSTRAINT "SpecialFoodRule_foodCategoryId_fkey"
            FOREIGN KEY ("foodCategoryId") REFERENCES "FoodCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ChatConversation_userId_fkey'
    ) THEN
        ALTER TABLE "ChatConversation"
            ADD CONSTRAINT "ChatConversation_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_conversationId_fkey'
    ) THEN
        ALTER TABLE "ChatMessage"
            ADD CONSTRAINT "ChatMessage_conversationId_fkey"
            FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_userId_fkey'
    ) THEN
        ALTER TABLE "ChatMessage"
            ADD CONSTRAINT "ChatMessage_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeChunk_documentId_fkey'
    ) THEN
        ALTER TABLE "KnowledgeChunk"
            ADD CONSTRAINT "KnowledgeChunk_documentId_fkey"
            FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

