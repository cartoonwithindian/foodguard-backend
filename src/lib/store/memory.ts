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
import type { ChatConversationRecord, ChatMessageRecord, ChatRole } from "@/types/chat";
import type {
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
import type { ChallengeDefinitionView, ChallengeHistoryView } from "@/gamification/challenges/models";
import { streakProtectionConfig, PROTECTION_REASONS } from "@/gamification/protection/config";
import {
  achievementViews,
  levelUpBetween,
  pendingUnlocks,
  summarizeAchievements,
  toLevelView,
  type AchievementContext,
} from "@/gamification/achievements/achievement.engine";
import type { AchievementCounters } from "@/lib/store/module2.prisma";
import type {
  AchievementRecord,
  AchievementStateResult,
} from "@/gamification/models/achievements";
import {
  countIngredientViews,
  countMeaningfulChats,
  countUniqueProducts,
} from "@/gamification/challenges/progress.service";
import { listChallengeDefinitions } from "@/gamification/challenges/config";
import { applyProtectionCap, decideProtection } from "@/gamification/protection/protection.engine";
import { listRewardDefinitions, rewardsConfig } from "@/gamification/rewards/config";
import { milestoneKeyFor, observeCondition, toRewardView } from "@/gamification/rewards/reward.engine";
import type {
  ClaimRewardResult,
  GamificationOverview,
  RewardEvaluationContext,
  RewardListResult,
  RewardRecord,
  RewardView,
  StreakProtectionHistoryResult,
  StreakProtectionStatus,
  StreakProtectionUsageRecord,
} from "@/gamification/models/rewards";
import { AppError, ErrorCodes } from "@/lib/errors";
import { xpService } from "@/gamification/services/xp.service";
import { streakService } from "@/gamification/services/streak.service";
import { cosineSimilarity, STOPWORDS } from "@/lib/embeddings";
import {
  matchesCatalogTerm,
  scoreCatalogMatch,
  tokenizeCatalogQuery,
} from "@/lib/search/catalog-match";
import type { DataStore, ProductSearchResult, UserPreferencesRecord, UserRecord } from "./types";
import {
  preferencesToRecord,
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_LIST,
  MAX_SEARCH_RESULTS,
} from "./types";
import { PRODUCT_SEED, buildNutrition } from "@/data/seed/products";
import { INGREDIENT_SEED } from "@/data/seed/ingredients";
import { EVIDENCE_SEED } from "@/data/seed/evidence";
import { config } from "@/lib/config";
import type { ProductLookupResult } from "@/lib/product-provider";

type UserChallengeRow = {
  id: string;
  userId: string;
  challengeId: string;
  periodStart: Date;
  periodEnd: Date;
  progress: number;
  completed: boolean;
  completedAt: Date | null;
  rewardClaimed: boolean;
  status: "active" | "completed" | "expired";
  createdAt: Date;
  updatedAt: Date;
};

function toProductInfo(seed: (typeof PRODUCT_SEED)[number], index: number): ProductInfo {
  // isDemo is preserved from seed data; in real mode, providers set isDemo=false
  // Only mark as demo when explicitly from demo data source
  return {
    id: `prod-${index + 1}`,
    barcode: seed.barcode,
    name: seed.name,
    brand: seed.brand,
    category: seed.category,
    country: seed.country ?? "IN",
    servingSize: seed.servingSize ?? null,
    imageUrl: seed.imageUrl ?? null,
    ingredientsRaw: seed.ingredientsRaw,
    ingredientsNormalized: [],
    source: seed.source,
    sourceUrl: seed.sourceUrl ?? null,
    verified: seed.verified,
    productDataConfidence: seed.confidence,
    isDemo: seed.isDemo,
  };
}

// Precomputed bcrypt hashes for the opt-in (SEED_DEMO_DATA=true) mock-mode
// demo accounts. Never seeded unless demo data is explicitly enabled.
const DEMO_ADMIN_HASH = "$2b$10$TI1YSjnZtV4nu3n.UEJadOXncKTkxWe1X/p89qD7IKA7jvHOV7OpK";
const DEMO_USER_HASH = "$2b$10$TI1YSjnZtV4nu3n.UEJadOH6tPfDEYUB4NchoX4ca5PvaGIpqe8Fa";

function seedUser(
  email: string,
  name: string,
  role: "USER" | "ADMIN",
  language: "EN" | "HI",
  passwordHash: string,
  timezone = "UTC",
): UserRecord {
  return {
    id: `usr-${email.split("@")[0]}-demo`,
    email,
    name,
    passwordHash,
    role,
    language,
    timezone,
    createdAt: new Date().toISOString(),
  };
}

/**
 * In-memory store. Seeded from the bundled demo data; used when no
 * DATABASE_URL is configured (MOCK MODE). Not for production use.
 */
export class InMemoryStore implements DataStore {
  private products: ProductInfo[] = [];
  private nutritionByProduct = new Map<string, NutritionFacts>();
  private ingredients: Map<string, IngredientRecord> = new Map();
  private evidenceByIngredient = new Map<string, EvidenceRef[]>();
  private unknown: UnknownIngredientInfo[] = [];
  private users: Map<string, UserRecord>;
  private preferences = new Map<string, UserPreferencesRecord>();
  private history: HistoryEntryInfo[] = [];
  private gamificationProfiles = new Map<string, GamificationProfileRecord>();
  private gamificationActivities: (GamificationActivityResult["activity"] & { ingredientId?: string | null })[] = [];
  private challengeDefinitions = new Map<string, ChallengeDefinitionRow>();
  private userChallenges: UserChallengeRow[] = [];
  // Module 4. Created lazily: a new user holds no protection and no reward
  // until a real milestone earns one, so a read never seeds a fake inventory.
  private streakProtections = new Map<string, { availableCount: number; usedCount: number }>();
  private streakProtectionUsages: StreakProtectionUsageRecord[] = [];
  private userRewards: RewardRecord[] = [];
  private userAchievements: AchievementRecord[] = [];
  private gamificationLock: Promise<void> = Promise.resolve();
  private conversations = new Map<string, ChatConversationRecord>();
  private chatMessages: ChatMessageRecord[] = [];
  private knowledgeDocuments = new Map<string, KnowledgeDocumentRecord>();
  private knowledgeChunks: KnowledgeChunkRecord[] = [];
  private counter = 0;

  constructor() {
    // When DATABASE_URL is configured, do NOT seed from demo data.
    // The store will be populated from the database or external providers.
    if (!config.databaseUrl) {
      this.products = PRODUCT_SEED.map(toProductInfo);
      for (const p of this.products) {
        const seed = PRODUCT_SEED.find((s) => s.barcode === p.barcode);
        if (seed?.nutrition) {
          this.nutritionByProduct.set(p.id, buildNutrition(seed.nutrition)!);
        }
      }
      this.ingredients = new Map(INGREDIENT_SEED.map((i) => [i.id, i]));
      for (const entry of EVIDENCE_SEED) {
        const list = this.evidenceByIngredient.get(entry.ingredientId) ?? [];
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
        this.evidenceByIngredient.set(entry.ingredientId, list);
      }
    }
    this.users = new Map<string, UserRecord>();
    if (config.seed.enabled) {
      const admin = seedUser(config.seed.adminEmail.toLowerCase(), "FoodGaurd Admin", "ADMIN", "EN", DEMO_ADMIN_HASH);
      const user = seedUser(config.seed.userEmail.toLowerCase(), "Demo User", "USER", "EN", DEMO_USER_HASH);
      this.users.set(admin.id, admin);
      this.users.set(user.id, user);
    }
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${Date.now()}-${this.counter}`;
  }

  private async withGamificationLock<T>(work: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.gamificationLock;
    this.gamificationLock = previous.then(() => next);
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  private syncChallengeDefinitions(definitions: readonly ChallengeDefinition[]): void {
    for (const definition of definitions) {
      const row = challengeDefinitionToRow(definition);
      this.challengeDefinitions.set(row.challengeId, row);
    }
  }

  private currentChallengeRows(
    userId: string,
    now: Date,
    timezone: string,
  ): Array<{ definition: ChallengeDefinition; row: UserChallengeRow }> {
    const definitions = [...this.challengeDefinitions.values()]
      .filter((row) => row.enabled)
      .map(challengeRowToDefinition);
    const nowMs = now.getTime();
    for (const row of this.userChallenges) {
      if (row.userId === userId && row.status === "active" && row.periodEnd.getTime() <= nowMs) {
        row.status = "expired";
        row.updatedAt = new Date(nowMs);
      }
    }
    const result: Array<{ definition: ChallengeDefinition; row: UserChallengeRow }> = [];
    for (const definition of definitions) {
      const window = challengePeriodService.windowFor(now, timezone, definition.period);
      let row = this.userChallenges.find(
        (candidate) =>
          candidate.userId === userId &&
          candidate.challengeId === definition.id &&
          candidate.periodStart.getTime() === window.startInstant.getTime(),
      );
      if (!row) {
        const timestamp = new Date(nowMs);
        row = {
          id: this.nextId("challenge"),
          userId,
          challengeId: definition.id,
          periodStart: window.startInstant,
          periodEnd: window.endInstant,
          progress: 0,
          completed: false,
          completedAt: null,
          rewardClaimed: false,
          status: "active",
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        this.userChallenges.push(row);
      }
      result.push({ definition, row });
    }
    return result;
  }

  private challengeView(
    definition: ChallengeDefinition,
    row: UserChallengeRow,
    window: { startDate: string; endDate: string },
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
      period_start: window.startDate,
      period_end: window.endDate,
    };
  }

  private challengeHistoryView(
    definition: ChallengeDefinition,
    row: UserChallengeRow,
    timezone: string,
  ): ChallengeHistoryView {
    const window = {
      startDate: challengePeriodService.localDateKey(row.periodStart, timezone),
      endDate: challengePeriodService.localDateKey(new Date(row.periodEnd.getTime() - 1), timezone),
    };
    return {
      ...this.challengeView(definition, row, window),
      status: row.status,
      completed_at: row.completedAt?.toISOString() ?? null,
    };
  }

  private evaluateCurrentChallenges(
    user: UserRecord,
    current: Array<{ definition: ChallengeDefinition; row: UserChallengeRow }>,
    now: Date,
    rules: GamificationRules,
  ): { completed: Array<{ definition: ChallengeDefinition; row: UserChallengeRow }>; rewardXp: number } {
    const profile = this.gamificationProfileForUser(user, rules);
    const completed: Array<{ definition: ChallengeDefinition; row: UserChallengeRow }> = [];
    let rewardXp = 0;
    for (const entry of current) {
      const window = challengePeriodService.windowFor(now, user.timezone, entry.definition.period);
      const activities: ChallengeActivityRow[] = this.gamificationActivities
        .filter(
          (activity) =>
            activity.userId === user.id &&
            challengePeriodService.containsDateKey(window, activity.activityDate),
        )
        .map((activity) => ({
          activityType: activity.actionType,
          activityDate: activity.activityDate,
          productId: activity.productId,
          ingredientId: activity.ingredientId,
          eventId: activity.eventId,
        }));
      const evaluation = evaluateChallenges([entry.definition], {
        activities,
        currentStreakDays: profile.currentStreak,
      })[0];
      entry.row.progress = evaluation.progress;
      entry.row.updatedAt = now;
      if (!entry.row.completed && evaluation.completed) {
        entry.row.completed = true;
        entry.row.completedAt = now;
        entry.row.rewardClaimed = true;
        entry.row.status = "completed";
        rewardXp += rules.xpService.calculateChallengeReward(entry.definition.rewardXp);
        completed.push(entry);
      }
    }
    return { completed, rewardXp };
  }

  private applyChallengeReward(
    user: UserRecord,
    rewardXp: number,
    now: Date,
    rules: GamificationRules,
  ): GamificationProfileRecord {
    const previous = this.gamificationProfiles.get(user.id);
    const profile = this.gamificationProfileForUser(user, rules);
    const updated: GamificationProfileRecord = {
      ...profile,
      totalXp: (previous?.totalXp ?? profile.totalXp) + rules.xpService.calculateChallengeReward(rewardXp),
      createdAt: previous?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };
    if (rewardXp > 0 || previous) this.gamificationProfiles.set(user.id, updated);
    return updated;
  }

  private challengeViewsForUser(
    user: UserRecord,
    current: Array<{ definition: ChallengeDefinition; row: UserChallengeRow }>,
    now: Date,
  ): { daily: ChallengeDefinitionView[]; weekly: ChallengeDefinitionView[] } {
    const daily: ChallengeDefinitionView[] = [];
    const weekly: ChallengeDefinitionView[] = [];
    for (const entry of current) {
      const window = challengePeriodService.windowFor(now, user.timezone, entry.definition.period);
      const view = this.challengeView(entry.definition, entry.row, {
        startDate: window.startDate,
        endDate: window.endDate,
      });
      (entry.definition.period === "weekly" ? weekly : daily).push(view);
    }
    return { daily, weekly };
  }

  private challengeHistoryForUser(
    userId: string,
    currentIds: Set<string>,
    timezone: string,
  ): ChallengeHistoryView[] {
    return this.userChallenges
      .filter((row) => row.userId === userId && !currentIds.has(`${row.challengeId}:${row.periodStart.toISOString()}`))
      .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())
      .slice(0, 50)
      .flatMap((row) => {
        const definitionRow = this.challengeDefinitions.get(row.challengeId);
        if (!definitionRow) return [];
        return [this.challengeHistoryView(challengeRowToDefinition(definitionRow), row, timezone)];
      });
  }

  private gamificationProfileForUser(
    user: UserRecord,
    rules: GamificationRules,
  ): GamificationProfileRecord {
    const activities = this.gamificationActivities.filter(
      (activity) => activity.userId === user.id && activity.actionType === "product_scan",
    );
    const existing = this.gamificationProfiles.get(user.id);
    const activityDates = activities.map((activity) => activity.activityDate);
    const now = rules.now();
    const today = rules.streakService.today(user.timezone, now);
    const base = rules.streakService.calculateForProfile(activityDates, today);
    const totalXp =
      existing?.totalXp ?? activities.reduce((sum, activity) => sum + activity.xpAwarded, 0);
    const longestStreak = Math.max(existing?.longestStreak ?? 0, base.longestStreak);

    // Module 4 runs first: a consumed protection changes the streak answer.
    // `longestStreak` is protection-independent, so reward eligibility is
    // evaluated from it without a circular read.
    this.reconcileModule4(user.id, {
      now,
      today,
      activityDates,
      totalXp,
      longestStreak,
    });
    const calculated = rules.streakService.calculateForProfile(
      activityDates,
      today,
      this.protectedDatesFor(user.id),
    );
    return {
      userId: user.id,
      totalXp,
      currentStreak: calculated.currentStreak,
      longestStreak: Math.max(existing?.longestStreak ?? 0, calculated.longestStreak),
      lastActivityDate: calculated.lastActivityDate,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // ── Module 2: levels + achievements ────────────────────────
  private unlockedAchievementsFor(userId: string): AchievementRecord[] {
    return this.userAchievements.filter((entry) => entry.userId === userId);
  }

  /**
   * Counters derived from real activity rows, using the same counting helpers
   * Module 3 uses so "unique product" means one thing across the system.
   */
  private achievementCountersFor(userId: string): AchievementCounters {
    const activities: ChallengeActivityRow[] = this.gamificationActivities
      .filter((activity) => activity.userId === userId)
      .map((activity) => ({
        activityType: activity.actionType,
        activityDate: activity.activityDate,
        productId: activity.productId,
        ingredientId: activity.ingredientId ?? null,
        eventId: activity.eventId,
      }));
    return {
      uniqueProductsScanned: countUniqueProducts(activities),
      ingredientViews: countIngredientViews(activities),
      meaningfulChats: countMeaningfulChats(activities),
      challengesCompleted: this.userChallenges.filter(
        (challenge) => challenge.userId === userId && challenge.completed,
      ).length,
    };
  }

  /**
   * Record every achievement the user has genuinely reached and pay its XP.
   *
   * Mirrors the Prisma path. The caller holds `gamificationLock`, so the
   * equivalent of the unique (user, achievement) constraint is the check for an
   * existing record, and XP is only added for a record actually created.
   */
  private achievementStateFor(
    userId: string,
    rules: GamificationRules,
    previousTotalXp?: number,
  ): AchievementStateResult {
    const profile = this.gamificationProfiles.get(userId);
    const baseXp = profile?.totalXp ?? 0;
    const before = this.unlockedAchievementsFor(userId);
    const context: AchievementContext = {
      userId,
      now: rules.now(),
      totalXp: baseXp,
      longestStreak: profile?.longestStreak ?? 0,
      ...this.achievementCountersFor(userId),
      unlocked: before,
    };

    const newlyUnlocked: string[] = [];
    let awardedXp = 0;
    for (const definition of pendingUnlocks(context)) {
      if (this.userAchievements.some(
        (entry) => entry.userId === userId && entry.achievementId === definition.id,
      )) {
        continue;
      }
      this.userAchievements.push({
        achievementId: definition.id,
        userId,
        unlockedAt: context.now.toISOString(),
        xpAwarded: definition.rewardXp,
      });
      newlyUnlocked.push(definition.id);
      awardedXp += definition.rewardXp;
    }

    if (awardedXp > 0 && profile) {
      this.gamificationProfiles.set(userId, { ...profile, totalXp: baseXp + awardedXp });
    }
    const totalXp = baseXp + awardedXp;
    const unlockedAfter =
      newlyUnlocked.length > 0 ? this.unlockedAchievementsFor(userId) : before;
    const { from, to, leveledUp } = levelUpBetween(previousTotalXp ?? baseXp, totalXp);
    return {
      level: toLevelView(to),
      achievements: summarizeAchievements(
        achievementViews({ ...context, totalXp, unlocked: unlockedAfter }),
      ),
      leveled_up: leveledUp,
      level_up: leveledUp
        ? { from_level: from.level, to_level: to.level, total_xp: totalXp }
        : null,
      newly_unlocked: newlyUnlocked,
    };
  }

  /**
   * Completion counts for the user's current daily and weekly instances,
   * using the same period service as Module 3 so the two never disagree.
   */
  private challengeCountsFor(
    userId: string,
    rules: GamificationRules,
    timezone: string,
  ): {
    daily_completed: number;
    daily_total: number;
    weekly_completed: number;
    weekly_total: number;
  } {
    const now = rules.now();
    const periods = new Map(
      listChallengeDefinitions().map((definition) => [definition.id, definition.period]),
    );
    const dailyWindow = challengePeriodService.windowFor(now, timezone, "daily");
    const weeklyWindow = challengePeriodService.windowFor(now, timezone, "weekly");
    const live = this.userChallenges.filter((challenge) => {
      if (challenge.userId !== userId) return false;
      const period = periods.get(challenge.challengeId);
      if (!period) return false;
      const window = period === "weekly" ? weeklyWindow : dailyWindow;
      return (
        challenge.periodStart >= window.startInstant && challenge.periodStart < window.endInstant
      );
    });
    const weekly = live.filter(
      (challenge) => periods.get(challenge.challengeId) === "weekly",
    );
    const daily = live.filter(
      (challenge) => periods.get(challenge.challengeId) === "daily",
    );
    return {
      daily_completed: daily.filter((challenge) => challenge.completed).length,
      daily_total: daily.length,
      weekly_completed: weekly.filter((challenge) => challenge.completed).length,
      weekly_total: weekly.length,
    };
  }

  async getAchievementState(
    userId: string,
    rules: GamificationRules,
  ): Promise<AchievementStateResult> {
    return this.withGamificationLock(async () => {
      if (!this.users.has(userId)) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      }
      return this.achievementStateFor(userId, rules);
    });
  }

  // ── Module 4: streak protection + rewards ──────────────────
  private protectionFor(userId: string): { availableCount: number; usedCount: number } {
    return this.streakProtections.get(userId) ?? { availableCount: 0, usedCount: 0 };
  }

  private protectedDatesFor(userId: string): string[] {
    return this.streakProtectionUsages
      .filter((usage) => usage.userId === userId)
      .map((usage) => usage.protectedDate);
  }

  private usageFor(userId: string): StreakProtectionUsageRecord[] {
    return this.streakProtectionUsages
      .filter((usage) => usage.userId === userId)
      .sort((a, b) => (a.usedAt < b.usedAt ? 1 : -1));
  }

  /**
   * Grant earned rewards, then spend protections on genuinely missed days.
   *
   * Mirrors the Prisma path and relies on the same unique keys: a milestone is
   * recorded at most once per user, and a missed date is bridged at most once.
   * The caller holds `gamificationLock`, so this is serialized.
   */
  private reconcileModule4(
    userId: string,
    input: {
      now: Date;
      today: string;
      activityDates: readonly string[];
      totalXp: number;
      longestStreak: number;
    },
  ): void {
    const profile = this.gamificationProfiles.get(userId);
    const context: RewardEvaluationContext = {
      userId,
      now: input.now,
      profile: {
        userId,
        totalXp: input.totalXp,
        currentStreak: input.longestStreak,
        longestStreak: input.longestStreak,
        lastActivityDate: input.activityDates.at(-1) ?? null,
        createdAt: profile?.createdAt ?? input.now.toISOString(),
        updatedAt: profile?.updatedAt ?? input.now.toISOString(),
      },
      completedChallengeIds: this.userChallenges
        .filter((challenge) => challenge.userId === userId && challenge.completed)
        .map((challenge) => challenge.challengeId),
      definitions: listRewardDefinitions(),
    };

    const recordedKeys = new Set(
      this.userRewards.filter((reward) => reward.userId === userId).map((r) => r.milestoneKey),
    );
    for (const definition of listRewardDefinitions()) {
      const observed = observeCondition(definition, context);
      if (observed === null || observed < definition.condition.target) continue;
      const milestoneKey = milestoneKeyFor(definition, observed);
      if (recordedKeys.has(milestoneKey)) continue;

      if (definition.autoClaim && definition.rewardType === "STREAK_PROTECTION") {
        const current = this.protectionFor(userId);
        const capped = applyProtectionCap(current.availableCount, definition.rewardValue);
        this.streakProtections.set(userId, {
          availableCount: capped.availableCount,
          usedCount: current.usedCount,
        });
      }
      if (definition.autoClaim && definition.rewardType === "XP_BONUS") {
        if (profile) {
          this.gamificationProfiles.set(userId, {
            ...profile,
            totalXp: profile.totalXp + definition.rewardValue,
          });
        }
      }
      this.userRewards.push({
        userRewardId: this.nextId("reward"),
        userId,
        rewardId: definition.id,
        milestoneKey,
        earnedAt: input.now.toISOString(),
        claimed: definition.autoClaim,
        claimedAt: definition.autoClaim ? input.now.toISOString() : null,
      });
      recordedKeys.add(milestoneKey);
    }

    const protection = this.protectionFor(userId);
    const decision = decideProtection({
      activityDates: input.activityDates,
      protectedDates: this.protectedDatesFor(userId),
      today: input.today,
      availableCount: protection.availableCount,
    });
    if (decision.declined || decision.protectedDates.length === 0) return;

    let availableCount = protection.availableCount;
    let usedCount = protection.usedCount;
    for (const protectedDate of decision.protectedDates) {
      if (availableCount <= 0) break;
      // The unique (user, date) rule: a date is bridged at most once.
      if (this.streakProtectionUsages.some(
        (usage) => usage.userId === userId && usage.protectedDate === protectedDate,
      )) {
        continue;
      }
      this.streakProtectionUsages.push({
        usageId: this.nextId("protection"),
        userId,
        protectedDate,
        streakBefore: decision.streakBefore,
        streakAfter: decision.streakAfter,
        usedAt: input.now.toISOString(),
        reason: PROTECTION_REASONS.missedActivityDay,
      });
      availableCount -= 1;
      usedCount += 1;
    }
    // Only write when this pass moved a counter, so a read never seeds a
    // zero-protection record. Mirrors the Prisma path.
    if (availableCount !== protection.availableCount || usedCount !== protection.usedCount) {
      this.streakProtections.set(userId, { availableCount, usedCount });
    }
  }

  private rewardViewsFor(
    userId: string,
    context: RewardEvaluationContext,
  ): RewardView[] {
    const earned = new Map<string, RewardRecord>();
    for (const record of this.userRewards) {
      if (record.userId !== userId) continue;
      // Most recent record wins, so a repeatable reward shows its latest state.
      const previous = earned.get(record.rewardId);
      if (!previous || previous.earnedAt < record.earnedAt) {
        earned.set(record.rewardId, record);
      }
    }
    return listRewardDefinitions().map((definition) =>
      toRewardView(definition, context, earned.get(definition.id) ?? null),
    );
  }

  private summarizeRewards(rewards: RewardView[]): RewardListResult {
    const earned = rewards.filter((reward) => reward.earned);
    return {
      rewards,
      available: earned.filter((reward) => !reward.claimed).length,
      earned: earned.length,
      claimed: rewards.filter((reward) => reward.claimed).length,
    };
  }

  private module4Context(
    userId: string,
    rules: GamificationRules,
  ): RewardEvaluationContext {
    const user = this.users.get(userId);
    if (!user) throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
    const profile = this.gamificationProfileForUser(user, rules);
    return {
      userId,
      now: rules.now(),
      profile,
      completedChallengeIds: this.userChallenges
        .filter((challenge) => challenge.userId === userId && challenge.completed)
        .map((challenge) => challenge.challengeId),
      definitions: listRewardDefinitions(),
    };
  }

  async getStreakProtection(
    userId: string,
    rules: GamificationRules,
  ): Promise<StreakProtectionStatus> {
    return this.withGamificationLock(async () => {
      const user = this.users.get(userId);
      if (!user) throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      const profile = this.gamificationProfileForUser(user, rules);
      const usage = this.usageFor(userId);
      const protection = this.protectionFor(userId);
      const latest = usage[0];
      return {
        available_count: protection.availableCount,
        used_count: protection.usedCount,
        max_available: streakProtectionConfig.maxAvailable,
        current_streak: profile.currentStreak,
        last_protected: latest
          ? {
              protected_date: latest.protectedDate,
              used_at: latest.usedAt,
              reason: latest.reason,
            }
          : null,
      };
    });
  }

  async getStreakProtectionHistory(
    userId: string,
    limit = rewardsConfig.historyLimit,
  ): Promise<StreakProtectionHistoryResult> {
    return this.withGamificationLock(async () => {
      if (!this.users.has(userId)) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      }
      return {
        history: this.usageFor(userId).slice(0, limit).map((usage) => ({
          protected_date: usage.protectedDate,
          streak_before: usage.streakBefore,
          streak_after: usage.streakAfter,
          used_at: usage.usedAt,
          reason: usage.reason,
        })),
      };
    });
  }

  async getRewards(userId: string, rules: GamificationRules): Promise<RewardListResult> {
    return this.withGamificationLock(async () => {
      const context = this.module4Context(userId, rules);
      return this.summarizeRewards(this.rewardViewsFor(userId, context));
    });
  }

  async getRewardHistory(
    userId: string,
    rules: GamificationRules,
  ): Promise<RewardListResult> {
    return this.getRewards(userId, rules);
  }

  async claimReward(
    userId: string,
    input: { userRewardId?: string | null; rewardId?: string | null },
    rules: GamificationRules,
  ): Promise<ClaimRewardResult> {
    return this.withGamificationLock(async () => {
      const context = this.module4Context(userId, rules);
      const rewardId = input.userRewardId
        ? this.userRewards.find(
            (reward) => reward.userId === userId && reward.userRewardId === input.userRewardId,
          )?.rewardId
        : input.rewardId;
      if (!rewardId) throw new AppError(ErrorCodes.VALIDATION_ERROR, "reward_id is required");
      const definition = listRewardDefinitions().find((entry) => entry.id === rewardId);
      if (!definition) throw new AppError(ErrorCodes.VALIDATION_ERROR, "Unknown reward", 400);

      const view = this.rewardViewsFor(userId, context).find(
        (entry) => entry.reward_id === rewardId,
      );
      // Eligibility is re-derived server-side; the client cannot assert it.
      if (!view?.earned) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Reward has not been earned", 400);
      }
      if (view.claimed) {
        return { reward: view, claimed: false, alreadyClaimed: true };
      }
      const target = this.userRewards
        .filter((reward) => reward.userId === userId && reward.rewardId === rewardId && !reward.claimed)
        .sort((a, b) => (a.earnedAt < b.earnedAt ? -1 : 1))[0];
      if (!target) return { reward: view, claimed: false, alreadyClaimed: true };

      if (definition.rewardType === "STREAK_PROTECTION") {
        const protection = this.protectionFor(userId);
        const next = Math.min(
          streakProtectionConfig.maxAvailable,
          protection.availableCount + definition.rewardValue,
        );
        this.streakProtections.set(userId, { ...protection, availableCount: next });
      } else if (definition.rewardType === "XP_BONUS") {
        const profile = this.gamificationProfiles.get(userId);
        if (profile) {
          this.gamificationProfiles.set(userId, {
            ...profile,
            totalXp: profile.totalXp + definition.rewardValue,
          });
        }
      }
      target.claimed = true;
      target.claimedAt = context.now.toISOString();

      const refreshed = this.module4Context(userId, rules);
      const updated =
        this.rewardViewsFor(userId, refreshed).find((entry) => entry.reward_id === rewardId) ??
        view;
      return { reward: updated, claimed: true, alreadyClaimed: false };
    });
  }

  async getGamificationOverview(
    userId: string,
    rules: GamificationRules,
  ): Promise<GamificationOverview> {
    return this.withGamificationLock(async () => {
      const user = this.users.get(userId);
      if (!user) throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      const state = this.achievementStateFor(userId, rules);
      const context = this.module4Context(userId, rules);
      const rewards = this.rewardViewsFor(userId, context);
      const earned = rewards.filter((reward) => reward.earned);
      const protection = this.protectionFor(userId);
      const challenges = this.challengeCountsFor(userId, rules, user.timezone ?? "UTC");
      return {
        // Read from the Module 2 result so an achievement payout taken during
        // this same locked pass is already included.
        total_xp: state.level.total_xp,
        level: state.level,
        current_streak: context.profile.currentStreak,
        longest_streak: context.profile.longestStreak,
        achievements: {
          unlocked: state.achievements.unlocked,
          total: state.achievements.total,
        },
        challenges,
        streak_protection: {
          available_count: protection.availableCount,
          max_available: streakProtectionConfig.maxAvailable,
          used_count: protection.usedCount,
        },
        rewards: {
          available: earned.filter((reward) => !reward.claimed).length,
          earned: earned.length,
        },
      };
    });
  }

  // ── products ──────────────────────────────────────────────
  async getProductByBarcode(barcode: string): Promise<ProductInfo | null> {
    return this.products.find((p) => p.barcode === barcode.trim()) ?? null;
  }

  async getProductById(id: string): Promise<ProductInfo | null> {
    return this.products.find((p) => p.id === id) ?? null;
  }

  async getNutritionForProduct(productId: string): Promise<NutritionFacts | null> {
    return this.nutritionByProduct.get(productId) ?? null;
  }

  async saveProductFromProvider(lookup: ProductLookupResult): Promise<ProductLookupResult> {
    if (!lookup.product) return lookup;
    const existing = await this.getProductByBarcode(lookup.product.barcode);
    if (existing) {
      return { product: existing, nutrition: await this.getNutritionForProduct(existing.id), source: lookup.source };
    }
    const product: ProductInfo = { ...lookup.product, id: this.nextId("prod") };
    this.products.push(product);
    if (lookup.nutrition) this.nutritionByProduct.set(product.id, lookup.nutrition);
    return { product, nutrition: lookup.nutrition, source: lookup.source };
  }

  async searchProducts(query: string, category: ProductCategory | "all" = "all"): Promise<ProductSearchResult[]> {
    const q = query.toLowerCase().trim();
    // Multi-word queries ("low sugar products") are scored per term. Treating
    // the whole query as one substring meant such queries matched nothing.
    const tokens = tokenizeCatalogQuery(query);
    const results: ProductSearchResult[] = [];
    for (const product of this.products) {
      if (category !== "all" && product.category !== category) continue;
      const name = product.name.toLowerCase();
      const brand = product.brand?.toLowerCase() ?? "";
      const raw = product.ingredientsRaw.toLowerCase();
      let rank = 0;
      const matchedOn: string[] = [];
      if (q) {
        // Keep the exact-phrase path as a bonus so a literal full-query match
        // still outranks scattered term matches.
        const phraseHit =
          name.includes(q) || brand.includes(q) || product.barcode.includes(q) || raw.includes(q);
        const scored = scoreCatalogMatch(tokens, {
          name: product.name,
          brand: product.brand,
          barcode: product.barcode,
          ingredients: product.ingredientsRaw,
        });
        if (scored.matched === 0) continue;
        rank = scored.score + (phraseHit ? 150 : 0);
        if (name.includes(q) || matchesCatalogTerm(product.name, tokens)) matchedOn.push("name");
        if (brand.includes(q) || matchesCatalogTerm(product.brand, tokens)) matchedOn.push("brand");
        if (product.barcode.includes(q) || tokens.some((t) => product.barcode.toLowerCase().includes(t))) {
          matchedOn.push("barcode");
        }
        if (raw.includes(q) || tokens.some((t) => raw.includes(t))) matchedOn.push("ingredient");
      } else {
        rank = 50;
      }
      results.push({ product, rank, matchedOn });
    }
    return results.sort((a, b) => b.rank - a.rank).slice(0, MAX_SEARCH_RESULTS);
  }

  async updateProductImage(productId: string, imageUrl: string): Promise<void> {
    const product = this.products.find((p) => p.id === productId);
    if (product) product.imageUrl = imageUrl;
  }

  // ── ingredients ───────────────────────────────────────────
  async getIngredientById(id: string): Promise<IngredientRecord | null> {
    return this.ingredients.get(id) ?? null;
  }

  async getIngredientByCanonical(name: string): Promise<IngredientRecord | null> {
    const lower = name.toLowerCase();
    return [...this.ingredients.values()].find((i) => i.canonicalName.toLowerCase() === lower) ?? null;
  }

  async getIngredientByAlias(alias: string): Promise<IngredientRecord | null> {
    const lower = alias.toLowerCase().trim();
    return (
      [...this.ingredients.values()].find((i) =>
        i.aliases.some((a) => a.alias.toLowerCase() === lower),
      ) ?? null
    );
  }

  async listIngredients(): Promise<IngredientRecord[]> {
    return [...this.ingredients.values()];
  }

  async upsertIngredient(record: IngredientRecord): Promise<void> {
    this.ingredients.set(record.id, record);
  }

  async getEvidenceByIngredientId(ingredientId: string): Promise<EvidenceRef[]> {
    return this.evidenceByIngredient.get(ingredientId) ?? [];
  }

  // ── unknown ingredients ───────────────────────────────────
  async addUnknownIngredient(input: {
    rawName: string;
    normalizedAttempt: string | null;
    confidence: number;
    context: string | null;
  }): Promise<UnknownIngredientInfo> {
    const entry: UnknownIngredientInfo = {
      id: this.nextId("unk"),
      rawName: input.rawName,
      normalizedAttempt: input.normalizedAttempt,
      confidence: input.confidence,
      status: "pending",
      context: input.context,
      createdAt: new Date().toISOString(),
    };
    this.unknown.push(entry);
    return entry;
  }

  async listUnknownIngredients(status?: string): Promise<UnknownIngredientInfo[]> {
    return this.unknown.filter((u) => !status || u.status === status);
  }

  async resolveUnknownIngredient(
    id: string,
    status: "resolved" | "dismissed",
    resolvedIngredientId?: string,
  ): Promise<void> {
    const entry = this.unknown.find((u) => u.id === id);
    if (entry) {
      entry.status = status;
      if (resolvedIngredientId) entry.confidence = 1;
    }
  }

  // ── users ─────────────────────────────────────────────────
  async getUserByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async createUser(input: {
    email: string;
    name: string;
    passwordHash: string | null;
    role?: "USER" | "ADMIN";
    language?: "EN" | "HI";
    timezone?: string;
  }): Promise<UserRecord> {
    // Mirror the Postgres unique index so mock-mode tests exercise the same
    // conflict path as production (service catches `P2002`).
    if (await this.getUserByEmail(input.email)) {
      throw Object.assign(new Error("Unique constraint failed on the fields: (`email`)"), {
        code: "P2002",
      });
    }
    const user: UserRecord = {
      id: this.nextId("usr"),
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      role: input.role ?? "USER",
      language: input.language ?? "EN",
      timezone: input.timezone?.trim() || "UTC",
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, fields: { name?: string; language?: "EN" | "HI"; timezone?: string }): Promise<UserRecord | null> {
    const user = this.users.get(id);
    if (!user) return null;
    if (fields.name) user.name = fields.name;
    if (fields.language) user.language = fields.language;
    if (fields.timezone?.trim()) user.timezone = fields.timezone.trim();
    return user;
  }

  async getUserPreferences(userId: string): Promise<UserPreferencesRecord | null> {
    return this.preferences.get(userId) ?? null;
  }

  async upsertUserPreferences(userId: string, prefs: UserPreferencesInput): Promise<UserPreferencesRecord> {
    const record = await preferencesToRecord(userId, prefs);
    this.preferences.set(userId, record);
    return record;
  }

  async listUsers(): Promise<UserRecord[]> {
    return [...this.users.values()];
  }

  // ── history ───────────────────────────────────────────────
  async addHistoryEntry(
    userId: string,
    entry: { productId: string | null; assessmentSnapshot: unknown; source: string },
  ): Promise<HistoryEntryInfo> {
    const record: HistoryEntryInfo = {
      id: this.nextId("hist"),
      userId,
      productId: entry.productId,
      scannedAt: new Date().toISOString(),
      assessmentSnapshot: entry.assessmentSnapshot as HistoryEntryInfo["assessmentSnapshot"],
      source: entry.source,
    };
    this.history.unshift(record);
    // Mirror the Prisma store's write-side cap: without it an open POST
    // /api/history loop grows this array (and the real table) without bound.
    const mine = this.history.filter((h) => h.userId === userId);
    if (mine.length > MAX_HISTORY_ENTRIES) {
      const stale = new Set(mine.slice(MAX_HISTORY_ENTRIES).map((h) => h.id));
      this.history = this.history.filter((h) => !stale.has(h.id));
    }
    return record;
  }

  async listHistory(userId: string): Promise<HistoryEntryInfo[]> {
    return this.history.filter((h) => h.userId === userId).slice(0, MAX_HISTORY_LIST);
  }

  async deleteHistoryEntry(userId: string, entryId: string): Promise<boolean> {
    const index = this.history.findIndex((h) => h.id === entryId && h.userId === userId);
    if (index === -1) return false;
    this.history.splice(index, 1);
    return true;
  }

  // ── gamification (XP + daily streak) ───────────────────────
  async getGamificationProfile(
    userId: string,
    rules: GamificationRules,
  ): Promise<GamificationProfileRecord> {
    return this.withGamificationLock(async () => {
      const user = this.users.get(userId);
      if (!user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      }
      const profile = this.gamificationProfileForUser(user, rules);
      const existing = this.gamificationProfiles.get(userId);
      // A profile row is created only after real activity; reads never create
      // a fake activity or a fake XP balance.
      if (existing) this.gamificationProfiles.set(userId, profile);
      return profile;
    });
  }

  async recordSuccessfulProductScan(
    input: SuccessfulProductScanInput,
    rules: GamificationRules,
    challengeDefinitions: readonly ChallengeDefinition[] = [],
  ): Promise<GamificationActivityResult> {
    return this.withGamificationLock(async () => {
      if (input.actionType !== "product_scan") {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Unsupported gamification action");
      }
      const user = this.users.get(input.userId);
      if (!user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      }
      const product = this.products.find((candidate) => candidate.id === input.productId);
      // Only reject demo products when running in mock mode without DATABASE_URL
      // In real mode, all products from real data sources should be accepted
      const isMockMode = !config.databaseUrl;
      if (!product || (isMockMode && product.isDemo)) {
        throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product was not found", 404);
      }

      const userActivities = this.gamificationActivities.filter(
        (activity) => activity.userId === input.userId && activity.actionType === input.actionType,
      );
      const existingByEvent = input.eventIdProvided
        ? userActivities.find((activity) => activity.eventId === input.eventId)
        : undefined;
      if (existingByEvent) {
        return {
          activity: { ...existingByEvent },
          profile: this.gamificationProfileForUser(user, rules),
          idempotent: true,
          completedChallenges: [],
        };
      }

      const existingRecent = input.eventIdProvided
        ? undefined
        : userActivities.find(
            (activity) =>
              activity.productId === input.productId &&
              new Date(activity.timestamp).getTime() >=
                input.timestamp.getTime() - rules.duplicateRequestWindowMs,
          );
      if (existingRecent) {
        return {
          activity: { ...existingRecent },
          profile: this.gamificationProfileForUser(user, rules),
          idempotent: true,
          completedChallenges: [],
        };
      }

      const activityDate = rules.streakService.activityDate(input.timestamp, user.timezone);
      const isNewProduct = !userActivities.some(
        (activity) => activity.productId === input.productId,
      );
      const hasPriorProductOnDate = userActivities.some(
        (activity) =>
          activity.productId === input.productId && activity.activityDate === activityDate,
      );
      const xpAwarded = rules.xpService.calculateProductScanXp({
        isNewProduct,
        hasPriorProductOnDate,
      });
      const activity = {
        activityId: this.nextId("activity"),
        userId: input.userId,
        actionType: input.actionType,
        productId: input.productId,
        activityDate,
        timestamp: input.timestamp.toISOString(),
        xpAwarded,
        eventId: input.eventId,
      };
      const streak = rules.streakService.calculateAfterActivity(
        [...userActivities.map((entry) => entry.activityDate), activityDate],
        activityDate,
      );
      const previous = this.gamificationProfiles.get(input.userId);
      const now = new Date().toISOString();
      const profile: GamificationProfileRecord = {
        userId: input.userId,
        totalXp: (previous?.totalXp ?? 0) + xpAwarded,
        currentStreak: streak.currentStreak,
        longestStreak: Math.max(previous?.longestStreak ?? 0, streak.longestStreak),
        lastActivityDate: streak.lastActivityDate,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };

      // Mutate only after all validation and calculations have succeeded.
      this.gamificationActivities.push(activity);
      this.gamificationProfiles.set(input.userId, profile);

      let challenges: ReturnType<typeof this.challengeViewsForUser> | null = null;
      let completedChallenges: GamificationActivityResult["completedChallenges"];
      // The authoritative profile after scan XP *and* any challenge reward, so
      // Module 2 reconciles once over the real final total.
      let finalProfile = profile;

      if (challengeDefinitions.length > 0) {
        this.syncChallengeDefinitions(challengeDefinitions);
        const current = this.currentChallengeRows(input.userId, input.timestamp, user.timezone);
        const outcome = this.evaluateCurrentChallenges(user, current, input.timestamp, rules);
        finalProfile =
          outcome.rewardXp > 0
            ? this.applyChallengeReward(user, outcome.rewardXp, input.timestamp, rules)
            : profile;
        challenges = this.challengeViewsForUser(user, current, input.timestamp);
        completedChallenges = outcome.completed.map(({ definition }) => ({
          challenge_id: definition.id,
          name: definition.title,
          description: definition.description,
          xp_reward: definition.rewardXp,
        }));
      }

      // Module 2 reconciles last, after the challenge reward, so a level
      // crossing caused by either source is reported exactly once and the
      // `profile` and `level` XP figures in this response cannot disagree.
      const module2 = this.achievementStateFor(input.userId, rules, previous?.totalXp ?? 0);
      const events = {
        level: module2.level,
        level_up: module2.level_up,
        newly_unlocked: module2.achievements.achievements.filter((view) =>
          module2.newly_unlocked.includes(view.achievement_id),
        ),
      };
      // An achievement payout may have raised XP again, so report the profile
      // as it stands after Module 2 rather than a now-stale snapshot.
      finalProfile =
        this.gamificationProfiles.get(input.userId) ?? finalProfile;

      if (challenges) {
        return {
          activity: { ...activity },
          profile: { ...finalProfile },
          idempotent: false,
          ...events,
          challenges: [...challenges.daily, ...challenges.weekly],
          completedChallenges,
        };
      }

      return { activity: { ...activity }, profile: { ...finalProfile }, idempotent: false, ...events };
    });
  }

  async recordValidatedActivity(
    input: ValidatedGamificationActivityInput,
    rules: GamificationRules,
    challengeDefinitions: readonly ChallengeDefinition[] = [],
  ): Promise<GamificationActivityResult> {
    return this.withGamificationLock(async () => {
      if (input.actionType !== "ingredient_view" && input.actionType !== "meaningful_chat") {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "Unsupported gamification action");
      }
      const user = this.users.get(input.userId);
      if (!user) throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      const product = this.products.find((candidate) => candidate.id === input.productId);
      if (!product || product.isDemo) {
        throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product was not found", 404);
      }
      if (!input.eventId || input.eventId.length < 8 || input.eventId.length > 128) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, "event_id must be 8-128 characters");
      }
      const existing = this.gamificationActivities.find(
        (activity) => activity.userId === input.userId && activity.eventId === input.eventId,
      );
      if (existing) {
        const profile = this.gamificationProfileForUser(user, rules);
        const current = challengeDefinitions.length > 0
          ? (this.syncChallengeDefinitions(challengeDefinitions),
            this.currentChallengeRows(input.userId, input.timestamp, user.timezone))
          : [];
        return {
          activity: { ...existing },
          profile,
          idempotent: true,
          challenges: current.length > 0
            ? Object.values(this.challengeViewsForUser(user, current, input.timestamp)).flat()
            : undefined,
          completedChallenges: [],
        };
      }

      const activityDate = challengePeriodService.localDateKey(input.timestamp, user.timezone);
      const activity = {
        activityId: this.nextId("activity"),
        userId: input.userId,
        actionType: input.actionType,
        productId: input.productId,
        ingredientId: input.ingredientId ?? null,
        activityDate,
        timestamp: input.timestamp.toISOString(),
        xpAwarded: 0,
        eventId: input.eventId,
      };
      this.gamificationActivities.push(activity);
      if (challengeDefinitions.length === 0) {
        return {
          activity: { ...activity },
          profile: this.gamificationProfileForUser(user, rules),
          idempotent: false,
        };
      }

      this.syncChallengeDefinitions(challengeDefinitions);
      const current = this.currentChallengeRows(input.userId, input.timestamp, user.timezone);
      const outcome = this.evaluateCurrentChallenges(user, current, input.timestamp, rules);
      const profile = outcome.rewardXp > 0
        ? this.applyChallengeReward(user, outcome.rewardXp, input.timestamp, rules)
        : this.gamificationProfileForUser(user, rules);
      const views = this.challengeViewsForUser(user, current, input.timestamp);
      return {
        activity: { ...activity },
        profile,
        idempotent: false,
        challenges: [...views.daily, ...views.weekly],
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
  ): Promise<{ daily: ChallengeDefinitionView[]; weekly: ChallengeDefinitionView[]; history: ChallengeHistoryView[] }> {
    return this.withGamificationLock(async () => {
      const user = this.users.get(userId);
      if (!user) throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
      this.syncChallengeDefinitions(challengeDefinitions);
      const current = this.currentChallengeRows(userId, now, user.timezone);
      const rules: GamificationRules = {
        now: () => now,
        duplicateRequestWindowMs: 0,
        xpService,
        streakService,
      };
      const outcome = this.evaluateCurrentChallenges(user, current, now, rules);
      if (outcome.rewardXp > 0) {
        this.applyChallengeReward(user, outcome.rewardXp, now, rules);
      }
      const views = this.challengeViewsForUser(user, current, now);
      const currentIds = new Set(current.map(({ row }) => `${row.challengeId}:${row.periodStart.toISOString()}`));
      return { ...views, history: this.challengeHistoryForUser(userId, currentIds, user.timezone) };
    });
  }

  // ── chat conversations ────────────────────────────────────
  async createConversation(userId: string): Promise<ChatConversationRecord> {
    const now = new Date().toISOString();
    const record: ChatConversationRecord = { id: this.nextId("conv"), userId, createdAt: now, updatedAt: now };
    this.conversations.set(record.id, record);
    return record;
  }

  async listConversations(userId: string): Promise<ChatConversationRecord[]> {
    return [...this.conversations.values()]
      .filter((c) => c.userId === userId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, 50);
  }

  async getConversation(conversationId: string): Promise<ChatConversationRecord | null> {
    return this.conversations.get(conversationId) ?? null;
  }

  async appendChatMessage(
    conversationId: string,
    userId: string,
    role: ChatRole,
    content: string,
  ): Promise<ChatMessageRecord> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error(`Conversation ${conversationId} not found for user ${userId}`);
    }
    const record: ChatMessageRecord = {
      id: this.nextId("msg"),
      conversationId,
      userId,
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    this.chatMessages.push(record);
    conversation.updatedAt = record.createdAt;
    return record;
  }

  async listChatMessages(conversationId: string, limit = 50): Promise<ChatMessageRecord[]> {
    return this.chatMessages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .slice(-limit);
  }

  // ── knowledge base (RAG) ──────────────────────────────────
  async upsertKnowledgeDocument(doc: KnowledgeDocumentRecord): Promise<void> {
    this.knowledgeDocuments.set(doc.id, doc);
  }

  async listKnowledgeDocuments(category?: string): Promise<KnowledgeDocumentRecord[]> {
    const all = [...this.knowledgeDocuments.values()];
    return category ? all.filter((d) => d.category === category) : all;
  }

  async insertKnowledgeChunks(chunks: KnowledgeChunkRecord[]): Promise<void> {
    this.knowledgeChunks = this.knowledgeChunks.filter(
      (c) => !chunks.some((n) => n.documentId === c.documentId),
    );
    this.knowledgeChunks.push(...chunks);
  }

  async searchKnowledgeChunks(
    query: string,
    options: { category?: string; limit?: number; queryEmbedding?: number[] | null } = {},
  ): Promise<KnowledgeSearchHit[]> {
    const limit = options.limit ?? 5;
    const category = options.category;
    const pool = category
      ? this.knowledgeChunks.filter((c) => {
          const doc = this.knowledgeDocuments.get(c.documentId);
          return doc?.category === category;
        })
      : this.knowledgeChunks;

    const hits: KnowledgeSearchHit[] = [];
    for (const chunk of pool) {
      let score: number;
      if (chunk.embedding && options.queryEmbedding) {
        score = cosineSimilarity(options.queryEmbedding, chunk.embedding);
      } else {
        const queryTokens = new Set(
          query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).filter((t) => !STOPWORDS.has(t)),
        );
        if (queryTokens.size === 0) continue;
        const contentTokens = new Set(
          chunk.content.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean),
        );
        const overlap = [...queryTokens].filter((t) => contentTokens.has(t)).length;
        if (overlap === 0) continue;
        score = overlap / Math.sqrt(queryTokens.size);
      }
      hits.push({ chunk, score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ── admin ─────────────────────────────────────────────────
  async logAdminAction(input: {
    adminId: string;
    action: string;
    entity: string;
    entityId?: string;
    detail?: string;
  }): Promise<void> {
    // In-memory audit trail is intentionally not persisted.
    void input;
  }

  async getAdminStats(): Promise<Record<string, number>> {
    return {
      products: this.products.length,
      ingredients: this.ingredients.size,
      users: this.users.size,
      pendingUnknownIngredients: this.unknown.filter((u) => u.status === "pending").length,
      historyEntries: this.history.length,
    };
  }
}
