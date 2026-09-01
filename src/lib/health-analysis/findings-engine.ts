/**
 * Deterministic Health Findings Engine
 *
 * Generates structured HealthFinding objects from verified product data.
 * The LLM NEVER decides findings - this engine does.
 * The LLM only explains the verified findings in user-friendly language.
 */

import {
  type HealthFinding,
  type HealthAnalysisResult,
  type NutritionInput,
  type IngredientInput,
  type HealthAnalysisInput,
  type FindingCategory,
  type FindingSeverity,
  type ClaimType,
  type Confidence,
  type NutritionBasis,
} from "./types";
import {
  FOODGUARD_THRESHOLDS,
  WHO_DAILY,
  PROCESSING_LEVELS,
  NUTRIENT_LABELS,
} from "./reference-values";

let findingCounter = 0;
function nextId(): string {
  return `hf-${++findingCounter}`;
}

// ── Helper: classify severity ───────────────────────────────────────────

function classifySeverity(
  value: number,
  threshold: { high: number; moderate: number },
  higherIsBetter = false,
): FindingSeverity {
  if (higherIsBetter) {
    // For protein/fibre: high = good, low = bad
    if (value >= threshold.high) return "high"; // high is good
    if (value >= threshold.moderate) return "moderate";
    return "low";
  }
  // For sodium/sugar/fat: high = bad
  if (value >= threshold.high) return "high";
  if (value >= threshold.moderate) return "moderate";
  return "low";
}

// ── Helper: determine confidence ────────────────────────────────────────

function dataConfidence(
  value: number | null | undefined,
  hasServingSize: boolean,
  hasPackageWeight: boolean,
): Confidence {
  if (value == null || value === undefined) return "low";
  if (hasServingSize && hasPackageWeight) return "high";
  if (hasServingSize || hasPackageWeight) return "medium";
  return "medium"; // per-100g only
}

// ── Sodium Finding ──────────────────────────────────────────────────────

function generateSodiumFinding(
  sodium: number,
  basis: NutritionBasis,
  servingWeight: number | null,
  packageWeight: number | null,
): HealthFinding[] {
  const findings: HealthFinding[] = [];
  const t = FOODGUARD_THRESHOLDS.sodium;
  const severity = classifySeverity(sodium, t);
  const whoLimit = WHO_DAILY.sodium;

  // Main sodium finding
  findings.push({
    finding_id: nextId(),
    category: "sodium",
    severity,
    title: severity === "high" ? "High sodium" : severity === "moderate" ? "Moderate sodium" : "Low sodium",
    metric: "sodium",
    value: sodium,
    unit: "mg",
    basis,
    threshold: t.high,
    threshold_unit: "mg",
    evidence: ["nutrition.sodium"],
    confidence: "high",
    claim_type: "fact",
    explanation: `Contains ${sodium} mg sodium per 100g.`,
    recommendation: severity === "high"
      ? "Consider limiting frequency of consumption."
      : "Within acceptable range for sodium.",
  });

  // Per-serving calculation (only if serving weight known)
  if (servingWeight && servingWeight > 0) {
    const sodiumPerServing = Math.round((sodium * servingWeight) / 100);
    const pctDaily = Math.round((sodiumPerServing / whoLimit.value) * 100);
    findings.push({
      finding_id: nextId(),
      category: "sodium",
      severity,
      title: "Sodium per serving",
      metric: "sodium_per_serving",
      value: sodiumPerServing,
      unit: "mg",
      basis: "per_serving",
      threshold: whoLimit.value,
      threshold_unit: "mg",
      evidence: ["nutrition.sodium", "nutrition.servingSize"],
      confidence: dataConfidence(sodium, true, !!packageWeight),
      claim_type: "fact",
      explanation: `One serving provides approximately ${sodiumPerServing} mg sodium (${pctDaily}% of the WHO daily limit of ${whoLimit.value} mg).`,
      recommendation: pctDaily > 30 ? "This is a significant portion of the daily sodium limit." : "",
    });
  }

  // Per-package calculation (only if package weight known)
  if (packageWeight && packageWeight > 0) {
    const sodiumPerPackage = Math.round((sodium * packageWeight) / 100);
    findings.push({
      finding_id: nextId(),
      category: "sodium",
      severity,
      title: "Sodium per package",
      metric: "sodium_per_package",
      value: sodiumPerPackage,
      unit: "mg",
      basis: "per_package",
      threshold: whoLimit.value,
      threshold_unit: "mg",
      evidence: ["nutrition.sodium", "nutrition.packageWeight"],
      confidence: dataConfidence(sodium, !!servingWeight, true),
      claim_type: "fact",
      explanation: `The full package provides approximately ${sodiumPerPackage} mg sodium.`,
      recommendation: "",
    });
  }

  return findings;
}

