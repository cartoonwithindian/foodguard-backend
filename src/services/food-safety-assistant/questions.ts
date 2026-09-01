// Canonical question bank for the Food Safety Assistant.
// Pure data — order matters because the engine asks one question at a time
// and skips any field that's already been answered or skipped.
//
// IMPORTANT: wording here is the canonical, vendor-neutral wording. The
// optional LLM pass may rewrite it into plain language, but it cannot add
// new fields, change the schema or hide a required question.

import type { DynamicQuestion, IssueType, QuestionField } from "@/types/food-safety-assistant";

const COMMON_FIRST_QUESTIONS: DynamicQuestion[] = [
  {
    field: "incident_date",
    type: "date",
    prompt: "When did you notice the issue?",
    helpText: "An approximate date (day, month, year) is fine if exact",
    required: true,
  },
  {
    field: "purchase_location",
    type: "text",
    prompt: "Where did you buy this product?",
    helpText: "Store name and city. Avoid sharing your full address.",
    required: true,
  },
];

// Per-issue-type evidence questions that are required for a complete draft.
const ISSUE_EVIDENCE: Record<IssueType, QuestionField[]> = {
  allergen_undeclared: ["evidence_photos", "evidence_receipt", "observed_symptoms"],
  foreign_object: ["evidence_photos", "evidence_receipt", "evidence_keeping_sample"],
  spoilage: ["evidence_photos", "evidence_keeping_sample"],
  mislabeling: ["evidence_photos", "evidence_receipt"],
  contamination: ["evidence_photos", "evidence_keeping_sample"],
  packaging_damage: ["evidence_photos", "evidence_receipt"],
  unauthorized_additive: ["evidence_photos", "evidence_receipt"],
  fssai_concern: ["evidence_photos"],
  other: ["evidence_photos"],
};

// Issue-specific extras: batch/lot, manufacturing date, expiry date,
// consumer age group, existing conditions are only asked when relevant.
const ISSUE_FEATURES: Record<IssueType, QuestionField[]> = {
  allergen_undeclared: ["consumer_age_group", "consumer_existing_conditions", "observed_symptoms"],
  foreign_object: ["product_batch", "product_expiry_date"],
  spoilage: ["product_manufacturing_date", "product_expiry_date"],
  mislabeling: ["product_batch"],
  contamination: ["product_batch", "product_manufacturing_date", "product_expiry_date"],
  packaging_damage: ["product_batch", "product_expiry_date"],
  unauthorized_additive: [],
  fssai_concern: [],
  other: [],
};

// Question rendering per-field. The same field gets the same prompt across
// every issue type unless the issue-specific code below overrides it.
const QUESTION_BY_FIELD: Record<QuestionField, DynamicQuestion> = {
  issue_type: {
    field: "issue_type",
    type: "choice",
    prompt: "Which best describes the issue?",
    helpText: "Pick the option that matches what you observed",
    required: true,
  },
  incident_date: COMMON_FIRST_QUESTIONS[0]!,
  purchase_location: COMMON_FIRST_QUESTIONS[1]!,
  observed_symptoms: {
    field: "observed_symptoms",
    type: "multichoice",
    prompt: "Did anyone experience symptoms?",
    choices: [
      { value: "none", label: "No symptoms" },
      { value: "mild", label: "Mild discomfort" },
      { value: "moderate", label: "Moderate reaction" },
      { value: "severe", label: "Severe reaction" },
      { value: "unsure", label: "Not sure" },
    ],
    helpText: "Avoid sharing medical details — symptom severity is enough",
    sensitive: false,
  },
  product_batch: {
    field: "product_batch",
    type: "text",
    prompt: "Batch or lot number (if available)",
    helpText: "Usually printed near the manufacturing date with 'Batch' or 'Lot'",
  },
  product_manufacturing_date: {
    field: "product_manufacturing_date",
    type: "date",
    prompt: "Manufacturing date (if visible on the package)",
  },
  product_expiry_date: {
    field: "product_expiry_date",
    type: "date",
    prompt: "Expiry / best-before date (if visible on the package)",
  },
  consumer_age_group: {
    field: "consumer_age_group",
    type: "choice",
    prompt: "Who consumed the product?",
    choices: [
      { value: "adult", label: "Adult" },
      { value: "child", label: "Child" },
      { value: "elderly", label: "Elderly" },
      { value: "mix", label: "Multiple people" },
      { value: "na", label: "Prefers not to say" },
    ],
  },
  consumer_existing_conditions: {
    field: "consumer_existing_conditions",
    type: "yesno",
    prompt: "Did the consumer have any relevant known allergies or conditions?",
    helpText: "Yes / No / Not sure — keep this high level, the assistant won't ask for medical details",
  },
  evidence_photos: {
    field: "evidence_photos",
    type: "yesno",
    prompt: "Do you have photos of the issue?",
    helpText: "Photos help support the complaint. No need to upload now.",
  },
  evidence_receipt: {
    field: "evidence_receipt",
    type: "yesno",
    prompt: "Do you have a purchase receipt or order screenshot?",
  },
  evidence_keeping_sample: {
    field: "evidence_keeping_sample",
    type: "yesno",
    prompt: "Have you kept the product (or a portion of it) safely for later review?",
    helpText: "Seal it in a clean container and refrigerate where possible",
  },
  anything_else: {
    field: "anything_else",
    type: "text",
    prompt: "Is there anything else you want the complaint to mention?",
    helpText: "Optional. Skipping is fine.",
    required: false,
  },
};

export function nextQuestion(
  state: { collected: Record<string, unknown>; followUpsAsked: QuestionField[]; skipAnswers: QuestionField[]; issueType: IssueType | null },
): DynamicQuestion | null {
  if (!state.issueType) return null;
  const order: QuestionField[] = buildOrderForIssue(state.issueType);
  for (const field of order) {
    if (state.followUpsAsked.includes(field)) continue;
    if (state.skipAnswers.includes(field)) continue;
    if (hasAnswer(state.collected, field)) continue;
    return QUESTION_BY_FIELD[field];
  }
  return null;
}

export function buildOrderForIssue(issue: IssueType): QuestionField[] {
  const result: QuestionField[] = ["issue_type", "incident_date", "purchase_location"];
  for (const f of ISSUE_EVIDENCE[issue] ?? []) {
    if (!result.includes(f)) result.push(f);
  }
  for (const f of ISSUE_FEATURES[issue] ?? []) {
    if (!result.includes(f)) result.push(f);
  }
  if (!result.includes("anything_else")) result.push("anything_else");
  return result;
}

function hasAnswer(collected: Record<string, unknown>, field: QuestionField): boolean {
  const v = collected[field];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "boolean") return true;
  return false;
}

export function listAllQuestions(issue: IssueType): DynamicQuestion[] {
  return buildOrderForIssue(issue).map((f) => QUESTION_BY_FIELD[f]);
}

export function lookupQuestion(field: QuestionField): DynamicQuestion {
  return QUESTION_BY_FIELD[field];
}
