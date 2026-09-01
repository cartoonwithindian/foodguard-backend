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
import { cosineSimilarity, STOPWORDS } from "@/lib/embeddings";
import type { DataStore, ProductSearchResult, UserPreferencesRecord, UserRecord } from "./types";
import { preferencesToRecord } from "./types";
import { PRODUCT_SEED, buildNutrition } from "@/data/seed/products";
import { INGREDIENT_SEED } from "@/data/seed/ingredients";
import { EVIDENCE_SEED } from "@/data/seed/evidence";
import { config } from "@/lib/config";
import type { ProductLookupResult } from "@/lib/product-provider";

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
): UserRecord {
  return {
    id: `usr-${email.split("@")[0]}-demo`,
    email,
    name,
    passwordHash,
    role,
    language,
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
  }): Promise<UserRecord> {
    const user: UserRecord = {
      id: this.nextId("usr"),
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      role: input.role ?? "USER",
      language: input.language ?? "EN",
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, fields: { name?: string; language?: "EN" | "HI" }): Promise<UserRecord | null> {
    const user = this.users.get(id);
    if (!user) return null;
    if (fields.name) user.name = fields.name;
    if (fields.language) user.language = fields.language;
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
