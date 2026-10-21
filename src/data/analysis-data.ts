import type { ProductCategory } from "@/types/domain";
import type { FSSAIAnalysisResult } from "@/services/regulatory/fssai";
import type { LegalMetrologyResult } from "@/services/regulatory/legal-metrology";
import type { EnhancedAlternative } from "@/services/recommendation.service";
import type { AlternativeCharacteristicInfo } from "@/lib/alternative-characteristics";

export type AssessmentLevel = "low" | "moderate" | "high" | "insufficient";

export type PositivePoint = {
  text: string;
};

export type AttentionPoint = {
  name: string;
  /** Human-readable display name (e.g. "Saturated Fat" instead of "saturatedFat"). */
  displayName?: string;
  amount?: string;
  value?: number;
  unit?: string;
  basis?: string;
  reason: string;
  severity: AssessmentLevel;
  source?: string;
};

export type IngredientAnalysis = {
  name: string;
  function: string;
  assessment: AssessmentLevel;
  explanation: string;
  evidence: string;
  source?: string;
};

export type EvidenceSource = {
  sourceName: string;
  sourceType: string;
  evidenceCategory?: "PRODUCT_DATA" | "REGULATORY_REFERENCE" | "NUTRITION_GUIDANCE" | "SCIENTIFIC_REFERENCE";
  summary: string;
  url?: string;
};

export type AlternativeSuggestion = {
  title: string;
  description: string;
};

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

export type ProductAnalysisResult = {
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
  positivePoints: PositivePoint[];
  attentionPoints: AttentionPoint[];
  ingredients: IngredientAnalysis[];
  alternativeSuggestions: AlternativeSuggestion[];
  evidenceSources: EvidenceSource[];
  nutrition?: {
    calories: number | string;
    sugar: string;
    sodium: string;
    saturatedFat: string;
    protein: string;
    fibre: string;
    servingSize: string;
  };
  /** Four-component FoodGuard score breakdown. */
  foodguardScore?: FoodGuardScoreResult;
  regulatory?: FSSAIAnalysisResult | null;
  /** Normalized FSSAI regulatory compliance (HTTP-backed). */
  regulatoryCompliance?: import("@/types/domain").RegulatoryCompliance | null;
  legalMetrology?: LegalMetrologyResult | null;
  alternatives?: EnhancedAlternative[];
  /** Phase 5: characteristics derived from the scanned product's issues. */
  alternativeCharacteristics?: AlternativeCharacteristicInfo[];
  /** Phase 5: criteria metadata (validated vs unsupported characteristics). */
  alternativeCriteria?: {
    preferredCharacteristics: string[];
    unsupported: string[];
  };
};

