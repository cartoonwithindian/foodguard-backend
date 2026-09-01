/**
 * FSSAI Regulatory Analyzer
 * 
 * Main entry point for FSSAI regulatory analysis.
 * Combines all checker services to provide comprehensive regulatory analysis.
 */

import { logger } from "@/lib/logger";
import { AdditiveChecker } from "./additive-checker";
import { LabellingChecker } from "./labelling-checker";
import { ClaimChecker } from "./claim-checker";
import { ContaminantChecker } from "./contaminant-checker";
import { PackagingChecker } from "./packaging-checker";
import { SpecialFoodChecker } from "./special-food-checker";
import { ProductStandardChecker } from "./product-standard-checker";
import type {
  AdditiveCheckResult,
  ClaimCheckResult,
  FSSAIAnalysisResult,
  LabellingCheckResult,
  RegulatorySource,
} from "./types";
import type { NutritionFacts } from "@/types/domain";

export interface FSSAIAnalyzerInput {
  product?: {
    name?: string;
    category?: string;
    barcode?: string;
  };
  ingredients?: string[];
  nutrition?: NutritionFacts | null;
  claims?: string[];
  labelData?: {
    hasIngredientsList?: boolean;
    hasNutritionInfo?: boolean;
    hasAllergenDeclaration?: boolean;
    hasNetQuantity?: boolean;
    hasManufacturerInfo?: boolean;
    hasFssaiLicense?: boolean;
    hasVegetarianDeclaration?: boolean;
    hasDateMarking?: boolean;
    hasBatchLotId?: boolean;
    hasStorageInstructions?: boolean;
    hasCountryOfOrigin?: boolean;
    hasMrp?: boolean;
  };
  /** True only when the actual physical label was inspected/verified. A
   *  barcode/OCR scan cannot verify the label, so this stays false for scans. */
  labelVerified?: boolean;
  category?: string;
}

export class FSSAIAnalyzer {
  private additiveChecker: AdditiveChecker;
  private labellingChecker: LabellingChecker;
  private claimChecker: ClaimChecker;
  private contaminantChecker: ContaminantChecker;
  private packagingChecker: PackagingChecker;
  private specialFoodChecker: SpecialFoodChecker;
  private productStandardChecker: ProductStandardChecker;

  constructor() {
    this.additiveChecker = new AdditiveChecker();
    this.labellingChecker = new LabellingChecker();
    this.claimChecker = new ClaimChecker();
    this.contaminantChecker = new ContaminantChecker();
    this.packagingChecker = new PackagingChecker();
    this.specialFoodChecker = new SpecialFoodChecker();
    this.productStandardChecker = new ProductStandardChecker();
  }

  /**
   * Shared singleton instance. Checkers are expensive to construct (they load
   * knowledge bases from disk on first use), so reuse the same analyzer
   * across requests rather than creating a new one per call.
   */
  static singleton(): FSSAIAnalyzer {
    FSSAIAnalyzer._instance ??= new FSSAIAnalyzer();
    return FSSAIAnalyzer._instance;
  }
  private static _instance: FSSAIAnalyzer | null = null;

  /**
   * Perform comprehensive FSSAI regulatory analysis
   */
  async analyze(input: FSSAIAnalyzerInput): Promise<FSSAIAnalysisResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const sources: RegulatorySource[] = [];

    // Track whether data was available for each check. This distinguishes
    // "0 additives found because ingredients were checked" from "0 additives
    // because no ingredients were provided."
    const additiveDataAvailable = !!(input.ingredients && input.ingredients.length > 0);
    const labellingDataAvailable = !!(input.labelData?.hasIngredientsList || input.labelData?.hasNutritionInfo);

