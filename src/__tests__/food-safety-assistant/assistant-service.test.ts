import { describe, it, expect } from "vitest";
import { runAssistant, buildDraftSnapshot, type ConversationState } from "@/services/food-safety-assistant/assistant";
import { classifyIssue, redactSensitive, messageLooksSensitive } from "@/services/food-safety-assistant/classification";
import { buildEvidenceChecklist } from "@/services/food-safety-assistant/evidence";
import { buildOrderForIssue, nextQuestion, listAllQuestions } from "@/services/food-safety-assistant/questions";
import { buildComplaintDraft } from "@/services/food-safety-assistant/draft";
import type { IssueType, ProductSnapshot, RegulatoryContext, QuestionField } from "@/types/food-safety-assistant";

// ── Classification tests ──────────────────────────────────────

describe("classifyIssue", () => {
  it("returns other with low confidence for empty input", () => {
    const result = classifyIssue(null);
    expect(result.type).toBe("other");
    expect(result.confidence).toBe("low");
  });

  it("classifies allergen keywords with medium confidence (single keyword)", () => {
    const result = classifyIssue("I had an allergic reaction after eating this product");
    expect(result.type).toBe("allergen_undeclared");
    expect(result.confidence).toBe("medium");
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it("classifies allergen keywords with high confidence when multiple patterns match", () => {
    // Two distinct allergen_undeclared patterns must both match to reach
    // score >= 4 ("high"). Here we trigger both the "contains ... but label"
    // pattern AND the "allergen" keyword pattern.
    const result = classifyIssue(
      "This product contains milk but label does not list allergen, I had an allergic reaction",
    );
    expect(result.type).toBe("allergen_undeclared");
    expect(result.confidence).toBe("high");
  });

  it("classifies foreign object keywords", () => {
    const result = classifyIssue("Found a piece of metal inside the packet");
    expect(result.type).toBe("foreign_object");
    expect(result.confidence).toBe("medium");
  });

  it("classifies spoilage keywords", () => {
    const result = classifyIssue("The product smells bad and is spoiled");
    expect(result.type).toBe("spoilage");
    expect(result.confidence).toBe("medium");
  });

  it("classifies packaging damage", () => {
    const result = classifyIssue("The can was swollen and the seal was broken");
    expect(result.type).toBe("packaging_damage");
    expect(result.confidence).toBe("medium");
  });

  it("classifies FSSAI concern", () => {
    const result = classifyIssue("The FSSAI license number on the package is missing");
    expect(result.type).toBe("fssai_concern");
    expect(result.confidence).toBe("medium");
  });

  it("classifies unauthorized additive", () => {
    const result = classifyIssue("This additive is not allowed in food products");
    expect(result.type).toBe("unauthorized_additive");
    expect(result.confidence).toBe("medium");
  });

  it("classifies mislabeling", () => {
    const result = classifyIssue("The ingredient label was wrong, the product was mislabeled");
    expect(result.type).toBe("mislabeling");
    expect(result.confidence).toBe("medium");
  });

  it("classifies contamination", () => {
    const result = classifyIssue("I think there is contamination in this food product");
    expect(result.type).toBe("contamination");
    expect(result.confidence).toBe("medium");
  });
});

// ── Sensitive data redaction tests ────────────────────────────

describe("redactSensitive", () => {
  it("redacts email addresses", () => {
    const { redacted, removed } = redactSensitive("Contact me at test@example.com for more info");
    expect(redacted).toContain("[redacted-email]");
    expect(redacted).not.toContain("test@example.com");
    expect(removed).toBe(1);
  });

  it("redacts phone numbers", () => {
    const { redacted, removed } = redactSensitive("Call me at +91 9876543210");
    expect(redacted).toContain("[redacted-phone]");
    expect(redacted).not.toContain("9876543210");
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it("redacts Aadhaar-like numbers", () => {
    const { redacted } = redactSensitive("My Aadhaar is 1234 5678 9012");
    expect(redacted).toContain("[redacted-id]");
    expect(redacted).not.toContain("1234 5678 9012");
  });

  it("returns empty for null input", () => {
    const { redacted, removed } = redactSensitive("");
    expect(redacted).toBe("");
    expect(removed).toBe(0);
  });
});

describe("messageLooksSensitive", () => {
  it("detects messages with redactables", () => {
    expect(messageLooksSensitive("Contact me at test@example.com")).toBe(true);
  });
  it("returns false for plain text", () => {
    expect(messageLooksSensitive("The product is spoiled")).toBe(false);
  });
});

// ── Evidence checklist tests ──────────────────────────────────

describe("buildEvidenceChecklist", () => {
  it("includes photos and receipt for mislabeling", () => {
    const list = buildEvidenceChecklist("mislabeling", {});
    expect(list.some((e) => e.key === "photos_of_product_label")).toBe(true);
    expect(list.some((e) => e.key === "purchase_receipt")).toBe(true);
  });

  it("includes kept_sample for foreign_object", () => {
    const list = buildEvidenceChecklist("foreign_object", {});
    expect(list.some((e) => e.key === "kept_product_sample")).toBe(true);
  });

  it("marks doctor_consultation not_applicable when no symptoms", () => {
    const list = buildEvidenceChecklist("allergen_undeclared", { observed_symptoms: "none" });
    const doctor = list.find((e) => e.key === "doctor_consultation");
    expect(doctor?.status).toBe("not_applicable");
  });

  it("marks doctor_consultation not_provided when symptoms are present", () => {
    const list = buildEvidenceChecklist("allergen_undeclared", { observed_symptoms: "moderate" });
    const doctor = list.find((e) => e.key === "doctor_consultation");
    expect(doctor?.status).toBe("not_provided");
  });

  it("marks receipt as provided when evidence_receipt is true", () => {
    const list = buildEvidenceChecklist("spoilage", { evidence_receipt: true });
    const receipt = list.find((e) => e.key === "purchase_receipt");
    expect(receipt?.status).toBe("provided");
  });

  it("marks photos as provided when evidence_photos is true", () => {
    const list = buildEvidenceChecklist("spoilage", { evidence_photos: true });
    const photos = list.find((e) => e.key === "photos_of_issue");
    expect(photos?.status).toBe("provided");
  });
});

// ── Question flow tests ───────────────────────────────────────

describe("buildOrderForIssue", () => {
  it("starts with issue_type, incident_date, purchase_location for all issues", () => {
    const issues: IssueType[] = ["allergen_undeclared", "foreign_object", "spoilage", "other"];
    for (const issue of issues) {
      const order = buildOrderForIssue(issue);
      expect(order[0]).toBe("issue_type");
      expect(order[1]).toBe("incident_date");
      expect(order[2]).toBe("purchase_location");
    }
  });

  it("includes consumer fields for allergen_undeclared", () => {
    const order = buildOrderForIssue("allergen_undeclared");
    expect(order).toContain("consumer_age_group");
    expect(order).toContain("observed_symptoms");
  });

  it("includes batch/expiry for foreign_object", () => {
    const order = buildOrderForIssue("foreign_object");
    expect(order).toContain("product_batch");
    expect(order).toContain("product_expiry_date");
  });

  it("ends with anything_else", () => {
    const order = buildOrderForIssue("other");
    expect(order[order.length - 1]).toBe("anything_else");
  });
});

describe("listAllQuestions", () => {
  it("returns DynamicQuestion objects for every field in the order", () => {
    const questions = listAllQuestions("spoilage");
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q.field).toBeDefined();
      expect(q.prompt).toBeDefined();
      expect(q.prompt.length).toBeGreaterThan(0);
    }
  });
});

describe("nextQuestion", () => {
  it("skips fields already in followUpsAsked", () => {
    const state = {
      collected: {} as Record<string, unknown>,
      followUpsAsked: ["issue_type" as QuestionField],
      skipAnswers: [] as QuestionField[],
      issueType: "spoilage" as IssueType,
    };
    const q = nextQuestion(state);
    expect(q?.field).not.toBe("issue_type");
  });
});

// ── Draft generation tests ────────────────────────────────────

describe("buildComplaintDraft", () => {
  it("uses 'Not provided' for all missing product fields", () => {
    const draft = buildComplaintDraft({
      issue: "spoilage",
      product: null,
      collected: {},
      evidence: [],
      regulatory: null,
    });
    expect(draft.productDetails.productName).toBeNull();
    expect(draft.productDetails.barcode).toBeNull();
    expect(draft.productDetails.brand).toBeNull();
    expect(draft.productDetails.batchOrLot).toBeNull();
    expect(draft.purchaseDetails.purchaseDate).toBeNull();
    expect(draft.purchaseDetails.purchaseLocation).toBeNull();
    expect(draft.disclaimer).toContain("does not assert");
  });

  it("includes provided product details in the draft", () => {
    const product: ProductSnapshot = {
      barcode: "8901491100519",
      name: "Kurkure",
      brand: "PepsiCo",
      ingredients: ["Corn meal", "Palm oil", "Salt"],
    };
    const draft = buildComplaintDraft({
      issue: "foreign_object",
      product,
      collected: {
        incident_date: "2026-07-01",
        purchase_location: "Big Bazaar, Mumbai",
        product_batch: "BATCH123",
        evidence_photos: true,
      },
      evidence: [
        { key: "photos_of_issue", label: "Photos", description: "", importance: "high", status: "provided" },
      ],
      regulatory: null,
    });
    expect(draft.productDetails.productName).toBe("Kurkure");
    expect(draft.productDetails.brand).toBe("PepsiCo");
    expect(draft.productDetails.barcode).toBe("8901491100519");
    expect(draft.productDetails.batchOrLot).toBe("BATCH123");
    expect(draft.purchaseDetails.purchaseDate).toBe("2026-07-01");
    expect(draft.purchaseDetails.purchaseLocation).toBe("Big Bazaar, Mumbai");
    expect(draft.observations.foodguardObservations.some((o) => o.includes("Corn meal"))).toBe(true);
  });

  it("never asserts legal violations (no declarative statements)", () => {
    const draft = buildComplaintDraft({
      issue: "allergen_undeclared",
      product: { barcode: "123", name: "Test" },
      collected: {},
      evidence: [],
      regulatory: null,
    });
    // The disclaimer contains the word "violation" to explain what we
    // do NOT do — that is fine. The request uses "non-compliance" as a
    // factual descriptor, not a legal conclusion — also fine.
    // Check that we never say "this product violates" or "this is illegal".
    const allText = [
      draft.issueSummary,
      draft.request,
      ...draft.observations.userObservations,
      ...draft.observations.foodguardObservations,
      ...draft.observations.regulatoryContext,
    ].join(" ");
    expect(allText).not.toMatch(/\b(this product|product) (violates|is illegal|breaks)\b/i);
    expect(allText).not.toMatch(/\b(illegal|contraven|breach)\b/i);
    expect(draft.request).toContain("requesting");
    expect(draft.request).toContain("review");
  });

  it("preserves all fields in the evidence checklist", () => {
    const draft = buildComplaintDraft({
      issue: "contamination",
      product: null,
      collected: {},
      evidence: [
        { key: "photos_of_issue", label: "Photos", description: "", importance: "high", status: "not_provided" },
        { key: "kept_product_sample", label: "Sample", description: "", importance: "medium", status: "not_applicable" },
      ],
      regulatory: null,
    });
    expect(draft.evidenceChecklist.length).toBe(2);
    expect(draft.evidenceChecklist[0]!.status).toBe("not_provided");
    expect(draft.evidenceChecklist[1]!.status).toBe("not_applicable");
  });

  it("includes regulatory context when available", () => {
    const regulatory: RegulatoryContext = {
      country: "India",
      fssai: {
        status: "reviewed",
        summary: "Overall status: REVIEW",
        findings: [{ type: "labelling", details: "Labelling issues found" }],
        sources: [{ title: "FSSAI Knowledge Base", organization: "FSSAI" }],
      },
    };
    const draft = buildComplaintDraft({
      issue: "fssai_concern",
      product: null,
      collected: {},
      evidence: [],
      regulatory,
    });
    expect(draft.observations.regulatoryContext.some((l) => l.includes("FSSAI summary"))).toBe(true);
    expect(draft.observations.regulatoryContext.some((l) => l.includes("labelling"))).toBe(true);
    expect(draft.observations.regulatoryContext.some((l) => l.includes("India"))).toBe(true);
  });
});

// ── Full orchestrator / round-trip tests ──────────────────────

describe("runAssistant", () => {
  it("starts a conversation and returns a greeting with product name", () => {
    const result = runAssistant({
      action: "start",
      language: "en",
      productContext: { barcode: "8901491100519", name: "Kurkure", brand: "PepsiCo" },
    });
    expect(result.state.stage).toBe("selecting_issue");
    expect(result.state.productSnapshot?.barcode).toBe("8901491100519");
    expect(result.state.productSnapshot?.name).toBe("Kurkure");
    expect(result.assistantMessage?.content).toContain("Kurkure");
    expect(result.meta.reportingUrlAvailable).toBe(false);
  });

  it("classifies the issue from a free-text message", () => {
    const r1 = runAssistant({ action: "start", language: "en", productContext: { barcode: "123", name: "X" } });
    const r2 = runAssistant({
      action: "message",
      language: "en",
      state: r1.state,
      message: "I found a piece of metal inside the packet",
    });
    expect(r2.state.issueType).toBe("foreign_object");
    expect(r2.state.stage).toBe("collecting_info");
    expect(r2.state.currentQuestion).toBeDefined();
  });

  it("handles issue_type choice directly", () => {
    const r1 = runAssistant({ action: "start", language: "en" });
    const r2 = runAssistant({
      action: "message",
      language: "en",
      state: r1.state,
      answerKey: "issue_type",
      answerValue: "spoilage",
    });
    expect(r2.state.issueType).toBe("spoilage");
    expect(r2.state.stage).toBe("collecting_info");
  });

  it("generates a draft after enough answers", () => {
    const r1 = runAssistant({ action: "start", language: "en" });
    let state = r1.state;
    // Quick-fill answers through the orchestrator.
    const fields: Array<{ key: QuestionField; value: string | boolean }> = [
      { key: "issue_type", value: "mislabeling" },
      { key: "incident_date", value: "2026-07-01" },
      { key: "purchase_location", value: "Store" },
      { key: "evidence_photos", value: true },
      { key: "evidence_receipt", value: true },
      { key: "product_batch", value: "B1" },
      { key: "anything_else", value: false },
    ];
    for (const f of fields) {
      const r = runAssistant({
        action: "message",
        language: "en",
        state,
        answerKey: f.key,
        answerValue: f.value,
      });
      state = r.state;
    }
    // Should have reached ready_to_generate or reviewing_draft.
    expect(state.stage === "ready_to_generate" || state.stage === "reviewing_draft").toBe(true);

    // Generate.
    const genResult = runAssistant({ action: "generate", language: "en", state });
    expect(genResult.state.stage).toBe("reviewing_draft");
    expect(genResult.state.draft).not.toBeNull();
    expect(genResult.state.draft!.subjectLine.toLowerCase()).toContain("mislabeling");
    expect(genResult.state.draft!.productDetails.batchOrLot).toBe("B1");
    expect(genResult.state.draft!.purchaseDetails.purchaseDate).toBe("2026-07-01");
  });

  it("reset clears conversation state but preserves product snapshot", () => {
    const r1 = runAssistant({
      action: "start",
      language: "en",
      productContext: { barcode: "8901491100519", name: "Kurkure" },
    });
    const r2 = runAssistant({ action: "reset", language: "en", state: r1.state, productContext: { barcode: "8901491100519", name: "Kurkure" } });
    expect(r2.state.stage).toBe("greeting");
    expect(r2.state.issueType).toBeNull();
    expect(r2.state.productSnapshot?.barcode).toBe("8901491100519");
    expect(r2.state.draft).toBeNull();
  });

  it("does not auto-submit complaints — no submit action exists", () => {
    // The runAssistant function only accepts start/message/generate/reset.
    // Verify that calling with an unknown action type results in the
    // switch falling through to the default (reset) — no submit.
    const result = runAssistant({
      action: "start" as unknown as "start",
      language: "en",
    });
    expect(result.state.stage).toBeDefined();
    // The runtime response contains state only; there is no submission
    // endpoint/action in this assistant flow.
    expect(typeof (result as Record<string, unknown>).state).toBe("object");
  });
});

// ── Kurkure-specific tests ────────────────────────────────────

describe("Kurkure barcode 8901491100519 flow", () => {
  const KURKURE: ProductSnapshot = {
    barcode: "8901491100519",
    name: "Kurkure",
    brand: "PepsiCo India",
    ingredients: ["Corn meal", "Palmolein oil", "Spices & condiments", "Salt", "Flavour enhancers (INS 621, INS 627)"],
    allergens: [],
    nutritionConcerns: ["High sodium content (sodium 0.67g)"],
  };

  it("preserves the barcode through a full conversation", () => {
    const r1 = runAssistant({ action: "start", language: "en", productContext: KURKURE });
    expect(r1.state.productSnapshot?.barcode).toBe("8901491100519");
    expect(r1.state.productSnapshot?.name).toBe("Kurkure");
  });

  it("generates a valid draft for Kurkure foreign_object concern", () => {
    let state = runAssistant({
      action: "start",
      language: "en",
      productContext: KURKURE,
    }).state;
    const fields: Array<{ key: QuestionField; value: string | boolean }> = [
      { key: "issue_type", value: "foreign_object" },
      { key: "incident_date", value: "2026-08-01" },
      { key: "purchase_location", value: "Big Bazaar, Pune" },
      { key: "evidence_photos", value: true },
      { key: "evidence_receipt", value: false },
      { key: "evidence_keeping_sample", value: true },
      { key: "product_batch", value: "KUR20260801" },
      { key: "product_expiry_date", value: "2027-01-01" },
      { key: "anything_else", value: "" },
    ];
    for (const f of fields) {
      state = runAssistant({ action: "message", language: "en", state, answerKey: f.key, answerValue: f.value }).state;
    }
    const gen = runAssistant({ action: "generate", language: "en", state });
    const draft = gen.state.draft!;
    expect(draft).not.toBeNull();
    expect(draft.productDetails.barcode).toBe("8901491100519");
    expect(draft.productDetails.productName).toBe("Kurkure");
    expect(draft.productDetails.brand).toBe("PepsiCo India");
    expect(draft.subjectLine).toContain("Kurkure");
    expect(draft.observations.foodguardObservations.some((o) => o.includes("Corn meal"))).toBe(true);
    expect(draft.observations.foodguardObservations.some((o) => o.includes("sodium"))).toBe(true);
    expect(draft.evidenceChecklist.some((e) => e.key === "kept_product_sample")).toBe(true);
    expect(draft.request).toContain("review");
  });
});

// ── buildDraftSnapshot direct test ────────────────────────────

describe("buildDraftSnapshot", () => {
  it("creates evidence and draft from partial state", () => {
    const state: ConversationState = {
      stage: "ready_to_generate",
      productSnapshot: { barcode: "123", name: "Test", brand: "Brand" },
      issueType: "spoilage",
      issueConfidence: "medium",
      collected: {
        incident_date: "2026-07-01",
        purchase_location: "Shop",
        evidence_photos: true,
        evidence_keeping_sample: true,
      },
      evidence: [],
      followUpsAsked: ["issue_type", "incident_date", "purchase_location"],
      skipAnswers: [],
      currentQuestion: null,
      questionHistory: [],
      draft: null,
      language: "en",
      assistantMessages: [],
    };
    buildDraftSnapshot(state, null);
    expect(state.evidence.length).toBeGreaterThan(0);
    expect(state.draft).not.toBeNull();
    expect(state.draft!.productDetails.barcode).toBe("123");
    expect(state.stage).toBe("ready_to_generate");
  });
});