// ── Saturated Fat Finding ───────────────────────────────────────────────

function generateSaturatedFatFinding(
  satFat: number,
  basis: NutritionBasis,
): HealthFinding[] {
  const findings: HealthFinding[] = [];
  const t = FOODGUARD_THRESHOLDS.saturatedFat;
  const severity = classifySeverity(satFat, t);
  const whoLimit = WHO_DAILY.saturatedFat;

  findings.push({
    finding_id: nextId(),
    category: "saturated_fat",
    severity,
    title: severity === "high" ? "High saturated fat" : severity === "moderate" ? "Moderate saturated fat" : "Low saturated fat",
    metric: "saturatedFat",
    value: satFat,
    unit: "g",
    basis,
    threshold: t.high,
    threshold_unit: "g",
    evidence: ["nutrition.saturatedFat"],
    confidence: "high",
    claim_type: "fact",
    explanation: `Contains ${satFat} g saturated fat per 100g.`,
    recommendation: severity === "high"
      ? "Foods high in saturated fat should be consumed in moderation."
      : "Within acceptable range for saturated fat.",
  });

  // WHO context (as inference, not fact)
  const pctDaily = Math.round((satFat / whoLimit.value) * 100 * 100) / 100;
  if (pctDaily > 10) {
    findings.push({
      finding_id: nextId(),
      category: "saturated_fat",
      severity: "moderate",
      title: "Saturated fat context",
      metric: "satfat_who_pct",
      value: pctDaily,
      unit: "%",
      basis,
      threshold: 10,
      threshold_unit: "%",
      evidence: ["nutrition.saturatedFat", "WHO_guidance"],
      confidence: "medium",
      claim_type: "inference",
      explanation: `Per 100g, this product provides approximately ${pctDaily}% of the WHO recommended daily limit for saturated fat (${whoLimit.value}g). Frequent consumption of foods high in saturated fat is generally less favourable for heart health.`,
      recommendation: "Consider balancing with lower-fat options throughout the day.",
    });
  }

  return findings;
}

// ── Calorie / Energy Finding ────────────────────────────────────────────

function generateCalorieFinding(
  calories: number,
  basis: NutritionBasis,
): HealthFinding[] {
  const findings: HealthFinding[] = [];
  const t = FOODGUARD_THRESHOLDS.calories;
  const severity = classifySeverity(calories, t);

  findings.push({
    finding_id: nextId(),
    category: "calories",
    severity,
    title: severity === "high" ? "Energy-dense" : "Moderate energy density",
    metric: "calories",
    value: calories,
    unit: "kcal",
    basis,
    threshold: t.high,
    threshold_unit: "kcal",
    evidence: ["nutrition.calories"],
    confidence: "high",
    claim_type: "fact",
    explanation: `Energy-dense: ${calories} kcal per 100g.`,
    recommendation: severity === "high"
      ? "Energy-dense foods can contribute substantial calories in relatively small portions."
      : "",
  });

  return findings;
}

// ── Sugar Finding ───────────────────────────────────────────────────────

function generateSugarFinding(
  sugar: number,
  basis: NutritionBasis,
): HealthFinding[] {
  const findings: HealthFinding[] = [];
  const t = FOODGUARD_THRESHOLDS.sugars;
  const severity = classifySeverity(sugar, t);
  const whoLimit = WHO_DAILY.sugars;

  findings.push({
    finding_id: nextId(),
    category: "sugar",
    severity,
    title: severity === "high" ? "High sugar" : severity === "moderate" ? "Moderate sugar" : "Low total sugar",
    metric: "sugars",
    value: sugar,
    unit: "g",
    basis,
    threshold: t.high,
    threshold_unit: "g",
    evidence: ["nutrition.sugars"],
    confidence: "high",
    claim_type: "fact",
    explanation: `Contains ${sugar} g total sugar per 100g.`,
    recommendation: severity === "high"
      ? "High sugar intake is associated with increased risk of dental caries and weight gain."
      : "",
  });

  return findings;
}

