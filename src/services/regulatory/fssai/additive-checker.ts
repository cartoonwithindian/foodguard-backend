/**
 * FSSAI Additive Checker
 *
 * Checks if food additives are permitted under FSSAI regulations.
 * Supports INS numbers, E numbers, common names, and synonyms.
 *
 * Matching priority (never fuzzy):
 *   1. Exact INS number          → 556-record FSSAI additive knowledge base
 *   2. Normalized INS number     → 556-record FSSAI additive knowledge base
 *   3. Exact normalized name     → 556-record FSSAI additive knowledge base
 *   4. Known synonym             → 556-record FSSAI additive knowledge base
 *   5. Ingredient store          → curated ingredient knowledge base (bundled seed)
 *   6. Hardcoded fallback table  → curated ~40-additive reference table
 *
 * A knowledge-base hit alone is NOT proof of permission: the status comes only
 * from additive_permissions.json (every row backed by an explicit FSSAI source
 * table/rule). When no permission row exists the result is NOT_SPECIFIED +
 * PERMISSION_REQUIRES_CATEGORY_DATA + needsReview — never a guessed PERMITTED.
 */

import { logger } from "@/lib/logger";
import { ingredientIndex } from "@/lib/ingredients";
import {
  FSSAIAdditiveKnowledgeBase,
  getFSSAIAdditiveKnowledgeBase,
} from "./additive-knowledge-base";
import type { AdditiveKBRecord } from "./additive-knowledge-base";
import type { AdditiveCheckResult, AdditiveMatchType, AdditiveUserStatus } from "./types";
import type { IngredientRecord, RegulatoryStatus } from "@/types/domain";

// Common additive synonyms and alternate names (curated fallback table)
const ADDITIVE_SYNONYMS: Record<string, { name: string; insNumber: string; synonyms: string[] }> = {
  "INS 621": { name: "Monosodium Glutamate", insNumber: "621", synonyms: ["MSG", "E621", "monosodium glutamate", "sodium salt of glutamic acid"] },
  "INS 330": { name: "Citric Acid", insNumber: "330", synonyms: ["E330", "citric acid", "2-hydroxypropane-1,2,3-tricarboxylic acid"] },
  "INS 211": { name: "Sodium Benzoate", insNumber: "211", synonyms: ["E211", "sodium benzoate", "benzoate of soda"] },
  "INS 200": { name: "Sorbic Acid", insNumber: "200", synonyms: ["E200", "sorbic acid", "2,4-hexadienoic acid"] },
  "INS 202": { name: "Potassium Sorbate", insNumber: "202", synonyms: ["E202", "potassium sorbate"] },
  "INS 220": { name: "Sulphur Dioxide", insNumber: "220", synonyms: ["E220", "sulfur dioxide", "sulphur dioxide"] },
  "INS 250": { name: "Sodium Nitrite", insNumber: "250", synonyms: ["E250", "sodium nitrite"] },
  "INS 251": { name: "Sodium Nitrate", insNumber: "251", synonyms: ["E251", "sodium nitrate"] },
  "INS 280": { name: "Propionic Acid", insNumber: "280", synonyms: ["E280", "propionic acid"] },
  "INS 281": { name: "Sodium Propionate", insNumber: "281", synonyms: ["E281", "sodium propionate"] },
  "INS 282": { name: "Calcium Propionate", insNumber: "282", synonyms: ["E282", "calcium propionate"] },
  "INS 300": { name: "Ascorbic Acid", insNumber: "300", synonyms: ["E300", "ascorbic acid", "vitamin C"] },
  "INS 301": { name: "Sodium Ascorbate", insNumber: "301", synonyms: ["E301", "sodium ascorbate"] },
  "INS 306": { name: "Tocopherol Concentrate", insNumber: "306", synonyms: ["E306", "mixed tocopherols", "vitamin E"] },
  "INS 307": { name: "Alpha-Tocopherol", insNumber: "307", synonyms: ["E307", "alpha-tocopherol", "vitamin E"] },
  "INS 310": { name: "Gallates", insNumber: "310", synonyms: ["E310", "propyl gallate"] },
  "INS 319": { name: "TBHQ", insNumber: "319", synonyms: ["E319", "tert-butylhydroquinone"] },
  "INS 320": { name: "BHA", insNumber: "320", synonyms: ["E320", "butylated hydroxyanisole"] },
  "INS 321": { name: "BHT", insNumber: "321", synonyms: ["E321", "butylated hydroxytoluene"] },
  "INS 334": { name: "Tartaric Acid", insNumber: "334", synonyms: ["E334", "tartaric acid"] },
  "INS 335": { name: "Sodium Tartrate", insNumber: "335", synonyms: ["E335", "sodium tartrate"] },
  "INS 336": { name: "Potassium Tartrate", insNumber: "336", synonyms: ["E336", "potassium tartrate", "cream of tartar"] },
  "INS 375": { name: "Niacin", insNumber: "375", synonyms: ["E375", "niacin", "nicotinic acid", "vitamin B3"] },
  "INS 392": { name: "Rosemary Extract", insNumber: "392", synonyms: ["E392", "rosemary extract"] },
  "INS 407": { name: "Carrageenan", insNumber: "407", synonyms: ["E407", "carrageenan", "irish moss extract"] },
  "INS 410": { name: "Locust Bean Gum", insNumber: "410", synonyms: ["E410", "locust bean gum", "carob gum"] },
  "INS 412": { name: "Guar Gum", insNumber: "412", synonyms: ["E412", "guar gum"] },
  "INS 414": { name: "Gum Arabic", insNumber: "414", synonyms: ["E414", "gum arabic", "acacia gum"] },
  "INS 415": { name: "Xanthan Gum", insNumber: "415", synonyms: ["E415", "xanthan gum"] },
  "INS 440": { name: "Pectin", insNumber: "440", synonyms: ["E440", "pectin"] },
  "INS 500": { name: "Sodium Carbonate", insNumber: "500", synonyms: ["E500", "sodium carbonate", "washing soda"] },
  "INS 501": { name: "Potassium Carbonate", insNumber: "501", synonyms: ["E501", "potassium carbonate"] },
  "INS 503": { name: "Ammonium Carbonate", insNumber: "503", synonyms: ["E503", "ammonium carbonate"] },
  "INS 504": { name: "Calcium Carbonate", insNumber: "504", synonyms: ["E504", "calcium carbonate"] },
  "INS 509": { name: "Calcium Chloride", insNumber: "509", synonyms: ["E509", "calcium chloride"] },
  "INS 516": { name: "Calcium Sulphate", insNumber: "516", synonyms: ["E516", "calcium sulfate", "gypsum"] },
  "INS 524": { name: "Sodium Hydroxide", insNumber: "524", synonyms: ["E524", "sodium hydroxide", "lye"] },
  "INS 948": { name: "Oxygen", insNumber: "948", synonyms: ["E948", "oxygen"] },
};

