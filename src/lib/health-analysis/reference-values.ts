/**
 * Centralized Reference Values
 *
 * WHO daily guidance, FSSAI reference values, and FoodGuard scoring thresholds.
 * These are SEPARATE concepts:
 * - REFERENCE GUIDANCE: WHO/FSSAI daily limits for context
 * - FOODGUARD THRESHOLDS: Our scoring/finding thresholds
 *
 * Do NOT scatter hard-coded numbers throughout prompts or analysis logic.
 */

export interface ReferenceThreshold {
  authority: string;
  value: number;
  unit: string;
  population: string;
  context: string;
  source_date?: string;
}

export interface FoodGuardThreshold {
  high: number;
  moderate: number;
  unit: string;
  basis: "per_100g" | "per_serving";
  description: string;
}

// ── WHO Daily Reference Intake (adults) ────────────────────────────────

export const WHO_DAILY: Record<string, ReferenceThreshold> = {
  sodium: {
    authority: "WHO",
    value: 2000,
    unit: "mg",
    population: "adults",
    context: "Daily upper limit",
    source_date: "2012",
  },
  saturatedFat: {
    authority: "WHO",
    value: 20,
    unit: "g",
    population: "adults",
    context: "Less than 10% of total energy intake (based on 2000 kcal diet)",
    source_date: "2023",
  },
  totalFat: {
    authority: "WHO",
    value: 65,
    unit: "g",
    population: "adults",
    context: "Less than 30% of total energy intake (based on 2000 kcal diet)",
    source_date: "2023",
  },
  sugars: {
    authority: "WHO",
    value: 50,
    unit: "g",
    population: "adults",
    context: "Less than 10% of total energy intake",
    source_date: "2015",
  },
  addedSugars: {
    authority: "WHO",
    value: 25,
    unit: "g",
    population: "adults",
    context: "Less than 5% of total energy intake (conditional recommendation)",
    source_date: "2015",
  },
  energy: {
    authority: "WHO",
    value: 2000,
    unit: "kcal",
    population: "adults",
    context: "Average daily energy requirement",
    source_date: "2004",
  },
  protein: {
    authority: "WHO/FAO",
    value: 50,
    unit: "g",
    population: "adults",
    context: "Minimum daily requirement (0.83 g/kg body weight)",
    source_date: "2007",
  },
  fibre: {
    authority: "WHO",
    value: 25,
    unit: "g",
    population: "adults",
    context: "Minimum daily intake for health benefits",
    source_date: "2003",
  },
};

// ── FoodGuard Finding Thresholds (per 100g basis) ─────────────────────
// These determine when FoodGuard flags a finding.

export const FOODGUARD_THRESHOLDS: Record<string, FoodGuardThreshold> = {
  sodium: {
    high: 600,
    moderate: 200,
    unit: "mg",
    basis: "per_100g",
    description: "Sodium content per 100g",
  },
  saturatedFat: {
    high: 5,
    moderate: 1.5,
    unit: "g",
    basis: "per_100g",
    description: "Saturated fat content per 100g",
  },
  totalFat: {
    high: 17.5,
    moderate: 8,
    unit: "g",
    basis: "per_100g",
    description: "Total fat content per 100g",
  },
  sugars: {
    high: 22.5,
    moderate: 5,
    unit: "g",
    basis: "per_100g",
    description: "Total sugar content per 100g",
  },
  addedSugars: {
    high: 22.5,
    moderate: 5,
    unit: "g",
    basis: "per_100g",
    description: "Added sugar content per 100g",
  },
  calories: {
    high: 400,
    moderate: 200,
    unit: "kcal",
    basis: "per_100g",
    description: "Energy density per 100g",
  },
  protein: {
    high: 12,
    moderate: 6,
    unit: "g",
    basis: "per_100g",
    description: "Protein content per 100g (higher is positive)",
  },
  fibre: {
    high: 6,
    moderate: 3,
    unit: "g",
    basis: "per_100g",
    description: "Dietary fibre per 100g (higher is positive)",
  },
};

// ── Processing Level Descriptions ──────────────────────────────────────

export const PROCESSING_LEVELS: Record<number, { label: string; description: string }> = {
  1: {
    label: "Minimally processed",
    description: "Whole foods with minimal processing (washing, peeling, grinding).",
  },
  2: {
    label: "Processed",
    description: "Simple加工 using methods like roasting, baking, or fermentation.",
  },
  3: {
    label: "Highly processed",
    description: "Substantial formulation with industrial ingredients and processing.",
  },
  4: {
    label: "Ultra-processed",
    description: "Industrial formulations with multiple functional additives and highly refined ingredients.",
  },
};

// ── Nutrient Display Labels ────────────────────────────────────────────

export const NUTRIENT_LABELS: Record<string, string> = {
  sodium: "Sodium",
  saturatedFat: "Saturated fat",
  totalFat: "Total fat",
  sugars: "Total sugar",
  totalSugars: "Total sugar",
  addedSugars: "Added sugar",
  calories: "Calories",
  protein: "Protein",
  fiber: "Dietary fibre",
  dietaryFibre: "Dietary fibre",
  transFat: "Trans fat",
  carbohydrates: "Carbohydrates",
  salt: "Salt",
};
