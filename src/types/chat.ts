export type ChatRole = "user" | "assistant";

export type ChatMessageRecord = {
  id: string;
  conversationId: string;
  userId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ChatConversationRecord = {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatSourceRef = {
  title: string;
  source: string;
  url?: string | null;
};

export type ChatAction =
  | { type: "view_product"; label: string; payload: { product_id: string } }
  | { type: "view_analysis"; label: string; payload: { product_id: string } }
  | { type: "generate_report"; label: string; payload: { product_id?: string } }
  | { type: "view_regulation"; label: string; payload: { url: string } }
  | { type: "scan_another"; label: string; payload: Record<string, never> };

export type ChatAssistantResponse = {
  answer: string;
  sources: ChatSourceRef[];
  actions: ChatAction[];
  metadata: {
    intent: string;
    model_version: string;
  };
};

export type ChatIntent =
  | "PRODUCT_EXPLANATION"
  | "INGREDIENT_EXPLANATION"
  | "FOOD_SAFETY_QUESTION"
  | "CONCERN_LEVEL_EXPLANATION"
  | "SCAN_HISTORY"
  | "PRODUCT_COMPARISON"
  | "REGULATORY_INFORMATION"
  | "REPORT_REQUEST"
  | "GENERAL_FOODGUARD_HELP"
  | "UNKNOWN";