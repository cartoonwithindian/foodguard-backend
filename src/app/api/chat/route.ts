// POST /api/chat  — send a message (streaming follows in a later iteration)
// GET  /api/chat?conversation_id= — fetch the authenticated user's messages
//
//  • Authenticates the user server-side (JWT Bearer) — the client can never
//    choose whose data is accessed.
//  • Rate limits per authenticated user (`chat:<userId>`).
//  • Validates the body with chatRequestSchema.
//  • Resolves product context server-side (product_id wins; barcode resolves
//    through the product store).
//  • Runs the orchestrator (intent → context → LLM → response guard).
//  • Never exposes raw backend errors to the client.

import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { logger } from "@/lib/logger";
import { chatRequestSchema } from "@/schemas";
import { runChatAssistant } from "@/services/chat/orchestrator";
import { ConversationService } from "@/services/chat/conversation.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 64 * 1024;

async function handlePost(request: NextRequest, requestId: string): Promise<Response> {
  const user = await requireAuth(request);
  await enforceRateLimit(`chat:${user.id}`);

  const rawText = await request.text();
  if (rawText.length > MAX_REQUEST_BYTES) {
    return jsonError({ code: "VALIDATION_ERROR", message: "Chat request body too large" }, requestId);
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return jsonError({ code: "VALIDATION_ERROR", message: "Chat request body must be valid JSON" }, requestId);
  }
  const parsed = chatRequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return jsonError(parsed.error, requestId);
  }

  const { message, product_id, conversation_id, barcode } = parsed.data;
  const store = getStore();

  let productId = product_id ?? null;
  if (!productId && barcode) {
    const product = await store.getProductByBarcode(barcode);
    if (product) productId = product.id;
  }

  const result = await runChatAssistant({
    userId: user.id,
    message,
    productId: productId,
    conversationId: conversation_id,
  });

  return jsonSuccess(
    {
      answer: result.response.answer,
      sources: result.response.sources,
      actions: result.response.actions,
      conversation_id: result.conversationId,
      metadata: result.response.metadata,
    },
    { requestId },
  );
}

async function handleGet(request: NextRequest, requestId: string): Promise<Response> {
  const user = await requireAuth(request);
  const conversationId = new URL(request.url).searchParams.get("conversation_id");
  if (!conversationId) {
    return jsonError({ code: "VALIDATION_ERROR", message: "conversation_id is required" }, requestId);
  }

  const store = getStore();
  const conversations = new ConversationService(store);
  const conversation = await conversations.getConversationForUser(user.id, conversationId);
  if (!conversation) {
    return jsonError({ code: "CONVERSATION_NOT_FOUND", message: "Conversation not found" }, requestId);
  }

  const messages = (await store.listChatMessages(conversationId)).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
  }));
  return jsonSuccess({ conversation_id: conversationId, messages }, { requestId });
}

async function handle(request: NextRequest): Promise<Response> {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    if (request.method === "POST") return await handlePost(request, requestId);
    return await handleGet(request, requestId);
  } catch (error) {
    logger.warn("chat_route_failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(error, requestId);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}