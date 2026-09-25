import { createHash } from "node:crypto";
import { AppError, ErrorCodes } from "@/lib/errors";
import { getStore } from "@/lib/store";
import type { DataStore } from "@/lib/store/types";
import { gamificationConfig } from "@/gamification/config";
import { detectIntent } from "@/services/chat/intent";
import type { ChatIntent } from "@/types/chat";
import { xpService } from "@/gamification/services/xp.service";
import { streakService } from "@/gamification/services/streak.service";
import type { GamificationRules } from "@/gamification/models/gamification";
import {
  challengesConfig,
  listChallengeDefinitions,
  type ChallengeDefinition,
} from "@/gamification/challenges/config";
import { challengePeriodService } from "@/gamification/challenges/period.service";
import type { ChallengeListResult } from "@/gamification/challenges/models";
import type { GamificationActivityResult } from "@/gamification/models/gamification";

const PRODUCT_INTENTS = new Set<ChatIntent>([
  "PRODUCT_EXPLANATION",
  "INGREDIENT_EXPLANATION",
  "FOOD_SAFETY_QUESTION",
  "CONCERN_LEVEL_EXPLANATION",
  "PRODUCT_COMPARISON",
  "REGULATORY_INFORMATION",
  "REPORT_REQUEST",
]);

function rules(now: () => Date): GamificationRules {
  return {
    now,
    duplicateRequestWindowMs: gamificationConfig.duplicateRequestWindowMs,
    xpService,
    streakService,
  };
}

function stableChatEventId(userId: string, conversationId: string | null | undefined, message: string): string {
  const digest = createHash("sha256")
    .update(`${userId}:${conversationId ?? "none"}:${message.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
  return `chat-${digest}`;
}

/**
 * Reuse the existing chat intent classifier. A challenge message must be tied
 * to a real product and must resolve to a product/food-safety intent; greetings,
 * unknown text, and product-less questions never create activity.
 */
export function isMeaningfulProductQuestion(
  message: string,
  productId: string | null | undefined,
): boolean {
  const text = message.trim();
  if (!productId || text.length < 8 || text.split(/\s+/).length < 3) return false;
  return PRODUCT_INTENTS.has(detectIntent(text, productId));
}

export class ChallengeService {
  private readonly definitions: readonly ChallengeDefinition[];

  constructor(
    private readonly storeOverride?: DataStore,
    private readonly clock: () => Date = () => new Date(),
    definitions: readonly ChallengeDefinition[] = listChallengeDefinitions(),
  ) {
    this.definitions = definitions.filter((definition) =>
      challengesConfig.supportedConditionTypes.includes(definition.condition.type),
    );
  }

  private store(): DataStore {
    return this.storeOverride ?? getStore();
  }

  async getChallenges(userId: string): Promise<ChallengeListResult> {
    if (!userId.trim()) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);
    }
    return this.store().getChallenges(userId, this.definitions, this.clock());
  }

  async getDailyChallenges(userId: string) {
    return (await this.getChallenges(userId)).daily;
  }

  async getWeeklyChallenges(userId: string) {
    return (await this.getChallenges(userId)).weekly;
  }

  async recordIngredientView(input: {
    userId: string;
    productId: string;
    eventId?: string;
    ingredientId?: string | null;
  }): Promise<GamificationActivityResult> {
    const now = this.clock();
    return this.store().recordValidatedActivity(
      {
        userId: input.userId,
        actionType: "ingredient_view",
        productId: input.productId,
        ingredientId: input.ingredientId ?? null,
        timestamp: now,
        eventId: input.eventId?.trim() || `ingredient-${now.getTime()}`,
        eventIdProvided: Boolean(input.eventId?.trim()),
      },
      rules(() => now),
      this.definitions,
    );
  }

  async recordMeaningfulChat(input: {
    userId: string;
    productId: string;
    message: string;
    conversationId?: string | null;
  }): Promise<GamificationActivityResult | null> {
    if (!isMeaningfulProductQuestion(input.message, input.productId)) return null;
    const now = this.clock();
    return this.store().recordValidatedActivity(
      {
        userId: input.userId,
        actionType: "meaningful_chat",
        productId: input.productId,
        ingredientId: null,
        timestamp: now,
        eventId: stableChatEventId(input.userId, input.conversationId, input.message),
        eventIdProvided: true,
      },
      rules(() => now),
      this.definitions,
    );
  }
}

export const challengeService = new ChallengeService();