export class AdditiveChecker {
  private readonly knowledgeBase: FSSAIAdditiveKnowledgeBase;

  constructor(knowledgeBase: FSSAIAdditiveKnowledgeBase = getFSSAIAdditiveKnowledgeBase()) {
    this.knowledgeBase = knowledgeBase;
  }

  /**
   * Check a list of additives against FSSAI regulations
   */
  async checkAdditives(
    ingredients: string[],
    options?: { foodCategory?: string },
  ): Promise<AdditiveCheckResult[]> {
    const results: AdditiveCheckResult[] = [];

    for (const ingredient of ingredients) {
      const trimmed = ingredient.trim();
      if (!trimmed) continue;

      try {
        const result = await this.checkSingleAdditive(trimmed, options);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        logger.warn("additive_check_failed", { ingredient: trimmed, error: String(error) });
      }
    }

    return results;
  }

  /**
   * Check a single additive against FSSAI regulations
   */
  async checkSingleAdditive(
    name: string,
    options?: { foodCategory?: string },
  ): Promise<AdditiveCheckResult | null> {
    // ── 1. INS number → FSSAI knowledge base → curated ingredient index → table
    const insNumber = this.extractINSNumber(name);
    if (insNumber) {
      const kbMatch = this.knowledgeBase.lookupByINS(insNumber);
      if (kbMatch) {
        // lookupByINS already normalizes the number before matching.
        return this.buildKnowledgeBaseResult(kbMatch, insNumber, "INS_EXACT", options);
      }

      const storeMatch = ingredientIndex.resolveByIns(insNumber);
      if (storeMatch?.isAdditive) {
        return this.buildStoreResult(storeMatch, insNumber);
      }

      const tableMatch = this.matchByINSNumber(insNumber);
      if (tableMatch) {
        return this.buildTableResult(tableMatch);
      }
    }

    // ── 2. E number → same INS-numbered lookup chain ─────────────────────────
    const eNumber = this.extractENumber(name);
    if (eNumber) {
      const kbMatch = this.knowledgeBase.lookupByINS(eNumber);
      if (kbMatch) {
        return this.buildKnowledgeBaseResult(kbMatch, eNumber, "INS_EXACT", options);
      }

      const storeMatch = ingredientIndex.resolveByE(`e${eNumber}`) ?? ingredientIndex.resolveByIns(eNumber);
      if (storeMatch?.isAdditive) {
        return this.buildStoreResult(storeMatch, eNumber);
      }

      const tableMatch = this.matchByINSNumber(eNumber);
      if (tableMatch) {
        return this.buildTableResult(tableMatch);
      }
    }

    // ── 3. Name → FSSAI knowledge base → curated ingredient index → table ────
    const kbNameMatch = this.knowledgeBase.lookupByName(name);
    if (kbNameMatch) {
      return this.buildKnowledgeBaseResult(
        kbNameMatch,
        kbNameMatch.insNumber ?? undefined,
        "NAME_EXACT",
        options,
      );
    }

    const aliasMatch = ingredientIndex.resolveByAlias(name);
    const canonicalMatch = ingredientIndex.resolveByCanonical(name);
    const storeMatch =
      (aliasMatch?.isAdditive ? aliasMatch : undefined) ??
      (canonicalMatch?.isAdditive ? canonicalMatch : undefined);
    if (storeMatch) {
      return this.buildStoreResult(storeMatch, storeMatch.insCode);
    }

    // 4. Curated fallback table (by name/synonym)
    const matchedByName = this.matchByName(name);
    if (matchedByName) {
      return this.buildTableResult(matchedByName);
    }

    return null;
  }

