/**
 * FSSAI Regulatory Service
 * 
 * Provides access to the FSSAI regulatory knowledge base for Indian food safety analysis.
 * This service is used by the /api/analyze pipeline to add regulatory context.
 */

export { FSSAIAnalyzer } from "./analyzer";
export { AdditiveChecker } from "./additive-checker";
export {
  FSSAIAdditiveKnowledgeBase,
  getFSSAIAdditiveKnowledgeBase,
} from "./additive-knowledge-base";
export {
  ContaminantKnowledgeBase,
  getContaminantKnowledgeBase,
} from "./contaminant-knowledge-base";
export { LabellingChecker } from "./labelling-checker";
export { ClaimChecker } from "./claim-checker";
export { ContaminantChecker } from "./contaminant-checker";
export { PackagingChecker } from "./packaging-checker";
export { SpecialFoodChecker } from "./special-food-checker";
export { ProductStandardChecker } from "./product-standard-checker";

// Types
export type {
  FSSAIAnalysisResult,
  AdditiveCheckResult,
  AdditiveMatchType,
  ContaminantEvidenceStatus,
  LabellingCheckResult,
  ClaimCheckResult,
  ContaminantCheckResult,
  PackagingCheckResult,
  SpecialFoodCheckResult,
  ProductStandardCheckResult,
  RegulatorySource,
  RegulatoryCheckSummary,
} from "./types";