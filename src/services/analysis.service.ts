import type {
  AllergenMatch,
  AnalyzeMeta,
  FrontendAnalysisResult,
  FrontendAttentionPoint,
  FrontendEvidenceSource,
  FrontendIngredientAnalysis,
  FrontendNutritionFinding,
  IngredientAnalysisItem,
  NutritionFacts,
  ProductInfo,
  ScoreFactor,
  WebResearchEvidence,
} from "@/types/domain";
import { lookupProductByBarcode } from "@/lib/product-provider";
import { searchIndianProducts } from "@/lib/india-dataset";
import { fetchOffImageUrl } from "@/lib/external/off-image";
import { parseIngredientText } from "@/lib/ingredients/parse";
import { analyzeIngredients } from "@/services/ingredient.service";
import { detectAllergens } from "@/lib/allergens";
import { parseNutritionTable } from "@/lib/nutrition/parse";
import { assessNutrition, nutrientLabel } from "@/lib/nutrition/analyze";
import { scoreNutrition } from "@/lib/scoring";
import { computeFoodGuardHealthScore } from "@/lib/scoring/engine";
import { personalize } from "@/services/personalization.service";

import type { EnhancedAlternative } from "@/services/recommendation.service";
import { getStore } from "@/lib/store";
import { knownBarcodeText } from "@/lib/ocr";
import { logger } from "@/lib/logger";
import { buildRegulatoryCompliance, regulatoryComplianceUnavailable } from "@/services/regulatory/fssai/compliance";
import type { FSSAIAnalysisResult } from "@/services/regulatory/fssai";
import type { RegulatoryCompliance } from "@/types/domain";
import { isServiceAvailable as isLegalMetrologyAvailable, analyze as analyzeLegalMetrology } from "@/services/regulatory/legal-metrology";
import type { LegalMetrologyResult } from "@/services/regulatory/legal-metrology";
import { researchIngredient, researchProduct, isWebResearchAvailable, shouldPerformWebResearch, needsWebResearch } from "@/services/web-research.service";
import { getAIProvider } from "@/lib/ai";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";
import type { AIAnalysisExplanation } from "@/lib/ai";
import { generateHealthFindings, validateFindings, buildAnalysisExplanationFromFindings } from "@/lib/health-analysis";
import type { HealthAnalysisInput } from "@/lib/health-analysis";
import { findAlternativesForProduct, type EnhancedAlternative as EnhancedAlternativeV2 } from "@/services/alternative-engine.service";
import { toAlternativeCharacteristicInfo } from "@/lib/alternative-characteristics";
import type { AlternativeCharacteristicInfo } from "@/lib/alternative-characteristics";

export type AnalyzeInput = {
  barcode?: string;
  productName?: string;
  brand?: string;
  ingredientsText?: string;
  nutrition?: NutritionFacts | null;
  ocrText?: string | null;
  ocrConfidence?: number | null;
  imageAvailable?: boolean;
  userId?: string | null;
  language?: string;
  skipAlternatives?: boolean;
  skipPersonalization?: boolean;
};

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function mapAssessmentLabel(label: string): "low" | "moderate" | "high" {
  if (label === "potentially_concerning" || label === "allergen") return "high";
  if (label === "noteworthy" || label === "dietary_conflict" || label === "insufficient_evidence") return "moderate";
  return "low";
}

function assessmentDescription(assessment: string): string {
  switch (assessment) {
    case "low":
      return "This product has a generally favourable profile based on its ingredients and nutrition. This assessment is informational and does not replace individual dietary advice.";
    case "moderate":
      return "Some aspects of this product deserve closer attention based on its ingredient and nutrition profile. While generally acceptable for most people, certain ingredients may warrant consideration for sensitive individuals.";
    case "high":
      return "Several aspects of this product's ingredient or nutrition profile are worth careful consideration. Please review the highlighted points below.";
    default:
      return "Not enough reliable data was available to assess this product. Please review the ingredients manually.";
  }
}

/**
 * Map FoodGuard rating label to the existing assessment level.
 * FSSAI "insufficient" does NOT affect this — only data completeness matters.
 */
function scoreLabelToAssessment(
  ratingLabel: string,
  confidence: number,
): "low" | "moderate" | "high" | "insufficient" {
  if (confidence < 0.3) return "insufficient";
  switch (ratingLabel) {
    case "Excellent":
    case "Good":
      return "low";
    case "Okay":
      return "moderate";
    case "Poor":
    case "Very Poor":
      return "high";
    default:
      return "moderate";
  }
}

