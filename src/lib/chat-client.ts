import type { ChatAction, ChatSourceRef } from "@/types/chat";

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type ChatSendResponse = {
  answer: string;
  sources: ChatSourceRef[];
  actions: ChatAction[];
  conversation_id: string;
  metadata: { intent: string; model_version: string };
};

export type ChatHistoryResponse = {
  conversation_id: string;
  messages: ChatMessageView[];
};

export class ChatClientError extends Error {
  constructor(
    message: string,
    public readonly kind: "unauthorized" | "rate_limited" | "unavailable" | "invalid",
  ) {
    super(message);
    this.name = "ChatClientError";
  }
}

const TIMEOUT_MS = 45_000;

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("foodgaurd-token");
  } catch {
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const response = await fetch(path, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
      signal: controller.signal,
    });

    if (response.status === 401) {
      throw new ChatClientError("Please log in again.", "unauthorized");
    }
    if (response.status === 429) {
      throw new ChatClientError("You're sending messages too quickly — wait a moment.", "rate_limited");
    }
    if (!response.ok) {
      if (response.status >= 500) {
        throw new ChatClientError("FoodGuard AI is temporarily unavailable. Please try again.", "unavailable");
      }
      throw new ChatClientError("Something went wrong. Please try again.", "invalid");
    }

    const payload = (await response.json()) as { success: boolean; data: T };
    if (!payload.success) {
      throw new ChatClientError("Something went wrong. Please try again.", "invalid");
    }
    return payload.data;
  } catch (error) {
    if (error instanceof ChatClientError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ChatClientError("FoodGuard AI took too long to respond. Please try again.", "unavailable");
    }
    throw new ChatClientError("FoodGuard AI is temporarily unavailable. Please try again.", "unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export function sendChatMessage(input: {
  message: string;
  productId?: string | null;
  conversationId?: string | null;
  barcode?: string | null;
}): Promise<ChatSendResponse> {
  return request<ChatSendResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      message: input.message,
      product_id: input.productId ?? null,
      conversation_id: input.conversationId ?? null,
      barcode: input.barcode ?? null,
    }),
  });
}

export function fetchChatHistory(conversationId: string): Promise<ChatHistoryResponse> {
  return request<ChatHistoryResponse>(
    `/api/chat?conversation_id=${encodeURIComponent(conversationId)}`,
  );
}