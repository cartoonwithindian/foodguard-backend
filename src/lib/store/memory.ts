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
import { AppError, ErrorCodes } from "@/lib/errors";
import { xpService } from "@/gamification/services/xp.service";
import { streakService } from "@/gamification/services/streak.service";
import { cosineSimilarity, STOPWORDS } from "@/lib/embeddings";
import type { DataStore, ProductSearchResult, UserPreferencesRecord, UserRecord } from "./types";
import { preferencesToRecord } from "./types";
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

// Precomputed bcrypt hashes of the documented demo passwords
// (FoodGaurd@Admin1 / FoodGaurd@User1) so the demo accounts can
// actually log in when running in MOCK MODE (no DATABASE_URL).
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
  private products: ProductInfo[];
  private nutritionByProduct = new Map<string, NutritionFacts>();
  private ingredients: Map<string, IngredientRecord>;
  private evidenceByIngredient = new Map<string, EvidenceRef[]>();
  private unknown: UnknownIngredientInfo[] = [];
  private users: Map<string, UserRecord>;
  private preferences = new Map<string, UserPreferencesRecord>();
  private history: HistoryEntryInfo[] = [];
  private gamificationProfiles = new Map<string, GamificationProfileRecord>();
  private gamificationActivities: (GamificationActivityResult["activity"] & { ingredientId?: string | null })[] = [];
  private challengeDefinitions = new Map<string, ChallengeDefinitionRow>();
  private userChallenges: UserChallengeRow[] = [];
  private gamificationLock: Promise<void> = Promise.resolve();
  private conversations = new Map<string, ChatConversationRecord>();
  private chatMessages: ChatMessageRecord[] = [];
  private knowledgeDocuments = new Map<string, KnowledgeDocumentRecord>();
  private knowledgeChunks: KnowledgeChunkRecord[] = [];
  private counter = 0;

  constructor() {
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
    this.users = new Map<string, UserRecord>();
    if (config.seed.enabled) {
      const admin = seedUser(config.seed.adminEmail, "FoodGaurd Admin", "ADMIN", "EN", DEMO_ADMIN_HASH);
      const user = seedUser(config.seed.userEmail, "Demo User", "USER", "EN", DEMO_USER_HASH);
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
    const calculated = rules.streakService.calculateForProfile(
      activities.map((activity) => activity.activityDate),
      rules.streakService.today(user.timezone, rules.now()),
    );
    return {
      userId: user.id,
      totalXp: existing?.totalXp ?? activities.reduce((sum, activity) => sum + activity.xpAwarded, 0),
      currentStreak: calculated.currentStreak,
      longestStreak: Math.max(existing?.longestStreak ?? 0, calculated.longestStreak),
      lastActivityDate: calculated.lastActivityDate,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
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
    const results: ProductSearchResult[] = [];
    for (const product of this.products) {
      if (category !== "all" && product.category !== category) continue;
      const name = product.name.toLowerCase();
      const brand = product.brand?.toLowerCase() ?? "";
      const raw = product.ingredientsRaw.toLowerCase();
      if (q && !name.includes(q) && !brand.includes(q) && !product.barcode.includes(q) && !raw.includes(q)) continue;
      let rank = 0;
      const matchedOn: string[] = [];
      if (q) {
        if (name.includes(q)) {
          rank += 100;
          matchedOn.push("name");
        }
        if (brand.includes(q)) {
          rank += 60;
          matchedOn.push("brand");
        }
        if (product.barcode.includes(q)) {
          rank += 80;
          matchedOn.push("barcode");
        }
        if (raw.includes(q)) {
          rank += 30;
          matchedOn.push("ingredient");
        }
      } else {
        rank = 50;
      }
      results.push({ product, rank, matchedOn });
    }
    return results.sort((a, b) => b.rank - a.rank);
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
    return record;
  }

  async listHistory(userId: string): Promise<HistoryEntryInfo[]> {
    return this.history.filter((h) => h.userId === userId);
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
      if (!product || product.isDemo) {
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

      if (challengeDefinitions.length > 0) {
        this.syncChallengeDefinitions(challengeDefinitions);
        const current = this.currentChallengeRows(input.userId, input.timestamp, user.timezone);
        const outcome = this.evaluateCurrentChallenges(user, current, input.timestamp, rules);
        const finalProfile =
          outcome.rewardXp > 0
            ? this.applyChallengeReward(user, outcome.rewardXp, input.timestamp, rules)
            : profile;
        const views = this.challengeViewsForUser(user, current, input.timestamp);
        return {
          activity: { ...activity },
          profile: { ...finalProfile },
          idempotent: false,
          challenges: [...views.daily, ...views.weekly],
          completedChallenges: outcome.completed.map(({ definition }) => ({
            challenge_id: definition.id,
            name: definition.title,
            description: definition.description,
            xp_reward: definition.rewardXp,
          })),
        };
      }

      return { activity: { ...activity }, profile: { ...profile }, idempotent: false };
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
