import type { DataStore } from "@/lib/store/types";
import type { ChatAssistantResponse, ChatIntent } from "@/types/chat";
import { ConversationService } from "./conversation.service";
import { guardResponse } from "./response-guard";
import { detectIntent } from "./intent";
import { FOODGUARD_ASSISTANT_SYSTEM_PROMPT } from "./system-prompt";
import { getChatProvider } from "@/lib/ai-chat";
import { getStore } from "@/lib/store";
import { runTool } from "./tools";
import { logger } from "@/lib/logger";

export const CHAT_MODEL_VERSION = "foodguard-chat-v2";

export type ChatRunArgs = {
  userId: string;
  message: string;
  productId?: string | null;
  conversationId?: string | null;
  store?: DataStore;
};

export type ChatRunResult = {
  response: ChatAssistantResponse;
  conversationId: string;
};

type ProductContext = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  ingredientsRaw: string;
  verified: boolean;
};

function buildProductContext(product: ProductContext): string {
  const ingredients = product.ingredientsRaw.trim()
    ? product.ingredientsRaw.slice(0, 400)
    : "No ingredient list available for this product.";
  return [
    "Current product context:",
    `- Name: ${product.name}`,
    `- Brand: ${product.brand ?? "Unknown"}`,
    `- Category: ${product.category}`,
    `- Ingredients (as recorded): ${ingredients}`,
    `- Product verification status: ${product.verified ? "verified" : "not verified"}`,
    "Note: FoodGuard's concern assessment comes from the FoodGuard analysis engine. The assistant never changes it.",
  ].join("\n");
}

function intentInstruction(intent: ChatIntent): string {
  const map: Record<ChatIntent, string> = {
    PRODUCT_EXPLANATION:
      "Explain the product using ONLY the provided product context and FoodGuard analysis. Never invent issues that are not in the data.",
    INGREDIENT_EXPLANATION:
      "Explain the ingredient in simple language: what it is, its common purpose, where it is used, and regulatory information when the provided knowledge allows it. If no reliable information is available, say so.",
    FOOD_SAFETY_QUESTION:
      "Give practical, general information. Avoid medical claims; recommend checking the product label and consulting a professional when necessary.",
    CONCERN_LEVEL_EXPLANATION:
      "Explain FoodGuard's concern level exactly: 'FoodGuard has identified one or more factors that require greater attention based on the available product information.' Never say the product is legally unsafe.",
    SCAN_HISTORY:
      "Summarize the user's scan history records exactly as provided. Never invent scans. Never mention other users.",
    PRODUCT_COMPARISON:
      "Compare the two products using ONLY the provided product data: ingredients, nutrition, allergens, concern level, detected issues. Keep it simple.",
    REGULATORY_INFORMATION:
      "Answer using ONLY the retrieved regulatory context. Cite sources with title, source and url. If nothing was retrieved, say: 'I couldn't retrieve the relevant regulatory information right now.'",
    REPORT_REQUEST:
      "Explain that FoodGuard can prepare an authority-ready report using the product's analysis and evidence. Ask for any missing complaint information (batch number, expiry, complaint description) before generating. FoodGuard never submits complaints automatically.",
    GENERAL_FOODGUARD_HELP:
      "Describe what FoodGuard does: scan products, analyze ingredients and nutrition, explain concern levels, compare products, and generate authority-ready complaint reports.",
    UNKNOWN:
      "The question is unclear. Ask the user to rephrase, and suggest the quick actions (explain a product, ingredient, scan history, or report).",
  };
  return map[intent];
}