    try {
      // 1. Additive analysis — the product category lets the checker pick
      //    category-specific permission rows from the FSSAI knowledge base.
      const additiveResults = await this.additiveChecker.checkAdditives(
        input.ingredients || [],
        { foodCategory: input.category ?? input.product?.category },
      );

      // 2. Labelling analysis — the label itself is never verified by a
      //    barcode/OCR scan, so the honest result is INSUFFICIENT_DATA unless
      //    the caller explicitly verified the physical label.
      const labellingResult = await this.labellingChecker.checkLabelling(
        input.labelData || {},
        { verified: input.labelVerified ?? false }
      );

      // 3. Claim analysis
      const claimResults = await this.claimChecker.checkClaims(
        input.claims || []
      );

      // 4. Contaminant analysis — reference limits only; a barcode/OCR scan
      //    carries no laboratory result, so nothing here claims contamination.
      const contaminantResults = await this.contaminantChecker.checkContaminants({
        foodCategory: input.category ?? input.product?.category,
        limit: 100,
      });

      // 5. Packaging analysis
      const packagingResult = await this.packagingChecker.checkPackaging(
        input.category
      );
      const packagingResults = [packagingResult];

      // 6. Special food rules
      const specialFoodResults = await this.specialFoodChecker.checkSpecialRules(
        input.category
      );

      // 7. Product standards
      const productStandardResults = await this.productStandardChecker.checkProductStandard(
        input.product?.name,
        input.category
      );

      // Collect all sources
      sources.push(...additiveResults.flatMap(r => r.sourceReferences));
      sources.push(...labellingResult.sourceReferences);
      sources.push(...claimResults.flatMap(r => r.sourceReferences));
      sources.push(...contaminantResults.flatMap(r => r.sourceReferences));
      sources.push(...packagingResults.flatMap(r => r.sourceReferences));
      sources.push(...specialFoodResults.flatMap(r => r.sourceReferences));
      sources.push(...productStandardResults.flatMap(r => r.sourceReferences));

    // Determine overall status
    const overallStatus = this.determineOverallStatus(
      additiveResults,
      labellingResult,
      claimResults,
      additiveDataAvailable,
    );

      // Calculate confidence — reference contaminant limits say nothing about
      // THIS product, so only actual product test results may contribute.
      const productTestContaminantCount = contaminantResults.filter(
        (c) => c.evidenceStatus === "PRODUCT_TEST_RESULT_AVAILABLE",
      ).length;
      const confidence = this.calculateConfidence(
        additiveResults.length,
        labellingResult.checks.length,
        claimResults.length,
        productTestContaminantCount
      );

      // Check if review is needed
      const needsReview = confidence < 0.6 || 
        additiveResults.some(r => r.status === "UNCLEAR" || r.needsReview) ||
        labellingResult.overallStatus === "INSUFFICIENT_DATA";

      const duration = Date.now() - startTime;
      logger.info("fssai_analysis_completed", {
        duration,
        overallStatus,
        confidence,
        additiveCount: additiveResults.length,
        needsReview,
      });

      // Contaminant status: reference limits alone can never PASS or FAIL a
      // product. Only an actual laboratory result (not available to scans) may
      // be compared against a limit.
      const contaminantExceeded = contaminantResults.some(
        (c) => c.evidenceStatus === "PRODUCT_TEST_RESULT_AVAILABLE" &&
          c.measuredValue !== undefined && c.maximumLimit !== undefined &&
          parseFloat(c.measuredValue) > parseFloat(c.maximumLimit),
      );
      const contaminantWithin = contaminantResults.some(
        (c) => c.evidenceStatus === "PRODUCT_TEST_RESULT_AVAILABLE" &&
          c.measuredValue !== undefined && c.maximumLimit !== undefined &&
          parseFloat(c.measuredValue) <= parseFloat(c.maximumLimit),
      );
      const contaminantStatus = contaminantExceeded
        ? "NEEDS_REVIEW"
        : contaminantWithin
          ? "PASS"
          : contaminantResults.some((c) => c.evidenceStatus === "PRODUCT_TEST_RESULT_AVAILABLE")
            ? "REVIEW"
            : contaminantResults.length > 0
              ? "REFERENCE_LIMIT_AVAILABLE"
              : "NO_DATA";

      // Build regulatory checks breakdown — statuses reflect evidence, not
      // guesses: PERMITTED with a category rule is PASS, anything unverifiable
      // is INSUFFICIENT_DATA, and only real findings produce REVIEW/NEEDS_REVIEW.
      const additiveUserReview = additiveResults.some(
        (a) => a.userStatus === "REVIEW" ||
          a.status === "NOT_PERMITTED" || a.status === "RESTRICTED" || a.status === "UNCLEAR",
      );
      const additiveUserInsufficient = additiveResults.some(
        (a) => a.userStatus === "INSUFFICIENT_DATA",
      );
      const additiveStatus = additiveResults.length === 0
        ? "NO_DATA"
        : additiveUserReview
          ? "NEEDS_REVIEW"
          : additiveUserInsufficient
            ? "INSUFFICIENT_DATA"
            : "PASS";

      const labellingStatus = labellingResult.overallStatus === "FAIL"
        ? "NEEDS_REVIEW"
        : labellingResult.overallStatus === "PARTIAL"
          ? "REVIEW"
          : labellingResult.overallStatus === "PASS"
            ? "PASS"
            : labellingResult.overallStatus === "INSUFFICIENT_DATA"
              ? "INSUFFICIENT_DATA"
              : "NO_DATA";

      const regulatoryChecks = {
        additives: additiveStatus,
        labelling: labellingStatus,
        claims: claimResults.some(c => c.status === "PROHIBITED")
          ? "NEEDS_REVIEW"
          : claimResults.some(c => c.status === "REQUIRES_REVIEW")
            ? "REVIEW"
            : claimResults.length > 0
              ? "PASS"
              : "NO_DATA",
        contaminants: contaminantStatus,
        productStandards: productStandardResults.length > 0 ? "PASS" : "NO_DATA",
      };

      const additiveFindings = additiveResults
        .filter(a => a.userStatus === "REVIEW" || a.status === "RESTRICTED" || a.status === "NOT_PERMITTED" || a.status === "UNCLEAR")
        .map(a => ({ type: "additive", explanation: `${a.additiveName}: ${a.status}`, sourceReferences: a.sourceReferences }));
      const additiveReason =
        additiveFindings.length > 0
          ? additiveFindings.map(f => f.explanation).join("; ")
          : additiveUserInsufficient
            ? "Additives were identified, but the available product information is insufficient to confirm their permitted use/level for this product."
            : additiveResults.length > 0
              ? "All identified additives are permitted for the applicable food category according to the available FSSAI reference."
              : "No additives were identified from the available product information.";

      const labellingFindings = labellingResult.checks
        .filter(c => c.status === "NOT_FOUND")
        .map(c => ({ type: "labelling", explanation: `${c.element}: ${c.requirement ?? "Product label evidence is missing"}`, sourceReferences: c.sourceReferences }));

      const regulatoryCheckDetails: NonNullable<FSSAIAnalysisResult["regulatoryCheckDetails"]> = {
        additives: {
          status: additiveStatus === "PASS" ? "PASS" : additiveStatus === "NO_DATA" ? "NO_DATA" : additiveStatus === "INSUFFICIENT_DATA" ? "INSUFFICIENT_DATA" : "NEEDS_REVIEW",
          checksPerformed: additiveResults.length,
          findings: additiveFindings,
          evidence: additiveResults.flatMap(a => a.sourceReferences),
          references: additiveResults.flatMap(a => a.sourceReferences),
          reason: additiveReason,
          referenceCount: additiveResults.length,
        },
        labelling: {
          status: labellingResult.overallStatus === "PASS" ? "PASS"
            : labellingResult.overallStatus === "FAIL" ? "NEEDS_REVIEW"
            : labellingResult.overallStatus === "PARTIAL" ? "NEEDS_REVIEW"
            : labellingResult.checks.length === 0 ? "NO_DATA"
            : "INSUFFICIENT_DATA",
          checksPerformed: labellingResult.checks.length,
          findings: labellingFindings,
          evidence: labellingResult.sourceReferences,
          references: labellingResult.sourceReferences,
          reason: labellingResult.reason,
          referenceCount: labellingResult.checks.length,
        },
        claims: {
          status: claimResults.some(c => c.status === "PROHIBITED" || c.status === "REQUIRES_REVIEW") ? "NEEDS_REVIEW" : claimResults.length === 0 ? "NO_DATA" : "PASS",
          checksPerformed: claimResults.length,
          findings: claimResults
            .filter(c => c.status === "PROHIBITED" || c.status === "REQUIRES_REVIEW")
            .map(c => ({ type: "claim", explanation: `${c.claim}: ${c.status}`, sourceReferences: c.sourceReferences })),
          evidence: claimResults.flatMap(c => c.sourceReferences),
          references: claimResults.flatMap(c => c.sourceReferences),
          referenceCount: claimResults.length,
        },
        contaminants: {
          // Reference limits exist, but there is no laboratory result for THIS
          // product. The status is reported for transparency only — it is not
          // a claim about contamination.
          status: productTestContaminantCount > 0
            ? (contaminantExceeded ? "NEEDS_REVIEW" : "PASS")
            : contaminantResults.length > 0
              ? "INSUFFICIENT_DATA"
              : "NO_DATA",
          checksPerformed: contaminantResults.length,
          findings: contaminantResults
            .filter(c => c.evidenceStatus === "PRODUCT_TEST_RESULT_AVAILABLE")
            .map(c => ({ type: "contaminant", explanation: `${c.substance}: product test result available`, sourceReferences: c.sourceReferences })),
          evidence: contaminantResults.flatMap(c => c.sourceReferences),
          references: contaminantResults.flatMap(c => c.sourceReferences),
          reason: productTestContaminantCount > 0
            ? undefined
            : contaminantResults.length > 0
              ? "FSSAI reference limits exist for substances relevant to this product category, but there is no laboratory result for this product. This is reported for transparency and is not a claim about contamination."
              : "No contaminant reference data is available for this product.",
          referenceCount: contaminantResults.length,
        },
        productStandards: {
          status: "NO_DATA",
          checksPerformed: productStandardResults.length,
          findings: [],
          evidence: productStandardResults.flatMap(p => p.sourceReferences),
          references: productStandardResults.flatMap(p => p.sourceReferences),
          referenceCount: productStandardResults.length,
        },
      };

      const disclaimer = "Based on available product information and FSSAI regulatory data. This is not a legal compliance determination. For official compliance, consult FSSAI directly.";

      return {
        overallStatus,
        regulatoryChecks,
        regulatoryCheckDetails,
        disclaimer,
        additives: additiveResults,
        productStandards: productStandardResults,
        contaminants: contaminantResults,
        labelling: labellingResult,
        claims: claimResults,
        packaging: packagingResults,
        specialFoodRules: specialFoodResults,
        sources,
        confidence,
        warnings,
        needsReview,
        additiveDataAvailable,
        labellingDataAvailable,
      };
    } catch (error) {
      logger.error("fssai_analysis_failed", { error: String(error) });
      return {
        overallStatus: "INSUFFICIENT_DATA",
        regulatoryChecks: {
          additives: "NO_DATA",
          labelling: "NO_DATA",
          claims: "NO_DATA",
          contaminants: "NO_DATA",
          productStandards: "NO_DATA",
        },
        disclaimer: "FSSAI analysis could not be completed due to an error.",
        additives: [],
        productStandards: [],
        contaminants: [],
        labelling: { overallStatus: "INSUFFICIENT_DATA", checks: [], sourceReferences: [] },
        claims: [],
        packaging: [{ requirement: "", mandatory: false, sourceReferences: [] }],
        specialFoodRules: [],
        sources: [],
        confidence: 0,
        warnings: ["FSSAI analysis failed: " + String(error)],
        needsReview: true,
        additiveDataAvailable: false,
        labellingDataAvailable: false,
      };
    }
  }

  private determineOverallStatus(
    additives: AdditiveCheckResult[],
    labelling: LabellingCheckResult,
    claims: ClaimCheckResult[],
    additiveDataAvailable: boolean,
  ): FSSAIAnalysisResult["overallStatus"] {
    // Definitive findings always surface, even when the rest of the scan is sparse.
    const hasConcerning = additives.some(a =>
      a.status === "NOT_PERMITTED" || a.status === "RESTRICTED" || a.status === "UNCLEAR"
    );
    const hasLabellingIssues = labelling.overallStatus === "FAIL";
    const hasProhibitedClaims = claims.some(c => c.status === "PROHIBITED");
    const hasReviewClaims = claims.some(c => c.status === "REQUIRES_REVIEW");

    if (hasConcerning || hasLabellingIssues || hasProhibitedClaims || hasReviewClaims) {
      return "NEEDS_REVIEW";
    }

    // Additives with explicit category conditions are a real attention item.
    if (additives.some(a => a.status === "PERMITTED_WITH_CONDITIONS")) {
      return "REVIEW";
    }

    // FIXED: When additive data WAS available but no concerning additives were
    // found, this is a meaningful PASS — not INSUFFICIENT_DATA. The old code
    // treated additiveCount=0 as "no data" which is wrong when ingredients
    // were actually provided and checked.
    const hasAnyProductData =
      additiveDataAvailable ||
      additives.length > 0 ||
      (labelling.checks.length > 0 && labelling.overallStatus !== "INSUFFICIENT_DATA");

    if (!hasAnyProductData) {
      return "INSUFFICIENT_DATA";
    }

    // No definite findings, but not all regulatory aspects could be verified
    // against the available product data (e.g. the label was not verified).
    return "REVIEW";
  }

  private calculateConfidence(
    additiveCount: number,
    labellingCheckCount: number,
    claimCount: number,
    contaminantCount: number
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on data availability
    if (additiveCount > 0) confidence += 0.1;
    if (labellingCheckCount > 0) confidence += 0.1;
    if (claimCount > 0) confidence += 0.1;
    if (contaminantCount > 0) confidence += 0.1;

    // Cap at 0.95
    return Math.min(confidence, 0.95);
  }
}