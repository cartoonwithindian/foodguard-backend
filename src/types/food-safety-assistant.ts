// ─────────────────────────────────────────────────────────────
// Food Safety Assistant types.
//
// The assistant is a guided, factual conversation that helps a user
// understand a possible food-safety / labelling / allergen /
// packaging / adulteration / regulatory concern and draft a clear,
// factual complaint. The contract is server-stateless — the client
// sends the full conversation state on each request and the server
// returns the next step. We never persist complaint info, never
// declare legal violations and never impersonate FSSAI.
// ─────────────────────────────────────────────────────────────

// Issue categories the assistant can recognise from the user's first message,
// product context or quick-issue selection. Loose classification by design —
// the assistant explicitly says "based on what you described" and treats
// unknown values as a general concern.
export type IssueType =
  | "allergen_undeclared"
  | "foreign_object"
  | "spoilage"
  | "mislabeling"
  | "contamination"
  | "packaging_damage"
  | "unauthorized_additive"
  | "fssai_concern"
  | "other";

// One focused question per step. The schema controls the order in which
// we ask questions so the flow stays predictable even if the LLM rewrites
// the wording.
export type QuestionField =
  | "issue_type"
  | "incident_date"
  | "purchase_location"
  | "observed_symptoms"
  | "product_batch"
  | "product_manufacturing_date"
  | "product_expiry_date"
  | "consumer_age_group"
  | "consumer_existing_conditions"
  | "evidence_photos"
  | "evidence_receipt"
  | "evidence_keeping_sample"
  | "anything_else";

export type QuestionType = "choice" | "text" | "date" | "yesno" | "multichoice";

export type Choice = { value: string; label: string; description?: string };

export type DynamicQuestion = {
  field: QuestionField;
  type: QuestionType;
  prompt: string;
  choices?: Choice[];
  helpText?: string;
  required?: boolean;
  // Sensitive fields are filtered before being inserted into the draft.
  sensitive?: boolean;
};

// Information collected from the user. The assistant never invents
// fields; every value comes from `value` or the schema-level
// "not_provided" string so the draft can render missing data clearly.
export type CollectedAnswerValue = string | string[] | boolean | number | null;

export type CollectedInformation = Partial<Record<QuestionField, CollectedAnswerValue>>;

// Evidence checklist derived from the issue + collected answers. Each
// item is informational; "not_provided" / "not_applicable" are valid
// statuses so we never promise the user has evidence they don't have.
export type EvidenceStatus = "provided" | "not_provided" | "not_applicable";

export type EvidenceRequirement = {
  key: string;
  label: string;
  description: string;
  importance: "high" | "medium" | "low";
  status: EvidenceStatus;
  notes?: string;
};

// Structured regulator / FSSAI context that the assistant can re-use.
// These mirror what the existing Product Analysis pipeline produces;
// the assistant never re-derives regulatory status itself.
export type RegulatoryContext = {
  country?: string | null;
  fssai: {
    status: string;
    summary: string;
    findings: Array<{ type: string; details: string }>;
    sources: Array<{ title: string; url?: string; organization: string }>;
  } | null;
  ingredients?: Array<{
    name: string;
    identifier?: string;
    assessment: string;
    concernSummary?: string;
  }>;
  nutritionConcerns?: string[];
  allergensDecl?: string[];
};

// A factual complaint draft. We always lead with a request for review
// rather than a legal conclusion. Fields are explicitly nullable so the
// UI can render "Not provided" instead of guessing.
export type ComplaintDraft = {
  subjectLine: string;
  greeting: string;
  productDetails: {
    productName: string | null;
    brand: string | null;
    barcode: string | null;
    batchOrLot: string | null;
    manufacturingDate: string | null;
    expiryDate: string | null;
    mrp: string | null;
    netWeight: string | null;
  };
  purchaseDetails: {
    purchaseDate: string | null;
    purchaseLocation: string | null;
    purchaseReceipt: string | null;
  };
  consumerDetails: {
    isConsumerProvided: boolean;
    ageGroup: string | null;
  };
  issueSummary: string;
  observations: {
    userObservations: string[];
    foodguardObservations: string[];
    regulatoryContext: string[];
  };
  evidenceChecklist: EvidenceRequirement[];
  request: string;
  closing: string;
  disclaimer: string;
};

// Conversation state that the client sends on each call. The server
// only mutates this transitionally and returns it back so the UI can
// render the next step without losing progress.
export type ConversationState = {
  stage: "greeting" | "selecting_issue" | "collecting_info" | "ready_to_generate" | "reviewing_draft" | "complete";
  productSnapshot: ProductSnapshot | null;
  issueType: IssueType | null;
  issueConfidence: "low" | "medium" | "high";
  collected: CollectedInformation;
  evidence: EvidenceRequirement[];
  followUpsAsked: QuestionField[];
  skipAnswers: QuestionField[];
  currentQuestion: DynamicQuestion | null;
  questionHistory: Array<{ field: QuestionField; answer: CollectedAnswerValue; at: string }>;
  draft: ComplaintDraft | null;
  language: "en" | "hi";
  assistantMessages: AssistantMessage[];
};

// Minimal product snapshot, sent in the request so we don't depend on
// the analysis API. Only fields we genuinely need are included. Every field
// is optional so degraded contexts (e.g. only a barcode) are accepted.
export type ProductSnapshot = {
  id?: string | null;
  barcode?: string | null;
  name?: string | null;
  brand?: string | null;
  category?: string | null;
  ingredients?: string[];
  nutritionConcerns?: string[];
  allergens?: string[];
  regulatorySummary?: string | null;
};

export type AssistantMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  createdAt: string;
};

// ── API request/response shapes ──────────────────────────────

export type AssistantAction = "start" | "message" | "generate" | "reset";

export type AssistantRequest = {
  action: AssistantAction;
  conversationId?: string | null;
  // The full conversation state is sent on every call (server is stateless).
  state?: Partial<ConversationState> | null;
  // For "start" we can accept a fresh product context to seed the conversation.
  productContext?: ProductSnapshot | null;
  // For "message" we accept the answer to the current question OR a free-text msg.
  message?: string | null;
  answerKey?: QuestionField | null;
  answerValue?: CollectedAnswerValue;
  language?: "en" | "hi";
};

// Server response. Always includes the next conversation state, plus an
// `assistantMessage` for the new assistant turn and a `meta` payload
// that lets the UI surface AI availability / next-step hints.
export type AssistantResponse = {
  conversationId: string;
  state: ConversationState;
  assistantMessage: AssistantMessage | null;
  meta: {
    aiAvailable: boolean;
    dynamicSuggestedQuestions?: QuestionField[];
    reportingUrlAvailable: boolean;
  };
};

// Sentinel used by collected-information fields when no answer was provided.
// We use a literal string instead of null so the type still wraps a string.
export const NOT_PROVIDED = "Not provided";
