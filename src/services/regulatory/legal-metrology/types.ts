/**
 * Legal Metrology API types.
 *
 * These match the JSON response schema from the Legal Metrology FastAPI service
 * at /api/v1/legal-metrology/*.
 */

// ── Extraction fields ──────────────────────────────────────────────────────

export type FieldStatus = "FOUND" | "NOT_FOUND" | "UNCERTAIN";

export interface FieldExtraction {
  field: string;
  raw_text: string | null;
  normalized_value: unknown;
  unit: string | null;
  confidence: number;
  image_id: string | null;
  bbox: [number, number, number, number] | null;
  status: FieldStatus;
}

// ── Evidence ───────────────────────────────────────────────────────────────

export interface EvidenceItem {
  rule_id: string;
  rule_number: string;
  source_id: string;
  source_clause: string;
  image_id: string | null;
  bbox: [number, number, number, number] | null;
  detected_text: string | null;
  normalized_value: unknown;
  confidence: number;
  result: "PASS" | "FAIL" | "REVIEW" | "NOT_APPLICABLE" | "SKIPPED";
  note: string | null;
}

// ── Checks ─────────────────────────────────────────────────────────────────

export interface ComplianceCheck {
  rule_id: string;
  rule: string;
  requirement: string;
  result: "PASS" | "FAIL" | "REVIEW" | "NOT_APPLICABLE" | "SKIPPED";
  evidence: EvidenceItem[];
  note: string | null;
}

// ── Violations ─────────────────────────────────────────────────────────────

export interface Violation {
  violation_id: string;
  taxonomy_id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  rule: string;
  rule_id: string;
  message: string;
  evidence: EvidenceItem | null;
  source_id: string;
}

// ── Review items ───────────────────────────────────────────────────────────

export interface ReviewItem {
  code: string;
  message: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  evidence: EvidenceItem | null;
}

// ── Product summary ────────────────────────────────────────────────────────

export interface ProductSummary {
  product_name: string | null;
  net_quantity: { value: number; unit: string } | null;
  mrp: { value: number; currency: string } | null;
}

// ── Extraction metadata ────────────────────────────────────────────────────

export interface ExtractionMeta {
  provider: string;
  model: string | null;
  confidence: number;
  fields_detected: number;
  fields_uncertain: number;
}

// ── Source reference ───────────────────────────────────────────────────────

export interface SourceReference {
  source_id: string;
  title: string | null;
  url: string | null;
  authority: string | null;
  document_type: string | null;
  relevance: string | null;
  status: string | null;
}

// ── Full compliance result ─────────────────────────────────────────────────

export type ComplianceStatus =
  | "COMPLIANT"
  | "NON_COMPLIANT"
  | "REVIEW_REQUIRED"
  | "NOT_APPLICABLE";

export interface LegalMetrologyResult {
  analysis_id: string;
  request_id: string;
  status: ComplianceStatus;
  as_of_date: string | null;
  product: ProductSummary;
  extraction: ExtractionMeta;
  declarations: FieldExtraction[];
  applicability: ComplianceCheck[];
  checks: ComplianceCheck[];
  rule_results: ComplianceCheck[];
  violations: Violation[];
  review_items: ReviewItem[];
  review_required: boolean;
  review_reasons: Array<{ code: string; message: string; severity: string }>;
  evidence: EvidenceItem[];
  sources: SourceReference[];
  dataset: { version: string; jurisdiction: string };
  disclaimer: string;
}

// ── API error ──────────────────────────────────────────────────────────────

export interface LegalMetrologyError {
  error: {
    code: string;
    message: string;
  };
}

// ── Version info ───────────────────────────────────────────────────────────

export interface LegalMetrologyVersion {
  dataset_version: string;
  api_version: string;
  rule_count: number;
  source_count: number;
  violation_count: number;
  declaration_count: number;
  numerical_rule_count: number;
  last_validation_status: string;
  validation_errors: string[];
  jurisdiction: string;
}

// ── Health check ───────────────────────────────────────────────────────────

export interface LegalMetrologyHealth {
  status: "ok" | "degraded";
  dataset_loaded: boolean;
  provider_configured: boolean;
  store_images: boolean;
}
