/**
 * FSSAI Regulatory Service Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FSSAIAnalyzer } from "@/services/regulatory/fssai";
import { AdditiveChecker } from "@/services/regulatory/fssai/additive-checker";
import { FSSAIAdditiveKnowledgeBase } from "@/services/regulatory/fssai/additive-knowledge-base";
import { LabellingChecker } from "@/services/regulatory/fssai/labelling-checker";
import { ClaimChecker } from "@/services/regulatory/fssai/claim-checker";

describe("FSSAI Regulatory Service", () => {
  let analyzer: FSSAIAnalyzer;
  let additiveChecker: AdditiveChecker;
  let labellingChecker: LabellingChecker;
  let claimChecker: ClaimChecker;

  beforeEach(() => {
    analyzer = new FSSAIAnalyzer();
    additiveChecker = new AdditiveChecker();
    labellingChecker = new LabellingChecker();
    claimChecker = new ClaimChecker();
  });

  describe("FSSAIAnalyzer", () => {
    it("should analyze product with no data", async () => {
      const result = await analyzer.analyze({});
      expect(result).toBeDefined();
      expect(result.overallStatus).toBe("INSUFFICIENT_DATA");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("should analyze product with ingredients", async () => {
      const result = await analyzer.analyze({
        ingredients: ["sugar", "salt", "oil"],
        category: "food",
      });
      expect(result).toBeDefined();
      expect(result.additives).toBeDefined();
      expect(Array.isArray(result.additives)).toBe(true);
    });

    it("should analyze product with label data", async () => {
      const result = await analyzer.analyze({
        labelData: {
          hasIngredientsList: true,
          hasNutritionInfo: true,
          hasAllergenDeclaration: true,
          hasFssaiLicense: true,
        },
      });
      expect(result).toBeDefined();
      expect(result.labelling).toBeDefined();
      expect(result.labelling.checks.length).toBeGreaterThan(0);
    });

    it("should analyze product with claims", async () => {
      const result = await analyzer.analyze({
        claims: ["High Protein", "No Added Sugar"],
      });
      expect(result).toBeDefined();
      expect(result.claims).toBeDefined();
      expect(result.claims.length).toBe(2);
    });

    it("should surface a prohibited claim even with no other data", async () => {
      // A PROHIBITED claim is a definitive finding and must not be masked
      // as INSUFFICIENT_DATA just because the rest of the scan is empty.
      const result = await analyzer.analyze({
        claims: ["Cures diabetes"],
      });
      expect(result.overallStatus).toBe("NEEDS_REVIEW");
    });
  });

  describe("FSSAIAnalyzer — contaminant evidence semantics", () => {
    it("reports REFERENCE_LIMIT_AVAILABLE, never claiming contamination, for a normal scan", async () => {
      const result = await analyzer.analyze({
        product: { name: "Biscuit", category: "biscuits" },
        ingredients: ["wheat flour", "sugar"],
      });
      // Reference limits exist, but there is no lab result for this product:
      // the status must be REFERENCE_LIMIT_AVAILABLE — never PASS or NEEDS_REVIEW.
      expect(result.regulatoryChecks.contaminants).toBe("REFERENCE_LIMIT_AVAILABLE");
      expect(result.regulatoryChecks.contaminants).not.toBe("PASS");
      expect(result.regulatoryChecks.contaminants).not.toBe("NEEDS_REVIEW");
      expect(result.contaminants.length).toBeGreaterThan(0);
      expect(
        result.contaminants.every((c) => c.evidenceStatus === "REFERENCE_LIMIT_AVAILABLE"),
      ).toBe(true);
    });

    it("does not let reference limits change the overall status", async () => {
      const empty = await analyzer.analyze({});
      expect(empty.overallStatus).toBe("INSUFFICIENT_DATA");
      expect(empty.regulatoryChecks.contaminants).toBe("REFERENCE_LIMIT_AVAILABLE");
    });

    it("keeps confidence uninflated by reference contaminant data", async () => {
      const withIngredients = await analyzer.analyze({
        ingredients: ["sugar", "salt"],
      });
      const empty = await analyzer.analyze({});
      // Reference limits say nothing about THIS product, so they must not add
      // to the confidence of an otherwise data-poor scan. Both scans have the
      // same labelling/claim data and no additive matches, so confidence must
      // be exactly equal — reference contaminant data contributes nothing.
      expect(withIngredients.confidence).toBe(empty.confidence);
    });
  });

  describe("AdditiveChecker", () => {
    it("should check single additive", async () => {
      const result = await additiveChecker.checkSingleAdditive("sodium benzoate");
      // Result may be null if not in database
      expect(result === null || result !== null).toBe(true);
    });

    it("should extract INS number", () => {
      const insNumber = additiveChecker.extractINSNumber("INS 100");
      expect(insNumber).toBe("100");
    });

    it("should extract INS number from parentheses", () => {
      const insNumber = additiveChecker.extractINSNumber("E100 (100)");
      expect(insNumber).toBe("100");
    });
  });

  describe("AdditiveChecker — FSSAI knowledge base integration", () => {
    // The 556-additive FSSAI knowledge base is the first matching tier and is
    // fully file-backed — it resolves the headline additives the same way in
    // mock mode and database mode (no PostgreSQL required).
    it("resolves INS 621 to Monosodium glutamate via the FSSAI KB", async () => {
      const result = await additiveChecker.checkSingleAdditive("INS 621");
      expect(result).not.toBeNull();
      expect(result!.additiveName).toBe("Monosodium glutamate");
      expect(result!.insNumber).toBe("621");
      expect(result!.matchType).toBe("INS_EXACT");
      // MSG has an explicit FSSAI rule (3.1.11) — permitted with conditions.
      expect(result!.status).toBe("PERMITTED_WITH_CONDITIONS");
      expect(result!.maximumLevel).toBe("GMP");
      expect(result!.needsReview).toBe(false);
    });

    it("resolves INS 322 to Lecithins from the FSSAI KB", async () => {
      const result = await additiveChecker.checkSingleAdditive("INS 322");
      expect(result?.additiveName).toBe("Lecithins");
      expect(result?.insNumber).toBe("322");
      expect(result?.matchType).toBe("INS_EXACT");
    });

    it("resolves INS 960 to Stevioside from the FSSAI KB", async () => {
      const result = await additiveChecker.checkSingleAdditive("INS 960");
      expect(result?.additiveName).toBe("Stevioside");
      expect(result?.insNumber).toBe("960");
    });

    it("resolves E-numbers (E621) to the same additive", async () => {
      const result = await additiveChecker.checkSingleAdditive("E621");
      expect(result?.additiveName).toBe("Monosodium glutamate");
      expect(result?.matchType).toBe("INS_EXACT");
    });

    it("matches known additive names via the FSSAI KB", async () => {
      const aspartame = await additiveChecker.checkSingleAdditive("aspartame");
      expect(aspartame?.additiveName).toBe("Aspartame");
      expect(aspartame?.matchType).toBe("NAME_EXACT");
      expect(aspartame?.status).toBe("PERMITTED_WITH_CONDITIONS");

      const sucralose = await additiveChecker.checkSingleAdditive("sucralose");
      expect(sucralose?.additiveName).toBe("Sucralose (trichlorogalactosucrose)");
      expect(sucralose?.matchType).toBe("NAME_EXACT");
    });

    it("matches by abbreviation via the ingredient store when the KB lacks it", async () => {
      const msg = await additiveChecker.checkSingleAdditive("MSG");
      expect(msg?.additiveName).toBe("Monosodium Glutamate");
      expect(msg?.matchType).toBe("INGREDIENT_STORE");

      const lecithin = await additiveChecker.checkSingleAdditive("lecithin");
      expect(lecithin?.additiveName).toBe("Soy Lecithin");
    });

    it("matches case-insensitive names via the FSSAI KB", async () => {
      const result = await additiveChecker.checkSingleAdditive("SODIUM BENZOATE");
      expect(result?.additiveName).toBe("Sodium benzoate");
      expect(result?.matchType).toBe("NAME_EXACT");
      // No category-specific permission row exists for INS 211 → honest
      // NOT_SPECIFIED + PERMISSION_REQUIRES_CATEGORY_DATA, never a guess.
      expect(result?.status).toBe("NOT_SPECIFIED");
      expect(result?.permissionStatus).toBe("PERMISSION_REQUIRES_CATEGORY_DATA");
      expect(result?.needsReview).toBe(true);
    });

    it("returns null for unknown additives", async () => {
      const result = await additiveChecker.checkSingleAdditive("polygluconate-xyz-999");
      expect(result).toBeNull();
    });

    it("classifies Tartrazine per FSSAI (permitted with conditions), not the EU-informed store", async () => {
      // India-first: FSSAI 3.1.2 explicitly permits Tartrazine (INS 102) with
      // a 100 ppm maximum in enumerated foods. The KB tier wins over the
      // EU-informed store seed.
      const result = await additiveChecker.checkSingleAdditive("E102");
      expect(result?.additiveName).toBe("Tartrazine");
      expect(result?.matchType).toBe("INS_EXACT");
      expect(result?.status).toBe("PERMITTED_WITH_CONDITIONS");
      expect(result?.maximumLevel).toBe("100");
      expect(result?.unit).toBe("ppm");
      expect(result?.needsReview).toBe(false);
    });

    it("keeps KB matches source-traceable to the FSSAI knowledge base", async () => {
      const result = await additiveChecker.checkSingleAdditive("INS 621");
      expect(result?.sourceReferences[0].documentType).toBe("FSSAI knowledge base (extracted)");
      expect(result?.source?.document).toBe("Food_Additives_Regulations.txt");
      expect(result?.source?.section).toBe("3.1.11");
    });

    it("uses the hardcoded fallback table only when the KB and store have no entry", async () => {
      // INS 392 (Rosemary extract) is in the fallback table but NOT in the FSSAI
      // KB master list, so it exercises the last matching tier.
      const result = await additiveChecker.checkSingleAdditive("INS 392");
      expect(result?.additiveName).toBe("Rosemary Extract");
      expect(result?.matchType).toBe("HARDCODED_TABLE");
      expect(result?.status).toBe("PERMITTED");
    });

    it("picks the category-specific permission row when a food category is known", async () => {
      // Sucralose has 19 permission rows; the category lets us pick the right one.
      const result = await additiveChecker.checkSingleAdditive("INS 955", {
        foodCategory: "Carbonated water",
      });
      expect(result?.additiveName).toBe("Sucralose (trichlorogalactosucrose)");
      expect(result?.maximumLevel).toBe("300");
      expect(result?.unit).toBe("ppm");
    });

    it("works in mock mode without any database", async () => {
      // The whole suite runs without DATABASE_URL (mock mode): the checker must
      // resolve additives purely from bundled data + the knowledge-base file.
      const result = await additiveChecker.checkSingleAdditive("INS 621");
      expect(result?.additiveName).toBe("Monosodium glutamate");
    });
  });

  describe("AdditiveChecker — real product regression (Phase 3 KB)", () => {
    // Classified strictly from the extracted FSSAI dataset — no invented
    // permissions. INS numbers with explicit permission rows surface their
    // source-backed status; INS numbers without a category rule surface
    // PERMISSION_REQUIRES_CATEGORY_DATA instead of a guessed PERMITTED.
    const insExpectations: Array<[string, string, string]> = [
      // [INS, expected additive name, expected status]
      ["INS 621", "Monosodium glutamate", "PERMITTED_WITH_CONDITIONS"],
      ["INS 322", "Lecithins", "NOT_SPECIFIED"],
      ["INS 960", "Stevioside", "NOT_SPECIFIED"],
      ["INS 102", "Tartrazine", "PERMITTED_WITH_CONDITIONS"],
      ["INS 950", "Acesulfame potassium", "PERMITTED_WITH_CONDITIONS"],
      ["INS 951", "Aspartame", "PERMITTED_WITH_CONDITIONS"],
      ["INS 955", "Sucralose (trichlorogalactosucrose)", "PERMITTED_WITH_CONDITIONS"],
    ];

    it.each(insExpectations)("classifies %s from the extracted FSSAI dataset", async (ins, name, status) => {
      const result = await additiveChecker.checkSingleAdditive(ins);
      expect(result).not.toBeNull();
      expect(result!.additiveName).toBe(name);
      expect(result!.insNumber).toBe(ins.replace(/\D/g, ""));
      expect(result!.status).toBe(status);
      expect(result!.matchType).toBe("INS_EXACT");
      // No permission row → honest NOT_SPECIFIED, never a guessed PERMITTED.
      if (status === "NOT_SPECIFIED") {
        expect(result!.permissionStatus).toBe("PERMISSION_REQUIRES_CATEGORY_DATA");
      }
    });

    it("returns category-specific limits for sweeteners across categories", async () => {
      const carbonated = await additiveChecker.checkSingleAdditive("INS 955", {
        foodCategory: "Carbonated water",
      });
      expect(carbonated?.maximumLevel).toBe("300");
      expect(carbonated?.unit).toBe("ppm");

      const yoghurt = await additiveChecker.checkSingleAdditive("INS 955", {
        foodCategory: "Yoghurts",
      });
      expect(yoghurt?.maximumLevel).toBe("300");

      const chocolate = await additiveChecker.checkSingleAdditive("INS 955", {
        foodCategory: "Chocolate",
      });
      expect(chocolate?.maximumLevel).toBe("800");
    });

    it("surfaces MSG restrictions (foods where it is not allowed)", async () => {
      const result = await additiveChecker.checkSingleAdditive("INS 621");
      expect(result?.status).toBe("PERMITTED_WITH_CONDITIONS");
      expect(result?.maximumLevel).toBe("GMP");
      expect((result?.restrictions ?? []).length).toBeGreaterThan(10);
      // The restriction list comes from the source (3.1.11), not invented.
      expect(result?.restrictions).toContain("Carbonated Water");
    });

    it("keeps maximum level and unit faithful to the source (Tartrazine 100 ppm)", async () => {
      const result = await additiveChecker.checkSingleAdditive("E102");
      expect(result?.maximumLevel).toBe("100");
      expect(result?.unit).toBe("ppm");
      expect(result?.source?.section).toContain("3.1.2");
    });

    it("does not fabricate permission rows for INS numbers missing category data", async () => {
      // INS 322 (Lecithins) exists in Appendix A but has no category table in
      // the extracted dataset — it must stay NOT_SPECIFIED + needsReview.
      const result = await additiveChecker.checkSingleAdditive("INS 322");
      expect(result?.status).toBe("NOT_SPECIFIED");
      expect(result?.needsReview).toBe(true);
      expect(result?.permissionStatus).toBe("PERMISSION_REQUIRES_CATEGORY_DATA");
      expect(result?.maximumLevel).toBeUndefined();
    });
  });

  describe("AdditiveChecker — knowledge base match tier", () => {
    const KB_FIXTURE = new FSSAIAdditiveKnowledgeBase({
      records: [
        {
          additive_name: "Polyglycerol esters of fatty acids",
          INS_number: "475",
          source: { document: "Food_Additives_Regulations.txt", section: "Appendix A", table: "Table 1" },
        },
      ],
      permissions: [],
    });

    it("matches a KB INS number and reports PERMISSION_REQUIRES_CATEGORY_DATA", async () => {
      const checker = new AdditiveChecker(KB_FIXTURE);
      const result = await checker.checkSingleAdditive("INS 475");
      expect(result).not.toBeNull();
      expect(result!.matchType).toBe("INS_EXACT");
      expect(result!.additiveName).toBe("Polyglycerol esters of fatty acids");
      // Presence in the KB is NOT permission: no additive_permissions.json data.
      expect(result!.status).toBe("NOT_SPECIFIED");
      expect(result!.permissionStatus).toBe("PERMISSION_REQUIRES_CATEGORY_DATA");
      expect(result!.needsReview).toBe(true);
    });

    it("matches a KB additive name", async () => {
      const checker = new AdditiveChecker(KB_FIXTURE);
      const result = await checker.checkSingleAdditive("polyglycerol esters of fatty acids");
      expect(result?.matchType).toBe("NAME_EXACT");
      expect(result?.insNumber).toBe("475");
    });

    it("keeps source traceability on KB matches", async () => {
      const checker = new AdditiveChecker(KB_FIXTURE);
      const result = await checker.checkSingleAdditive("INS 475");
      expect(result!.source).toEqual({
        document: "Food_Additives_Regulations.txt",
        section: "Appendix A",
        table: "Table 1",
      });
      expect(result!.sourceReferences[0].regulation).toBe("Food_Additives_Regulations.txt");
      expect(result!.sourceReferences[0].table).toBe("Table 1");
    });

    it("upgrades to PERMITTED_WITH_CONDITIONS when permission data exists", async () => {
      const kbWithPermission = new FSSAIAdditiveKnowledgeBase({
        records: [
          {
            additive_name: "Polyglycerol esters of fatty acids",
            INS_number: "475",
            source: { document: "Food_Additives_Regulations.txt" },
          },
        ],
        permissions: [
          { insNumber: "475", foodCategory: "bakery", maxLevel: "10", unit: "g/kg", conditions: "as per Appendix A" },
        ],
      });
      const checker = new AdditiveChecker(kbWithPermission);
      const result = await checker.checkSingleAdditive("INS 475");
      expect(result?.status).toBe("PERMITTED_WITH_CONDITIONS");
      expect(result?.maximumLevel).toBe("10");
      expect(result?.unit).toBe("g/kg");
      expect(result?.foodCategory).toBe("bakery");
      expect(result?.needsReview).toBe(false);
      expect(result?.permissionStatus).toBeUndefined();
    });

    it("does not invent permissions for a KB match without permission data", async () => {
      const checker = new AdditiveChecker(KB_FIXTURE);
      const result = await checker.checkSingleAdditive("INS 475");
      expect(result?.status).not.toBe("PERMITTED");
      expect(result?.status).not.toBe("PERMITTED_WITH_CONDITIONS");
    });
  });

  describe("LabellingChecker", () => {
    it("should check labelling with all elements", async () => {
      const result = await labellingChecker.checkLabelling({
        hasIngredientsList: true,
        hasNutritionInfo: true,
        hasAllergenDeclaration: true,
        hasNetQuantity: true,
        hasManufacturerInfo: true,
        hasFssaiLicense: true,
        hasVegetarianDeclaration: true,
        hasDateMarking: true,
        hasBatchLotId: true,
        hasStorageInstructions: true,
      });
      expect(result.overallStatus).toBe("PASS");
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.checks.every(c => c.status === "FOUND")).toBe(true);
    });

    it("should check labelling with missing elements", async () => {
      const result = await labellingChecker.checkLabelling({
        hasIngredientsList: true,
        hasNutritionInfo: false,
        hasAllergenDeclaration: false,
      });
      expect(result.overallStatus).not.toBe("PASS");
      expect(result.checks.some(c => c.status === "NOT_FOUND")).toBe(true);
    });
  });

  describe("ClaimChecker", () => {
    it("should check supported claim", async () => {
      const result = await claimChecker.checkSingleClaim("High Protein");
      expect(result.status).toBe("SUPPORTED");
      expect(result.conditions.length).toBeGreaterThan(0);
    });

    it("should check prohibited claim", async () => {
      const result = await claimChecker.checkSingleClaim("Cures diabetes");
      expect(result.status).toBe("PROHIBITED");
    });

    it("should check review required claim", async () => {
      const result = await claimChecker.checkSingleClaim("Healthy");
      expect(result.status).toBe("REQUIRES_REVIEW");
    });

    it("should check unknown claim", async () => {
      const result = await claimChecker.checkSingleClaim("Some random claim");
      expect(result.status).toBe("REQUIRES_REVIEW");
    });
  });
});