// Stateless orchestrator for the Food Safety Assistant.
//
// Server contract:
//  • The client sends the full conversation state on every call.
//  • The server mutates that state transitionally, derives the next
//    question / draft, and returns the new state plus the assistant
//    message.
//  • The server never persists anything — no DB writes, no extra logs
//    beyond the standard request id.
//  • The server never fabricates facts. Products, ingredients, FSSAI
//    data and evidence statuses are passed in by the client (or
//    rendered as "Not provided").

import type {
  AssistantMessage,
  AssistantRequest,
  AssistantResponse,
  CollectedInformation,
  ConversationState,
  DynamicQuestion,
  IssueType,
  ProductSnapshot,
  QuestionField,
  RegulatoryContext,
} from "@/types/food-safety-assistant";
import { classifyIssue, redactSensitive } from "./classification";
import { buildEvidenceChecklist } from "./evidence";
import { buildComplaintDraft } from "./draft";
import { nextQuestion, lookupQuestion } from "./questions";

const PRODUCT_FIELDS = new Set<QuestionField>([
  "product_batch",
  "product_manufacturing_date",
  "product_expiry_date",
]);

// ── Helpers ────────────────────────────────────────────────────

function ensureState(input: Partial<ConversationState> | null | undefined, language: "en" | "hi"): ConversationState {
  const stage = input?.stage ?? "greeting";
  return {
    stage,
    productSnapshot: input?.productSnapshot ?? null,
    issueType: input?.issueType ?? null,
    issueConfidence: input?.issueConfidence ?? "low",
    collected: (input?.collected as CollectedInformation | undefined) ?? {},
    evidence: input?.evidence ?? [],
    followUpsAsked: input?.followUpsAsked ?? [],
    skipAnswers: input?.skipAnswers ?? [],
    // The client sends the full conversation state on every call, so the
    // active question (if any) is part of that state. Dropping it here
    // made sequential answers fall through to the "reviewing" branch.
    currentQuestion: input?.currentQuestion ?? null,
    questionHistory: input?.questionHistory ?? [],
    draft: input?.draft ?? null,
    language: language === "hi" ? "hi" : "en",
    assistantMessages: input?.assistantMessages ?? [],
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function newConversationId(): string {
  // Pure-ASCII random id (no external dep). 96 bits via crypto.
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function pushAssistantMessage(state: ConversationState, content: string): AssistantMessage {
  const msg: AssistantMessage = {
    id: newConversationId(),
    role: "assistant",
    content,
    createdAt: nowIso(),
  };
  state.assistantMessages = [...state.assistantMessages, msg];
  return msg;
}

function pushUserMessage(state: ConversationState, content: string): AssistantMessage {
  const msg: AssistantMessage = {
    id: newConversationId(),
    role: "user",
    content,
    createdAt: nowIso(),
  };
  state.assistantMessages = [...state.assistantMessages, msg];
  return msg;
}

function applyAnswer(state: ConversationState, key: QuestionField, value: unknown): void {
  state.collected = { ...state.collected, [key]: value } as CollectedInformation;
  state.followUpsAsked = [...state.followUpsAsked, key];
  state.questionHistory = [
    ...state.questionHistory,
    { field: key, answer: (value ?? null) as never, at: nowIso() },
  ];
}

function advance(state: ConversationState): void {
  if (!state.issueType) {
    state.currentQuestion = null;
    state.stage = "selecting_issue";
    return;
  }
  const all = {
    collected: state.collected,
    followUpsAsked: state.followUpsAsked,
    skipAnswers: state.skipAnswers,
    issueType: state.issueType,
  };
  const next = nextQuestion(all);
  if (next) {
    state.currentQuestion = next;
    state.stage = "collecting_info";
    return;
  }
  state.currentQuestion = null;
  state.stage = "ready_to_generate";
}

// ── Action handlers ────────────────────────────────────────────

function handleStart(req: AssistantRequest, language: "en" | "hi"): { state: ConversationState; message: AssistantMessage | null } {
  const product: ProductSnapshot | null = req.productContext ?? req.state?.productSnapshot ?? null;
  const state = ensureState(req.state ?? null, language);
  state.productSnapshot = product;
  // Carry forward any pre-selected issue from the request.
  if (req.state?.issueType && !state.issueType) {
    state.issueType = req.state.issueType;
    state.issueConfidence = req.state.issueConfidence ?? "medium";
  }
  // If we already have an issue, resume from where we were.
  if (state.issueType) {
    advance(state);
    if (state.stage === "ready_to_generate" && state.draft) {
      // Already had a draft — go straight to reviewing.
      state.stage = "reviewing_draft";
      const msg = pushAssistantMessage(state, "Your draft is ready. Review it below and feel free to edit it.");
      return { state, message: msg };
    }
    if (state.stage === "ready_to_generate") {
      state.stage = "collecting_info";
      const q = state.currentQuestion;
      const msg = q
        ? pushAssistantMessage(state, formatQuestionPrompt(q))
        : pushAssistantMessage(state, "Please continue with the next detail.");
      return { state, message: msg };
    }
    if (state.stage === "collecting_info" && state.currentQuestion) {
      const msg = pushAssistantMessage(state, formatQuestionPrompt(state.currentQuestion));
      return { state, message: msg };
    }
  }
  // From here we're at greeting → selecting_issue.
  state.stage = "selecting_issue";
  const greet = product
    ? greetingWithProduct(product)
    : "Hello — I'm the FoodGuard Food Safety Assistant. I can help you understand and report a food-safety, labelling, allergen, packaging or regulatory concern.";
  const msg = pushAssistantMessage(state, greet + "\n\nWhat is the issue? Please choose one or describe it in your own words.");
  return { state, message: msg };
}

function handleMessage(
  req: AssistantRequest,
  language: "en" | "hi",
): { state: ConversationState; message: AssistantMessage | null } {
  const state = ensureState(req.state ?? null, language);
  // Carry product context if the client only sent it on start.
  if (!state.productSnapshot && req.productContext) {
    state.productSnapshot = req.productContext;
  }

  // First, classify any free-text the user may have sent.
  const rawMessage = (req.message ?? "").trim();
  const safeMessage = redactSensitive(rawMessage).redacted;
  const userMsgContent = safeMessage || "(no message)";

  // If we are still at greeting / selecting_issue, the message clarifies issue.
  if (state.stage === "greeting" || state.stage === "selecting_issue") {
    pushUserMessage(state, userMsgContent);
    // Explicit answerKey takes precedence over free-text classification.
    if (req.answerKey === "issue_type" && typeof req.answerValue === "string") {
      const candidate = req.answerValue as IssueType;
      if (isValidIssueType(candidate)) {
        state.issueType = candidate;
        state.issueConfidence = "medium";
      }
    } else if (!state.issueType) {
      const cls = classifyIssue(rawMessage);
      state.issueType = cls.type;
      state.issueConfidence = cls.confidence;
    }
    // Record that issue_type has been answered so nextQuestion skips it.
    if (state.issueType) {
      applyAnswer(state, "issue_type" as QuestionField, state.issueType);
    }
    advance(state);
    return {
      state,
      message: pushAssistantMessage(state, stageTransitionMessage(state)),
    };
  }

  // Otherwise we treat the message as the answer to the current question.
  if (state.currentQuestion) {
    const field = state.currentQuestion.field;
    pushUserMessage(state, userMsgContent);

    // Apply either the explicit answer value (preferred) or a yes/no from text.
    let value = req.answerValue;
    if (value === undefined) {
      value = inferYesNoText(rawMessage);
    }
    if (value !== undefined) {
      applyAnswer(state, field, value);
      advance(state);
      return { state, message: pushAssistantMessage(state, stageTransitionMessage(state)) };
    }

    if (state.currentQuestion.type === "text") {
      applyAnswer(state, field, safeMessage);
      advance(state);
      return { state, message: pushAssistantMessage(state, stageTransitionMessage(state)) };
    }

    if (state.currentQuestion.type === "multichoice" && Array.isArray(state.currentQuestion.choices)) {
      const matches = state.currentQuestion.choices.filter((c) => rawMessage.toLowerCase().includes(c.label.toLowerCase()));
      if (matches.length > 0) {
        applyAnswer(state, field, matches.map((m) => m.value));
        advance(state);
        return { state, message: pushAssistantMessage(state, stageTransitionMessage(state)) };
      }
    }

    if (state.currentQuestion.type === "date") {
      const detected = detectDate(rawMessage);
      if (detected) {
        applyAnswer(state, field, detected);
        advance(state);
        return { state, message: pushAssistantMessage(state, stageTransitionMessage(state)) };
      }
    }

    // If we couldn't parse it, gently ask again with the same prompt.
    const retry = state.currentQuestion;
    return { state, message: pushAssistantMessage(state, `Sorry, I didn't catch that. ${formatQuestionPrompt(retry)}`) };
  }

  // No active question — likely the user is now reviewing the draft.
  // We don't interpret free-text revisions; the UI handles editing directly.
  pushUserMessage(state, userMsgContent);
  return {
    state,
    message: pushAssistantMessage(
      state,
      "Your draft is below. You can edit the text directly. Type \"start over\" to begin again.",
    ),
  };
}

function handleGenerate(
  _req: AssistantRequest,
  language: "en" | "hi",
  regulatory: RegulatoryContext | null,
): { state: ConversationState; message: AssistantMessage | null } {
  const state = ensureState(_req.state ?? null, language);
  if (!state.issueType) {
    return { state, message: pushAssistantMessage(state, "Please choose an issue before generating a draft.") };
  }
  // Apply any answers that arrived in the request but not yet committed.
  if (_req.answerKey) {
    applyAnswer(state, _req.answerKey, _req.answerValue);
  }
  buildDraftSnapshot(state, regulatory);
  state.stage = "reviewing_draft";
  const msg = pushAssistantMessage(state, "Your draft is ready. Review it below and feel free to edit it.");
  return { state, message: msg };
}

function handleReset(req: AssistantRequest, language: "en" | "hi"): { state: ConversationState; message: AssistantMessage | null } {
  // Reset keeps the product snapshot if provided so the user can re-start
  // quickly with the same context.
  const product = req.productContext ?? req.state?.productSnapshot ?? null;
  const state = ensureState({}, language);
  state.productSnapshot = product;
  state.stage = "greeting";
  const greet = product
    ? greetingWithProduct(product)
    : "Hello — I'm the FoodGuard Food Safety Assistant.";
  state.assistantMessages = [];
  const msg = pushAssistantMessage(state, greet + "\n\nWhat is the issue? Please choose one or describe it in your own words.");
  return { state, message: msg };
}

// ── Draft snapshot ─────────────────────────────────────────────

export function buildDraftSnapshot(state: ConversationState, regulatory: RegulatoryContext | null): void {
  if (!state.issueType) return;
  const issue: IssueType = state.issueType;
  const evidence = buildEvidenceChecklist(issue, state.collected);
  state.evidence = evidence;
  state.draft = buildComplaintDraft({
    issue,
    product: state.productSnapshot,
    collected: state.collected,
    evidence,
    regulatory,
  });
  state.currentQuestion = null;
}

// ── Formatting helpers ─────────────────────────────────────────

function formatQuestionPrompt(q: DynamicQuestion): string {
  const parts: string[] = [q.prompt];
  if (q.helpText) parts.push(`(${q.helpText})`);
  if (q.type === "choice" && q.choices) {
    parts.push(q.choices.map((c, i) => `${i + 1}. ${c.label}${c.description ? ` — ${c.description}` : ""}`).join("\n"));
  }
  if (q.type === "multichoice" && q.choices) {
    parts.push(q.choices.map((c, i) => `${i + 1}. ${c.label} ${c.description ? `— ${c.description}` : ""}`).join("\n"));
  }
  if (q.type === "yesno") {
    parts.push("Please answer Yes or No.");
  }
  return parts.join("\n");
}

function greetingWithProduct(product: ProductSnapshot): string {
  const pieces: string[] = [];
  if (product.brand) pieces.push(product.brand);
  if (product.name) pieces.push(product.name);
  const label = pieces.length > 0 ? pieces.join(" – ") : (product.barcode ?? "this product");
  return `Hello — I'm the FoodGuard Food Safety Assistant. I can help you prepare a factual complaint for ${label}.`;
}

function stageTransitionMessage(state: ConversationState): string {
  if (state.currentQuestion) return formatQuestionPrompt(state.currentQuestion);
  if (state.stage === "ready_to_generate") {
    return "I have enough information to draft a complaint. Click \"Generate draft\" when you're ready.";
  }
  if (state.stage === "selecting_issue") {
    return "What is the issue? Please choose one or describe it in your own words.";
  }
  return "Anything else you'd like to add before we generate the draft?";
}

function isValidIssueType(value: unknown): value is IssueType {
  return (
    typeof value === "string" &&
    [
      "allergen_undeclared",
      "foreign_object",
      "spoilage",
      "mislabeling",
      "contamination",
      "packaging_damage",
      "unauthorized_additive",
      "fssai_concern",
      "other",
    ].includes(value)
  );
}

function inferYesNoText(text: string): boolean | undefined {
  const lower = text.trim().toLowerCase();
  if (!lower) return undefined;
  if (/^(yes|y|sure|ok|okay|yep|yeah|haan|ha)\b/.test(lower)) return true;
  if (/^(no|n|nope|na|nahi|nah)\b/.test(lower)) return false;
  return undefined;
}

function detectDate(text: string): string | undefined {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slash) {
    const year = slash[3]!.length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[1]!.padStart(2, "0")}-${slash[2]!.padStart(2, "0")}`;
  }
  return undefined;
}

// ── Public entry point ─────────────────────────────────────────

export type RunAssistantInput = AssistantRequest & {
  regulatory?: RegulatoryContext | null;
};

export type RunAssistantOutput = AssistantResponse;

export function runAssistant(input: RunAssistantInput): RunAssistantOutput {
  const language = input.language === "hi" ? "hi" : "en";
  const conversationId = input.conversationId ?? newConversationId();
  const regulatory = input.regulatory ?? null;
  switch (input.action) {
    case "start":
      return finalise(handleStart(input, language), conversationId);
    case "message":
      return finalise(handleMessage(input, language), conversationId, regulatory);
    case "generate":
      return finalise(handleGenerate(input, language, regulatory), conversationId, regulatory);
    case "reset":
      return finalise(handleReset(input, language), conversationId, regulatory);
  }
}

function finalise(
  result: { state: ConversationState; message: AssistantMessage | null },
  conversationId: string,
  regulatory: RegulatoryContext | null = null,
): RunAssistantOutput {
  const state = result.state;
  if (state.stage === "ready_to_generate" && !state.draft && state.issueType) {
    buildDraftSnapshot(state, regulatory);
  }
  return {
    conversationId,
    state,
    assistantMessage: result.message,
    meta: {
      aiAvailable: false, // AI unavailability is detected at the route layer.
      reportingUrlAvailable: !!process.env.FSSAI_REPORTING_URL,
    },
  };
}

// Re-export commonly used types so callers don't have to dig through
// multiple files.
export type { ConversationState, QuestionField };
// Product-field marker exported so callers (tests) can introspect.
export const __productFields = PRODUCT_FIELDS;
export const __lookupQuestion = lookupQuestion;