function buildFrontendNutrition(nutrition: NutritionFacts | null): FrontendAnalysisResult["nutrition"] {
  if (!nutrition) return undefined;
  const normalized = normalizeNutritionFacts(nutrition);
  const n = normalized.nutrients;
  const display = (key: string) => (n[key] ? `${fmt(n[key].value)}${n[key].normalizedUnit ?? n[key].unit}` : undefined);
  return {
    calories: n.calories ? Math.round(n.calories.value) : "—",
    sugar: display("sugars") ?? "—",
    sodium: display("sodium") ?? "—",
    saturatedFat: display("saturatedFat") ?? "—",
    totalFat: display("totalFat"),
    salt: display("salt"),
    protein: display("protein") ?? "—",
    fibre: display("fiber") ?? "—",
    servingSize: normalized.servingSize ?? "100g",
  };
}

function buildAttentionPoints(
  items: IngredientAnalysisItem[],
  nutrition: NutritionFacts | null,
): FrontendAttentionPoint[] {
  const points: FrontendAttentionPoint[] = [];
  const seen = new Set<string>();
  const add = (point: FrontendAttentionPoint) => {
    const key = point.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (seen.has(key)) return;
    seen.add(key);
    points.push(point);
  };

  // Ingredient attention is limited to evidence-backed concerns. Dietary
  // considerations such as salt and palm oil are represented by nutrition
  // findings below, not duplicated as ingredient warnings.
  for (const item of items) {
    if (!item.matched || item.evidence.length === 0) continue;
    if (item.assessment === "potentially_concerning" || item.assessment === "allergen") {
      add({
        name: item.name,
        displayName: item.name,
        amount: item.identifier,
        reason: item.explanation,
        severity: mapAssessmentLabel(item.assessment),
        source: item.evidence[0]?.organization ?? "Ingredient evidence",
      });
    }
  }
  for (const concern of assessNutrition(nutrition).concerns) {
    add({
      name: concern.nutrient,
      displayName: nutrientLabel(concern.nutrient),
      value: concern.actualValue,
      unit: concern.unit,
      basis: concern.basis,
      amount:
        concern.actualValue !== undefined && concern.unit
          ? `${fmt(concern.actualValue)}${concern.unit}`
          : undefined,
      reason: concern.reason,
      severity: concern.level,
      source: concern.source ?? "Product nutrition data",
    });
  }
  return points.slice(0, 8);
}

function buildPositivePoints(items: IngredientAnalysisItem[], nutrition: NutritionFacts | null): Array<{ text: string }> {
  const points: Array<{ text: string }> = [];
  for (const item of items) {
    if (item.assessment === "beneficial") {
      points.push({ text: `${item.name} - ${item.function}` });
    }
  }
  const nutritionAssessment = assessNutrition(nutrition);
  for (const positive of nutritionAssessment.positives) {
    points.push({ text: positive.reason });
  }
  return points.slice(0, 6);
}