  /** Result from the curated ~40-additive fallback table (Appendix A references). */
  private buildTableResult(matched: { name: string; insNumber: string; synonyms: string[] }): AdditiveCheckResult {
    return {
      additiveName: matched.name,
      insNumber: matched.insNumber,
      status: "PERMITTED",
      confidence: "HIGH",
      sourceReferences: [
        { regulation: "Food Safety and Standards (Food Product Standards and Food Additives) Regulation, 2011", section: "Appendix A" }
      ],
      matchType: "HARDCODED_TABLE",
      needsReview: false,
      userStatus: "INSUFFICIENT_DATA",
      explanation:
        "The additive is listed in the FSSAI Food Additives Regulations (Appendix A), but the available product information is insufficient to confirm whether its use is permitted for this specific food product and quantity.",
    };
  }

  /**
   * Result from the 556-record FSSAI additive knowledge base.
   *
   * Presence in the KB is traceable but is NOT itself permission: the status
   * comes only from additive_permissions.json (each row backed by an explicit
   * FSSAI source table/rule). When no permission row exists, the result is
   * NOT_SPECIFIED + PERMISSION_REQUIRES_CATEGORY_DATA — never a guessed
   * "PERMITTED".
   */
  private buildKnowledgeBaseResult(
    record: AdditiveKBRecord,
    insNumber: string | undefined,
    matchType: AdditiveMatchType,
    options?: { foodCategory?: string },
  ): AdditiveCheckResult {
    const source = {
      document: record.source.document,
      ...(record.source.section ? { section: record.source.section } : {}),
      ...(record.source.table ? { table: record.source.table } : {}),
    };

    const permission = this.knowledgeBase.getCategoryPermission(insNumber, {
      name: record.name,
      foodCategory: options?.foodCategory,
    });

    const status = permission?.status ?? "NOT_SPECIFIED";
    const needsReview = permission
      ? status === "RESTRICTED" || status === "NOT_PERMITTED" || status === "UNCLEAR"
      : true;

    let userStatus: AdditiveUserStatus;
    let explanation: string;
    if (status === "PERMITTED") {
      userStatus = "PASS";
      explanation =
        "Permitted for the applicable food category/use conditions according to the available FSSAI reference.";
    } else if (status === "PERMITTED_WITH_CONDITIONS") {
      userStatus = "PASS";
      explanation =
        "Permitted subject to the conditions and maximum levels set out in the FSSAI reference for the applicable food category.";
    } else if (status === "RESTRICTED") {
      userStatus = "REVIEW";
      explanation =
        "Restricted by the FSSAI reference — the specific conditions under which this additive may be used could not be confirmed for this product.";
    } else if (status === "NOT_PERMITTED") {
      userStatus = "REVIEW";
      explanation =
        "Not permitted according to the FSSAI reference for the applicable category. Confirm whether the product falls within the scope of the prohibition.";
    } else if (status === "UNCLEAR") {
      userStatus = "REVIEW";
      explanation = "The applicable FSSAI reference is ambiguous for this additive and requires manual review.";
    } else {
      userStatus = "INSUFFICIENT_DATA";
      explanation =
        "An applicable FSSAI reference was found, but the available product information is insufficient to confirm the specific permitted use/level for this product.";
    }

    return {
      additiveName: record.name,
      insNumber,
      status,
      maximumLevel: permission?.maxLevel,
      unit: permission?.unit,
      conditions: permission?.conditions,
      foodCategory: permission?.foodCategory,
      confidence: record.confidence ?? "MEDIUM",
      sourceReferences: [
        {
          documentType: "FSSAI knowledge base (extracted)",
          regulation: record.source.document,
          section: record.source.section,
          table: record.source.table,
        },
      ],
      matchType,
      needsReview,
      permissionStatus: permission ? undefined : "PERMISSION_REQUIRES_CATEGORY_DATA",
      source: {
        ...source,
        ...(permission?.source?.section ? { section: permission.source.section } : {}),
        ...(permission?.source?.table ? { table: permission.source.table } : {}),
      },
      restrictions: permission?.restrictions,
      userStatus,
      explanation,
    };
  }

