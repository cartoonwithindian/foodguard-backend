export {
  analyze,
  validate,
  checkHealth,
  getVersion,
  isServiceAvailable,
  resetAvailabilityCache,
  LegalMetrologyApiError,
} from "./client";
export type {
  AnalyzeOptions,
  ValidateOptions,
} from "./client";
export type {
  LegalMetrologyResult,
  LegalMetrologyHealth,
  LegalMetrologyVersion,
  ComplianceStatus,
  ComplianceCheck,
  Violation,
  ReviewItem,
  EvidenceItem,
  ProductSummary,
  ExtractionMeta,
  SourceReference,
  FieldExtraction,
  FieldStatus,
} from "./types";