// ── Positive Findings (Protein, Fibre) ─────────────────────────────────

function generateProteinFinding(
  protein: number,
  basis: NutritionBasis,
): HealthFinding[] {
  const t = FOODGUARD_THRESHOLDS.protein;
  if (protein < t.moderate) return []; // too low to be noteworthy

  const isHigh = protein >= t.high;
  return [{
    finding_id: nextId(),
    category: "protein",
    severity: isHigh ? "high" : "moderate",
    title: isHigh ? "Good source of protein" : "Contains protein",
    metric: "protein",
    value: protein,
    unit: "g",
    basis,
    threshold: t.high,
    threshold_unit: "g",
    evidence: ["nutrition.protein"],
    confidence: "high",
    claim_type: "fact",
    explanation: `Contains ${protein} g protein per 100g.`,
    recommendation: isHigh ? "Good source of protein." : "",
  }];
}

function generateFibreFinding(
  fibre: number,
  basis: NutritionBasis,
): HealthFinding[] {
  const t = FOODGUARD_THRESHOLDS.fibre;
  if (fibre < t.moderate) return [];

  const isHigh = fibre >= t.high;
  return [{
    finding_id: nextId(),
    category: "fibre",
    severity: isHigh ? "high" : "moderate",
    title: isHigh ? "Good source of fibre" : "Contains dietary fibre",
    metric: "fibre",
    value: fibre,
    unit: "g",
    basis,
    threshold: t.high,
    threshold_unit: "g",
    evidence: ["nutrition.fibre"],
    confidence: "high",
    claim_type: "fact",
    explanation: `Contains ${fibre} g dietary fibre per 100g.`,
    recommendation: isHigh ? "Good source of dietary fibre." : "",
  }];
}

// ── Ingredient Findings ─────────────────────────────────────────────────

function generateIngredientFindings(
  ingredients: IngredientInput[],
): HealthFinding[] {
  const findings: HealthFinding[] = [];

  for (const ing of ingredients) {
    if (ing.assessment === "potentially_concerning" && ing.severity !== "low") {
      findings.push({
        finding_id: nextId(),
        category: "ingredient",
        severity: ing.severity as FindingSeverity,
        title: `${ing.name} — attention ingredient`,
        metric: `ingredient_${ing.name.toLowerCase().replace(/\s+/g, "_")}`,
        value: null,
        unit: "",
        basis: "per_100g",
        threshold: null,
        threshold_unit: null,
        evidence: [`ingredient.${ing.name}`],
        confidence: "medium",
        claim_type: "inference",
        explanation: `${ing.name} is ${ing.function}. Some evidence suggests it may warrant attention.`,
        recommendation: "",
      });
    }
  }

  return findings;
}

// ── Processing Finding ──────────────────────────────────────────────────

function generateProcessingFinding(
  score: number | null,
  level: number | null,
): HealthFinding[] {
  if (score == null && level == null) return [];

  const effectiveLevel = level ?? (score != null ? Math.round(5 - score) : null);
  if (effectiveLevel == null) return [];

  const info = PROCESSING_LEVELS[effectiveLevel] ?? PROCESSING_LEVELS[3];

  return [{
    finding_id: nextId(),
    category: "processing",
    severity: effectiveLevel >= 3 ? "high" : "moderate",
    title: info.label,
    metric: "processing_level",
    value: effectiveLevel,
    unit: "",
    basis: "per_100g",
    threshold: null,
    threshold_unit: null,
    evidence: ["processing.score"],
    confidence: "medium",
    claim_type: "fact",
    explanation: `FoodGuard classifies this product as: ${info.label}. ${info.description}`,
    recommendation: effectiveLevel >= 3
      ? "Products in this category are typically formulated with industrial ingredients."
      : "",
  }];
}

// ── Main Engine ─────────────────────────────────────────────────────────