function buildEvidenceSources(
  items: IngredientAnalysisItem[],
  product: ProductInfo | null,
  limit = 8,
): FrontendEvidenceSource[] {
  const sources: FrontendEvidenceSource[] = [];
  const seen = new Set<string>();
  const add = (source: FrontendEvidenceSource) => {
    const key = `${source.sourceName}|${source.sourceType}|${source.summary}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  };

  if (product) {
    add({
      sourceName: product.source,
      sourceType: "Product label/database record",
      evidenceCategory: "PRODUCT_DATA",
      summary: `Product-specific data for ${product.name} (${product.barcode}).`,
      url: product.sourceUrl ?? undefined,
    });
  }

  for (const item of items) {
    // USDA rice/corn entries are general nutrition guidance, not evidence
    // that this particular product contains or has the stated properties.
    if (/^(rice|rice meal|corn(?: \(maize\))?|corn meal)$/i.test(item.name)) continue;
    for (const ref of item.evidence) {
      const org = `${ref.organization} ${ref.sourceType}`;
      // Evidence-category semantics:
      //  - World Health Organization → NUTRITION_GUIDANCE
      //  - Regulators/standards bodies (FSSAI, EFSA, FDA, Codex) → REGULATORY_REFERENCE
      //  - USDA/scientific databases & peer-reviewed research → SCIENTIFIC_REFERENCE
      //  - product/dataset/OCR → PRODUCT_DATA
      const isNutritionGuidance = /world health organization/i.test(org);
      const isRegulatory =
        /fssai|food safety|regulat|codex|appendix\s*a|schedule|food standards|food additives regulation|licen[cs]e/i.test(org) ||
        /us food and drug administration|\bfda\b/i.test(org) ||
        /european food safety authority|\befsa\b|european commission/i.test(org);
      const isScientific =
        /usda|agricultural research|fooddata|nutrient database|journal|the lancet|iarc|jecfa|\bnih\b|academi|peer[- ]reviewed|scientific/i.test(org);
      let evidenceCategory: NonNullable<FrontendEvidenceSource["evidenceCategory"]> =
        "REGULATORY_REFERENCE";
      if (isNutritionGuidance) evidenceCategory = "NUTRITION_GUIDANCE";
      else if (isRegulatory) evidenceCategory = "REGULATORY_REFERENCE";
      else if (isScientific) evidenceCategory = "SCIENTIFIC_REFERENCE";
      add({
        sourceName: ref.organization,
        sourceType: ref.sourceType,
        evidenceCategory,
        summary: ref.summary,
        url: ref.url,
      });
      if (sources.length >= limit) return sources;
    }
  }
  return sources;
}

function buildIngredientsFrontend(items: IngredientAnalysisItem[]): FrontendIngredientAnalysis[] {
  return items.map((item) => ({
    name: item.name,
    function: item.function,
    assessment: mapAssessmentLabel(item.assessment),
    explanation: item.explanation,
    evidence: item.evidence[0]?.summary ?? (item.matched ? "No structured evidence found" : "Unable to confidently identify this portion of the label."),
    source: item.evidence[0]?.organization,
  }));
}

function buildNutritionFindings(nutrition: NutritionFacts | null): FrontendNutritionFinding[] {
  return assessNutrition(nutrition).concerns.map((concern) => ({
    nutrient: concern.nutrient,
    actualValue: concern.actualValue ?? 0,
    unit: concern.unit ?? "",
    basis: concern.basis ?? nutrition?.basis ?? "PER_100G",
    threshold: concern.threshold ?? 0,
    severity: concern.level,
    reason: concern.reason,
    source: concern.source ?? "Product nutrition data",
  }));
}

/**
 * The main end-to-end analysis pipeline:
 * validate -> identify product -> OCR -> parse -> normalize -> allergens ->
 * nutrition -> evidence -> deterministic scoring -> personalization ->
 * explanation -> alternatives -> history -> structured result.
 */
export async function runAnalysis(input: AnalyzeInput): Promise<{ frontend: FrontendAnalysisResult; meta: AnalyzeMeta }> {
  const warnings: string[] = [];
  const store = getStore();

  // ── 1. Product identification (local -> cache -> external) ──
  let product: ProductInfo | null = null;
  let productNutrition: NutritionFacts | null = input.nutrition ? normalizeNutritionFacts(input.nutrition) : null;
  let productSource: string | null = null;

  if (input.barcode) {
    const lookup = await lookupProductByBarcode(input.barcode);
    product = lookup.product;
    productNutrition = lookup.nutrition ? normalizeNutritionFacts(lookup.nutrition) : productNutrition;
    productSource = lookup.source;
    if (!product) {
      warnings.push(`Product with barcode ${input.barcode} was not found. Proceeding with provided label data.`);
    } else if (product.isDemo) {
      warnings.push("This product is from the bundled demo dataset and has not been verified against a retailer.");
    }
  }

  if (!product && input.productName) {
    const indianResults = await searchIndianProducts(input.productName, 1);
    // Only adopt the matched product when the name match is strong (>= 60:
    // exact, starts-with, contains, or full word overlap). Weak fuzzy matches
    // must not hijack the user-provided product name.
    if (indianResults.length > 0 && indianResults[0].score >= 60) {
      const indianProduct = indianResults[0].product;
      const saved = await store.saveProductFromProvider({ product: indianProduct, nutrition: null, source: "indian_dataset" });
      product = saved.product;
      productNutrition = saved.nutrition ? normalizeNutritionFacts(saved.nutrition) : productNutrition;
      productSource = "indian_dataset";
    }
  }

  // ── 1b. Best-effort product image (Open Food Facts, by barcode) ──
  // The bundled Indian dataset carries no image URLs; resolve one the same
  // way the alternatives engine does so the product result shows a real
  // photo when OFF has one. A missing image never blocks analysis.
  if (product && product.barcode && !product.imageUrl) {
    try {
      const imageUrl = await fetchOffImageUrl(product.barcode);
      if (imageUrl) product = { ...product, imageUrl };
    } catch {
      // Best-effort; ignore failures.
    }
  }

  // ── 2. Ingredient text sources: label text > OCR > stored raw ──
  let ingredientsText = input.ingredientsText?.trim() || "";
  const ocrConfidence = input.ocrConfidence ?? null;
  if (!ingredientsText && input.ocrText) {
    ingredientsText = input.ocrText;
  }
  if (!ingredientsText && product) {
    const parsed = parseIngredientText(product.ingredientsRaw);
    ingredientsText = parsed.listText ?? "";
  }
  if (!ingredientsText && input.barcode && !input.imageAvailable) {
    const canned = knownBarcodeText(input.barcode);
    if (canned) ingredientsText = canned;
  }

  // ── 3. Parse + normalize + analyze ingredients ──
  const parsedIngredients = parseIngredientText(ingredientsText);
  const ingredientAnalysis = await analyzeIngredients({
    ingredients: parsedIngredients.ingredients,
    context: product ? product.name : input.productName ?? null,
    language: input.language ?? "en",
  });

  if (ingredientAnalysis.unresolvedCount > 0) {
    warnings.push(
      `${ingredientAnalysis.unresolvedCount} ingredient(s) could not be identified and have been queued for review.`,
    );
  }

  // ── 4. Allergens (label-level declarations + ingredient-level) ──
  const allergenMatches: AllergenMatch[] = detectAllergens(ingredientsText);
  for (const item of ingredientAnalysis.items) {
    for (const a of item.allergens) {
      if (!allergenMatches.some((m) => m.allergen === a.allergen)) allergenMatches.push(a);
    }
  }

  // ── 5. Nutrition: provided > OCR parse > product data ──
  if (!productNutrition && ingredientsText) {
    const parsedNutrition = parseNutritionTable(ingredientsText);
    if (parsedNutrition) productNutrition = normalizeNutritionFacts(parsedNutrition);
  }
  if (!productNutrition && product) {
    const stored = await store.getNutritionForProduct(product.id);
    if (stored) productNutrition = normalizeNutritionFacts(stored);
  }
  if (!productNutrition && !input.nutrition) {
    warnings.push("No nutrition information was available for this product.");
  }

  // ── 6. Evidence is gathered inside analyzeIngredients ──

  // ── 7. Four-component FoodGuard health score (0.0–5.0, deterministic) ──
  // FSSAI is NOT involved in health scoring — it is a separate regulatory module.
  const healthScore = computeFoodGuardHealthScore(
    product?.id ?? "manual",
    product?.name ?? input.productName ?? "Unknown Product",
    productNutrition,
    ingredientAnalysis.items,
    { includeDebug: true },
  );

  // Canonical score is 0.0–5.0, NOT 0–100.
  const score = healthScore.final_score;
  const scoreLabel = healthScore.rating;
  const scoreBreakdown: FrontendAnalysisResult["scoreBreakdown"] = [
    { factor: "nutrient_score", impact: Math.round(healthScore.components.nutrient.score * 100) / 100, explanation: `Nutrient score: ${healthScore.components.nutrient.score}/5`, category: "nutrition" as const },
    { factor: "ingredient_profile_score", impact: Math.round(healthScore.components.ingredient_profile.score * 100) / 100, explanation: `Ingredient profile: ${healthScore.components.ingredient_profile.score}/5`, category: "ingredients" as const },
    { factor: "ingredient_concern_score", impact: Math.round(healthScore.components.ingredient_concern.score * 100) / 100, explanation: `Ingredient concern: ${healthScore.components.ingredient_concern.score}/5`, category: "ingredients" as const },
    { factor: "processing_score", impact: Math.round(healthScore.components.processing.score * 100) / 100, explanation: `Processing level: ${healthScore.components.processing.level} (${healthScore.components.processing.score}/5)`, category: "ingredients" as const },
  ];

  // Confidence is computed from data completeness, NOT from FSSAI.
  const productConfidence = product ? product.productDataConfidence : 0.7;
  const dataCompleteness = ingredientsText ? 1 : 0.3;
  const nutritionScoring = scoreNutrition(productNutrition);
  let confidence = Math.round(
    (0.35 * productConfidence + 0.25 * nutritionScoring.confidence + 0.3 * ingredientAnalysis.matchRate + 0.1 * dataCompleteness) * 100,
  ) / 100;

  // Assessment is derived from the new 0–5 score + confidence.
  // Rating labels: Very Poor / Poor / Okay / Good / Excellent.
  const assessment = scoreLabelToAssessment(scoreLabel, confidence);
  const needsReview = confidence < 0.6 || ingredientAnalysis.unresolvedCount > 0 || (ocrConfidence !== null && ocrConfidence < 0.6);

  // ── 8. Personalization ──
  const personalization = input.skipPersonalization
    ? null
    : await personalize(input.userId ?? null, ingredientAnalysis.items, allergenMatches, productNutrition);

  // ── 9. FSSAI Regulatory Compliance (SEPARATE from FoodGuard health score) ──
  // Regulatory facts come from the standalone FSSAI Regulatory API over HTTP.
  // FSSAI status never affects the FoodGuard score, and a failure here must
  // not crash the analysis (REVIEW_REQUIRED / service unavailable instead).
  const additiveInputs = [...new Map(
    ingredientAnalysis.items.filter(i => i.matched).map(i => [i.name.toLowerCase(), i.name]),
  ).values()].map((name) => ({ name }));

  let regulatoryCompliance: RegulatoryCompliance | null = null;
  try {
    regulatoryCompliance = await buildRegulatoryCompliance({
      productName: product?.name ?? input.productName,
      foodCategory: product?.category,
      ingredients: additiveInputs.map((a) => a.name),
      additives: additiveInputs,
      // A barcode/OCR scan carries no laboratory measurements, so no
      // contaminant amounts are passed — the service returns the applicable
      // limit rather than a fabricated verdict.
      contaminants: [],
    });
  } catch (error) {
    logger.warn("fssai_analysis_failed", { error: String(error) });
    regulatoryCompliance = regulatoryComplianceUnavailable({
      additives: additiveInputs,
      contaminants: [],
    });
  }

  // ── 10. Legal Metrology Compliance (SEPARATE from FoodGuard health score) ──
  // Calls the standalone Legal Metrology API for packaged commodity compliance.
  // This checks MRP, net quantity, manufacturer details, dates, etc.
  let legalMetrologyResult: LegalMetrologyResult | null = null;
  try {
    const lmAvailable = await isLegalMetrologyAvailable();
    if (lmAvailable && product?.imageUrl) {
      // Fetch the product image and send to Legal Metrology API
      const imageResponse = await fetch(product.imageUrl);
      if (imageResponse.ok) {
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        const mime = imageResponse.headers.get("content-type") || "image/jpeg";
        legalMetrologyResult = await analyzeLegalMetrology({
          images: [{ buffer, filename: "product.jpg", mime }],
          productName: product.name,
          country: "India",
          productCategory: product.category,
        });
        logger.info("legal_metrology_analysis_complete", {
          productId: product.id,
          status: legalMetrologyResult.status,
          violations: legalMetrologyResult.violations.length,
        });
      }
    }
  } catch (error) {
    logger.warn("legal_metrology_analysis_failed", { error: String(error) });
  }

  // ── 11. Web Research (SELECTIVE - only when evidence is missing/outdated) ──
  const webResearchResults: WebResearchEvidence[] = [];
  const webResearchQueries: string[] = [];
  let webResearchPerformed = false;

  // Check if web research is needed and available
  const shouldResearch = shouldPerformWebResearch(
    ingredientAnalysis.items,
    !!regulatoryCompliance,
    !!productNutrition,
  );

  if (isWebResearchAvailable() && shouldResearch.needed) {
    logger.info("web_research_triggered", {
      reasons: shouldResearch.reasons,
      product: product?.name,
    });

    try {
      // Research ingredients that need more evidence (selective)
      const ingredientsNeedingEvidence = ingredientAnalysis.items.filter(needsWebResearch);

      // Limit to 2 ingredients to avoid excessive API calls
      for (const ing of ingredientsNeedingEvidence.slice(0, 2)) {
        const research = await researchIngredient({
          ingredientName: ing.name,
          insCode: ing.identifier,
          context: product?.name,
        });
        if (research.performed) {
          webResearchResults.push(...research.sources);
          webResearchQueries.push(...research.queries);
          webResearchPerformed = true;
        }
      }

      // Only research product if we have very few results and it's a concerning product
      if (product && webResearchResults.length < 2 && assessment === "high") {
        const productResearch = await researchProduct({
          productName: product.name,
          brand: product.brand ?? undefined,
          category: product.category,
          barcode: product.barcode,
        });
        if (productResearch.performed) {
          webResearchResults.push(...productResearch.sources);
          webResearchQueries.push(...productResearch.queries);
          webResearchPerformed = true;
        }
      }
    } catch (error) {
      logger.warn("web_research_failed", { error: String(error) });
    }
  } else {
    logger.debug("web_research_skipped", {
      available: isWebResearchAvailable(),
      needed: shouldResearch.needed,
      reasons: shouldResearch.reasons,
    });
  }

  // ── 12. Health Analysis (deterministic findings + LLM explanation) ──
  // The deterministic engine generates verified findings.
  // The LLM only explains them — it never decides health status.
  let aiAnalysis: AIAnalysisExplanation | null = null;
  try {
    const healthInput: HealthAnalysisInput = {
      product: {
        name: product?.name ?? input.productName ?? "Unknown Product",
        brand: product?.brand ?? input.brand,
        category: product?.category ?? "food",
      },
      nutrition: productNutrition ? {
        calories: productNutrition.nutrients.calories?.value,
        totalFat: productNutrition.nutrients.totalFat?.value,
        saturatedFat: productNutrition.nutrients.saturatedFat?.value,
        transFat: productNutrition.nutrients.transFat?.value,
        sodium: productNutrition.nutrients.sodium?.value,
        salt: productNutrition.nutrients.salt?.value,
        sugars: productNutrition.nutrients.sugars?.value,
        totalSugars: productNutrition.nutrients.totalSugars?.value,
        addedSugars: productNutrition.nutrients.addedSugars?.value,
        protein: productNutrition.nutrients.protein?.value,
        fiber: productNutrition.nutrients.fiber?.value,
        dietaryFibre: productNutrition.nutrients.dietaryFibre?.value,
        carbohydrates: productNutrition.nutrients.carbohydrates?.value,
        servingSize: productNutrition.servingSize,
      } : null,
      ingredients: ingredientAnalysis.items.map(item => ({
        name: item.name,
        function: item.function,
        assessment: item.assessment,
        severity: item.severity,
      })),
      processingScore: healthScore?.components.processing.score,
      processingLevel: healthScore?.components.processing.level,
    };

    // Step 1: Deterministic findings engine (no LLM involved)
    const healthResult = generateHealthFindings(healthInput);

    // Step 2: Anti-hallucination validation
    const validation = validateFindings(healthResult, healthInput);
    if (validation.rejected.length > 0) {
      logger.warn("health_findings_rejected", {
        count: validation.rejected.length,
        reasons: validation.rejected.map(r => r.reason),
      });
    }

    // Step 3: Use validated findings to build explanation
    const explanation = buildAnalysisExplanationFromFindings(
      { ...healthResult, findings: validation.valid },
      product?.name ?? input.productName ?? "Unknown Product",
    );

    aiAnalysis = {
      summary: explanation.summary,
      positivePoints: explanation.positivePoints,
      concerns: explanation.concerns,
      ingredientExplanations: ingredientAnalysis.items.map(item => ({
        name: item.name,
        explanation: item.evidence.length > 0
          ? `${item.name} is ${item.function}. ${item.evidence[0].summary}`
          : `${item.name} is ${item.function}.`,
        category: item.assessment === "potentially_concerning"
          ? "potential_concern" as const
          : item.assessment === "beneficial"
            ? "health_evidence" as const
            : "fact" as const,
      })),
      nutritionExplanation: explanation.nutritionExplanation,
      recommendation: explanation.recommendation,
      confidence: explanation.confidence,
      caveats: healthResult.missing_data.length > 0
        ? [`Missing data: ${healthResult.missing_data.join(", ")}`]
        : [],
      language: "en" as const,
    };

    // Use confidence to adjust overall confidence
    if (aiAnalysis.confidence > 0) {
      confidence = Math.round((confidence * 0.7 + aiAnalysis.confidence * 0.3) * 100) / 100;
    }
  } catch (error) {
    logger.warn("health_analysis_failed", { error: String(error) });
  }

  // ── 13. Alternatives (Phase 1–4 pipeline + existing ranking) ──
  let alternatives: EnhancedAlternative[] = [];
  let alternativeCharacteristics: AlternativeCharacteristicInfo[] = [];
  let alternativeCriteria: { preferredCharacteristics: string[]; unsupported: string[] } = {
    preferredCharacteristics: [],
    unsupported: [],
  };
  if (!input.skipAlternatives && product) {
    try {
      // Use the Phase 1–4 pipeline: existing issue detection → characteristics
      // → search criteria → candidate retrieval + validation → existing ranking.
      const pipeline = await findAlternativesForProduct({
        product,
        nutrition: productNutrition,
        userPreferences: input.userId ? {
          vegetarian: personalization?.flags.some(f => f.type === "dietary_conflict" && f.preference === "vegetarian"),
          vegan: personalization?.flags.some(f => f.type === "dietary_conflict" && f.preference === "vegan"),
          allergies: personalization?.flags.filter(f => f.type === "allergen_alert").map(f => f.ingredient ?? ""),
          healthGoals: personalization?.flags.filter(f => f.type === "health_goal_conflict").map(f => f.preference),
        } : null,
        limit: 5,
      });
      const enhancedAlternatives = pipeline.alternatives;

      // Convert enhanced alternatives to the existing format
      alternatives = enhancedAlternatives.map((alt: EnhancedAlternativeV2) => ({
        product: alt.product,
        similarity: alt.similarity,
        improvement: alt.improvement,
        recommendationScore: alt.recommendationScore,
        reasons: alt.reasons,
        whyBetter: alt.whyBetter,
        dataConfidence: alt.dataConfidence ?? 0.5,
        fssai: alt.fssai,
        preferenceAlignment: alt.preferenceAlignment,
      }));
      alternativeCharacteristics = pipeline.characteristics.map(toAlternativeCharacteristicInfo);
      alternativeCriteria = {
        preferredCharacteristics: pipeline.criteria.preferredCharacteristics,
        unsupported: pipeline.criteria.unsupported,
      };
    } catch (error) {
      logger.warn("alternatives_failed", { productId: product.id, error: String(error) });
      // A failed ranking must produce no alternatives, never placeholders.
      alternatives = [];
      alternativeCharacteristics = [];
      alternativeCriteria = { preferredCharacteristics: [], unsupported: [] };
    }
  }

  // ── 12. History (when authenticated) ──
  const frontendResult = buildFrontendResult({
    product,
    productName: input.productName,
    brand: input.brand,
    assessment,
    score,
    confidence,
    items: ingredientAnalysis.items,
    allergens: allergenMatches,
    nutrition: productNutrition,
    alternatives,
    alternativeCharacteristics,
    alternativeCriteria,
    personalization,
    regulatory: null,
    regulatoryCompliance,
    legalMetrology: legalMetrologyResult,
    scoreBreakdown,
    scoreLabel,
    needsReview,
    healthScore,
  });

  if (input.userId && frontendResult.id !== "manual") {
    try {
      await store.addHistoryEntry(input.userId, {
        productId: product?.id ?? null,
        assessmentSnapshot: frontendResult,
        source: input.barcode ? "barcode" : "label",
      });
    } catch (error) {
      logger.warn("history_save_failed", { userId: input.userId, error: String(error) });
    }
  }

  const meta: AnalyzeMeta = {
    confidence,
    warnings,
    needsReview,
    product,
    productSource,
    ingredients: ingredientAnalysis.items,
    unknownIngredients: ingredientAnalysis.unknownIngredients,
    allergens: allergenMatches,
    nutrition: productNutrition,
    assessmentFactors: [],
    personalization,
    evidence: ingredientAnalysis.items.flatMap((i) => i.evidence).slice(0, 12),
    alternatives,
    alternativeCharacteristics,
    alternativeCriteria,
    rawText: input.ocrText ?? undefined,
    ocrConfidence: ocrConfidence ?? undefined,
    regulatoryCompliance: regulatoryCompliance ?? undefined,
    legalMetrology: legalMetrologyResult ?? undefined,
    webResearch: webResearchPerformed ? {
      performed: webResearchPerformed,
      sources: webResearchResults,
      queries: webResearchQueries,
      totalResults: webResearchResults.length,
    } : undefined,
    aiAnalysis: aiAnalysis ? {
      summary: aiAnalysis.summary,
      positivePoints: aiAnalysis.positivePoints,
      concerns: aiAnalysis.concerns,
      ingredientExplanations: aiAnalysis.ingredientExplanations,
      nutritionExplanation: aiAnalysis.nutritionExplanation,
      recommendation: aiAnalysis.recommendation,
      confidence: aiAnalysis.confidence,
    } : undefined,
    healthScore,
  };

  return { frontend: frontendResult, meta };
}

function buildFrontendResult(params: {
  product: ProductInfo | null;
  productName?: string;
  brand?: string;
  assessment: string;
  score: number;
  confidence: number;
  items: IngredientAnalysisItem[];
  allergens: AllergenMatch[];
  nutrition: NutritionFacts | null;
  alternatives: EnhancedAlternative[];
  alternativeCharacteristics: AlternativeCharacteristicInfo[];
  alternativeCriteria: { preferredCharacteristics: string[]; unsupported: string[] };
  personalization: Awaited<ReturnType<typeof personalize>> | null;
  regulatory?: FSSAIAnalysisResult | null;
  regulatoryCompliance?: RegulatoryCompliance | null;
  legalMetrology?: LegalMetrologyResult | null;
  scoreBreakdown: FrontendAnalysisResult["scoreBreakdown"];
  scoreLabel: string;
  needsReview: boolean;
  healthScore?: import("@/lib/scoring/engine").FoodGuardHealthScore;
}): FrontendAnalysisResult {
  const name = params.product?.name ?? params.productName ?? "Custom Product";
  const brand = params.product?.brand ?? params.brand ?? (params.product ? "" : "Manual Entry");
  const id = params.product?.id ?? "manual";

  // Build the foodguardScore object for the frontend.
  const hs = params.healthScore;
  const foodguardScore = hs ? {
    final_score: hs.final_score,
    rating: hs.rating,
    confidence: hs.confidence,
    components: {
      nutrient: { score: hs.components.nutrient.score, weight: hs.components.nutrient.weight, status: "available" as const },
      ingredient_profile: { score: hs.components.ingredient_profile.score, weight: hs.components.ingredient_profile.weight, status: "available" as const },
      ingredient_concern: { score: hs.components.ingredient_concern.score, weight: hs.components.ingredient_concern.weight, status: "available" as const },
      processing: { score: hs.components.processing.score, weight: hs.components.processing.weight, level: hs.components.processing.level, status: "derived" as const },
    },
    positive_factors: hs.positive_factors,
    negative_factors: hs.negative_factors,
    explanation: hs.explanation,
    missing_data: hs.data_quality.missing_fields,
    debug: hs.debug ? {
      nutrient_contribution: hs.debug.nutrient_contribution,
      ingredient_profile_contribution: hs.debug.ingredient_contribution,
      ingredient_concern_contribution: hs.debug.concern_contribution,
      processing_contribution: hs.debug.processing_contribution,
      raw_final_score: hs.debug.final_score,
      display_score: hs.final_score,
    } : undefined,
  } : undefined;

  return {
    id,
    name,
    brand,
    category: params.product?.category ?? "food",
    barcode: params.product?.barcode ?? "",
    scanDate: new Date().toISOString(),
    imageUrl: params.product?.imageUrl ?? undefined,
    assessment: params.assessment as FrontendAnalysisResult["assessment"],
    assessmentDescription: assessmentDescription(params.assessment),
    score: params.score, // 0.0–5.0
    positivePoints: buildPositivePoints(params.items, params.nutrition),
    attentionPoints: buildAttentionPoints(params.items, params.nutrition),
    ingredients: buildIngredientsFrontend(params.items),
    ingredientFindings: buildIngredientsFrontend(params.items),
    nutritionFindings: buildNutritionFindings(params.nutrition),
    foodguardScore,
    scoreBreakdown: params.scoreBreakdown,
    scoreDetails: {
      value: params.score,
      label: params.scoreLabel,
      breakdown: params.scoreBreakdown ?? [],
    },
    confidence: params.confidence,
    needsReview: params.needsReview,
    alternativeSuggestions: params.alternatives.slice(0, 3).map((alt) => ({
      title: `${alt.product.name} by ${alt.product.brand ?? "unknown brand"}`,
      description: alt.reasons.map((r) => r.detail).join(". "),
    })),
    evidenceSources: buildEvidenceSources(params.items, params.product),
    nutrition: buildFrontendNutrition(params.nutrition),
    regulatory: params.regulatory,
    regulatoryCompliance: params.regulatoryCompliance ?? null,
    legalMetrology: params.legalMetrology ?? null,
    alternatives: params.alternatives,
    alternativeCharacteristics: params.alternativeCharacteristics,
    alternativeCriteria: params.alternativeCriteria,
  };
}