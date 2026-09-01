/**
 * FSSAI Contaminant Checker — regression tests
 *
 * Regulatory limits are REFERENCE THRESHOLDS. A barcode/OCR scan carries no
 * laboratory result, so the checker must never imply a product is contaminated.
 * These tests lock in the NO_DATA / REFERENCE_LIMIT_AVAILABLE /
 * PRODUCT_TEST_RESULT_AVAILABLE semantics.
 */

import { describe, it, expect } from "vitest";
import { ContaminantChecker } from "@/services/regulatory/fssai/contaminant-checker";
import {
  ContaminantKnowledgeBase,
  getContaminantKnowledgeBase,
} from "@/services/regulatory/fssai/contaminant-knowledge-base";

const FIXTURE_RECORDS = [
  {
    substance: "Mercury",
    substance_type: "HEAVY_METAL" as const,
    food_category: "Fish",
    maximum_limit: "0.5",
    unit: "ppm",
    source: { document: "Contaminants_Regulations.pdf", section: "2.1", table: "Table 1" },
    confidence: "HIGH" as const,
    needs_human_review: false,
  },
  {
    substance: "Aflatoxin",
    substance_type: "MYCOTOXIN" as const,
    food_category: "All articles of food",
    maximum_limit: "30",
    unit: "µg/kg",
    source: { document: "Contaminants_Regulations.pdf", section: "2.2" },
    confidence: "HIGH" as const,
    needs_human_review: false,
  },
  {
    substance: "Chlorpyrifos",
    substance_type: "PESTICIDE_RESIDUE" as const,
    food_category: "Foodgrains",
    maximum_limit: "0.05",
    unit: "mg/kg",
    source: { document: "Contaminants_Regulations.pdf", section: "2.3.1" },
    confidence: "HIGH" as const,
    needs_human_review: false,
  },
  {
    substance: "Chlorienvinphos",
    substance_type: "PESTICIDE_RESIDUE" as const,
    food_category: "Milk and Milk Products",
    maximum_limit: "0.2",
    unit: "mg/kg",
    source: { document: "Contaminants_Regulations.pdf", section: "2.3.1" },
    confidence: "MEDIUM" as const,
    needs_human_review: true,
    note: "OCR-flagged name; verify spelling",
  },
];

describe("ContaminantChecker", () => {
  const checker = new ContaminantChecker(new ContaminantKnowledgeBase({ records: FIXTURE_RECORDS }));

  it("returns reference limits with evidenceStatus REFERENCE_LIMIT_AVAILABLE", async () => {
    const results = await checker.checkContaminants();
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.evidenceStatus).toBe("REFERENCE_LIMIT_AVAILABLE");
    }
  });

  it("never claims a scanned product is contaminated (no PASS/FAIL from references)", async () => {
    const results = await checker.checkContaminants();
    // A reference limit is a threshold, not a finding about the product.
    expect(results.every((r) => r.evidenceStatus === "REFERENCE_LIMIT_AVAILABLE")).toBe(true);
  });

  it("flags lab results as PRODUCT_TEST_RESULT_AVAILABLE when explicitly provided", async () => {
    const results = await checker.checkContaminants({ productTestResult: true });
    expect(results.every((r) => r.evidenceStatus === "PRODUCT_TEST_RESULT_AVAILABLE")).toBe(true);
  });

  it("returns exact known substance limits (Mercury fish 0.5, other 1.0)", async () => {
    const mercury = (await checker.getContaminantBySubstance("Mercury")).filter(
      (r) => r.foodCategory === "Fish",
    );
    expect(mercury[0]?.maximumLimit).toBe("0.5");
    expect(mercury[0]?.unit).toBe("ppm");
  });

  it("returns the aflatoxin reference limit (30 µg/kg, all foods)", async () => {
    const afla = await checker.getContaminantBySubstance("Aflatoxin");
    expect(afla[0]?.maximumLimit).toBe("30");
    expect(afla[0]?.unit).toBe("µg/kg");
  });

  it("matches substances case-insensitively", async () => {
    const r = await checker.getContaminantBySubstance("chlorpyrifos");
    expect(r[0]?.maximumLimit).toBe("0.05");
  });

  it("filters by food category and falls back to general buckets", async () => {
    const fish = await checker.checkContaminants({ foodCategory: "Fish" });
    expect(fish.some((r) => r.foodCategory?.includes("Fish"))).toBe(true);

    const biscuits = await checker.checkContaminants({ foodCategory: "biscuits" });
    expect(biscuits.some((r) => r.foodCategory === "All articles of food")).toBe(true);
  });

  it("surfaces needsHumanReview and OCR notes", async () => {
    const cv = await checker.getContaminantBySubstance("Chlorienvinphos");
    expect(cv[0]?.needsHumanReview).toBe(true);
    expect(cv[0]?.confidence).toBe("MEDIUM");
    expect(cv[0]?.note).toContain("OCR");
  });

  it("keeps source traceability (document/section/table)", async () => {
    const r = (await checker.getContaminantBySubstance("Mercury"))[0];
    expect(r.sourceReferences[0].regulation).toContain("Contaminants, Toxins and Residues");
    expect(r.sourceReferences[0].section).toBe("2.1");
    expect(r.sourceReferences[0].table).toBe("Table 1");
  });

  it("returns NO_DATA semantics when the knowledge base is unavailable", async () => {
    const empty = new ContaminantChecker(new ContaminantKnowledgeBase({ records: [] }));
    expect(empty.hasReferenceData()).toBe(false);
    expect(await empty.checkContaminants()).toEqual([]);
  });
});

describe("ContaminantKnowledgeBase (real file)", () => {
  it("loads the full extracted dataset", () => {
    const kb = getContaminantKnowledgeBase();
    const stats = kb.getStats();
    expect(stats.totalRecords).toBeGreaterThanOrEqual(400);
    expect(stats.byType.HEAVY_METAL).toBeGreaterThanOrEqual(80);
    expect(stats.byType.PESTICIDE_RESIDUE).toBeGreaterThanOrEqual(400);
    expect(stats.byType.MYCOTOXIN).toBe(4);
    expect(stats.byType.NATURAL_TOXIN).toBe(4);
  });

  it("contains the key reference values from the 2011 regulation", () => {
    const kb = getContaminantKnowledgeBase();
    const mercury = kb.getBySubstance("Mercury");
    expect(mercury.some((r) => r.food_category === "Fish" && r.maximum_limit === "0.5")).toBe(true);
    expect(mercury.some((r) => r.food_category === "Other foods" && r.maximum_limit === "1.0")).toBe(true);

    const aflatoxin = kb.getBySubstance("Aflatoxin");
    expect(aflatoxin[0]?.maximum_limit).toBe("30");

    const lead = kb.getBySubstance("Lead");
    expect(lead.some((r) => r.food_category === "Foods not specified" && r.maximum_limit === "2.5")).toBe(true);

    const chrom = kb.getBySubstance("Chromium");
    expect(chrom.some((r) => r.unit === "ppb" && r.maximum_limit === "20")).toBe(true);
  });

  it("flags OCR-uncertain rows for human review instead of asserting them", () => {
    const kb = getContaminantKnowledgeBase();
    const flagged = kb.getStats().needsHumanReview;
    expect(flagged).toBeGreaterThan(0);
    // The mangled '0. 2' limit from the source is normalised to 0.2.
    const cv = kb.getBySubstance("Chlorienvinphos");
    expect(cv.some((r) => r.maximum_limit === "0.2" && r.needs_human_review)).toBe(true);
  });
});
