/**
 * FSSAI Special Food Checker
 *
 * Checks special food regulations (gluten-free, organic, vegan, infant
 * nutrition, nutraceuticals, etc.) using the extracted FSSAI knowledge base
 * (special_food_rules.json, 1983 rules).
 *
 * Design:
 *  - Rules are loaded ONCE and cached in memory (precomputed map pattern).
 *  - Only rules with clear food-category keywords are indexed — noise fragments
 *    ("It", "and", "the same") are excluded to keep the index precise.
 *  - Fallback: when no KB rules match, the checker returns hardcoded special
 *    food category rules (gluten-free, organic, vegan, fortified) as a safety
 *    net. These are well-known FSSAI regulatory categories.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { logger } from "@/lib/logger";
import type { RegulatorySource, SpecialFoodCheckResult } from "./types";

interface SpecialFoodRule {
  category: string;
  requirement: string;
  source: { document: string };
}

/** Indexed, validated rule from the KB. */
interface IndexedSpecialFoodRule {
  category: string;
  requirement: string;
  source: RegulatorySource;
  /** Lowercased keywords extracted from the category for matching. */
  keywords: string[];
}

const FSSAI_DIR = join(process.cwd(), "fssai-knowledge-base");
const SPECIAL_FOOD_RULES_FILE = "special_food_rules.json";

/** Noise tokens that indicate the rule is not a real food-category rule. */
const NOISE_PATTERNS = [
  /^\d+$/,                    // pure numbers
  /^(it|they|the|and|or|not|this|that|which|there|its)$/i, // pronouns
  /shall come into force/i,   // enforcement clauses
  /official gazette/i,        // publication clauses
];

/** Food-category keywords that signal a rule is about a specific food type. */
const FOOD_CATEGORY_KEYWORDS = [
  "food", "beverage", "milk", "water", "oil", "meat", "fish", "egg",
  "fruit", "vegetable", "grain", "cereal", "spice", "salt", "sugar",
  "honey", "chocolate", "candy", "snack", "biscuit", "bread", "noodle",
  "ice cream", "cheese", "butter", "yogurt", "juice", "tea", "coffee",
  "wine", "beer", "spirit", "infant", "baby", "nutraceutical", "supplement",
  "fortif", "organic", "vegan", "gluten", "alcohol", "gin", "rum", "whisky",
  "vodka", "confection", "frozen", "fat", "fat spread", "condiment",
  "relish", "pickle", "chutney", "sauce", "vinegar", "starch",
];

/** Hardcoded fallback rules for well-known FSSAI special food categories. */
const FALLBACK_RULES: IndexedSpecialFoodRule[] = [
  {
    category: "Gluten-Free Food",
    requirement: "Must contain less than 20ppm gluten as per FSSAI regulations",
    source: { regulation: "FSSAI (Labelling and Display) Regulations, 2020" },
    keywords: ["gluten"],
  },
  {
    category: "Organic Food",
    requirement: "Must be certified organic as per FSSAI (Organic Foods) Regulations, 2017",
    source: { regulation: "FSSAI (Organic Foods) Regulations, 2017" },
    keywords: ["organic"],
  },
  {
    category: "Vegan Food",
    requirement: "Must not contain any animal-derived ingredients as per FSSAI (Vegan Foods) Regulations, 2022",
    source: { regulation: "FSSAI (Vegan Foods) Regulations, 2022" },
    keywords: ["vegan"],
  },
  {
    category: "Fortified Food",
    requirement: "Must meet FSSAI fortification standards as per FSSAI (Fortification of Foods) Regulations, 2018",
    source: { regulation: "FSSAI (Fortification of Foods) Regulations, 2018" },
    keywords: ["fortified"],
  },
  {
    category: "Infant Food",
    requirement: "Must comply with FSSAI (Packaging and Labelling) and infant nutrition regulations",
    source: { regulation: "FSSAI (Infant Nutrition) Regulations" },
    keywords: ["infant", "baby"],
  },
  {
    category: "Nutraceutical / Health Supplement",
    requirement: "Must comply with FSSAI (Nutraceuticals, Health Supplements, etc.) Regulations, 2016",
    source: { regulation: "FSSAI (Nutraceuticals, Health Supplements, Foods for Special Dietary Uses, Foods for Special Medical Purposes, Functional Food and Novel Food) Regulations, 2016" },
    keywords: ["nutraceutical", "health supplement", "dietary supplement"],
  },
  {
    category: "Alcoholic Beverage",
    requirement: "Must comply with FSSAI Alcoholic Beverages Regulations; labelling must include alcohol content",
    source: { regulation: "FSSAI (Alcoholic Beverages) Regulations, 2018" },
    keywords: ["alcoholic", "wine", "beer", "spirit", "gin", "rum", "whisky", "vodka"],
  },
  {
    category: "Proprietary Food",
    requirement: "Must not represent an existing standardized food category; must carry 'proprietary food' declaration",
    source: { regulation: "FSSAI (Food Product Standards and Food Additives) Regulations, 2011" },
    keywords: ["proprietary"],
  },
];

