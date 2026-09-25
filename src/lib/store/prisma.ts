import { PrismaClient, Prisma, Role, Language, NutrientBasis } from "@prisma/client";
import type {
  EvidenceRef,
  HistoryEntryInfo,
  IngredientRecord,
  NutritionFacts,
  ProductInfo,
  ProductCategory,
  UnknownIngredientInfo,
  UserPreferencesInput,
} from "@/types/domain";
import type { DataStore, ProductSearchResult, UserPreferencesRecord, UserRecord } from "./types";
import type {
  KnowledgeCategory,
  KnowledgeChunkRecord,
  KnowledgeDocumentRecord,
  KnowledgeSearchHit,
} from "@/types/knowledge";
import type {
  GamificationActivityResult,
  GamificationProfileRecord,
  GamificationRules,
  SuccessfulProductScanInput,
  ValidatedGamificationActivityInput,
} from "@/gamification/models/gamification";
import type { ChallengeDefinition } from "@/gamification/challenges/config";
import { challengePeriodService } from "@/gamification/challenges/period.service";
import { evaluateChallenges, type ChallengeActivityRow } from "@/gamification/challenges/progress.service";
import {
  challengeDefinitionToRow,
  challengeRowToDefinition,
  type ChallengeDefinitionRow,
} from "@/gamification/challenges/store-utils";
import type { ChallengeDefinitionView, ChallengeHistoryView, ChallengeListResult } from "@/gamification/challenges/models";
import { cosineSimilarity, STOPWORDS } from "@/lib/embeddings";
import type { ChatConversationRecord, ChatMessageRecord, ChatRole } from "@/types/chat";
import { preferencesToRecord } from "./types";
import { EVIDENCE_SEED } from "@/data/seed/evidence";
import type { ProductLookupResult } from "@/lib/product-provider";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";
import { AppError, ErrorCodes } from "@/lib/errors";
import { xpService } from "@/gamification/services/xp.service";
import { streakService } from "@/gamification/services/streak.service";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Lazy PrismaClient factory - the engine binary is only loaded when the
 * production store is actually used (DATABASE_URL set). In mock mode the
 * in-memory store is used and Prisma is never instantiated.
 */
export function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= new PrismaClient({
    log: ["warn", "error"],
  });
  return globalForPrisma.prisma;
}

/** Lazy proxy so `prisma.user.count()` works without instantiating at import time. */
export const prisma = new Proxy({} as PrismaClient, {
  get: (_target, prop) => Reflect.get(getPrisma(), prop),
});

function mapProduct(row: {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  category: string;
  country: string | null;
  servingSize: string | null;
  imageUrl: string | null;
  ingredientsRaw: string;
  source: string;
  sourceUrl: string | null;
  verified: boolean;
  productDataConfidence: number;
  isDemo: boolean;
}): ProductInfo {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    category: row.category as ProductCategory,
    country: row.country,
    servingSize: row.servingSize,
    imageUrl: row.imageUrl,
    ingredientsRaw: row.ingredientsRaw,
    ingredientsNormalized: [],
    source: row.source,
    sourceUrl: row.sourceUrl,
    verified: row.verified,
    productDataConfidence: row.productDataConfidence,
    isDemo: row.isDemo,
  };
}

