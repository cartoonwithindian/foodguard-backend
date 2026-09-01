import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { AppError, ErrorCodes } from "@/lib/errors";

/**
 * Free-form chat client for the FoodGuard AI Assistant.
 * Follows the same pattern as src/lib/ai.ts: an OpenAI-compatible
 * chat/completions provider plus a deterministic mock provider used
 * when AI_PROVIDER=mock or no API key is configured.
 */

export type ChatHistoryItem = { role: "user" | "assistant"; content: string };

export type ChatCompletionInput = {
  system: string;
  user: string;
  history?: ChatHistoryItem[];
  temperature?: number;
};

export interface ChatProvider {
  chat(input: ChatCompletionInput): Promise<{ content: string }>;
}

class MockChatProvider implements ChatProvider {
  async chat(input: ChatCompletionInput): Promise<{ content: string }> {
    const historyTail = (input.history ?? []).slice(-4);
    const summary = historyTail.length > 0 ? `\nConversation so far:\n${historyTail.map((m) => `${m.role}: ${m.content.slice(0, 200)}`).join("\n")}` : "";
    return {
      content: JSON.stringify({
        answer: [
          `This is a mock FoodGuard AI response (no AI_API_KEY configured).`,
          `Your question: "${input.user.slice(0, 1600)}"`,
          "FoodGuard provides preliminary AI-assisted information and does not replace official regulatory inspection or professional advice.",
          summary,
        ].join("\n"),
        sources: [],
        actions: [],
        metadata: { intent: "UNKNOWN", model_version: "foodguard-chat-v1" },
      }),
    };
  }
}

class OpenAICompatibleChatProvider implements ChatProvider {
  async chat(input: ChatCompletionInput): Promise<{ content: string }> {
    if (!config.ai.apiKey) {
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "AI_API_KEY is not configured");
    }
    const messages = [
      { role: "system", content: input.system },
      ...(input.history ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: input.user },
    ];

    const url = `${config.ai.baseUrl.replace(/\/$/, "")}/chat/completions`;
    
    // Build request body - conditionally include response_format for JSON mode
    const requestBody: Record<string, unknown> = {
      model: config.ai.model,
      temperature: input.temperature ?? 0.3,
      messages,
    };
    
    // Only include response_format if the provider supports it
    if (config.ai.supportsJsonMode) {
      requestBody.response_format = { type: "json_object" };
    }
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      logger.error("chat_llm_http_error", { status: response.status, errorText: errorText.slice(0, 500) });
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "AI provider request failed");
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "AI provider returned no content");
    }
    return { content };
  }
}

let instance: ChatProvider | null = null;

export function getChatProvider(): ChatProvider {
  if (!instance) {
    // Use real provider when API key is configured (supports openai, gemini, etc.)
    const useRealProvider = config.ai.apiKey && config.ai.provider !== "mock";
    instance = useRealProvider ? new OpenAICompatibleChatProvider() : new MockChatProvider();
  }
  return instance;
}