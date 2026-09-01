/**
 * FSSAI Regulatory Service Types
 */

// Source reference for traceability
export interface RegulatorySource {
  documentId?: string;
  documentType?: string;
  regulation?: string;
  chapter?: string;
  section?: string;
  regulationNumber?: string;
  table?: string;
  page?: string;
  paragraph?: string;
  notificationNumber?: string;
  notificationDate?: string;
}

// How an additive was matched to regulatory data
// (KB = the extracted 556-record FSSAI additive knowledge base;
// lookupByINS always normalizes the number before matching)
export type AdditiveMatchType =
  | "INS_EXACT" // KB match by (normalized) INS number
  | "NAME_EXACT" // KB match by normalized additive name
  | "INGREDIENT_STORE" // curated ingredient knowledge base (bundled seed)
  | "HARDCODED_TABLE"; // curated fallback table

// User-facing verdict for an additive check. Never stronger than the
// available evidence:
//  PASS              – a category-specific FSSAI permission rule confirms use
//  REVIEW            – a real, product-relevant restriction/issue was found
//  INSUFFICIENT_DATA – the additive was identified but category/use could not
//                      be verified against a category-specific FSSAI rule
//  NO_DATA           – no FSSAI reference for this additive at all
export type AdditiveUserStatus = "PASS" | "REVIEW" | "INSUFFICIENT_DATA" | "NO_DATA";

// Additive check result
export interface AdditiveCheckResult {
  additiveName: string;
  insNumber?: string;
  status: "PERMITTED" | "PERMITTED_WITH_CONDITIONS" | "RESTRICTED" | "NOT_PERMITTED" | "NOT_SPECIFIED" | "UNCLEAR";
  maximumLevel?: string;
  unit?: string;
  conditions?: string;
  foodCategory?: string;
  /** Foods/foods-groups where the additive is not allowed (explicit source). */
  restrictions?: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  sourceReferences: RegulatorySource[];
  // Knowledge-base traceability (added with the 556-additive KB integration)
  matchType?: AdditiveMatchType;
  needsReview?: boolean;
  /** Set when the additive was found but no category permission data exists. */
  permissionStatus?: "PERMISSION_REQUIRES_CATEGORY_DATA";
  /** Raw KB source (document/section/table) for source traceability. */
  source?: { document?: string; section?: string; table?: string };
  /** User-facing verdict derived from status + matchType (see AdditiveUserStatus). */
  userStatus?: AdditiveUserStatus;
  /** Plain-language reason for the userStatus verdict. */
  explanation?: string;
}

// Labelling check result
export interface LabellingCheckElement {
  element: string;
  status: "FOUND" | "NOT_FOUND" | "UNCLEAR" | "NOT_APPLICABLE";
  ruleId?: string;
  requirement?: string;
  mandatory: boolean;
  sourceReferences: RegulatorySource[];
}

export interface LabellingCheckResult {
  overallStatus: "PASS" | "PARTIAL" | "FAIL" | "INSUFFICIENT_DATA";
  checks: LabellingCheckElement[];
  sourceReferences: RegulatorySource[];
  /** Plain-language reason for the overallStatus. */
  reason?: string;
}

// Claim check result
export interface ClaimCheckResult {
  claim: string;
  status: "SUPPORTED" | "NOT_SUPPORTED" | "REQUIRES_REVIEW" | "PROHIBITED" | "INSUFFICIENT_DATA";
  conditions: string[];
  thresholds: string[];
  sourceReferences: RegulatorySource[];
}

// What kind of contaminant data backs this result. A barcode/OCR scan can only
// ever produce reference limits — never a claim that the product is contaminated.
export type ContaminantEvidenceStatus =
  | "NO_DATA" // no reference data available for this product/substance
  | "REFERENCE_LIMIT_AVAILABLE" // FSSAI reference threshold (no lab result)
  | "PRODUCT_TEST_RESULT_AVAILABLE"; // actual laboratory test result for the product

// Contaminant check result
export interface ContaminantCheckResult {
  substance: string;
  substanceType: string;
  maximumLimit?: string;
  unit?: string;
  foodCategory?: string;
  applicableConditions?: string;
  sourceReferences: RegulatorySource[];
  // Evidence semantics (added with the contaminant extraction improvement)
  evidenceStatus?: ContaminantEvidenceStatus;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  needsHumanReview?: boolean;
  note?: string;
  /** Measured value from an actual laboratory result (never present for scans). */
  measuredValue?: string;
}

// Packaging check result
export interface PackagingCheckResult {
  requirement: string;
  details?: string;
  mandatory: boolean;
  foodCategory?: string;
  sourceReferences: RegulatorySource[];
}

// Special food check result
export interface SpecialFoodCheckResult {
  category: string;
  subcategory?: string;
  requirement: string;
  conditions?: string;
  exceptions: string[];
  sourceReferences: RegulatorySource[];
}

// Product standard check result
export interface ProductStandardCheckResult {
  productName: string;
  sectionNumber?: string;
  standardDefinition?: string;
  compositionRequirements?: unknown[];
  qualityParameters?: unknown[];
  identityRequirements?: string[];
  permittedIngredients?: unknown[];
  permittedAdditives?: unknown[];
  maximumLimits?: unknown[];
  sourceReferences: RegulatorySource[];
}

export interface RegulatoryCheckSummary {
  status: "PASS" | "NEEDS_REVIEW" | "NO_DATA" | "REFERENCE_DATA_AVAILABLE" | "INSUFFICIENT_DATA";
  checksPerformed: number;
  findings: Array<{ type: string; explanation: string; sourceReferences: RegulatorySource[] }>;
  evidence: RegulatorySource[];
  /** Deduplicated source references behind this check (actual FSSAI references). */
  references?: RegulatorySource[];
  /** Plain-language reason for the status. */
  reason?: string;
  referenceCount: number;
}

// Main FSSAI analysis result
export interface FSSAIAnalysisResult {
  overallStatus: "REVIEW" | "NEEDS_REVIEW" | "INSUFFICIENT_DATA" | "NOT_APPLICABLE";
  regulatoryChecks: {
    additives: string;
    labelling: string;
    claims: string;
    contaminants: string;
    productStandards: string;
  };
  /** Structured semantics: referenceCount is never a violation count. */
  regulatoryCheckDetails?: {
    additives: RegulatoryCheckSummary;
    labelling: RegulatoryCheckSummary;
    claims: RegulatoryCheckSummary;
    contaminants: RegulatoryCheckSummary;
    productStandards: RegulatoryCheckSummary;
  };
  disclaimer: string;
  additives: AdditiveCheckResult[];
  productStandards: ProductStandardCheckResult[];
  contaminants: ContaminantCheckResult[];
  labelling: LabellingCheckResult;
  claims: ClaimCheckResult[];
  packaging: PackagingCheckResult[];
  specialFoodRules: SpecialFoodCheckResult[];
  sources: RegulatorySource[];
  confidence: number;
  warnings: string[];
  needsReview: boolean;
  /**
   * Whether ingredient data was available for additive checking.
   * When false, additiveCount=0 means "no data to check" not "no additives."
   * This distinction is critical — 0 additives with data available means the
   * product likely has no additives; 0 additives with no data means unknown.
   */
  additiveDataAvailable: boolean;
  /**
   * Whether ingredient data was available for labelling checks.
   * When false, labelling results are based on reference rules only.
   */
  labellingDataAvailable: boolean;
}