async function collectToolContext(
  intent: ChatIntent,
  args: ChatRunArgs,
): Promise<string[]> {
  const blocks: string[] = [];
  const ctx = { userId: args.userId };

  const push = (label: string, data: unknown) => {
    try {
      blocks.push(`[${label}] ${JSON.stringify(data).slice(0, 1500)}`);
    } catch {
      // skip un-stringifiable tool output
    }
  };

  switch (intent) {
    case "SCAN_HISTORY": {
      const result = await runTool("get_user_scan_history", {}, ctx);
      if (result.ok) {
        push("user scan history", result.data);
      }
      break;
    }
    case "PRODUCT_EXPLANATION":
    case "CONCERN_LEVEL_EXPLANATION":
    case "REPORT_REQUEST": {
      if (args.productId) {
        const details = await runTool("get_product_details", { product_id: args.productId }, ctx);
        if (details.ok) push("product details", details.data);
        const analysis = await runTool("get_product_analysis", { product_id: args.productId }, ctx);
        if (analysis.ok) push("FoodGuard analysis", analysis.data);
      }
      break;
    }
    case "INGREDIENT_EXPLANATION": {
      const candidates = args.message
        .replace(/[^a-zA-Z0-9 .-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !/^(what|is|the|this|that|about|in|of|ins|and|it)$/i.test(w))
        .slice(-4);
      const name = candidates.join(" ").trim().slice(0, 120);
      if (name) {
        const result = await runTool("get_ingredient_info", { name }, ctx);
        if (result.ok) push("ingredient info", result.data);
      }
      break;
    }
    case "PRODUCT_COMPARISON": {
      if (args.productId) {
        const result = await runTool("compare_products", { product_a: args.productId, product_b: undefined }, ctx);
        if (result.ok) push("comparison", result.data);
      }
      break;
    }
    default:
      break;
  }
  return blocks;
}

async function collectRagContext(intent: ChatIntent, args: ChatRunArgs): Promise<string[]> {
  const regulatory = new Set<ChatIntent>([
    "REGULATORY_INFORMATION",
    "FOOD_SAFETY_QUESTION",
    "REPORT_REQUEST",
  ]);
  if (!regulatory.has(intent)) return [];

  const query = args.message.replace(/\s+/g, " ").trim().slice(0, 200);
  if (query.length < 4) return [];

  try {
    const result = await runTool("search_regulations", { query }, { userId: args.userId });
    if (result.ok) {
      const data = result.data as { formatted?: string; notFound?: boolean };
      if (!data.notFound && data.formatted) return [data.formatted];
    }
  } catch {
    // RAG must never break the conversation; fall through without context.
  }
  return [];
}

export async function runChatAssistant(args: ChatRunArgs): Promise<ChatRunResult> {
  const store = args.store ?? getStore();
  const conversations = new ConversationService(store);
  const { id: conversationId } = await conversations.getOrCreate(args.userId, args.conversationId);
  await conversations.appendMessage(args.userId, conversationId, "user", args.message);

  const intent = detectIntent(args.message, args.productId ?? null);
  const history = await conversations.recentContext(args.userId, conversationId, 12);

  const contextParts: string[] = [];
  if (args.productId) {
    const product = await store.getProductById(args.productId);
    if (product) {
      contextParts.push(
        buildProductContext({
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
          ingredientsRaw: product.ingredientsRaw,
          verified: product.verified,
        }),
      );
    } else {
      contextParts.push(
        "The requested product could not be found in the FoodGuard database. Say: 'I couldn't find this product in the FoodGuard database.' and offer to scan or search again.",
      );
    }
  }

  // Controlled tool layer: intent → tool results (user-scoped, validated).
  const toolContext = await collectToolContext(intent, args);

  // RAG: retrieve regulation/labelling knowledge for regulatory intents.
  const ragContext = await collectRagContext(intent, args);

  // Phase 4 wires RAG retrieval here.
  const userPrompt = [
    `Intent: ${intent}`,
    intentInstruction(intent),
    "",
    "Trusted context:",
    ...(contextParts.length > 0 ? contextParts : ["(No product context attached.)"]),
    ...(toolContext.length > 0 ? ["", "Tool results:", ...toolContext] : []),
    ...(ragContext.length > 0 ? ["", "Knowledge base (FSSAI regulations):", ...ragContext] : []),
    "",
    `User question: ${args.message.slice(0, 2000)}`,
  ].join("\n");

  let guarded;
  try {
    const provider = getChatProvider();
    const result = await provider.chat({
      system: FOODGUARD_ASSISTANT_SYSTEM_PROMPT,
      user: userPrompt,
      history: history ? [{ role: "user", content: history }] : [],
      temperature: 0.3,
    });
    guarded = guardResponse(result.content, { intent, modelVersion: CHAT_MODEL_VERSION });
  } catch (error) {
    logger.warn("chat_llm_failed", { error: error instanceof Error ? error.message : String(error) });
    const fallback = guardResponse(
      JSON.stringify({
        answer:
          "Sorry, FoodGuard AI is temporarily unavailable. Please try again.",
        sources: [],
        actions: [],
        metadata: { intent, model_version: CHAT_MODEL_VERSION },
      }),
      { intent, modelVersion: CHAT_MODEL_VERSION },
    );
    guarded = fallback;
  }

  const response = guarded.response;
  await conversations.appendMessage(args.userId, conversationId, "assistant", response.answer);
  return { response, conversationId };
}