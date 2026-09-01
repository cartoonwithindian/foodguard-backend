import type { DataStore } from "@/lib/store/types";
import { AppError, ErrorCodes } from "@/lib/errors";
import { logger } from "@/lib/logger";

const MAX_CONTEXT_MESSAGES = 12;
const MAX_CONVERSATION_MESSAGES = 200;

export class ConversationService {
  constructor(private readonly store: DataStore) {}

  async getOrCreate(userId: string, conversationId?: string | null): Promise<{ id: string; created: boolean }> {
    if (conversationId) {
      const conversation = await this.store.getConversation(conversationId);
      if (!conversation) {
        throw new AppError(ErrorCodes.CONVERSATION_NOT_FOUND, "Conversation not found", 404);
      }
      if (conversation.userId !== userId) {
        logger.warn("chat_conversation_cross_user", { conversationId, userId });
        throw new AppError(ErrorCodes.FORBIDDEN, "Conversation belongs to another user", 403);
      }
      return { id: conversation.id, created: false };
    }
    const created = await this.store.createConversation(userId);
    return { id: created.id, created: true };
  }

  async getConversationForUser(userId: string, conversationId: string) {
    const conversation = await this.store.getConversation(conversationId);
    if (!conversation) return null;
    if (conversation.userId !== userId) {
      logger.warn("chat_conversation_cross_user", { conversationId, userId });
      throw new AppError(ErrorCodes.FORBIDDEN, "Conversation belongs to another user", 403);
    }
    return conversation;
  }

  async appendMessage(
    userId: string,
    conversationId: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<void> {
    const existing = await this.store.listChatMessages(conversationId, MAX_CONVERSATION_MESSAGES + 1);
    if (existing.length >= MAX_CONVERSATION_MESSAGES) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Conversation is too long; start a new chat", 400);
    }
    await this.store.appendChatMessage(conversationId, userId, role, content);
  }

  async recentContext(userId: string, conversationId: string, limit = MAX_CONTEXT_MESSAGES): Promise<string> {
    const messages = await this.store.listChatMessages(conversationId, limit);
    return messages
      .map((m) => `${m.role}: ${m.content.replace(/\n+/g, " ").trim()}`)
      .join("\n");
  }
}