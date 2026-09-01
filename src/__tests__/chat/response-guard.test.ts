import { describe, it, expect } from "vitest";
import {
  guardResponse,
  ChatAssistantResponseSchema,
  UNAVAILABLE_ANSWER,
  PRELIMINARY_CAVEAT,
} from "@/services/chat/response-guard";
import { FOODGUARD_ASSISTANT_SYSTEM_PROMPT } from "@/services/chat/system-prompt";
import { detectIntent } from "@/services/chat/intent";

describe("response guard", () => {
  it("accepts a valid structured response unchanged", () => {
    const raw = JSON.stringify({
      answer: "FoodGuard flagged this product because of its sodium content.",
      sources: [{ title: "FSSAI Labelling Regulations", source: "FSSAI", url: "https://fssai.gov.in" }],
      actions: [{ type: "view_analysis", label: "View Analysis", payload: { product_id: "p1" } }],
      metadata: { intent: "PRODUCT_EXPLANATION", model_version: "v1" },
    });
    const outcome = guardResponse(raw, { intent: "PRODUCT_EXPLANATION", modelVersion: "v1" });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.response.answer).toContain("sodium");
      expect(outcome.response.sources[0].source).toBe("FSSAI");
    }
  });

  it("wraps plain text as a valid response (graceful degradation)", () => {
    const outcome = guardResponse("not json", { intent: "UNKNOWN" });
    // Plain text is wrapped in a valid response for robustness
    expect(outcome.ok).toBe(true);
    expect(outcome.response.answer).toBe("not json");
    expect(outcome.response.metadata.intent).toBe("UNKNOWN");
  });

  it("rejects schema-mismatched output (no answer field)", () => {
    const outcome = guardResponse(JSON.stringify({ text: "hello" }), {});
    expect(outcome.ok).toBe(false);
    expect(outcome.issues.some((i) => i.startsWith("schema_mismatch"))).toBe(true);
  });

  it("replaces forbidden legal assertions with the caveat", () => {
    const raw = JSON.stringify({
      answer: "This product is legally unsafe and the company violated the law.",
      sources: [],
      actions: [],
      metadata: { intent: "PRODUCT_EXPLANATION", model_version: "v1" },
    });
    const outcome = guardResponse(raw, {});
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.response.answer).not.toContain("legally unsafe");
      expect(outcome.response.answer).toContain(PRELIMINARY_CAVEAT);
      expect(outcome.issues).toContain("forbidden_phrase_replaced");
    }
  });

  it("replaces fake complaint-submission claims", () => {
    const raw = JSON.stringify({
      answer: "Your complaint has been submitted to FSSAI and they will act on it.",
      sources: [],
      actions: [],
      metadata: { intent: "REPORT_REQUEST", model_version: "v1" },
    });
    const outcome = guardResponse(raw, {});
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.response.answer).not.toMatch(/submitted to fssai/i);
      expect(outcome.response.answer).toContain("does not submit complaints automatically");
    }
  });

  it("caps sources and actions at the schema limits", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ title: `s${i}`, source: "FSSAI" }));
    const actions = Array.from({ length: 8 }, (_, i) => ({
      type: "scan_another" as const,
      label: `a${i}`,
      payload: {},
    }));
    const raw = JSON.stringify({
      answer: "ok",
      sources: many,
      actions,
      metadata: { intent: "X", model_version: "v1" },
    });
    const parsed = ChatAssistantResponseSchema.safeParse(JSON.parse(raw));
    expect(parsed.success).toBe(false);
  });
});

describe("system prompt", () => {
  it("contains all master-rule constraints", () => {
    expect(FOODGUARD_ASSISTANT_SYSTEM_PROMPT).toContain("FoodGuard AI Assistant");
    expect(FOODGUARD_ASSISTANT_SYSTEM_PROMPT.toLowerCase()).toContain("never invent fssai regulations");
    expect(FOODGUARD_ASSISTANT_SYSTEM_PROMPT).toContain("legally unsafe");
    expect(FOODGUARD_ASSISTANT_SYSTEM_PROMPT).toContain("preliminary");
    expect(FOODGUARD_ASSISTANT_SYSTEM_PROMPT).toContain("JSON");
  });
});

describe("intent detection", () => {
  const cases: Array<[string, string | null, string]> = [
    ["Why is this product moderate concern?", null, "CONCERN_LEVEL_EXPLANATION"],
    ["why", "prod-1", "PRODUCT_EXPLANATION"],
    ["What is INS 621?", null, "INGREDIENT_EXPLANATION"],
    ["What should I check before buying packaged food?", null, "FOOD_SAFETY_QUESTION"],
    ["What does High Concern mean?", null, "CONCERN_LEVEL_EXPLANATION"],
    ["What products did I scan recently?", null, "SCAN_HISTORY"],
    ["Compare Product A and Product B.", null, "PRODUCT_COMPARISON"],
    ["What are the labelling requirements under FSSAI?", null, "REGULATORY_INFORMATION"],
    ["I want to report this product.", null, "REPORT_REQUEST"],
    ["hello", null, "GENERAL_FOODGUARD_HELP"],
    ["qwerty zzzz", null, "UNKNOWN"],
  ];

  for (const [message, productId, expected] of cases) {
    it(`detects "${message.slice(0, 40)}" as ${expected}`, () => {
      expect(detectIntent(message, productId)).toBe(expected);
    });
  }
});