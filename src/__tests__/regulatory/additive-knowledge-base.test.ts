/**
 * FSSAI Additive Knowledge Base tests
 *
 * The real additives.json extraction (556 clean records, valid INS numbers) is
 * loaded by the singleton. Fixture records prove the matching/validation logic
 * in isolation, and the real-file tests verify the headline INS numbers now
 * resolve (they did NOT before Phase 3 — the old extraction had no valid INS).
 */

import { describe, it, expect } from "vitest";
import {
  FSSAIAdditiveKnowledgeBase,
  getFSSAIAdditiveKnowledgeBase,
  normalizeAdditiveName,
  normalizeInsNumber,
} from "@/services/regulatory/fssai/additive-knowledge-base";

const FIXTURE_RECORDS = [
  {
    additive_name: "Monosodium Glutamate",
    INS_number: "621",
    source: { document: "Food_Additives_Regulations.txt", section: "Appendix A" },
  },
  {
    additive_name: "Lecithins",
    INS_number: "322",
    synonyms: ["E322", "Lecithin"],
    source: { document: "Food_Additives_Regulations.txt", table: "Table 1" },
  },
  {
    additive_name: "Steviol glycosides",
    INS_number: "960",
    synonyms: ["Stevioside"],
    source: { document: "Food_Additives_Regulations.txt" },
  },
  // Extraction noise that must NEVER be indexed or matched:
  { additive_name: "of sub section", INS_number: "2", source: { document: "x" } },
  { additive_name: "gram maximum", INS_number: "3", source: { document: "x" } },
  { additive_name: "", INS_number: "1", source: { document: "x" } },
  { additive_name: "Table\n  Minimum percent", INS_number: "4", source: { document: "x" } },
];

