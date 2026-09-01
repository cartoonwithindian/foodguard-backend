/**
 * FSSAI Labelling Checker
 *
 * Checks if product labelling meets FSSAI requirements.
 *
 * Evidence semantics: a barcode/OCR scan can confirm the presence of data
 * derived from a product record, but it CANNOT verify the physical label. When
 * the label itself is not verified (verified: false), the honest result is
 * INSUFFICIENT_DATA — the applicable FSSAI references are identified, but we
 * cannot determine whether the label meets them. REVIEW/FAIL is only reported
 * when an actual product-specific labelling finding exists.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { LabellingCheckResult, LabellingCheckElement, RegulatorySource } from "./types";

export interface LabelData {
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
}

export interface LabellingCheckOptions {
  /**
   * True only when the actual product label was inspected/verified (e.g. OCR
   * of the label image with the required elements detectable). When false or
   * omitted-without-evidence, the checker reports INSUFFICIENT_DATA rather
   * than asserting the label passes or fails.
   */
  verified?: boolean;
}

const FSSAI_DIR = join(process.cwd(), "fssai-knowledge-base");

interface LabellingRuleRecord {
  label_element?: string;
  requirement?: string;
  mandatory?: boolean;
  source?: { document?: string };
}

let cachedRules: LabellingRuleRecord[] | null = null;

/** Startup-loaded labelling rules (extracted from the FSSAI gazettes). */
function loadLabellingRules(): LabellingRuleRecord[] {
  if (cachedRules) return cachedRules;
  try {
    const path = join(FSSAI_DIR, "labelling_rules.json");
    if (!existsSync(path)) {
      cachedRules = [];
      return cachedRules;
    }
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    cachedRules = Array.isArray(raw) ? raw.filter((r) => r && r.source?.document) : [];
  } catch {
    cachedRules = [];
  }
  return cachedRules;
}

export class LabellingChecker {
  /**
   * Check labelling against FSSAI requirements
   */
  async checkLabelling(labelData: LabelData, options?: LabellingCheckOptions): Promise<LabellingCheckResult> {
    const checks: LabellingCheckElement[] = [];
    // When no option is given, the provided label data is treated as verified
    // (direct checker use). The analysis pipeline passes verified: false —
    // barcode/OCR scans cannot verify the physical label, so the honest
    // result is INSUFFICIENT_DATA rather than PASS/PARTIAL/FAIL.
    const verified = options?.verified ?? true;

    // Define mandatory labelling elements
    const mandatoryElements = [
      { element: "ingredients", hasElement: labelData.hasIngredientsList, requirement: "List of ingredients in descending order of weight" },
      { element: "nutrition", hasElement: labelData.hasNutritionInfo, requirement: "Nutrition information panel" },
      { element: "allergens", hasElement: labelData.hasAllergenDeclaration, requirement: "Allergen declaration" },
      { element: "netQuantity", hasElement: labelData.hasNetQuantity, requirement: "Net quantity declaration" },
      { element: "manufacturer", hasElement: labelData.hasManufacturerInfo, requirement: "Manufacturer/packer information" },
      { element: "fssaiLicense", hasElement: labelData.hasFssaiLicense, requirement: "FSSAI license number" },
      { element: "vegetarian", hasElement: labelData.hasVegetarianDeclaration, requirement: "Vegetarian/non-vegetarian declaration" },
      { element: "dateMarking", hasElement: labelData.hasDateMarking, requirement: "Date of manufacture and expiry" },
      { element: "batchLot", hasElement: labelData.hasBatchLotId, requirement: "Batch/lot identification" },
      { element: "storage", hasElement: labelData.hasStorageInstructions, requirement: "Storage instructions" },
    ];

    for (const item of mandatoryElements) {
      const rawElement: LabellingCheckElement = {
        element: item.element,
        status: item.hasElement === undefined ? "UNCLEAR" : item.hasElement ? "FOUND" : "NOT_FOUND",
        requirement: item.requirement,
        mandatory: true,
        sourceReferences: [],
      };
      // Never present an unverified label element as a verified finding.
      if (!verified) {
        rawElement.status = "UNCLEAR";
      }
      checks.push(rawElement);
    }

    // Source references: the actual FSSAI gazettes the rules were extracted from.
    const rules = loadLabellingRules();
    const sourceReferences: RegulatorySource[] = Array.from(
      new Set(rules.map((r) => r.source?.document ?? "").filter(Boolean)),
    ).map((document) => ({
      regulation: "Food Safety and Standards (Labelling and Display) Regulations, 2020",
      documentType: document,
    }));

    let overallStatus: LabellingCheckResult["overallStatus"];
    let reason: string;
    if (!verified) {
      overallStatus = "INSUFFICIENT_DATA";
      reason =
        "Applicable labelling requirements were identified, but the available product data is insufficient to determine whether the label meets them.";
    } else {
      // Determine overall status from verified label findings only
      const knownChecks = checks.filter(c => c.status !== "UNCLEAR");
      const foundCount = knownChecks.filter(c => c.status === "FOUND").length;
      const totalKnownCount = knownChecks.length;
      const foundRatio = totalKnownCount > 0 ? foundCount / totalKnownCount : 0;

      if (totalKnownCount === 0) {
        overallStatus = "INSUFFICIENT_DATA";
        reason =
          "The applicable FSSAI labelling requirements were identified, but no label element could be verified.";
      } else if (knownChecks.some(c => c.status === "NOT_FOUND") && foundRatio < 0.5) {
        overallStatus = "FAIL";
        reason =
          "Multiple mandatory labelling elements could not be verified on the product label, so the label does not meet the applicable FSSAI requirements.";
      } else if (knownChecks.some(c => c.status === "NOT_FOUND") || totalKnownCount < checks.length) {
        overallStatus = "PARTIAL";
        reason =
          "Some mandatory labelling elements were verified, but at least one required element could not be confirmed on the product label.";
      } else {
        overallStatus = "PASS";
        reason = "All mandatory labelling elements were verified on the product label.";
      }
    }

    return {
      overallStatus,
      checks,
      sourceReferences,
      reason,
    };
  }
}
