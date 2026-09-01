// ─────────────────────────────────────────────────────────────
// Domain types used across the backend.
// The `Frontend*` types mirror the shapes the existing FoodGaurd
// frontend renders (src/data/*.ts) so API responses stay compatible.
// ─────────────────────────────────────────────────────────────

import type { FSSAIAnalysisResult } from "@/services/regulatory/fssai";
import type { AlternativeCharacteristicInfo } from "@/lib/alternative-characteristics";

// ── Shared enums ─────────────────────────────────────────────
export type ProductCategory = "food" | "cosmetics" | "personal_care" | "household" | "other";
export type ConcernLevel = "high" | "moderate" | "low";
export type AssessmentLevel = "low" | "moderate" | "high" | "insufficient";
export type DataQualityLevel = "high" | "medium" | "low";

export type IngredientAssessmentLabel =
  | "beneficial"
  | "neutral"
  | "generally_accepted"
  | "noteworthy"
  | "potentially_concerning"
  | "allergen"
  | "dietary_conflict"
  | "insufficient_evidence";

export type RegulatoryStatus = "permitted" | "restricted" | "banned" | "under_review" | "unknown";

export type Severity = "low" | "moderate" | "high";

export type SourceCategory =
  | "government"
  | "regulatory"
  | "scientific"
  | "product_information"
  | "food_database";

export type SourceAuthority = "primary" | "scientific" | "supporting";

// ── Ingredient knowledge base ────────────────────────────────
export type IngredientRecord = {
  id: string; // slug, e.g. "monosodium-glutamate"
  canonicalName: string;
  insCode?: string;
  eNumber?: string;
  category: string;
  description: string;
  function: string;
  assessment: IngredientAssessmentLabel;
  allergenStatus?: string;
  dietaryStatus: string[];
  regulatoryStatus: RegulatoryStatus;
  regulatoryNotes?: string;
  evidenceLevel: "high" | "medium" | "low" | "insufficient";
  isAdditive: boolean;
  hindiName?: string;
  aliases: Array<{ alias: string; type: string }>;
};

// ── Normalization ────────────────────────────────────────────
export type NormalizedIngredient = {
  rawName: string;
  matched: boolean;
  canonicalName?: string;
  identifier?: string; // e.g. "INS 621" or "E621"
  aliases?: string[];
  function?: string;
  confidence: number; // 0..1, evidence-derived, not random
  spellingCorrected?: boolean;
};

// ── Allergens ────────────────────────────────────────────────
export type AllergenDeclarationType = "contains" | "may_contain" | "processed_in_facility";

export type AllergenMatch = {
  allergen: string;
  type: AllergenDeclarationType;
  confidence: number;
  evidence: string; // the raw text fragment that triggered the match
};

// ── Evidence ─────────────────────────────────────────────────
export type EvidenceRef = {
  id: string;
  title: string;
  organization: string;
  url?: string;
  sourceType: string; // government | regulator | scientific_paper | international_standard | academic_database | manufacturer | secondary_source
  publicationDate?: string;
  evidenceLevel: "high" | "medium" | "low";
  summary: string;
};

// ── Nutrition ────────────────────────────────────────────────
export type NutrientValue = {
  /** Normalized value used by thresholds and display. */
  value: number;
  /** Normalized display unit. Kept for compatibility with existing consumers. */
  unit: string;
  confidence: number;
  /** Numeric value exactly as received from the provider. */
  sourceValue?: number;
  /** Unit as received from the product/provider or its documented field convention. */
  sourceUnit?: string;
  /** Stable value used by thresholds and the UI. */
  normalizedValue?: number;
  /** Stable unit used by thresholds and the UI. */
  normalizedUnit?: string;
  /** Basis inherited from the containing nutrition record. */
  basis?: NutritionFacts["basis"];
  /** Present when source and normalized units differ. */
  conversion?: {
    sourceUnit: string;
    normalizedUnit: string;
    factor: number;
  };
};

export type NutritionSourceMetadata = {
  source: string;
  database: string;
};

export type NutritionFacts = {
  servingSize?: string;
  servingsPerContainer?: string;
  basis: "PER_100G" | "PER_SERVING";
  nutrients: Record<string, NutrientValue>; // calories | energyKj | protein | carbohydrates | sugars | addedSugars | totalFat | saturatedFat | transFat | fiber | sodium | salt
};

