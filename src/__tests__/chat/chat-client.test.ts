import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendChatMessage,
  fetchChatHistory,
  ChatClientError,
} from "@/lib/chat-client";

function mockFetchOnce(status: number, payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

function mockToken(token: string | null) {
  const store: Record<string, string> = token ? { "foodgaurd-token": token } : {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: () => {},
    removeItem: () => {},
  });
}

beforeEach(() => {
  mockToken("test-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendChatMessage", () => {
  it("shapes a successful response", async () => {
    mockFetchOnce(200, {
      success: true,
      data: {
        answer: "This product is low concern.",
        sources: [{ title: "Labelling Requirements", source: "FSSAI", url: "https://fssai.gov.in" }],
        actions: [{ type: "view_analysis", label: "View analysis", payload: { product_id: "p1" } }],
        conversation_id: "conv-1",
        metadata: { intent: "PRODUCT_EXPLANATION", model_version: "foodguard-chat-v2" },
      },
      error: null,
      meta: null,
    });

    const result = await sendChatMessage({ message: "why", productId: "p1" });
    expect(result.answer).toContain("low concern");
    expect(result.conversation_id).toBe("conv-1");
    expect(result.sources[0].source).toBe("FSSAI");
    expect(result.actions[0].type).toBe("view_analysis");
    expect(result.metadata.model_version).toBe("foodguard-chat-v2");
  });

  it("sends product_id and conversation_id in the body", async () => {
    let body: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({ success: true, data: { answer: "ok", sources: [], actions: [], conversation_id: "conv-9", metadata: {} } }),
          { status: 200 },
        );
      }),
    );
    await sendChatMessage({ message: "hello", productId: "p42", conversationId: "conv-9" });
    expect(body).toMatchObject({ message: "hello", product_id: "p42", conversation_id: "conv-9" });
  });

  it("maps 401 to unauthorized", async () => {
    mockFetchOnce(401, { success: false, error: null, data: null });
    await expect(sendChatMessage({ message: "hi" })).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("maps 429 to rate_limited", async () => {
    mockFetchOnce(429, { success: false, error: null, data: null });
    const err: ChatClientError = await sendChatMessage({ message: "hi" }).then(
      () => { throw new Error("expected failure"); },
      (e: unknown) => e as ChatClientError,
    );
    expect(err.kind).toBe("rate_limited");
    expect(err.message).toContain("too quickly");
  });

  it("maps 5xx to the friendly unavailable message", async () => {
    mockFetchOnce(503, { success: false, error: null, data: null });
    const err: ChatClientError = await sendChatMessage({ message: "hi" }).then(
      () => { throw new Error("expected failure"); },
      (e: unknown) => e as ChatClientError,
    );
    expect(err.kind).toBe("unavailable");
    expect(err.message).toContain("temporarily unavailable");
  });

  it("maps network failures to unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const err: ChatClientError = await sendChatMessage({ message: "hi" }).then(
      () => { throw new Error("expected failure"); },
      (e: unknown) => e as ChatClientError,
    );
    expect(err.kind).toBe("unavailable");
  });

  it("times out after the request budget", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
      ),
    );
    const promise = sendChatMessage({ message: "hi" }).then(
      () => { throw new Error("expected failure"); },
      (e: unknown) => e as ChatClientError,
    );
    await vi.advanceTimersByTimeAsync(50_000);
    const err = await promise;
    expect(err.kind).toBe("unavailable");
    expect(err.message).toContain("too long");
    vi.useRealTimers();
  });
});

describe("fetchChatHistory", () => {
  it("returns messages for the conversation", async () => {
    mockFetchOnce(200, {
      success: true,
      data: {
        conversation_id: "conv-1",
        messages: [
          { id: "m1", role: "user", content: "hi", createdAt: "2026-01-01T00:00:00Z" },
          { id: "m2", role: "assistant", content: "hello", createdAt: "2026-01-01T00:00:01Z" },
        ],
      },
      error: null,
      meta: null,
    });
    const history = await fetchChatHistory("conv-1");
    expect(history.conversation_id).toBe("conv-1");
    expect(history.messages).toHaveLength(2);
    expect(history.messages[1].role).toBe("assistant");
  });

  it("requests with the conversation_id query param", async () => {
    let url = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (u: string) => {
        url = String(u);
        return new Response(JSON.stringify({ success: true, data: { conversation_id: "conv-x", messages: [] } }), { status: 200 });
      }),
    );
    await fetchChatHistory("conv-x");
    expect(url).toContain("conversation_id=conv-x");
  });
});