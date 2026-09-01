export { computeFoodGuardHealthScore, type FoodGuardHealthScore } from "./engine";
export { getScoringRules, reloadScoringRules, type ScoringRules } from "./config";
export { scoreNutrients, type NutrientScoringResult, type NutrientFactor } from "./components/nutrient-scorer";
export { scoreIngredientProfile, type IngredientProfileResult, type IngredientProfileFactor } from "./components/ingredient-profile-scorer";
export { scoreIngredientConcerns, type IngredientConcernResult, type DetectedConcern } from "./components/ingredient-concern-scorer";
export { scoreProcessing, type ProcessingAnalysisResult } from "./components/processing-scorer";
export { INGREDIENT_CONCERNS_DB, lookupIngredientConcern, type IngredientConcernEntry } from "./ingredients-evidence-db";