export function generateHealthFindings(
  input: HealthAnalysisInput,
): HealthAnalysisResult {
  const findings: HealthFinding[] = [];
  const missingData: string[] = [];
  const verifiedFacts: string[] = [];
  const n = input.nutrition;

  // ── Sodium ──
  if (n?.sodium != null && n.sodium > 0) {
    findings.push(
      ...generateSodiumFinding(
        n.sodium,
        "per_100g",
        n.servingWeight ?? null,
        n.packageWeight ?? null,
      ),
    );
    verifiedFacts.push(`Sodium: ${n.sodium} mg per 100g`);
  } else if (n) {
    missingData.push("sodium");
  }

  // ── Saturated Fat ──
  if (n?.saturatedFat != null && n.saturatedFat > 0) {
    findings.push(...generateSaturatedFatFinding(n.saturatedFat, "per_100g"));
    verifiedFacts.push(`Saturated fat: ${n.saturatedFat}g per 100g`);
  } else if (n) {
    missingData.push("saturated_fat");
  }

  // ── Calories ──
  if (n?.calories != null && n.calories > 0) {
    findings.push(...generateCalorieFinding(n.calories, "per_100g"));
    verifiedFacts.push(`Calories: ${n.calories} kcal per 100g`);
  } else if (n) {
    missingData.push("calories");
  }

  // ── Sugar ──
  if (n?.sugars != null && n.sugars > 0) {
    findings.push(...generateSugarFinding(n.sugars, "per_100g"));
    verifiedFacts.push(`Sugar: ${n.sugars}g per 100g`);
  } else if (n?.totalSugars != null && n.totalSugars > 0) {
    findings.push(...generateSugarFinding(n.totalSugars, "per_100g"));
    verifiedFacts.push(`Sugar: ${n.totalSugars}g per 100g`);
  } else if (n) {
    missingData.push("sugar");
  }

  // ── Protein (positive) ──
  if (n?.protein != null && n.protein > 0) {
    findings.push(...generateProteinFinding(n.protein, "per_100g"));
    verifiedFacts.push(`Protein: ${n.protein}g per 100g`);
  }

  // ── Fibre (positive) ──
  const fibre = n?.fiber ?? n?.dietaryFibre;
  if (fibre != null && fibre > 0) {
    findings.push(...generateFibreFinding(fibre, "per_100g"));
    verifiedFacts.push(`Fibre: ${fibre}g per 100g`);
  }

  // ── Ingredient findings ──
  if (input.ingredients.length > 0) {
    findings.push(...generateIngredientFindings(input.ingredients));
  }

  // ── Processing ──
  findings.push(
    ...generateProcessingFinding(input.processingScore ?? null, input.processingLevel ?? null),
  );

  // ── Summary ──
  const highFindings = findings.filter((f) => f.severity === "high");
  const moderateFindings = findings.filter((f) => f.severity === "moderate");
  const positiveFindings = findings.filter(
    (f) => f.category === "protein" || f.category === "fibre",
  );

  const summaryParts: string[] = [];
  if (highFindings.length > 0) {
    summaryParts.push(
      `${highFindings.length} high-severity finding(s): ${highFindings.map((f) => f.title).join(", ")}.`,
    );
  }
  if (moderateFindings.length > 0) {
    summaryParts.push(
      `${moderateFindings.length} moderate finding(s).`,
    );
  }
  if (positiveFindings.length > 0) {
    summaryParts.push(
      `${positiveFindings.length} positive finding(s): ${positiveFindings.map((f) => f.title).join(", ")}.`,
    );
  }
  if (missingData.length > 0) {
    summaryParts.push(`Missing data: ${missingData.join(", ")}.`);
  }

  const summary = summaryParts.length > 0
    ? summaryParts.join(" ")
    : "Insufficient nutrition data to generate findings.";

  // ── Overall guidance ──
  const guidanceParts: string[] = [];
  if (highFindings.length >= 2) {
    guidanceParts.push("Multiple high-severity nutrition factors detected. Consider moderating consumption frequency.");
  } else if (highFindings.length === 1) {
    guidanceParts.push(`One high-severity factor detected (${highFindings[0].title}).`);
  }
  if (positiveFindings.length > 0) {
    guidanceParts.push(`Positive aspects: ${positiveFindings.map((f) => f.title).join(", ")}.`);
  }
  if (missingData.length > 0) {
    guidanceParts.push("Some nutrition data is missing; analysis may be incomplete.");
  }

  const overallGuidance = guidanceParts.length > 0
    ? guidanceParts.join(" ")
    : "Insufficient data to provide overall guidance.";

  // ── Confidence ──
  const totalExpected = 5; // sodium, satFat, calories, sugar, + at least one positive
  const available = totalExpected - missingData.length;
  const confidence = Math.round((available / totalExpected) * 100) / 100;

  return {
    summary,
    findings,
    overall_guidance: overallGuidance,
    confidence,
    missing_data: missingData,
    verified_facts: verifiedFacts,
  };
}
