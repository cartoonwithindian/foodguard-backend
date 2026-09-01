import { describe, it, expect } from "vitest";
import { InMemoryStore } from "@/lib/store/memory";
import { ConversationService } from "@/services/chat/conversation.service";
import { AppError, ErrorCodes } from "@/lib/errors";

describe("chat conversation store (in-memory)", () => {
  it("creates conversations and persists messages per user", async () => {
    const store = new InMemoryStore();
    const conv = await store.createConversation("user-a");
    await store.appendChatMessage(conv.id, "user-a", "user", "hello");
    await store.appendChatMessage(conv.id, "user-a", "assistant", "hi there");

    const messages = await store.listChatMessages(conv.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[0].content).toBe("hello");
  });

  it("rejects appending to another user's conversation", async () => {
    const store = new InMemoryStore();
    const conv = await store.createConversation("user-a");
    await expect(store.appendChatMessage(conv.id, "user-b", "user", "sneak")).rejects.toThrow();
  });

  it("lists conversations newest-first and scoped to the user", async () => {
    const store = new InMemoryStore();
    const a1 = await store.createConversation("user-a");
    await store.appendChatMessage(a1.id, "user-a", "user", "x");
    const a2 = await store.createConversation("user-a");
    await store.appendChatMessage(a2.id, "user-a", "user", "y");
    await store.createConversation("user-b");

    const list = await store.listConversations("user-a");
    expect(list.map((c) => c.id)).toEqual([a2.id, a1.id]);
  });

  it("caps message listing by limit", async () => {
    const store = new InMemoryStore();
    const conv = await store.createConversation("user-a");
    for (let i = 0; i < 10; i++) {
      await store.appendChatMessage(conv.id, "user-a", "user", `m${i}`);
    }
    const messages = await store.listChatMessages(conv.id, 3);
    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe("m7");
  });
});

describe("conversation service", () => {
  it("returns existing conversation for the owner and forbids cross-user access", async () => {
    const store = new InMemoryStore();
    const service = new ConversationService(store);
    const conv = await store.createConversation("user-a");

    const existing = await service.getOrCreate("user-a", conv.id);
    expect(existing.id).toBe(conv.id);
    expect(existing.created).toBe(false);

    await expect(service.getOrCreate("user-b", conv.id)).rejects.toMatchObject({
      code: ErrorCodes.FORBIDDEN,
      status: 403,
    });
  });

  it("creates a new conversation when no id is supplied", async () => {
    const service = new ConversationService(new InMemoryStore());
    const result = await service.getOrCreate("user-a", null);
    expect(result.created).toBe(true);
    expect(result.id.length).toBeGreaterThan(0);
  });

  it("throws a typed 404 for a missing conversation id", async () => {
    const service = new ConversationService(new InMemoryStore());
    await expect(service.getOrCreate("user-a", "conv-missing")).rejects.toMatchObject({
      code: ErrorCodes.CONVERSATION_NOT_FOUND,
      status: 404,
    });
  });

  it("builds a compact recent context", async () => {
    const store = new InMemoryStore();
    const service = new ConversationService(store);
    const conv = await store.createConversation("user-a");
    await store.appendChatMessage(conv.id, "user-a", "user", "What is INS 621?");
    await store.appendChatMessage(conv.id, "user-a", "assistant", "It is a preservative.");

    const context = await service.recentContext("user-a", conv.id, 12);
    expect(context).toContain("user: What is INS 621?");
    expect(context).toContain("assistant: It is a preservative.");
  });
});

describe("appending messages respects the conversation cap", () => {
  it("rejects appends beyond the cap with a validation error", async () => {
    const store = new InMemoryStore();
    const service = new ConversationService(store);
    const conv = await store.createConversation("user-a");
    for (let i = 0; i < 200; i++) {
      await store.appendChatMessage(conv.id, "user-a", "user", `m${i}`);
    }
    await expect(service.appendMessage("user-a", conv.id, "user", "overflow")).rejects.toMatchObject({
      code: ErrorCodes.VALIDATION_ERROR,
    });
  });
});

export function expectAppError(error: unknown, code: string): asserts error is AppError {
  if (!(error instanceof AppError) || error.code !== code) {
    throw new Error(`expected AppError with code ${code}`);
  }
}