// ── Ingredient analysis ──────────────────────────────────────
export type IngredientAnalysisItem = {
  rawName: string;
  name: string; // canonical display name
  identifier?: string;
  function: string;
  category?: string;
  assessment: IngredientAssessmentLabel;
  severity: Severity;
  explanation: string;
  evidence: EvidenceRef[];
  confidence: number;
  flags: string[]; // e.g. "processing_indicator", "allergen"
  allergens: AllergenMatch[];
  matched: boolean;
  /**
   * Auxiliary USDA-derived ingredient intelligence (NEVER regulatory).
   * Present only when the surface form was observed in the intelligence corpus.
   */
  intelligence?: IngredientIntelligenceInfo;
};

/** Provenance-tagged intelligence from the USDA-derived corpus (regulatory:false). */
export type IngredientIntelligenceInfo = {
  canonicalName: string;
  matchType: "canonical" | "alias";
  fssaiRegistryMatch?: string | null;
  insNumber?: string | null;
  classification: {
    category: string | null; // FSSAI registry category when traceable
    confidence: number;
  };
  intelligenceType: string | null;
  evidence: { productOccurrences: number; datasetVersion: string };
  source: {
    name: string;
    underlyingSource: string;
    type: "ingredient_intelligence";
    regulatory: false;
  };
  /** Always stated explicitly for explainability. */
  regulatoryStatus: "INSUFFICIENT_DATA";
};

// ── Scoring ──────────────────────────────────────────────────
export type ScoreFactor = {
  factor: string;
  impact: number; // signed points applied to the base score
  explanation: string;
  category: "ingredients" | "nutrition" | "regulatory" | "data_quality";
};

// ── Product ──────────────────────────────────────────────────
export type ProductInfo = {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  category: ProductCategory;
  country: string | null;
  servingSize: string | null;
  imageUrl: string | null;
  ingredientsRaw: string;
  ingredientsNormalized: string[];
  source: string;
  sourceUrl: string | null;
  verified: boolean;
  productDataConfidence: number;
  isDemo: boolean;
};

// ── Personalization ──────────────────────────────────────────
export type UserPreferencesInput = {
  vegetarian?: boolean;
  vegan?: boolean;
  allergies?: string[];
  dietaryRestrictions?: string[];
  avoidIngredients?: string[];
  preferredIngredients?: string[];
  healthGoals?: string[];
  sensitivityPreferences?: string[];
};

export type PersonalizedFlag = {
  type:
    | "preference_conflict"
    | "dietary_conflict"
    | "allergen_alert"
    | "health_goal_conflict"
    | "positive_match";
  ingredient?: string;
  preference: string;
  severity: Severity;
  message: string;
};

export type PersonalizedAnalysis = {
  flags: PersonalizedFlag[];
  compatible: boolean;
  summary: string;
};

// ── Alternatives ─────────────────────────────────────────────
export type AlternativeReason = {
  factor: "similarity" | "lower_sodium" | "lower_saturated_fat" | "lower_sugar" | "fewer_additives" | "better_nutrition" | "lower_concern" | "better_ingredients";
  detail: string;
};

export type Alternative = {
  product: ProductInfo;
  similarity: number; // 0..1
  improvement: Record<string, string>; // e.g. { sodium: "-32%", saturatedFat: "-18%" }
  recommendationScore: number; // 0..100 — objective improvement, NOT commercial
  reasons: AlternativeReason[];
  whyBetter: string;
  /** "better_match" = relevant + meaningfully better; "similar" = relevant but not clearly better. */
  recommendationType?: "better_match" | "similar";
};

// ── History ──────────────────────────────────────────────────
export type HistoryEntryInfo = {
  id: string;
  userId: string;
  productId: string | null;
  scannedAt: string;
  assessmentSnapshot: FrontendAnalysisResult;
  source: string;
};

// ── Unknown ingredients ──────────────────────────────────────
export type UnknownIngredientInfo = {
  id: string;
  rawName: string;
  normalizedAttempt: string | null;
  confidence: number;
  status: "pending" | "resolved" | "dismissed";
  context: string | null;
  createdAt: string;
};

// ── Frontend contract shapes (must match src/data/*.ts) ──────
export type FrontendIngredientConcern = {
  name: string;
  level: ConcernLevel;
  description: string;
};

export type FrontendProductAnalysis = {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  barcode: string;
  safetyScore: number;
  ingredients: FrontendIngredientConcern[];
  warnings: string[];
};

