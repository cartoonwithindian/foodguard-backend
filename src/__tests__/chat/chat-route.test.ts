import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { InMemoryStore } from "@/lib/store/memory";
import { runChatAssistant } from "@/services/chat/orchestrator";
import { signToken } from "@/lib/auth";
import { POST, GET } from "@/app/api/chat/route";
import { getStore } from "@/lib/store";

// Force mock mode for AI to prevent real API calls during tests
const { savedAIEnv } = vi.hoisted(() => {
  const savedAIEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
  };
  process.env.AI_PROVIDER = "mock";
  process.env.AI_API_KEY = "";
  return { savedAIEnv };
});

afterAll(() => {
  process.env.AI_PROVIDER = savedAIEnv.AI_PROVIDER ?? "mock";
  process.env.AI_API_KEY = savedAIEnv.AI_API_KEY ?? "";
});

describe("chat orchestrator", () => {
  it("returns a guarded structured response and persists the conversation", async () => {
    const store = new InMemoryStore();
    const result = await runChatAssistant({
      userId: "user-a",
      message: "What is INS 621?",
      store,
    });
    expect(result.response.answer.length).toBeGreaterThan(0);
    expect(Array.isArray(result.response.sources)).toBe(true);
    expect(Array.isArray(result.response.actions)).toBe(true);
    expect(result.response.metadata.intent).toBe("INGREDIENT_EXPLANATION");

    const messages = await store.listChatMessages(result.conversationId);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("loads product context when a valid product id is supplied", async () => {
    const store = new InMemoryStore();
    const products = await store.searchProducts("chocolate", "all");
    const product = products[0].product;

    const result = await runChatAssistant({
      userId: "user-a",
      message: "Why is this product high concern?",
      productId: product.id,
      store,
    });
    expect(result.response.metadata.intent).toBe("CONCERN_LEVEL_EXPLANATION");
    expect(result.response.answer.length).toBeGreaterThan(0);
  });

  it("does not crash when the product id is unknown", async () => {
    const result = await runChatAssistant({
      userId: "user-a",
      message: "Why is this product high concern?",
      productId: "prod-does-not-exist",
      store: new InMemoryStore(),
    });
    expect(result.response.answer).not.toHaveLength(0);
  });

  it("continues an existing conversation when a conversation id is supplied", async () => {
    const store = new InMemoryStore();
    const first = await runChatAssistant({ userId: "user-a", message: "hello", store });
    const second = await runChatAssistant({
      userId: "user-a",
      message: "what did I scan recently?",
      conversationId: first.conversationId,
      store,
    });
    expect(second.conversationId).toBe(first.conversationId);
    const messages = await store.listChatMessages(first.conversationId);
    expect(messages).toHaveLength(4);
    expect(second.response.metadata.intent).toBe("SCAN_HISTORY");
  });

  it("rejects a conversation id owned by another user", async () => {
    const store = new InMemoryStore();
    const owner = await runChatAssistant({ userId: "user-a", message: "hello", store });
    await expect(
      runChatAssistant({
        userId: "user-b",
        message: "hello",
        conversationId: owner.conversationId,
        store,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("POST /api/chat", () => {
  let token: string;

  beforeAll(async () => {
    token = await signToken({ id: "user-route-test", email: "t@t.co", name: "T", role: "USER", language: "EN" });
  });

  function request(body: unknown, authToken?: string): Request {
    return new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 without a token", async () => {
    const res = await POST(request({ message: "hello" }) as never);
    expect(res.status).toBe(401);
  });

  it("rejects an empty message with 400", async () => {
    const res = await POST(request({ message: "   " }, token) as never);
    expect(res.status).toBe(400);
  });

  it("returns the chat envelope for a valid request", async () => {
    const res = await POST(request({ message: "What should I check before buying packaged food?" }, token) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { answer: string; conversation_id: string; metadata: { intent: string } };
    };
    expect(body.success).toBe(true);
    expect(body.data.answer.length).toBeGreaterThan(0);
    expect(body.data.conversation_id.length).toBeGreaterThan(0);
    expect(body.data.metadata.intent).toBe("FOOD_SAFETY_QUESTION");
  });

  it("uses a deterministic conversation id when supplied", async () => {
    const conv = await getStore().createConversation("user-route-test");
    const res = await POST(
      request({ message: "What does High Concern mean?", conversation_id: conv.id }, token) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { conversation_id: string } };
    expect(body.data.conversation_id).toBe(conv.id);
  });

  it("resolves product context from a barcode when no product_id is supplied", async () => {
    const products = await getStore().searchProducts("chocolate", "all");
    const product = products[0].product;
    const res = await POST(
      request({ message: "why", barcode: product.barcode }, token) as never,
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/chat", () => {
  let token: string;

  beforeAll(async () => {
    token = await signToken({ id: "user-get-test", email: "get@t.co", name: "G", role: "USER", language: "EN" });
  });

  function getRequest(conversationId?: string, authToken?: string): Request {
    const url = conversationId
      ? `http://localhost/api/chat?conversation_id=${encodeURIComponent(conversationId)}`
      : "http://localhost/api/chat";
    const request = new Request(url, {
      method: "GET",
      headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
    });
    Object.assign(request, { nextUrl: new URL(url) });
    return request;
  }

  it("returns 401 without a token", async () => {
    const res = await GET(getRequest("conv-1") as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 when conversation_id is missing", async () => {
    const res = await GET(getRequest(undefined, token) as never);
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown conversation", async () => {
    const res = await GET(getRequest("conv-nope", token) as never);
    expect(res.status).toBe(404);
  });

  it("returns the user's own conversation messages", async () => {
    const conv = await getStore().createConversation("user-get-test");
    await getStore().appendChatMessage(conv.id, "user-get-test", "user", "hello");
    await getStore().appendChatMessage(conv.id, "user-get-test", "assistant", "hi there");
    const res = await GET(getRequest(conv.id, token) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { conversation_id: string; messages: Array<{ role: string; content: string }> } };
    expect(body.data.conversation_id).toBe(conv.id);
    expect(body.data.messages).toHaveLength(2);
    expect(body.data.messages[1].role).toBe("assistant");
    expect(body.data.messages[1].content).toBe("hi there");
  });

  it("rejects another user's conversation with 403", async () => {
    const conv = await getStore().createConversation("other-user");
    const res = await GET(getRequest(conv.id, token) as never);
    expect(res.status).toBe(403);
  });
});