describe("FSSAIAdditiveKnowledgeBase", () => {
  describe("INS number lookup", () => {
    const kb = new FSSAIAdditiveKnowledgeBase({ records: FIXTURE_RECORDS });

    it("matches an exact INS number", () => {
      const result = kb.lookupByINS("621");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Monosodium Glutamate");
      expect(result!.validIns).toBe(true);
    });

    it("matches E-number input (same numbering as INS)", () => {
      expect(kb.lookupByINS("E621")?.name).toBe("Monosodium Glutamate");
    });

    it("normalizes INS input (whitespace, INS prefix, sub-classifications)", () => {
      expect(kb.lookupByINS("  INS 322  ")?.name).toBe("Lecithins");
      expect(normalizeInsNumber("100(i)")).toBe("100");
    });

    it("returns null for implausible/garbage INS numbers (noise excluded)", () => {
      expect(kb.lookupByINS("2")).toBeNull();
      expect(kb.lookupByINS("3")).toBeNull();
      expect(kb.lookupByINS("9999")).toBeNull();
      expect(kb.lookupByINS("")).toBeNull();
    });
  });

  describe("name lookup", () => {
    const kb = new FSSAIAdditiveKnowledgeBase({ records: FIXTURE_RECORDS });

    it("matches a normalized name case-insensitively", () => {
      const result = kb.lookupByName("STEVIOL GLYCOSIDES");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Steviol glycosides");
    });

    it("matches known synonyms (e.g. Stevioside → Steviol glycosides)", () => {
      const result = kb.lookupByName("stevioside");
      expect(result?.name).toBe("Steviol glycosides");
      expect(result?.insNumber).toBe("960");
    });

    it("matches singular/plural name variants declared as synonyms", () => {
      expect(kb.lookupByName("lecithin")?.name).toBe("Lecithins");
    });

    it("does not match noise rows as names", () => {
      expect(kb.lookupByName("gram maximum")).toBeNull();
      expect(kb.lookupByName("of sub section")).toBeNull();
    });

    it("returns null for unknown names", () => {
      expect(kb.lookupByName("polyglycerol esters")).toBeNull();
    });
  });

  describe("validity filtering / stats", () => {
    it("excludes noise records from the index but counts them in totals", () => {
      const kb = new FSSAIAdditiveKnowledgeBase({ records: FIXTURE_RECORDS });
      const stats = kb.getStats();
      expect(stats.totalRecords).toBe(7);
      expect(stats.indexedRecords).toBe(3);
      expect(stats.validInsCount).toBe(3);
      expect(stats.validNameCount).toBe(3);
    });
  });

  describe("permission layer", () => {
    it("reports no permission when additive_permissions.json is empty", () => {
      const kb = new FSSAIAdditiveKnowledgeBase({ records: FIXTURE_RECORDS, permissions: [] });
      expect(kb.getCategoryPermission("621")).toBeNull();
    });

    it("returns a permission record when available", () => {
      const kb = new FSSAIAdditiveKnowledgeBase({
        records: FIXTURE_RECORDS,
        permissions: [
          { insNumber: "621", foodCategory: "seasonings", maxLevel: "10", unit: "g/kg", conditions: "as per Appendix A" },
        ],
      });
      const permission = kb.getCategoryPermission("621");
      expect(permission).not.toBeNull();
      expect(permission!.maxLevel).toBe("10");
      expect(permission!.foodCategory).toBe("seasonings");
    });

    it("normalizes INS on permission lookup", () => {
      const kb = new FSSAIAdditiveKnowledgeBase({
        records: FIXTURE_RECORDS,
        permissions: [{ insNumber: "621" }],
      });
      expect(kb.getCategoryPermission("E621")).not.toBeNull();
    });

    it("prefers a category-specific permission row when a food category is given", () => {
      const kb = new FSSAIAdditiveKnowledgeBase({
        records: FIXTURE_RECORDS,
        permissions: [
          { insNumber: "621", foodCategory: "carbonated water", maxLevel: "100", unit: "ppm" },
          { insNumber: "621", foodCategory: "sweets", maxLevel: "500", unit: "ppm" },
        ],
      });
      const forSweets = kb.getCategoryPermission("621", { foodCategory: "Sweets" });
      expect(forSweets?.maxLevel).toBe("500");
      const forDrinks = kb.getCategoryPermission("621", { foodCategory: "carbonated water" });
      expect(forDrinks?.maxLevel).toBe("100");
    });

    it("normalizes snake_case permission records from the real extraction", () => {
      // The real additive_permissions.json uses snake_case fields (additive,
      // ins_number, food_category, maximum_level, …). The disk-load path maps
      // these onto the runtime camelCase schema automatically.
      const kb = getFSSAIAdditiveKnowledgeBase();
      const msgPermission = kb.getCategoryPermission("621", {
        name: "Monosodium glutamate",
      });
      // The snake_case source was correctly normalized at load time.
      expect(msgPermission?.additiveName).toBe("Monosodium glutamate");
      expect(msgPermission?.status).toBe("PERMITTED_WITH_CONDITIONS");
      expect(msgPermission?.maxLevel).toBe("GMP");
      expect((msgPermission?.restrictions ?? []).length).toBeGreaterThan(0);
    });
  });

  describe("source traceability", () => {
    it("preserves the extracted source document/section/table on matches", () => {
      const kb = new FSSAIAdditiveKnowledgeBase({ records: FIXTURE_RECORDS });
      const result = kb.lookupByINS("322");
      expect(result!.source.document).toBe("Food_Additives_Regulations.txt");
      expect(result!.source.table).toBe("Table 1");
    });
  });

  describe("real knowledge base file", () => {
    it("loads the real additives.json safely and resolves headline INS numbers", () => {
      const kb = getFSSAIAdditiveKnowledgeBase();
      const stats = kb.getStats();
      expect(stats.totalRecords).toBeGreaterThanOrEqual(550);
      // Phase 3 re-extraction: the master list has real INS numbers now.
      expect(kb.lookupByINS("621")?.name).toBe("Monosodium glutamate");
      expect(kb.lookupByINS("322")?.name).toBe("Lecithins");
      expect(kb.lookupByINS("960")?.name).toBe("Stevioside");
      expect(kb.lookupByINS("951")?.name).toBe("Aspartame");
      expect(kb.lookupByINS("950")?.name).toBe("Acesulfame potassium");
    });

    it("loads the real additive_permissions.json (227 records, not 0)", () => {
      const kb = getFSSAIAdditiveKnowledgeBase();
      expect(kb.getStats().permissionsCount).toBeGreaterThan(100);
      // MSG has an explicit category rule with restrictions.
      const msg = kb.getCategoryPermission("621", { name: "Monosodium glutamate" });
      expect(msg).not.toBeNull();
      expect(msg!.status).toBe("PERMITTED_WITH_CONDITIONS");
      expect((msg!.restrictions ?? []).length).toBeGreaterThan(10);
    });
  });

  describe("normalizeAdditiveName", () => {
    it("lowercases and collapses punctuation/whitespace", () => {
      expect(normalizeAdditiveName("  Mono-Sodium  Glutamate!  ")).toBe("mono sodium glutamate");
    });
  });
});