export type FrontendIngredientAnalysis = {
  name: string;
  function: string;
  assessment: AssessmentLevel;
  explanation: string;
  evidence: string;
  source?: string;
};

export type FrontendPositivePoint = { text: string };
export type FrontendAttentionPoint = {
  name: string;
  /** Human-readable display name (e.g. "Saturated Fat" instead of "saturatedFat"). */
  displayName?: string;
  amount?: string;
  /** Numeric value of the underlying nutrient, when available. */
  value?: number;
  /** Unit of the numeric value (mg, g, %). */
  unit?: string;
  /** Basis of the value (PER_100G, PER_SERVING, PER_100ML). */
  basis?: string;
  reason: string;
  severity: AssessmentLevel;
  /** Evidence basis: "Product nutrition data" or an ingredient evidence source. */
  source?: string;
};

export type FrontendEvidenceSource = {
  sourceName: string;
  sourceType: string;
  evidenceCategory?: "PRODUCT_DATA" | "REGULATORY_REFERENCE" | "NUTRITION_GUIDANCE" | "SCIENTIFIC_REFERENCE";
  summary: string;
  url?: string;
};

export type FrontendAlternativeSuggestion = {
  title: string;
  description: string;
};

export type FrontendNutritionSummary = {
  calories: number | string;
  sugar: string;
  sodium: string;
  saturatedFat: string;
  totalFat?: string;
  salt?: string;
  protein: string;
  fibre: string;
  servingSize: string;
};

export type FrontendNutritionFinding = {
  nutrient: string;
  actualValue: number;
  unit: string;
  basis: string;
  threshold: number;
  severity: Severity;
  reason: string;
  source: string;
};

export type FrontendScoreBreakdown = {
  factor: string;
  impact: number;
  explanation: string;
  category: "ingredients" | "nutrition" | "regulatory" | "data_quality";
};

/** FoodGuard four-component health score (0.0–5.0 scale). */
export type FoodGuardScoreComponent = {
  score: number;
  weight: number;
  status: "available" | "derived" | "insufficient";
};

export type FoodGuardScoreResult = {
  final_score: number;
  rating: string;
  confidence: number;
  components: {
    nutrient: FoodGuardScoreComponent;
    ingredient_profile: FoodGuardScoreComponent;
    ingredient_concern: FoodGuardScoreComponent;
    processing: FoodGuardScoreComponent & { level: number };
  };
  positive_factors: string[];
  negative_factors: string[];
  explanation: string;
  missing_data: string[];
  debug?: {
    nutrient_contribution: number;
    ingredient_profile_contribution: number;
    ingredient_concern_contribution: number;
    processing_contribution: number;
    raw_final_score: number;
    display_score: number;
  };
};

// ── FSSAI Regulatory Compliance (normalized, HTTP-backed) ────────────────
// These come from the standalone FSSAI Regulatory API, never from a
// hard-coded TS rule table. The overall status uses the FSSAI service's own
// statuses. `SERVICE_UNAVAILABLE` is a FoodGuard-internal state indicating
// the FSSAI API could not be reached — the analysis continued without it and
// reported no PASS, rather than crashing.

export type FssaiRegulatoryStatus =
  | "PASS"
  | "EXCEEDS_LIMIT"
  | "BELOW_MINIMUM"
  | "NO_APPLICABLE_LIMIT"
  | "REVIEW_REQUIRED"
  | "NO_APPLICABLE_RULE"
  | "CATEGORY_REQUIRED"
  | "LIMIT_LOOKUP"
  | "INACTIVE_RULE"
  | "NON_NUMERIC_LIMIT"
  | "UNIT_MISMATCH"
  | "SERVICE_UNAVAILABLE";

export type RegulatoryEvidence = {
  ruleId: string;
  regulation?: string | null;
  sourceDocument?: string | null;
  sourceUrl?: string | null;
  section?: string | null;
  table?: string | null;
  page?: string | null;
  sourceText?: string | null;
  confidence?: string | null;
};

export type RegulatoryCheckResult = {
  name: string;
  type: "additive" | "contaminant";
  status: FssaiRegulatoryStatus;
  detectedAmount?: number | null;
  detectedUnit?: string | null;
  allowedAmount?: number | null;
  allowedUnit?: string | null;
  ruleId?: string | null;
  regulation?: string | null;
  foodCategory?: string | null;
  message?: string;
  evidenceAvailable: boolean;
};

