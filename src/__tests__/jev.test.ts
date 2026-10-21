import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JevStateInput } from "@/lib/jev";

/**
 * Jev decision-layer tests.
 *
 * The service must never throw: any failure (disabled, missing key, HTTP
 * error, malformed payload, invalid answers, network error) resolves to
 * `{ available: false }` so the analysis pipeline can fall back to the
 * deterministic rule engine (decision_source = "rule_engine").
 *
 * `@/lib/config` is mocked with a mutable holder so tests can flip the
 * feature flag without depending on process.env ordering.
 */
const jevConfigState = vi.hoisted(() => ({
  value: {
    enabled: true,
    apiKey: "test-key",
    model: "jev-test",
    baseUrl: "https://jev.test/v1",
    timeoutMs: 5_000,
  },
}));

vi.mock("@/lib/config", () => ({
  config: {
    get jev() {
      return jevConfigState.value;
    },
  },
}));

import {
  buildJevQuestions,
  evaluateFoodProductDecision,
  isJevAvailable,
  JEV_CONFIDENCE_THRESHOLD,
  JEV_EVIDENCE_THRESHOLD,
  JEV_QUESTION_VERSION,
  resolveJevDecision,
} from "@/lib/jev";

const sampleInput: JevStateInput = {
  analysisId: "prod-1",
  productName: "Test Snack",
  category: "food",
  ingredients: [
    { name: "Palm oil", assessment: "noteworthy" },
    { name: "Salt", assessment: "ok" },
  ],
  allergens: ["milk"],
  ruleEngine: {
    score: 2.4,
    rating: "Okay",
    assessment: "moderate",
    confidence: 0.7,
    needs_review: false,
    negative_factors: ["sodium"],
    missing_data: ["fiber"],
    unresolved_ingredients: 0,
    has_nutrition: true,
    has_ingredients: true,
  },
  user: { goals: ["weight_loss"], avoid: ["palm oil"] },
};

function jevSuccessResponse(overrides: Record<string, unknown> = {}) {
  return {
    model: "jev-test",
    answers: {
      concern_level: {
        type: "choice",
        choice: "moderate",
        confidence: 0.87,
        probabilities: { low: 0.05, moderate: 0.9, high: 0.05 },
      },
      evidence_sufficient: { type: "noul", noul: 0.94 },
      explanation_priority: {
        type: "choice",
        choice: "nutrition",
        confidence: 0.8,
        probabilities: { nutrition: 0.8 },
      },
      ...overrides,
    },
  };
}

beforeEach(() => {
  jevConfigState.value = {
    enabled: true,
    apiKey: "test-key",
    model: "jev-test",
    baseUrl: "https://jev.test/v1",
    timeoutMs: 5_000,
  };
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("question contract", () => {
  it("exposes the three documented questions with typed criteria", () => {
    const questions = buildJevQuestions();
    expect(Object.keys(questions).sort()).toEqual([
      "concern_level",
      "evidence_sufficient",
      "explanation_priority",
    ]);
    expect(questions.concern_level.type).toBe("choice");
    expect(Object.keys(questions.concern_level.criteria).sort()).toEqual([
      "high",
      "low",
      "moderate",
    ]);
    expect(questions.evidence_sufficient.type).toBe("noul");
    expect(questions.explanation_priority.type).toBe("choice");
    expect(Object.keys(questions.explanation_priority.criteria)).toHaveLength(6);
  });
});

describe("feature flag", () => {
  it("is unavailable when disabled or the key is missing", () => {
    jevConfigState.value = { ...jevConfigState.value, enabled: false };
    expect(isJevAvailable()).toBe(false);

    jevConfigState.value = { ...jevConfigState.value, enabled: true, apiKey: "" };
    expect(isJevAvailable()).toBe(false);

    jevConfigState.value = { ...jevConfigState.value, apiKey: "k" };
    expect(isJevAvailable()).toBe(true);
  });
});

describe("evaluateFoodProductDecision", () => {
  it("returns a normalized decision on success and sends the documented request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(jevSuccessResponse()), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateFoodProductDecision(sampleInput);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.evaluation.decision).toEqual({
      concern_level: "moderate",
      confidence: 0.87,
      evidence_sufficient: 0.94,
      explanation_priority: "nutrition",
    });
    expect(result.evaluation.model).toBe("jev-test");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://jev.test/v1/systemone");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body)) as {
      model: string;
      state: Record<string, unknown>;
      questions: Record<string, unknown>;
    };
    expect(body.model).toBe("jev-test");
    expect(Object.keys(body.questions).sort()).toEqual([
      "concern_level",
      "evidence_sufficient",
      "explanation_priority",
    ]);
    // State carries product/rule-engine signals only — no secrets or tokens.
    expect(Object.keys(body.state).sort()).toEqual(["product", "rule_engine", "user"]);
  });

  it("falls back when disabled without calling the network", async () => {
    jevConfigState.value = { ...jevConfigState.value, enabled: false };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateFoodProductDecision(sampleInput);
    expect(result).toEqual({ available: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["http_500", vi.fn().mockResolvedValue(new Response("boom", { status: 500 }))],
    ["http_429", vi.fn().mockResolvedValue(new Response("slow down", { status: 429 }))],
    [
      "malformed_json",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } } as unknown as Response),
    ],
    ["schema_mismatch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ nope: 1 }), { status: 200 }))],
    [
      "invalid_choice_value",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(jevSuccessResponse({ concern_level: { type: "choice", choice: "catastrophic", confidence: 0.9 } })),
          { status: 200 },
        ),
      ),
    ],
    ["network_error", vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))],
    ["timeout_abort", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"))],
  ])("falls back safely on %s", async (_name, fetchMock) => {
    vi.stubGlobal("fetch", fetchMock);
    const result = await evaluateFoodProductDecision(sampleInput);
    expect(result).toEqual({ available: false });
  });
});

