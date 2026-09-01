// Shared literal-string enums used by both Zod schemas and the runtime
// assistant flow. Mirrors src/types/food-safety-assistant.ts so that the
// schema validates against the same set the service uses.
//
// Keep here — not in src/types — because Zod needs the value-narrowed
// array constants at runtime.

export const ISSUE_TYPES = [
  "allergen_undeclared",
  "foreign_object",
  "spoilage",
  "mislabeling",
  "contamination",
  "packaging_damage",
  "unauthorized_additive",
  "fssai_concern",
  "other",
] as const;

export type IssueTypeLiteral = (typeof ISSUE_TYPES)[number];

export const QUESTION_FIELDS = [
  "issue_type",
  "incident_date",
  "purchase_location",
  "observed_symptoms",
  "product_batch",
  "product_manufacturing_date",
  "product_expiry_date",
  "consumer_age_group",
  "consumer_existing_conditions",
  "evidence_photos",
  "evidence_receipt",
  "evidence_keeping_sample",
  "anything_else",
] as const;

export type QuestionFieldLiteral = (typeof QUESTION_FIELDS)[number];