export type RegulatoryViolation = {
  name: string;
  type: "additive" | "contaminant";
  ruleId?: string | null;
  regulation?: string | null;
  detail: string;
};

export type RegulatoryCompliance = {
  /** Source of this block — always "fssai-api" (never a local hard-coded engine). */
  source: "fssai-api";
  overallStatus: FssaiRegulatoryStatus;
  serviceAvailable: boolean;
  additives: RegulatoryCheckResult[];
  contaminants: RegulatoryCheckResult[];
  violations: RegulatoryViolation[];
  evidence: RegulatoryEvidence[];
  message?: string;
  checkedAt: string;
};

export type FrontendAnalysisResult = {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  barcode: string;
  scanDate: string;
  imageUrl?: string;
  assessment: AssessmentLevel;
  assessmentDescription: string;
  /** Health score 0.0–5.0 (canonical FoodGuard score). */
  score: number;
  positivePoints: FrontendPositivePoint[];
  attentionPoints: FrontendAttentionPoint[];
  ingredients: FrontendIngredientAnalysis[];
  alternativeSuggestions: FrontendAlternativeSuggestion[];
  evidenceSources: FrontendEvidenceSource[];
  nutrition?: FrontendNutritionSummary;
  nutritionFindings?: FrontendNutritionFinding[];
  ingredientFindings?: FrontendIngredientAnalysis[];
  /** Four-component FoodGuard score breakdown. */
  foodguardScore?: FoodGuardScoreResult;
  scoreBreakdown?: FrontendScoreBreakdown[];
  scoreDetails?: {
    value: number;
    label: string;
    breakdown: FrontendScoreBreakdown[];
  };
  confidence?: number;
  needsReview?: boolean;
  regulatory?: FSSAIAnalysisResult | null;
  /** Normalized FSSAI regulatory compliance (HTTP-backed, separate from health score). */
  regulatoryCompliance?: RegulatoryCompliance | null;
  legalMetrology?: import("@/services/regulatory/legal-metrology").LegalMetrologyResult | null;
  alternatives?: Alternative[];
  /** Phase 5: characteristics derived from the scanned product's issues. */
  alternativeCharacteristics?: AlternativeCharacteristicInfo[];
  /** Phase 5: criteria metadata (which characteristics were validated vs not). */
  alternativeCriteria?: {
    preferredCharacteristics: string[];
    unsupported: string[];
  };
};

// ── Analyze endpoint extended payload ────────────────────────
export type AnalyzeMeta = {
  confidence: number;
  warnings: string[];
  needsReview: boolean;
  product: ProductInfo | null;
  productSource: string | null;
  ingredients: IngredientAnalysisItem[];
  unknownIngredients: UnknownIngredientInfo[];
  allergens: AllergenMatch[];
  nutrition: NutritionFacts | null;
  assessmentFactors: ScoreFactor[];
  personalization: PersonalizedAnalysis | null;
  evidence: EvidenceRef[];
  alternatives: Alternative[];
  alternativeCharacteristics?: AlternativeCharacteristicInfo[];
  /** Four-component health score result from the scoring engine. */
  healthScore?: import("@/lib/scoring/engine").FoodGuardHealthScore;
  alternativeCriteria?: {
    preferredCharacteristics: string[];
    unsupported: string[];
  };
  rawText?: string;
  ocrConfidence?: number;
  regulatory?: {
    india?: {
      fssai?: FSSAIAnalysisResult | null;
    };
  };
  /** Normalized FSSAI regulatory compliance (HTTP-backed). */
  regulatoryCompliance?: RegulatoryCompliance;
  legalMetrology?: import("@/services/regulatory/legal-metrology").LegalMetrologyResult;
  webResearch?: {
    performed: boolean;
    sources: WebResearchEvidence[];
    queries: string[];
    totalResults: number;
  };
  aiAnalysis?: {
    summary: string;
    positivePoints: string[];
    concerns: string[];
    ingredientExplanations: Array<{
      name: string;
      explanation: string;
      category: string;
    }>;
    nutritionExplanation: string;
    recommendation: string;
    confidence: number;
  };
};

// ── Web Research Types ──────────────────────────────────────
export type WebResearchEvidence = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  sourceType: string;
  authority: "primary" | "scientific" | "supporting";
  relevance: number;
  retrievedAt: string;
};
