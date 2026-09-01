/**
 * FSSAI Contaminant Checker
 *
 * Serves contaminant reference limits from the extracted knowledge base
 * (`contaminants.json`). Reference: Food Safety and Standards (Contaminants,
 * Toxins and Residues) Regulations, 2011.
 *
 * Evidence semantics (critical):
 *  - A barcode/OCR scan carries NO laboratory test result. The checker can only
 *    surface reference thresholds — never a claim that the product contains or
 *    exceeds a contaminant.
 *  - Results are tagged `evidenceStatus`:
 *      NO_DATA                         — no reference data available
 *      REFERENCE_LIMIT_AVAILABLE       — FSSAI reference threshold (normal scans)
 *      PRODUCT_TEST_RESULT_AVAILABLE   — reserved for real lab results
 *  - The analyzer must never derive PASS/FAIL from reference limits alone.
 */

import type { ContaminantCheckResult, RegulatorySource } from "./types";
import {
  ContaminantKnowledgeBase,
  getContaminantKnowledgeBase,
} from "./contaminant-knowledge-base";
import type { ContaminantKBRecord } from "./contaminant-knowledge-base";

export interface ContaminantCheckOptions {
  foodCategory?: string;
  substance?: string;
  substanceType?: string;
  /** Cap on the number of reference records returned (response hygiene). */
  limit?: number;
  /** When true, results are tagged as actual product lab results. Never true
   *  for barcode/OCR scans — reserved for laboratory data. */
  productTestResult?: boolean;
}

const REGULATION = "Food Safety and Standards (Contaminants, Toxins and Residues) Regulations, 2011";

export class ContaminantChecker {
  private readonly knowledgeBase: ContaminantKnowledgeBase;

  constructor(knowledgeBase: ContaminantKnowledgeBase = getContaminantKnowledgeBase()) {
    this.knowledgeBase = knowledgeBase;
  }

  private toResult(record: ContaminantKBRecord, productTest: boolean): ContaminantCheckResult {
    const sourceReferences: RegulatorySource[] = [
      {
        regulation: record.source.regulation ?? REGULATION,
        documentType: "FSSAI knowledge base (extracted)",
        section: record.source.section,
        table: record.source.table,
        page: record.source.page,
      },
    ];
    return {
      substance: record.substance,
      substanceType: record.substance_type,
      maximumLimit: record.maximum_limit,
      unit: record.unit,
      foodCategory: record.food_category,
      applicableConditions: record.applicable_conditions,
      sourceReferences,
      evidenceStatus: productTest ? "PRODUCT_TEST_RESULT_AVAILABLE" : "REFERENCE_LIMIT_AVAILABLE",
      confidence: record.confidence,
      needsHumanReview: record.needs_human_review,
      note: record.note,
    };
  }

  /**
   * Reference contaminant limits for a food category.
   * Returns [] with evidenceStatus NO_DATA semantics when the KB is unavailable.
   */
  async checkContaminants(options?: ContaminantCheckOptions): Promise<ContaminantCheckResult[]> {
    let records: ContaminantKBRecord[];
    if (options?.substance) {
      records = this.knowledgeBase.getBySubstance(options.substance);
    } else if (options?.substanceType) {
      records = this.knowledgeBase.getByType(options.substanceType as ContaminantKBRecord["substance_type"]);
    } else {
      records = this.knowledgeBase.getByFoodCategory(options?.foodCategory);
    }
    const results = records.map((r) => this.toResult(r, options?.productTestResult === true));
    return options?.limit !== undefined ? results.slice(0, options.limit) : results;
  }

  /**
   * Reference limits for a specific substance (exact, case-insensitive).
   */
  async getContaminantBySubstance(substance: string): Promise<ContaminantCheckResult[]> {
    return this.knowledgeBase.getBySubstance(substance).map((r) => this.toResult(r, false));
  }

  /**
   * Reference limits by substance type.
   */
  async getContaminantsByType(substanceType: string): Promise<ContaminantCheckResult[]> {
    return this.knowledgeBase
      .getByType(substanceType as ContaminantKBRecord["substance_type"])
      .map((r) => this.toResult(r, false));
  }

  /** True when the knowledge base has loaded reference data. */
  hasReferenceData(): boolean {
    return this.knowledgeBase.getAll().length > 0;
  }
}