export class SpecialFoodChecker {
  private rules: IndexedSpecialFoodRule[] = [];
  private loaded = false;
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? FSSAI_DIR;
  }

  private loadFromDisk(): void {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const rulesPath = join(this.dir, SPECIAL_FOOD_RULES_FILE);
      if (!existsSync(rulesPath)) {
        logger.warn("fssai_special_food_rules_missing", { path: rulesPath });
        this.rules = [...FALLBACK_RULES];
        return;
      }

      const raw = JSON.parse(readFileSync(rulesPath, "utf-8")) as unknown;
      if (!Array.isArray(raw)) {
        this.rules = [...FALLBACK_RULES];
        return;
      }

      let indexed = 0;
      for (const item of raw) {
        const record = item as SpecialFoodRule;
        const category = (record.category ?? "").replace(/\n/g, " ").trim();
        const requirement = (record.requirement ?? "").replace(/\n/g, " ").trim();

        if (!category || !requirement) continue;
        if (category.length > 200) continue;
        if (NOISE_PATTERNS.some((p) => p.test(category))) continue;

        const lowerCategory = category.toLowerCase();
        const hasFoodKeyword = FOOD_CATEGORY_KEYWORDS.some((kw) =>
          lowerCategory.includes(kw),
        );
        if (!hasFoodKeyword) continue;

        const keywords = lowerCategory.split(/\s+/).filter((w) => w.length > 2);

        this.rules.push({
          category,
          requirement,
          source: { regulation: record.source?.document ?? "FSSAI Regulations" },
          keywords,
        });
        indexed += 1;
      }

      // Merge fallback rules if no KB rules match certain fallback keywords
      for (const fb of FALLBACK_RULES) {
        const alreadyCovered = this.rules.some((r) =>
          r.keywords.some((k) => fb.keywords.includes(k)),
        );
        if (!alreadyCovered) {
          this.rules.push(fb);
        }
      }

      logger.info("fssai_special_food_rules_indexed", {
        total: raw.length,
        indexed,
        fallback: FALLBACK_RULES.length,
      });
    } catch (error) {
      logger.error("fssai_special_food_rules_load_failed", { error: String(error) });
      this.rules = [...FALLBACK_RULES];
    }
  }

  /**
   * Check special food rules for a category.
   *
   * Uses both the extracted KB rules and hardcoded fallback rules for
   * well-known FSSAI special food categories (gluten-free, organic, vegan,
   * fortified, infant, nutraceutical, alcoholic, proprietary).
   */
  async checkSpecialRules(
    category?: string,
  ): Promise<SpecialFoodCheckResult[]> {
    this.loadFromDisk();

    if (!category) return [];

    const normalizedCategory = category.toLowerCase();
    const results: SpecialFoodCheckResult[] = [];
    const seen = new Set<string>();

    for (const rule of this.rules) {
      const matches = rule.keywords.some((kw) =>
        normalizedCategory.includes(kw),
      );
      if (!matches) continue;

      const key = `${rule.category}|${rule.requirement}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        category: rule.category,
        requirement: rule.requirement,
        conditions: rule.requirement,
        exceptions: [],
        sourceReferences: [rule.source],
      });
    }

    return results;
  }
}
