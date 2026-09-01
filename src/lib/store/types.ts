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
import type { ProductLookupResult } from "@/lib/product-provider";

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: "USER" | "ADMIN";
  language: "EN" | "HI";
  createdAt: string;
};

export type UserPreferencesRecord = {
  userId: string;
  vegetarian: boolean;
  vegan: boolean;
  allergies: string[];
  dietaryRestrictions: string[];
  avoidIngredients: string[];
  preferredIngredients: string[];
  healthGoals: string[];
  sensitivityPreferences: string[];
};

export type ProductSearchResult = { product: ProductInfo; rank: number; matchedOn: string[] };

/**
 * Persistence abstraction. Two implementations:
 *  - InMemoryStore: seeded demo store (MOCK MODE, no database needed)
 *  - PrismaStore:  PostgreSQL via Prisma (PRODUCTION MODE)
 */
export interface DataStore {
  // products
  getProductByBarcode(barcode: string): Promise<ProductInfo | null>;
  getProductById(id: string): Promise<ProductInfo | null>;
  getNutritionForProduct(productId: string): Promise<NutritionFacts | null>;
  saveProductFromProvider(lookup: ProductLookupResult): Promise<ProductLookupResult>;
  searchProducts(query: string, category?: ProductCategory | "all"): Promise<ProductSearchResult[]>;
  updateProductImage(productId: string, imageUrl: string): Promise<void>;

  // ingredients
  getIngredientById(id: string): Promise<IngredientRecord | null>;
  getIngredientByCanonical(name: string): Promise<IngredientRecord | null>;
  getIngredientByAlias(alias: string): Promise<IngredientRecord | null>;
  listIngredients(): Promise<IngredientRecord[]>;
  upsertIngredient(record: IngredientRecord): Promise<void>;

  // evidence
  getEvidenceByIngredientId(ingredientId: string): EvidenceRef[] | Promise<EvidenceRef[]>;

  // unknown ingredients
  addUnknownIngredient(input: {
    rawName: string;
    normalizedAttempt: string | null;
    confidence: number;
    context: string | null;
  }): Promise<UnknownIngredientInfo>;
  listUnknownIngredients(status?: string): Promise<UnknownIngredientInfo[]>;
  resolveUnknownIngredient(id: string, status: "resolved" | "dismissed", resolvedIngredientId?: string): Promise<void>;

  // users
  getUserByEmail(email: string): Promise<UserRecord | null>;
  getUserById(id: string): Promise<UserRecord | null>;
  createUser(input: {
    email: string;
    name: string;
    passwordHash: string | null;
    role?: "USER" | "ADMIN";
    language?: "EN" | "HI";
  }): Promise<UserRecord>;
  updateUser(id: string, fields: { name?: string; language?: "EN" | "HI" }): Promise<UserRecord | null>;
  getUserPreferences(userId: string): Promise<UserPreferencesRecord | null>;
  upsertUserPreferences(userId: string, prefs: UserPreferencesInput): Promise<UserPreferencesRecord>;
  listUsers(): Promise<UserRecord[]>;

  // history
  addHistoryEntry(
    userId: string,
    entry: { productId: string | null; assessmentSnapshot: unknown; source: string },
  ): Promise<HistoryEntryInfo>;
  listHistory(userId: string): Promise<HistoryEntryInfo[]>;
  deleteHistoryEntry(userId: string, entryId: string): Promise<boolean>;

  // chat conversations
  createConversation(userId: string): Promise<ChatConversationRecord>;
  listConversations(userId: string): Promise<ChatConversationRecord[]>;
  getConversation(conversationId: string): Promise<ChatConversationRecord | null>;
  appendChatMessage(
    conversationId: string,
    userId: string,
    role: ChatRole,
    content: string,
  ): Promise<ChatMessageRecord>;
  listChatMessages(conversationId: string, limit?: number): Promise<ChatMessageRecord[]>;

  // knowledge base (RAG)
  upsertKnowledgeDocument(doc: KnowledgeDocumentRecord): Promise<void>;
  listKnowledgeDocuments(category?: string): Promise<KnowledgeDocumentRecord[]>;
  insertKnowledgeChunks(chunks: KnowledgeChunkRecord[]): Promise<void>;
  searchKnowledgeChunks(
    query: string,
    options?: { category?: string; limit?: number; queryEmbedding?: number[] | null },
  ): Promise<KnowledgeSearchHit[]>;

  // admin
  logAdminAction(input: { adminId: string; action: string; entity: string; entityId?: string; detail?: string }): Promise<void>;
  getAdminStats(): Promise<Record<string, number>>;
}

export async function preferencesToRecord(
  userId: string,
  prefs: UserPreferencesInput,
): Promise<UserPreferencesRecord> {
  return {
    userId,
    vegetarian: prefs.vegetarian ?? false,
    vegan: prefs.vegan ?? false,
    allergies: prefs.allergies ?? [],
    dietaryRestrictions: prefs.dietaryRestrictions ?? [],
    avoidIngredients: prefs.avoidIngredients ?? [],
    preferredIngredients: prefs.preferredIngredients ?? [],
    healthGoals: prefs.healthGoals ?? [],
    sensitivityPreferences: prefs.sensitivityPreferences ?? [],
  };
}