  /**
   * Result from the curated ingredient knowledge base (bundled seed).
   * The seed's regulatoryStatus is globally curated (FSSAI + EFSA + FDA), so a
   * non-PERMITTED status is flagged for review rather than asserted as a
   * definitive FSSAI determination.
   */
  private buildStoreResult(
    record: IngredientRecord,
    insNumber?: string,
  ): AdditiveCheckResult {
    const status = this.statusFromRegulatoryStatus(record.regulatoryStatus);
    const hasIssue = status === "RESTRICTED" || status === "NOT_PERMITTED" || status === "UNCLEAR";
    return {
      additiveName: record.canonicalName,
      insNumber: insNumber ?? record.insCode,
      status,
      conditions: record.regulatoryNotes,
      confidence: "MEDIUM",
      sourceReferences: [
        { documentType: "FoodGaurd curated ingredient knowledge base (bundled seed)" },
      ],
      matchType: "INGREDIENT_STORE",
      needsReview: status !== "PERMITTED",
      userStatus: hasIssue ? "REVIEW" : "INSUFFICIENT_DATA",
      explanation: hasIssue
        ? "The curated ingredient knowledge base records restrictions for this additive — confirm whether its use is permitted for this specific product."
        : "The additive is recorded in the curated ingredient knowledge base, but there is no category-specific FSSAI rule available to confirm whether its use is permitted for this product.",
    };
  }

  private statusFromRegulatoryStatus(status: RegulatoryStatus): AdditiveCheckResult["status"] {
    switch (status) {
      case "permitted":
        return "PERMITTED";
      case "restricted":
        return "RESTRICTED";
      case "banned":
        return "NOT_PERMITTED";
      case "under_review":
        return "UNCLEAR";
      default:
        return "NOT_SPECIFIED";
    }
  }

  /**
   * Match additive by INS number
   */
  private matchByINSNumber(insNumber: string): { name: string; insNumber: string; synonyms: string[] } | undefined {
    const normalized = insNumber.replace(/^0+/, ""); // Remove leading zeros
    for (const value of Object.values(ADDITIVE_SYNONYMS)) {
      if (value.insNumber === normalized || value.insNumber === insNumber) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Match additive by name/synonym
   */
  private matchByName(name: string): { name: string; insNumber: string; synonyms: string[] } | undefined {
    const normalized = this.normalizeAdditiveName(name);

    for (const value of Object.values(ADDITIVE_SYNONYMS)) {
      // Check main name
      if (this.normalizeAdditiveName(value.name) === normalized) {
        return value;
      }

      // Check synonyms
      for (const synonym of value.synonyms) {
        if (this.normalizeAdditiveName(synonym) === normalized) {
          return value;
        }
      }
    }
    return undefined;
  }

  /**
   * Normalize additive name for lookup
   */
  private normalizeAdditiveName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Extract INS number from ingredient text if present.
   * Preserves sub-classifications ("INS 160c", "INS 160a(i)") so distinct
   * additives are never conflated (160c must not resolve to Carotenes/160a).
   */
  extractINSNumber(text: string): string | null {
    // Match patterns like "INS 100" or "INS100" or "(INS 100)"
    const insMatch = text.match(/INS\s*(\d+[a-z]?(?:\(?(?:i{1,3}|iv|v|vi{0,3})\)?)?)/i);
    if (insMatch) {
      return insMatch[1];
    }

    // Match patterns like "(100)" at end of ingredient name
    const parenMatch = text.match(/\((\d+[a-z]?(?:\(?(?:i{1,3}|iv|v|vi{0,3})\)?)?)\)\s*$/);
    if (parenMatch) {
      return parenMatch[1];
    }

    // Match patterns like "Colour 160c" / "Color (160c)" (common on labels)
    const colourMatch = text.match(/(?:colour|color)\s*\(?\s*(\d+[a-z]?(?:\(?(?:i{1,3}|iv|v|vi{0,3})\)?)?)\s*\)?/i);
    if (colourMatch) {
      return colourMatch[1];
    }

    return null;
  }

  /**
   * Extract E number from ingredient text if present
   */
  extractENumber(text: string): string | null {
    // Match patterns like "E100" or "E 100" or "(E100)"
    const eMatch = text.match(/E\s*(\d+[a-z]?)/i);
    if (eMatch) {
      return eMatch[1];
    }
    return null;
  }

  /**
   * Get all known additives with INS numbers
   */
  getAllKnownAdditives(): Array<{ name: string; insNumber: string; synonyms: string[] }> {
    return Object.values(ADDITIVE_SYNONYMS);
  }
}
