/**
 * Ingredient Concern Evidence Database
 *
 * Centralized evidence-backed database for ingredients that may raise
 * dietary or health concerns. Each entry is based on regulatory guidance
 * and scientific literature.
 *
 * This is NOT a toxicity database. It classifies ingredients based on
 * available evidence and regulatory status.
 */

export type IngredientConcernEntry = {
  ingredient: string;
  aliases: string[];
  category: string;
  riskLevel: "low" | "moderate" | "high";
  evidenceLevel: "limited" | "moderate" | "strong";
  reason: string;
  regulatoryStatus: string;
  sources: string[];
};

/**
 * Evidence-backed ingredient concern database.
 * Order matters: first match wins.
 */
export const INGREDIENT_CONCERNS_DB: IngredientConcernEntry[] = [
  // ── Artificial Sweeteners ──
  {
    ingredient: "aspartame",
    aliases: ["e951", "nutrasweet", "equal"],
    category: "artificial_sweetener",
    riskLevel: "moderate",
    evidenceLevel: "strong",
    reason: "IARC classifies aspartame as possibly carcinogenic (Group 2B). WHO/FAO JECFA maintains the current ADI. Some individuals may have sensitivity.",
    regulatoryStatus: "Permitted within ADI limits",
    sources: ["WHO/IARC Monograph Vol 134", "JECFA 113th meeting", "FSSAI FSAI-2019-12"],
  },
  {
    ingredient: "sucralose",
    aliases: ["e955", "splenda"],
    category: "artificial_sweetener",
    riskLevel: "moderate",
    evidenceLevel: "moderate",
    reason: "Some studies suggest potential effects on gut microbiome. Regulatory bodies permit use within ADI. Limited long-term human studies.",
    regulatoryStatus: "Permitted within ADI limits",
    sources: ["EFSA ANS Panel 2023", "FDA GRAS notice"],
  },
  {
    ingredient: "acesulfame potassium",
    aliases: ["acesulfame k", "ace-k", "e950"],
    category: "artificial_sweetener",
    riskLevel: "low",
    evidenceLevel: "moderate",
    reason: "Generally recognized as safe within established ADI limits. Some concerns about combined sweetener effects.",
    regulatoryStatus: "Permitted within ADI limits",
    sources: ["FDA 21 CFR 172.800", "JECFA 69th meeting"],
  },
  {
    ingredient: "saccharin",
    aliases: ["e954", "sweet n low"],
    category: "artificial_sweetener",
    riskLevel: "moderate",
    evidenceLevel: "moderate",
    reason: "Historical bladder cancer concerns in animals have been largely dismissed in humans, but limited long-term data available.",
    regulatoryStatus: "Permitted within ADI limits",
    sources: ["JECFA 55th meeting", "FDA 21 CFR 180.37"],
  },

  // ── Artificial Colours ──
  {
    ingredient: "tartrazine",
    aliases: ["e102", "yellow 5", "fd&c yellow 5"],
    category: "artificial_colour",
    riskLevel: "moderate",
    evidenceLevel: "strong",
    reason: "Associated with hyperactivity in some children (Southampton study). Required warning label in EU. May cause allergic reactions in sensitive individuals.",
    regulatoryStatus: "Permitted with warning label in EU",
    sources: ["EFSA 2009 re-evaluation", "Southampton University Study 2007"],
  },
  {
    ingredient: "sunset yellow",
    aliases: ["e110", "orange yellow s", "fd&c yellow 6"],
    category: "artificial_colour",
    riskLevel: "moderate",
    evidenceLevel: "strong",
    reason: "Associated with hyperactivity in children. Required warning label in EU. May cause allergic reactions.",
    regulatoryStatus: "Permitted with warning label in EU",
    sources: ["EFSA 2014 re-evaluation", "Southampton University Study 2007"],
  },
  {
    ingredient: "allura red",
    aliases: ["e129", "fd&c red 40", "red 40"],
    category: "artificial_colour",
    riskLevel: "moderate",
    evidenceLevel: "strong",
    reason: "Associated with hyperactivity in children. Some studies suggest potential genotoxicity. Required warning label in EU.",
    regulatoryStatus: "Permitted with warning label in EU",
    sources: ["EFSA 2014 re-evaluation", "Southampton University Study 2007"],
  },
  {
    ingredient: "brilliant blue",
    aliases: ["e133", "fd&c blue 1", "blue 1"],
    category: "artificial_colour",
    riskLevel: "low",
    evidenceLevel: "limited",
    reason: "Generally considered safe within permitted limits. Limited evidence of concerns at typical consumption levels.",
    regulatoryStatus: "Permitted",
    sources: ["FDA GRAS", "JECFA 23rd meeting"],
  },
  {
    ingredient: "ponceau 4r",
    aliases: ["e124", "cochineal red a", "new coccine"],
    category: "artificial_colour",
    riskLevel: "moderate",
    evidenceLevel: "moderate",
    reason: "Associated with hyperactivity in children. Required warning label in EU. Not permitted in USA.",
    regulatoryStatus: "Permitted with warning label in EU; banned in USA",
    sources: ["EFSA 2014 re-evaluation", "Southampton University Study 2007"],
  },

  // ── Preservatives ──
  {
    ingredient: "sodium nitrite",
    aliases: ["e250", "nitrite"],
    category: "preservative",
    riskLevel: "moderate",
    evidenceLevel: "strong",
    reason: "Can form nitrosamines (potentially carcinogenic) under certain conditions. Regulated tightly. Permitted in cured meats.",
    regulatoryStatus: "Permitted within limits",
    sources: ["WHO/IARC Monograph Vol 17", "JECFA 73rd meeting", "FSSAI regulations"],
  },
  {
    ingredient: "sodium benzoate",
    aliases: ["e211"],
    category: "preservative",
    riskLevel: "low",
    evidenceLevel: "moderate",
    reason: "Can form benzene when combined with vitamin C (ascorbic acid) under heat/UV. Permitted within limits.",
    regulatoryStatus: "Permitted within limits",
    sources: ["FDA 21 CFR 184.1733", "EFSA re-evaluation 2016"],
  },
  {
    ingredient: "potassium sorbate",
    aliases: ["e202"],
    category: "preservative",
    riskLevel: "low",
    evidenceLevel: "limited",
    reason: "Generally recognized as safe. Widely used in food preservation. Limited evidence of concerns at permitted levels.",
    regulatoryStatus: "Permitted",
    sources: ["FDA GRAS", "JECFA 23rd meeting"],
  },

  // ── Emulsifiers ──
  {
    ingredient: "polysorbate 80",
    aliases: ["e433", "tween 80"],
    category: "emulsifier",
    riskLevel: "moderate",
    evidenceLevel: "limited",
    reason: "Some animal studies suggest potential effects on gut microbiome. Limited human data. Generally recognized as safe.",
    regulatoryStatus: "Permitted",
    sources: ["EFSA 2018 re-evaluation", "FDA GRAS"],
  },
  {
    ingredient: "sodium stearoyl lactylate",
    aliases: ["e481", "ssl"],
    category: "emulsifier",
    riskLevel: "low",
    evidenceLevel: "limited",
    reason: "Generally recognized as safe. Widely used in baking. Limited evidence of concerns.",
    regulatoryStatus: "Permitted",
    sources: ["FDA GRAS", "JECFA 17th meeting"],
  },
  {
    ingredient: "mono and diglycerides",
    aliases: ["e471", "mono- and diglycerides of fatty acids"],
    category: "emulsifier",
    riskLevel: "low",
    evidenceLevel: "limited",
    reason: "Generally recognized as safe. Common emulsifier derived from fats. Limited evidence of concerns.",
    regulatoryStatus: "Permitted",
    sources: ["FDA GRAS", "JECFA 23rd meeting"],
  },

  // ── Flavor Enhancers ──
  {
    ingredient: "monosodium glutamate",
    aliases: ["msg", "e621", "glutamic acid"],
    category: "flavor_enhancer",
    riskLevel: "low",
    evidenceLevel: "strong",
    reason: "Extensive research shows MSG is safe at normal consumption levels. 'Chinese restaurant syndrome' claims not supported by controlled studies. Glutamate is naturally present in many foods.",
    regulatoryStatus: "Permitted; GRAS",
    sources: ["JECFA 73rd meeting", "FDA GRAS", "EFSA 2017 re-evaluation"],
  },
  {
    ingredient: "disodium inosinate",
    aliases: ["e631"],
    category: "flavor_enhancer",
    riskLevel: "low",
    evidenceLevel: "limited",
    reason: "Nucleotide flavor enhancer. Generally recognized as safe. Usually combined with MSG.",
    regulatoryStatus: "Permitted",
    sources: ["JECFA", "FSSAI regulations"],
  },
  {
    ingredient: "disodium guanylate",
    aliases: ["e627"],
    category: "flavor_enhancer",
    riskLevel: "low",
    evidenceLevel: "limited",
    reason: "Nucleotide flavor enhancer. Generally recognized as safe. Avoid if you have gout (purine content).",
    regulatoryStatus: "Permitted",
    sources: ["JECFA", "FSSAI regulations"],
  },

  // ── Trans Fats / Partially Hydrogenated ──
  {
    ingredient: "partially hydrogenated",
    aliases: ["partially hydrogenated oil", "pho"],
    category: "trans_fat_source",
    riskLevel: "high",
    evidenceLevel: "strong",
    reason: "Contains industrially produced trans fats. WHO recommends global elimination. Associated with increased cardiovascular disease risk. Banned or restricted in many countries.",
    regulatoryStatus: "Banned/restricted in many countries; limited permits remain",
    sources: ["WHO REPLACE initiative 2018", "FDA 2018 ban", "EFSA 2019"],
  },
  {
    ingredient: "hydrogenated vegetable oil",
    aliases: ["hvo"],
    category: "trans_fat_source",
    riskLevel: "high",
    evidenceLevel: "strong",
    reason: "May contain trans fats depending on degree of hydrogenation. WHO recommends eliminating industrially produced trans fats.",
    regulatoryStatus: "Restricted in many countries",
    sources: ["WHO REPLACE initiative 2018", "FDA 2018 ban"],
  },

  // ── Refined Sugars ──
  {
    ingredient: "high fructose corn syrup",
    aliases: ["hfcs", "hfcs-55", "hfcs-42", "glucose-fructose syrup"],
    category: "refined_sugar",
    riskLevel: "moderate",
    evidenceLevel: "moderate",
    reason: "Highly refined sweetener associated with increased consumption patterns. Excessive intake linked to metabolic concerns. WHO recommends limiting free sugars.",
    regulatoryStatus: "Permitted; WHO recommends limiting intake",
    sources: ["WHO 2015 guideline on sugars", "EFSA 2018 opinion"],
  },
  {
    ingredient: "inverted sugar",
    aliases: ["invert sugar syrup", "invert syrup"],
    category: "refined_sugar",
    riskLevel: "low",
    evidenceLevel: "limited",
    reason: "Refined sugar product. Essentially glucose + fructose. Subject to same dietary considerations as other added sugars.",
    regulatoryStatus: "Permitted",
    sources: ["WHO 2015 guideline on sugars"],
  },

  // ── Antioxidants / Preservatives ──
  {
    ingredient: "tbhq",
    aliases: ["tert-butylhydroquinone", "e319"],
    category: "antioxidant_preservative",
    riskLevel: "low",
    evidenceLevel: "moderate",
    reason: "Synthetic antioxidant. Permitted within strict limits. Some animal studies at very high doses, but safe at permitted food levels.",
    regulatoryStatus: "Permitted within limits",
    sources: ["FDA 21 CFR 182.3173", "JECFA 40th meeting"],
  },
  {
    ingredient: "butylated hydroxyanisole",
    aliases: ["bha", "e320"],
    category: "antioxidant_preservative",
    riskLevel: "moderate",
    evidenceLevel: "moderate",
    reason: "IARC classifies BHA as possibly carcinogenic (Group 2B). Regulatory bodies permit use within limits. Limited human evidence.",
    regulatoryStatus: "Permitted within limits",
    sources: ["IARC Monograph Vol 40", "FDA 21 CFR 182.3164"],
  },
  {
    ingredient: "butylated hydroxytoluene",
    aliases: ["bht", "e321"],
    category: "antioxidant_preservative",
    riskLevel: "low",
    evidenceLevel: "moderate",
    reason: "Synthetic antioxidant. Generally recognized as safe within permitted levels. Some limited concerns at very high doses.",
    regulatoryStatus: "Permitted",
    sources: ["FDA GRAS", "JECFA 32nd meeting"],
  },

  // ── Nutrients ──
  {
    ingredient: "caffeine",
    aliases: [],
    category: "stimulant",
    riskLevel: "low",
    evidenceLevel: "strong",
    reason: "Natural stimulant. Safe within recommended daily limits (400mg for adults). May cause sleep disturbance or anxiety in sensitive individuals.",
    regulatoryStatus: "Permitted; labeling required in some jurisdictions",
    sources: ["EFSA 2015 opinion", "FDA"],
  },

  // ── Colour additives ──
  {
    ingredient: "caramel colour",
    aliases: ["e150a", "e150b", "e150c", "e150d", "plain caramel", "caustic sulphite caramel", "ammonia caramel", "sulphite ammonia caramel"],
    category: "colour",
    riskLevel: "low",
    evidenceLevel: "moderate",
    reason: "Type IV (sulphite ammonia caramel) contains 4-MEI which is classified as possibly carcinogenic. Most caramel colour in beverages is Type IV. Levels vary by manufacturer.",
    regulatoryStatus: "Permitted; 4-MEI limits in California",
    sources: ["IARC Monograph Vol 40 (4-MEI)", "California Proposition 65"],
  },
];

/**
 * Look up ingredient concern by name (case-insensitive, fuzzy).
 * Returns the first matching entry or null.
 */
export function lookupIngredientConcern(
  ingredientName: string,
): IngredientConcernEntry | null {
  const lower = ingredientName.toLowerCase().trim();
  for (const entry of INGREDIENT_CONCERNS_DB) {
    if (entry.ingredient.toLowerCase() === lower) return entry;
    if (entry.aliases.some((alias) => alias.toLowerCase() === lower)) return entry;
    // Partial match for multi-word ingredients
    if (lower.includes(entry.ingredient.toLowerCase())) return entry;
  }
  return null;
}
