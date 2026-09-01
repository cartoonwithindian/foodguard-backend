/**
 * Structured Health Finding Model
 *
 * Every health finding must be traceable to verified product data.
 * The deterministic engine decides findings; the LLM only explains them.
 */

export type FindingCategory =
  | "saturated_fat"
  | "sodium"
  | "calories"
  | "sugar"
  | "carbohydrate"
  | "protein"
  | "fibre"
  | "trans_fat"
  | "total_fat"
  | "ingredient"
  | "processing"
  | "positive"
  | "other";

export type FindingSeverity = "low" | "moderate" | "high";

export type ClaimType = "fact" | "inference" | "recommendation";

export type Confidence = "high" | "medium" | "low";

export type NutritionBasis = "per_100g" | "per_100ml" | "per_serving" | "per_package";

export interface HealthFinding {
  finding_id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  metric: string;
  value: number | null;
  unit: string;
  basis: NutritionBasis;
  threshold: number | null;
  threshold_unit: string | null;
  evidence: string[];
  confidence: Confidence;
  claim_type: ClaimType;
  explanation: string;
  recommendation: string;
}

export interface HealthAnalysisResult {
  summary: string;
  findings: HealthFinding[];
  overall_guidance: string;
  confidence: number;
  missing_data: string[];
  verified_facts: string[];
}

export interface NutritionInput {
  calories?: number | null;
  totalFat?: number | null;
  saturatedFat?: number | null;
  transFat?: number | null;
  sodium?: number | null;
  salt?: number | null;
  sugars?: number | null;
  totalSugars?: number | null;
  addedSugars?: number | null;
  protein?: number | null;
  fiber?: number | null;
  dietaryFibre?: number | null;
  carbohydrates?: number | null;
  servingSize?: string | null;
  servingWeight?: number | null;
  packageWeight?: number | null;
}

export interface IngredientInput {
  name: string;
  function: string;
  assessment: string;
  severity: string;
}

export interface HealthAnalysisInput {
  product: {
    name: string;
    brand?: string | null;
    category: string;
  };
  nutrition: NutritionInput | null;
  ingredients: IngredientInput[];
  processingScore?: number | null;
  processingLevel?: number | null;
}