function mapUser(row: {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: Role;
  language: Language;
  timezone: string;
  createdAt: Date;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    role: row.role === "ADMIN" ? "ADMIN" : "USER",
    language: row.language === "HI" ? "HI" : "EN",
    timezone: row.timezone,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapGamificationProfile(row: {
  userId: string;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}): GamificationProfileRecord {
  return {
    userId: row.userId,
    totalXp: row.totalXp,
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastActivityDate: row.lastActivityDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapGamificationActivity(row: {
  id: string;
  userId: string;
  actionType: string;
  productId: string;
  ingredientId: string | null;
  activityDate: string;
  timestamp: Date;
  xpAwarded: number;
  eventId: string;
}) {
  return {
    activityId: row.id,
    userId: row.userId,
    actionType: row.actionType,
    productId: row.productId,
    ingredientId: row.ingredientId,
    activityDate: row.activityDate,
    timestamp: row.timestamp.toISOString(),
    xpAwarded: row.xpAwarded,
    eventId: row.eventId,
  };
}

function isRetryableTransactionError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2034",
  );
}

async function serializableTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (error) {
      if (attempt === 2 || !isRetryableTransactionError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw new Error("Serializable transaction retry limit reached");
}

async function readGamificationProfileTx(
  tx: Prisma.TransactionClient,
  userId: string,
  rules: GamificationRules,
  timezone: string,
): Promise<GamificationProfileRecord> {
  const profileRow = await tx.userGamification.findUnique({ where: { userId } });
  const activityRows = await tx.gamificationActivity.findMany({
    where: { userId, actionType: "product_scan" },
    select: { activityDate: true, xpAwarded: true },
  });
  const activityDates = activityRows.map((row) => row.activityDate);
  const calculated = rules.streakService.calculateForProfile(
    activityDates,
    rules.streakService.today(timezone, rules.now()),
  );
  const totalXp = profileRow?.totalXp ?? activityRows.reduce((sum, row) => sum + row.xpAwarded, 0);
  const profile = {
    userId,
    totalXp,
    currentStreak: calculated.currentStreak,
    longestStreak: Math.max(profileRow?.longestStreak ?? 0, calculated.longestStreak),
    lastActivityDate: calculated.lastActivityDate,
    createdAt: profileRow?.createdAt ?? new Date(),
    updatedAt: profileRow?.updatedAt ?? new Date(),
  };

  if (
    profileRow &&
    (profileRow.currentStreak !== profile.currentStreak ||
      profileRow.longestStreak !== profile.longestStreak ||
      profileRow.lastActivityDate !== profile.lastActivityDate)
  ) {
    const updated = await tx.userGamification.update({
      where: { userId },
      data: {
        currentStreak: profile.currentStreak,
        longestStreak: profile.longestStreak,
        lastActivityDate: profile.lastActivityDate,
      },
    });
    return mapGamificationProfile(updated);
  }

  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

type ChallengeUserRow = {
  id: string;
  userId: string;
  challengeId: string;
  periodStart: Date;
  periodEnd: Date;
  progress: number;
  completed: boolean;
  completedAt: Date | null;
  rewardClaimed: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type ChallengeInstance = { definition: ChallengeDefinition; row: ChallengeUserRow };

async function syncChallengeDefinitionsTx(
  tx: Prisma.TransactionClient,
  definitions: readonly ChallengeDefinition[],
): Promise<void> {
  for (const definition of definitions) {
    const row = challengeDefinitionToRow(definition);
    await tx.challengeDefinition.upsert({
      where: { challengeId: row.challengeId },
      create: row,
      update: {
        name: row.name,
        description: row.description,
        challengeType: row.challengeType,
        conditionType: row.conditionType,
        targetValue: row.targetValue,
        xpReward: row.xpReward,
        startRule: row.startRule,
        endRule: row.endRule,
        enabled: row.enabled,
      },
    });
  }
}

async function ensureChallengeInstancesTx(
  tx: Prisma.TransactionClient,
  userId: string,
  definitions: readonly ChallengeDefinition[],
  now: Date,
  timezone: string,
): Promise<ChallengeInstance[]> {
  await syncChallengeDefinitionsTx(tx, definitions);
  await tx.userChallenge.updateMany({
    where: { userId, status: "active", periodEnd: { lte: now } },
    data: { status: "expired" },
  });

  const result: ChallengeInstance[] = [];
  for (const definition of definitions) {
    const window = challengePeriodService.windowFor(now, timezone, definition.period);
    const row = await tx.userChallenge.upsert({
      where: {
        userId_challengeId_periodStart: {
          userId,
          challengeId: definition.id,
          periodStart: window.startInstant,
        },
      },
      create: {
        userId,
        challengeId: definition.id,
        periodStart: window.startInstant,
        periodEnd: window.endInstant,
        status: "active",
      },
      update: { periodEnd: window.endInstant },
    });
    result.push({ definition, row: row as ChallengeUserRow });
  }
  return result;
}

function challengeView(
  definition: ChallengeDefinition,
  row: ChallengeUserRow,
  periodStart: string,
  periodEnd: string,
): ChallengeDefinitionView {
  return {
    challenge_id: definition.id,
    name: definition.title,
    description: definition.description,
    challenge_type: definition.period === "weekly" ? "WEEKLY" : "DAILY",
    condition_type: definition.condition.type,
    progress: row.progress,
    target: definition.condition.target,
    xp_reward: definition.rewardXp,
    completed: row.completed,
    reward_claimed: row.rewardClaimed,
    period_start: periodStart,
    period_end: periodEnd,
  };
}

async function evaluateChallengeInstancesTx(
  tx: Prisma.TransactionClient,
  userId: string,
  timezone: string,
  now: Date,
  instances: ChallengeInstance[],
  rules: GamificationRules,
  profile: GamificationProfileRecord,
): Promise<{ completed: ChallengeInstance[]; rewardXp: number; instances: ChallengeInstance[] }> {
  const completed: ChallengeInstance[] = [];
  let rewardXp = 0;
  const updated: ChallengeInstance[] = [];
  for (const instance of instances) {
    const window = challengePeriodService.windowFor(now, timezone, instance.definition.period);
    const activities = await tx.gamificationActivity.findMany({
      where: {
        userId,
        timestamp: { gte: window.startInstant, lt: window.endInstant },
      },
      select: { actionType: true, activityDate: true, productId: true, ingredientId: true, eventId: true },
    });
    const rows: ChallengeActivityRow[] = activities.map((activity) => ({
      activityType: activity.actionType,
      activityDate: activity.activityDate,
      productId: activity.productId,
      ingredientId: activity.ingredientId,
      eventId: activity.eventId,
    }));
    const evaluation = evaluateChallenges([instance.definition], {
      activities: rows,
      currentStreakDays: profile.currentStreak,
    })[0];
    const row = await tx.userChallenge.update({
      where: { id: instance.row.id },
      data: { progress: evaluation.progress },
    });
    const next: ChallengeInstance = { definition: instance.definition, row: row as ChallengeUserRow };
    if (!next.row.completed && evaluation.completed) {
      const finished = await tx.userChallenge.update({
        where: { id: next.row.id },
        data: {
          progress: evaluation.progress,
          completed: true,
          completedAt: now,
          rewardClaimed: true,
          status: "completed",
        },
      });
      next.row = finished as ChallengeUserRow;
      rewardXp += rules.xpService.calculateChallengeReward(instance.definition.rewardXp);
      completed.push(next);
    }
    updated.push(next);
  }
  return { completed, rewardXp, instances: updated };
}

async function challengeHistoryTx(
  tx: Prisma.TransactionClient,
  userId: string,
  currentInstances: ChallengeInstance[],
  timezone: string,
): Promise<ChallengeHistoryView[]> {
  const currentKeys = new Set(
    currentInstances.map(({ row }) => `${row.challengeId}:${row.periodStart.toISOString()}`),
  );
  const rows = await tx.userChallenge.findMany({
    where: { userId },
    orderBy: { periodStart: "desc" },
    take: 50,
  });
  const history: ChallengeHistoryView[] = [];
  for (const row of rows) {
    if (currentKeys.has(`${row.challengeId}:${row.periodStart.toISOString()}`)) continue;
    const definitionRow = await tx.challengeDefinition.findUnique({
      where: { challengeId: row.challengeId },
    });
    if (!definitionRow) continue;
    const definition = challengeRowToDefinition(definitionRow as ChallengeDefinitionRow);
    const start = challengePeriodService.localDateKey(row.periodStart, timezone);
    const end = challengePeriodService.localDateKey(new Date(row.periodEnd.getTime() - 1), timezone);
    history.push({
      ...challengeView(definition, row as ChallengeUserRow, start, end),
      status: row.status as "active" | "completed" | "expired",
      completed_at: row.completedAt?.toISOString() ?? null,
    });
  }
  return history;
}

/**
 * PostgreSQL implementation of the DataStore (via Prisma).
 */
export class PrismaStore implements DataStore {
  private seedEvidenceIndex(): Map<string, EvidenceRef[]> {
    const index = new Map<string, EvidenceRef[]>();
    for (const entry of EVIDENCE_SEED) {
      const list = index.get(entry.ingredientId) ?? [];
      list.push({
        id: `ev-${entry.ingredientId}-${list.length + 1}`,
        title: entry.title,
        organization: entry.organization,
        url: entry.url,
        sourceType: entry.sourceType,
        publicationDate: entry.publicationDate,
        evidenceLevel: entry.evidenceLevel,
        summary: entry.summary,
      });
      index.set(entry.ingredientId, list);
    }
    return index;
  }

  // ── products ──────────────────────────────────────────────
  async getProductByBarcode(barcode: string): Promise<ProductInfo | null> {
    const row = await prisma.product.findUnique({ where: { barcode: barcode.trim() } });
    return row ? mapProduct(row) : null;
  }

  async getProductById(id: string): Promise<ProductInfo | null> {
    const row = await prisma.product.findUnique({ where: { id } });
    return row ? mapProduct(row) : null;
  }

  async getNutritionForProduct(productId: string): Promise<NutritionFacts | null> {
    const row = await prisma.nutrition.findUnique({
      where: { productId },
      include: { nutrients: true },
    });
    if (!row) return null;
    const per100g = row.nutrients
      .filter((n) => n.basis === NutrientBasis.PER_100G)
      .reduce<NutritionFacts["nutrients"]>((acc, n) => {
        acc[n.nutrientKey] = { value: n.value, unit: n.unit, confidence: n.confidence };
        return acc;
      }, {});
    return normalizeNutritionFacts({
      servingSize: row.servingSize ?? undefined,
      servingsPerContainer: row.servingsPerContainer ?? undefined,
      basis: "PER_100G",
      nutrients: per100g,
    });
  }

  async saveProductFromProvider(lookup: ProductLookupResult): Promise<ProductLookupResult> {
    if (!lookup.product) return lookup;
    const existing = await this.getProductByBarcode(lookup.product.barcode);
    if (existing) {
      return {
        product: existing,
        nutrition: await this.getNutritionForProduct(existing.id),
        source: lookup.source,
      };
    }
    const created = await prisma.product.create({
      data: {
        barcode: lookup.product.barcode,
        name: lookup.product.name,
        brand: lookup.product.brand,
        category: lookup.product.category,
        country: lookup.product.country,
        servingSize: lookup.product.servingSize,
        imageUrl: lookup.product.imageUrl,
        ingredientsRaw: lookup.product.ingredientsRaw,
        source: lookup.product.source,
        sourceUrl: lookup.product.sourceUrl,
        verified: lookup.product.verified,
        productDataConfidence: lookup.product.productDataConfidence,
        isDemo: lookup.product.isDemo,
      },
    });
    const product = mapProduct(created);
    if (lookup.nutrition) {
      await prisma.nutrition.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          servingSize: lookup.nutrition.servingSize,
          servingsPerContainer: lookup.nutrition.servingsPerContainer,
          source: lookup.source,
          confidence: 0.7,
          nutrients: {
            create: Object.entries(lookup.nutrition.nutrients).map(([key, nv]) => ({
              nutrientKey: key,
              value: nv.value,
              unit: nv.unit,
              confidence: nv.confidence,
              basis: NutrientBasis.PER_100G,
            })),
          },
        },
        update: {},
      });
    }
    return { product, nutrition: lookup.nutrition, source: lookup.source };
  }

  async searchProducts(query: string, category: ProductCategory | "all" = "all"): Promise<ProductSearchResult[]> {
    const rows = await prisma.product.findMany({
      where: {
        AND: [
          category === "all" ? {} : { category },
          query
            ? {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { brand: { contains: query, mode: "insensitive" } },
                  { barcode: { contains: query } },
                  { ingredientsRaw: { contains: query, mode: "insensitive" } },
                ],
              }
            : {},
        ],
      },
      take: 50,
    });
    return rows.map((row) => ({ product: mapProduct(row), rank: 100, matchedOn: ["name"] }));
  }

  async updateProductImage(productId: string, imageUrl: string): Promise<void> {
    await prisma.product.update({
      where: { id: productId },
      data: { imageUrl },
    });
  }

  // ── ingredients (knowledge base is versioned data in seed files) ──
  async getIngredientById(id: string): Promise<IngredientRecord | null> {
    void id;
    return null;
  }
  async getIngredientByCanonical(name: string): Promise<IngredientRecord | null> {
    void name;
    return null;
  }
  async getIngredientByAlias(alias: string): Promise<IngredientRecord | null> {
    void alias;
    return null;
  }
  async listIngredients(): Promise<IngredientRecord[]> {
    return [];
  }

  async upsertIngredient(record: IngredientRecord): Promise<void> {
    await prisma.ingredient.upsert({
      where: { canonicalName: record.canonicalName },
      create: {
        canonicalName: record.canonicalName,
        insCode: record.insCode ?? null,
        eNumber: record.eNumber ?? null,
        category: record.category,
        description: record.description,
        function: record.function,
        assessment: record.assessment,
        allergenStatus: record.allergenStatus ?? null,
        dietaryStatus: record.dietaryStatus,
        regulatoryStatus: record.regulatoryStatus,
        regulatoryNotes: record.regulatoryNotes ?? null,
        evidenceLevel: record.evidenceLevel,
        isAdditive: record.isAdditive,
        hindiName: record.hindiName ?? null,
        aliases: {
          create: record.aliases.map((a) => ({ alias: a.alias, aliasType: a.type })),
        },
      },
      update: {
        insCode: record.insCode ?? null,
        eNumber: record.eNumber ?? null,
        category: record.category,
        description: record.description,
        function: record.function,
        assessment: record.assessment,
        allergenStatus: record.allergenStatus ?? null,
        dietaryStatus: record.dietaryStatus,
        regulatoryStatus: record.regulatoryStatus,
        regulatoryNotes: record.regulatoryNotes ?? null,
        evidenceLevel: record.evidenceLevel,
        isAdditive: record.isAdditive,
        hindiName: record.hindiName ?? null,
      },
    });
  }

  async getEvidenceByIngredientId(ingredientId: string): Promise<EvidenceRef[]> {
    return this.seedEvidenceIndex().get(ingredientId) ?? [];
  }

  // ── unknown ingredients ───────────────────────────────────
  async addUnknownIngredient(input: {
    rawName: string;
    normalizedAttempt: string | null;
    confidence: number;
    context: string | null;
  }): Promise<UnknownIngredientInfo> {
    const row = await prisma.unknownIngredient.create({
      data: {
        rawName: input.rawName,
        normalizedAttempt: input.normalizedAttempt,
        confidence: input.confidence,
        context: input.context,
      },
    });
    return {
      id: row.id,
      rawName: row.rawName,
      normalizedAttempt: row.normalizedAttempt,
      confidence: row.confidence,
      status: row.status as UnknownIngredientInfo["status"],
      context: row.context,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listUnknownIngredients(status?: string): Promise<UnknownIngredientInfo[]> {
    const rows = await prisma.unknownIngredient.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      rawName: r.rawName,
      normalizedAttempt: r.normalizedAttempt,
      confidence: r.confidence,
      status: r.status as UnknownIngredientInfo["status"],
      context: r.context,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async resolveUnknownIngredient(
    id: string,
    status: "resolved" | "dismissed",
    resolvedIngredientId?: string,
  ): Promise<void> {
    await prisma.unknownIngredient.update({
      where: { id },
      data: { status, resolvedIngredientId },
    });
  }

  // ── users ─────────────────────────────────────────────────
  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return row ? mapUser(row) : null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const row = await prisma.user.findUnique({ where: { id } });
    return row ? mapUser(row) : null;
  }

  async createUser(input: {
    email: string;
    name: string;
    passwordHash: string | null;
    role?: "USER" | "ADMIN";
    language?: "EN" | "HI";
    timezone?: string;
  }): Promise<UserRecord> {
    const row = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        role: input.role === "ADMIN" ? Role.ADMIN : Role.USER,
        language: input.language === "HI" ? Language.HI : Language.EN,
        timezone: input.timezone?.trim() || "UTC",
      },
    });
    return mapUser(row);
  }

  async updateUser(id: string, fields: { name?: string; language?: "EN" | "HI"; timezone?: string }): Promise<UserRecord | null> {
    const row = await prisma.user.update({
      where: { id },
      data: {
        ...(fields.name ? { name: fields.name } : {}),
        ...(fields.language ? { language: fields.language === "HI" ? Language.HI : Language.EN } : {}),
        ...(fields.timezone?.trim() ? { timezone: fields.timezone.trim() } : {}),
      },
    });
    return mapUser(row);
  }

  async getUserPreferences(userId: string): Promise<UserPreferencesRecord | null> {
    const row = await prisma.userPreference.findUnique({ where: { userId } });
    if (!row) return null;
    return {
      userId: row.userId,
      vegetarian: row.vegetarian,
      vegan: row.vegan,
      allergies: row.allergies,
      dietaryRestrictions: row.dietaryRestrictions,
      avoidIngredients: row.avoidIngredients,
      preferredIngredients: row.preferredIngredients,
      healthGoals: row.healthGoals,
      sensitivityPreferences: row.sensitivityPreferences,
    };
  }

  async upsertUserPreferences(userId: string, prefs: UserPreferencesInput): Promise<UserPreferencesRecord> {
    const record = await preferencesToRecord(userId, prefs);
    await prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        vegetarian: record.vegetarian,
        vegan: record.vegan,
        allergies: record.allergies,
        dietaryRestrictions: record.dietaryRestrictions,
        avoidIngredients: record.avoidIngredients,
        preferredIngredients: record.preferredIngredients,
        healthGoals: record.healthGoals,
        sensitivityPreferences: record.sensitivityPreferences,
      },
      update: {
        vegetarian: record.vegetarian,
        vegan: record.vegan,
        allergies: record.allergies,
        dietaryRestrictions: record.dietaryRestrictions,
        avoidIngredients: record.avoidIngredients,
        preferredIngredients: record.preferredIngredients,
        healthGoals: record.healthGoals,
        sensitivityPreferences: record.sensitivityPreferences,
      },
    });
    return record;
  }

  async listUsers(): Promise<UserRecord[]> {
    const rows = await prisma.user.findMany({ take: 100, orderBy: { createdAt: "desc" } });
    return rows.map(mapUser);
  }

  // ── history ───────────────────────────────────────────────
  async addHistoryEntry(
    userId: string,
    entry: { productId: string | null; assessmentSnapshot: unknown; source: string },
  ): Promise<HistoryEntryInfo> {
    const row = await prisma.historyEntry.create({
      data: {
        userId,
        productId: entry.productId,
        assessmentSnapshot: entry.assessmentSnapshot as object,
        source: entry.source,
      },
    });
    return {
      id: row.id,
      userId: row.userId,
      productId: row.productId,
      scannedAt: row.scannedAt.toISOString(),
      assessmentSnapshot: row.assessmentSnapshot as HistoryEntryInfo["assessmentSnapshot"],
      source: row.source,
    };
  }

  async listHistory(userId: string): Promise<HistoryEntryInfo[]> {
    const rows = await prisma.historyEntry.findMany({
      where: { userId },
      orderBy: { scannedAt: "desc" },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      productId: r.productId,
      scannedAt: r.scannedAt.toISOString(),
      assessmentSnapshot: r.assessmentSnapshot as HistoryEntryInfo["assessmentSnapshot"],
      source: r.source,
    }));
  }

  async deleteHistoryEntry(userId: string, entryId: string): Promise<boolean> {
    const result = await prisma.historyEntry.deleteMany({ where: { id: entryId, userId } });
    return result.count > 0;
  }

  // ── gamification (XP + daily streak) ───────────────────────
  async getGamificationProfile(
    userId: string,
    rules: GamificationRules,
  ): Promise<GamificationProfileRecord> {
    return serializableTransaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, timezone: true },
      });
      if (!user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      }
      // Serialize profile reconciliation with activity writes for this user.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      return readGamificationProfileTx(tx, userId, rules, user.timezone);
    });
  }

  async recordSuccessfulProductScan(
    input: SuccessfulProductScanInput,
    rules: GamificationRules,
    challengeDefinitions: readonly ChallengeDefinition[] = [],
  ): Promise<GamificationActivityResult> {
    return serializableTransaction(async (tx) => {
      if (input.actionType !== "product_scan") {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Unsupported gamification action");
      }
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, timezone: true },
      });
      if (!user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      }
      // Lock the parent user row. This serializes concurrent requests even
      // before the optional one-to-one profile row exists.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;

      const product = await tx.product.findUnique({
        where: { id: input.productId },
        select: { id: true, isDemo: true },
      });
      if (!product || product.isDemo) {
        throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product was not found", 404);
      }

      const existingByEvent = input.eventIdProvided
        ? await tx.gamificationActivity.findUnique({
            where: {
              userId_eventId: {
                userId: input.userId,
                eventId: input.eventId,
              },
            },
          })
        : null;
      if (existingByEvent) {
        const profile = await readGamificationProfileTx(tx, input.userId, rules, user.timezone);
        return {
          activity: mapGamificationActivity(existingByEvent),
          profile,
          idempotent: true,
          completedChallenges: [],
        };
      }

      const existingRecent = input.eventIdProvided
        ? null
        : await tx.gamificationActivity.findFirst({
            where: {
              userId: input.userId,
              actionType: input.actionType,
              productId: input.productId,
              timestamp: {
                gte: new Date(input.timestamp.getTime() - rules.duplicateRequestWindowMs),
              },
            },
            orderBy: { timestamp: "desc" },
          });
      if (existingRecent) {
        const profile = await readGamificationProfileTx(tx, input.userId, rules, user.timezone);
        return {
          activity: mapGamificationActivity(existingRecent),
          profile,
          idempotent: true,
          completedChallenges: [],
        };
      }

      const priorRows = await tx.gamificationActivity.findMany({
        where: { userId: input.userId, actionType: input.actionType },
        select: { activityDate: true, productId: true },
      });
      const activityDate = rules.streakService.activityDate(input.timestamp, user.timezone);
      const isNewProduct = !priorRows.some(
        (row) => row.productId === input.productId,
      );
      const hasPriorProductOnDate = priorRows.some(
        (row) => row.productId === input.productId && row.activityDate === activityDate,
      );
      const xpAwarded = rules.xpService.calculateProductScanXp({
        isNewProduct,
        hasPriorProductOnDate,
      });
      const activityRow = await tx.gamificationActivity.create({
        data: {
          userId: input.userId,
          actionType: input.actionType,
          productId: input.productId,
          ingredientId: null,
          activityDate,
          timestamp: input.timestamp,
          xpAwarded,
          eventId: input.eventId,
        },
      });
      const streak = rules.streakService.calculateAfterActivity(
        [...priorRows.map((row) => row.activityDate), activityDate],
        activityDate,
      );
      const existingProfile = await tx.userGamification.findUnique({
        where: { userId: input.userId },
        select: { longestStreak: true },
      });
      const longestStreak = Math.max(existingProfile?.longestStreak ?? 0, streak.longestStreak);
      const profileRow = await tx.userGamification.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          totalXp: xpAwarded,
          currentStreak: streak.currentStreak,
          longestStreak,
          lastActivityDate: streak.lastActivityDate,
        },
        update: {
          totalXp: { increment: xpAwarded },
          currentStreak: streak.currentStreak,
          longestStreak,
          lastActivityDate: streak.lastActivityDate,
        },
      });

      if (challengeDefinitions.length > 0) {
        const current = await ensureChallengeInstancesTx(
          tx,
          input.userId,
          challengeDefinitions,
          input.timestamp,
          user.timezone,
        );
        const outcome = await evaluateChallengeInstancesTx(
          tx,
          input.userId,
          user.timezone,
          input.timestamp,
          current,
          rules,
          mapGamificationProfile(profileRow),
        );
        const finalProfileRow = outcome.rewardXp > 0
          ? await tx.userGamification.update({
              where: { userId: input.userId },
              data: { totalXp: { increment: outcome.rewardXp } },
            })
          : profileRow;
        const views = outcome.instances.flatMap((instance) => {
          const window = challengePeriodService.windowFor(
            input.timestamp,
            user.timezone,
            instance.definition.period,
          );
          return [challengeView(instance.definition, instance.row, window.startDate, window.endDate)];
        });
        return {
          activity: mapGamificationActivity(activityRow),
          profile: mapGamificationProfile(finalProfileRow),
          idempotent: false,
          challenges: views,
          completedChallenges: outcome.completed.map(({ definition }) => ({
            challenge_id: definition.id,
            name: definition.title,
            description: definition.description,
            xp_reward: definition.rewardXp,
          })),
        };
      }

      return {
        activity: mapGamificationActivity(activityRow),
        profile: mapGamificationProfile(profileRow),
        idempotent: false,
      };
    });
  }

  async recordValidatedActivity(
    input: ValidatedGamificationActivityInput,
    rules: GamificationRules,
    challengeDefinitions: readonly ChallengeDefinition[] = [],
  ): Promise<GamificationActivityResult> {
    return serializableTransaction(async (tx) => {
      if (input.actionType !== "ingredient_view" && input.actionType !== "meaningful_chat") {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Unsupported gamification action");
      }
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, timezone: true },
      });
      if (!user) throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
      const product = await tx.product.findUnique({
        where: { id: input.productId },
        select: { id: true, isDemo: true },
      });
      if (!product || product.isDemo) {
        throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product was not found", 404);
      }
      if (!input.eventId || input.eventId.length < 8 || input.eventId.length > 128) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "event_id must be 8-128 characters");
      }
      const existing = await tx.gamificationActivity.findUnique({
        where: { userId_eventId: { userId: input.userId, eventId: input.eventId } },
      });
      if (existing) {
        const profile = await readGamificationProfileTx(tx, input.userId, rules, user.timezone);
        const current = challengeDefinitions.length > 0
          ? await ensureChallengeInstancesTx(tx, input.userId, challengeDefinitions, input.timestamp, user.timezone)
          : [];
        return {
          activity: mapGamificationActivity(existing),
          profile,
          idempotent: true,
          challenges: current.length > 0
            ? current.flatMap((instance) => {
                const window = challengePeriodService.windowFor(input.timestamp, user.timezone, instance.definition.period);
                return [challengeView(instance.definition, instance.row, window.startDate, window.endDate)];
              })
            : undefined,
          completedChallenges: [],
        };
      }

      const activityDate = rules.streakService.activityDate(input.timestamp, user.timezone);
      const activityRow = await tx.gamificationActivity.create({
        data: {
          userId: input.userId,
          actionType: input.actionType,
          productId: input.productId,
          ingredientId: input.ingredientId ?? null,
          activityDate,
          timestamp: input.timestamp,
          xpAwarded: 0,
          eventId: input.eventId,
        },
      });
      if (challengeDefinitions.length === 0) {
        return {
          activity: mapGamificationActivity(activityRow),
          profile: await readGamificationProfileTx(tx, input.userId, rules, user.timezone),
          idempotent: false,
        };
      }

      const current = await ensureChallengeInstancesTx(
        tx,
        input.userId,
        challengeDefinitions,
        input.timestamp,
        user.timezone,
      );
      const profileBefore = await readGamificationProfileTx(tx, input.userId, rules, user.timezone);
      const outcome = await evaluateChallengeInstancesTx(
        tx,
        input.userId,
        user.timezone,
        input.timestamp,
        current,
        rules,
        profileBefore,
      );
      const profileRow = outcome.rewardXp > 0
        ? await tx.userGamification.upsert({
            where: { userId: input.userId },
            create: {
              userId: input.userId,
              totalXp: profileBefore.totalXp + outcome.rewardXp,
              currentStreak: profileBefore.currentStreak,
              longestStreak: profileBefore.longestStreak,
              lastActivityDate: profileBefore.lastActivityDate,
            },
            update: { totalXp: { increment: outcome.rewardXp } },
          })
        : await tx.userGamification.findUnique({ where: { userId: input.userId } });
      const finalProfile = profileRow
        ? mapGamificationProfile(profileRow)
        : profileBefore;
      const views = outcome.instances.flatMap((instance) => {
        const window = challengePeriodService.windowFor(input.timestamp, user.timezone, instance.definition.period);
        return [challengeView(instance.definition, instance.row, window.startDate, window.endDate)];
      });
      return {
        activity: mapGamificationActivity(activityRow),
        profile: finalProfile,
        idempotent: false,
        challenges: views,
        completedChallenges: outcome.completed.map(({ definition }) => ({
          challenge_id: definition.id,
          name: definition.title,
          description: definition.description,
          xp_reward: definition.rewardXp,
        })),
      };
    });
  }

  async getChallenges(
    userId: string,
    challengeDefinitions: readonly ChallengeDefinition[],
    now: Date,
  ): Promise<ChallengeListResult> {
    return serializableTransaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, timezone: true },
      });
      if (!user) throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const rules: GamificationRules = {
        now: () => now,
        duplicateRequestWindowMs: 0,
        xpService,
        streakService,
      };
      const profile = await readGamificationProfileTx(tx, userId, rules, user.timezone);
      const current = await ensureChallengeInstancesTx(tx, userId, challengeDefinitions, now, user.timezone);
      const outcome = await evaluateChallengeInstancesTx(
        tx,
        userId,
        user.timezone,
        now,
        current,
        rules,
        profile,
      );
      if (outcome.rewardXp > 0) {
        await tx.userGamification.upsert({
          where: { userId },
          create: {
            userId,
            totalXp: profile.totalXp + outcome.rewardXp,
            currentStreak: profile.currentStreak,
            longestStreak: profile.longestStreak,
            lastActivityDate: profile.lastActivityDate,
          },
          update: { totalXp: { increment: outcome.rewardXp } },
        });
      }
      const daily: ChallengeDefinitionView[] = [];
      const weekly: ChallengeDefinitionView[] = [];
      for (const instance of outcome.instances) {
        const window = challengePeriodService.windowFor(now, user.timezone, instance.definition.period);
        const view = challengeView(instance.definition, instance.row, window.startDate, window.endDate);
        (instance.definition.period === "weekly" ? weekly : daily).push(view);
      }
      return {
        daily,
        weekly,
        history: await challengeHistoryTx(tx, userId, outcome.instances, user.timezone),
      };
    });
  }

  // ── chat conversations ────────────────────────────────────
  async createConversation(userId: string): Promise<ChatConversationRecord> {
    const row = await prisma.chatConversation.create({
      data: { userId },
    });
    return {
      id: row.id,
      userId: row.userId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listConversations(userId: string): Promise<ChatConversationRecord[]> {
    const rows = await prisma.chatConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async getConversation(conversationId: string): Promise<ChatConversationRecord | null> {
    const row = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async appendChatMessage(
    conversationId: string,
    userId: string,
    role: ChatRole,
    content: string,
  ): Promise<ChatMessageRecord> {
    const row = await prisma.chatMessage.create({
      data: { conversationId, userId, role, content },
    });
    await prisma.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return {
      id: row.id,
      conversationId: row.conversationId,
      userId: row.userId,
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listChatMessages(conversationId: string, limit = 50): Promise<ChatMessageRecord[]> {
    const rows = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      userId: r.userId,
      role: r.role === "assistant" ? "assistant" : "user",
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── knowledge base (RAG) ──────────────────────────────────
  async upsertKnowledgeDocument(doc: KnowledgeDocumentRecord): Promise<void> {
    await prisma.knowledgeDocument.upsert({
      where: { id: doc.id },
      update: {
        title: doc.title,
        source: doc.source,
        sourceUrl: doc.sourceUrl,
        category: doc.category,
        documentVersion: doc.documentVersion,
        updatedAt: new Date(doc.updatedAt),
      },
      create: {
        id: doc.id,
        title: doc.title,
        source: doc.source,
        sourceUrl: doc.sourceUrl,
        category: doc.category,
        documentVersion: doc.documentVersion,
        createdAt: new Date(doc.createdAt),
        updatedAt: new Date(doc.updatedAt),
      },
    });
  }

  async listKnowledgeDocuments(category?: string): Promise<KnowledgeDocumentRecord[]> {
    const rows = await prisma.knowledgeDocument.findMany({
      where: category ? { category } : undefined,
      orderBy: { title: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      source: r.source,
      sourceUrl: r.sourceUrl,
      category: r.category as KnowledgeCategory,
      documentVersion: r.documentVersion,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async insertKnowledgeChunks(chunks: KnowledgeChunkRecord[]): Promise<void> {
    await prisma.$transaction([
      prisma.knowledgeChunk.deleteMany({
        where: { documentId: { in: [...new Set(chunks.map((c) => c.documentId))] } },
      }),
      prisma.knowledgeChunk.createMany({
        data: chunks.map((c) => ({
          id: c.id,
          documentId: c.documentId,
          content: c.content,
          section: c.section,
          pageNumber: c.pageNumber ?? null,
          metadata: c.metadata,
          embedding: c.embedding ?? undefined,
          createdAt: new Date(c.createdAt),
        })),
      }),
    ]);
  }

  async searchKnowledgeChunks(
    query: string,
    options: { category?: string; limit?: number; queryEmbedding?: number[] | null } = {},
  ): Promise<KnowledgeSearchHit[]> {
    const limit = options.limit ?? 5;
    const rows = await prisma.knowledgeChunk.findMany({
      where: {
        document: options.category ? { category: options.category } : undefined,
      },
      take: limit * 3,
      orderBy: { createdAt: "desc" },
    });
    const queryTokens = new Set(
      query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).filter((t) => !STOPWORDS.has(t)),
    );
    const scored = rows
      .map((r) => {
        let score = 0;
        const storedEmbedding = Array.isArray(r.embedding) ? (r.embedding as number[]) : null;
        if (storedEmbedding && options.queryEmbedding) {
          score = cosineSimilarity(options.queryEmbedding, storedEmbedding);
        } else {
          const contentTokens = new Set(
            r.content.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).filter((t) => !STOPWORDS.has(t)),
          );
          const overlap = [...queryTokens].filter((t) => contentTokens.has(t)).length;
          score = queryTokens.size > 0 ? overlap / Math.sqrt(queryTokens.size) : 0;
        }
        return { r, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(({ r, score }) => ({
      chunk: {
        id: r.id,
        documentId: r.documentId,
        content: r.content,
        section: r.section,
        pageNumber: r.pageNumber,
        metadata: r.metadata as Record<string, string>,
        embedding: Array.isArray(r.embedding) ? (r.embedding as number[]) : null,
        createdAt: r.createdAt.toISOString(),
      },
      score,
    }));
  }

  // ── admin ─────────────────────────────────────────────────
  async logAdminAction(input: {
    adminId: string;
    action: string;
    entity: string;
    entityId?: string;
    detail?: string;
  }): Promise<void> {
    await prisma.adminAction.create({
      data: {
        adminId: input.adminId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        detail: input.detail,
      },
    });
  }

  async getAdminStats(): Promise<Record<string, number>> {
    const [products, ingredients, users, pendingUnknown, historyEntries] = await Promise.all([
      prisma.product.count(),
      prisma.ingredient.count(),
      prisma.user.count(),
      prisma.unknownIngredient.count({ where: { status: "pending" } }),
      prisma.historyEntry.count(),
    ]);
    return { products, ingredients, users, pendingUnknownIngredients: pendingUnknown, historyEntries };
  }
}