describe("resolveJevDecision (backend owns actions)", () => {
  const rule = { assessment: "moderate" as const, confidence: 0.7 };

  it("uses the rule engine when Jev is unavailable", () => {
    const decision = resolveJevDecision({ available: false }, rule);
    expect(decision).toMatchObject({
      concern_level: "moderate",
      confidence: 0.7,
      evidence_sufficient: null,
      explanation_priority: null,
      status: "ready",
      decision_source: "rule_engine",
    });
  });

  it("marks insufficient evidence below the noul threshold", () => {
    const decision = resolveJevDecision(
      {
        available: true,
        evaluation: {
          model: "jev-test",
          latencyMs: 10,
          decision: { concern_level: "high", confidence: 0.9, evidence_sufficient: JEV_EVIDENCE_THRESHOLD - 0.1, explanation_priority: "ingredients" },
        },
      },
      rule,
    );
    // The backend ignores the concern when evidence is insufficient.
    expect(decision.status).toBe("insufficient_evidence");
    expect(decision.concern_level).toBe("moderate");
    expect(decision.decision_source).toBe("jev");
    expect(decision.evidence_sufficient).toBeCloseTo(JEV_EVIDENCE_THRESHOLD - 0.1);
  });

  it("routes low-confidence answers to review instead of trusting them", () => {
    const decision = resolveJevDecision(
      {
        available: true,
        evaluation: {
          model: "jev-test",
          latencyMs: 10,
          decision: { concern_level: "low", confidence: JEV_CONFIDENCE_THRESHOLD - 0.05, evidence_sufficient: 0.95, explanation_priority: "nutrition" },
        },
      },
      rule,
    );
    expect(decision.status).toBe("review");
    expect(decision.concern_level).toBe("low");
    expect(decision.decision_source).toBe("jev");
  });

  it("accepts a confident, well-evidenced answer", () => {
    const decision = resolveJevDecision(
      {
        available: true,
        evaluation: {
          model: "jev-prod",
          latencyMs: 10,
          decision: { concern_level: "high", confidence: 0.88, evidence_sufficient: 0.93, explanation_priority: "allergens" },
        },
      },
      rule,
    );
    expect(decision).toMatchObject({
      concern_level: "high",
      confidence: 0.88,
      status: "ready",
      decision_source: "jev",
      model: "jev-prod",
      explanation_priority: "allergens",
    });
  });

  it("maps a rule-engine insufficient assessment to insufficient_evidence on fallback", () => {
    const decision = resolveJevDecision({ available: false }, { assessment: "insufficient", confidence: 0.2 });
    expect(decision.status).toBe("insufficient_evidence");
    expect(decision.decision_source).toBe("rule_engine");
  });
});

describe("observability metadata", () => {
  it("keeps a stable question version for persisted decisions", () => {
    expect(JEV_QUESTION_VERSION).toBe("foodguard.concern.v1");
  });
});
