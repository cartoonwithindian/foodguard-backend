import type { ProductCategory } from "./mock-data";
import type { AssessmentLevel, ProductAnalysisResult } from "./analysis-data";

export type HistoryItem = {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  barcode: string;
  scannedAt: string;
  assessment: AssessmentLevel;
  score: number;
  analysis: ProductAnalysisResult;
};

export type HistoryFilter = {
  assessment: "all" | AssessmentLevel;
  category: "all" | ProductCategory;
  dateRange: "all" | "recent" | "older";
};

const MOCK_HISTORY: HistoryItem[] = [
  {
    id: "hist-001",
    name: "GlowCare Face Wash",
    brand: "GlowCare",
    category: "cosmetics",
    barcode: "8901234567890",
    scannedAt: "2026-08-09",
    assessment: "moderate",
    score: 62,
    analysis: {
      id: "prod-001",
      name: "GlowCare Face Wash",
      brand: "GlowCare",
      category: "cosmetics",
      barcode: "8901234567890",
      scanDate: "2026-08-09",
      assessment: "moderate",
      assessmentDescription:
        "Some aspects of this product deserve closer attention based on its ingredient profile. While generally safe for most users, certain ingredients may warrant consideration for sensitive individuals.",
      score: 62,
      positivePoints: [
        { text: "Contains glycerin — effective humectant for skin hydration" },
        { text: "Citric acid as pH adjuster is generally well-tolerated" },
        { text: "Phenoxyethanol is a widely accepted preservative at low concentrations" },
      ],
      attentionPoints: [
        { name: "Sodium Lauryl Sulfate (SLS)", reason: "Known skin irritant that may cause dryness or discomfort with repeated use", severity: "high" },
        { name: "Methylparaben", reason: "Preservative with potential endocrine disruption concerns under review by regulatory bodies", severity: "moderate" },
        { name: "Fragrance / Parfum", reason: "Proprietary blend that may contain allergens not individually disclosed", severity: "moderate" },
      ],
      ingredients: [
        { name: "Water (Aqua)", function: "Solvent / Base", assessment: "low", explanation: "Primary solvent used as the base for the formulation. No concerns identified.", evidence: "Widely recognized as safe for topical use.", source: "EWG Skin Deep Database" },
        { name: "Sodium Lauryl Sulfate", function: "Surfactant", assessment: "high", explanation: "A strong surfactant that creates foam but can strip natural oils from the skin.", evidence: "The AAD notes SLS may aggravate skin conditions.", source: "Journal of the American Academy of Dermatology" },
        { name: "Glycerin", function: "Humectant", assessment: "low", explanation: "A natural humectant that draws moisture to the skin.", evidence: "Consistently rated as safe and effective.", source: "International Journal of Cosmetic Science" },
        { name: "Fragrance (Parfum)", function: "Scent", assessment: "moderate", explanation: "A proprietary blend that may contain undisclosed allergens.", evidence: "Some fragrance components identified as potential allergens.", source: "Contact Dermatitis Journal" },
        { name: "Citric Acid", function: "pH Adjuster", assessment: "low", explanation: "Naturally occurring acid used to adjust product pH.", evidence: "Generally recognized as safe.", source: "CosIng Database (EU)" },
        { name: "Methylparaben", function: "Preservative", assessment: "moderate", explanation: "Effective preservative with endocrine disruption concerns.", evidence: "EU has restricted certain concentrations.", source: "EU SCCS Opinion on Parabens" },
        { name: "Phenoxyethanol", function: "Preservative", assessment: "low", explanation: "Common preservative used at low concentrations.", evidence: "Rated safe at concentrations up to 1%.", source: "Cosmetic Ingredient Review" },
      ],
      alternativeSuggestions: [
        { title: "Sulfate-Free Cleansers", description: "Look for products using coco-glucoside or decyl glucoside as gentler surfactant alternatives." },
        { title: "Fragrance-Free Formulations", description: "Choose products labeled 'fragrance-free' rather than 'unscented'." },
        { title: "Paraben-Free Preservative Systems", description: "Products using phenoxyethanol, sodium benzoate, or potassium sorbate." },
      ],
      evidenceSources: [
        { sourceName: "EWG Skin Deep Database", sourceType: "Ingredient Safety Database", summary: "Comprehensive database rating cosmetic ingredients." },
        { sourceName: "EU Scientific Committee on Consumer Safety", sourceType: "Regulatory Body", summary: "Provides scientific opinions on cosmetic ingredient safety." },
      ],
    },
  },
  {
    id: "hist-002",
    name: "OatPlus Protein Bar",
    brand: "OatPlus",
    category: "food",
    barcode: "8901234567891",
    scannedAt: "2026-08-09",
    assessment: "low",
    score: 88,
    analysis: {
      id: "prod-002",
      name: "OatPlus Protein Bar",
      brand: "OatPlus",
      category: "food",
      barcode: "8901234567891",
      scanDate: "2026-08-09",
      assessment: "low",
      assessmentDescription: "No major concerns were identified. This product has a relatively clean ingredient profile.",
      score: 88,
      positivePoints: [
        { text: "Good protein content from whole grain oats" },
        { text: "No artificial colors or flavors" },
        { text: "Contains essential vitamins (B12) and minerals (Iron)" },
      ],
      attentionPoints: [{ name: "Added Sugar", amount: "8g per bar", reason: "Contains added sugar, though moderate for a protein bar", severity: "low" }],
      ingredients: [
        { name: "Oats", function: "Whole Grain", assessment: "low", explanation: "Primary ingredient providing complex carbohydrates and fiber.", evidence: "Recognized as heart-healthy by the FDA.", source: "USDA FoodData Central" },
        { name: "Soy Lecithin", function: "Emulsifier", assessment: "low", explanation: "Natural emulsifier derived from soybeans.", evidence: "Generally recognized as safe.", source: "FDA GRAS Notices" },
        { name: "Sugar", function: "Sweetener", assessment: "low", explanation: "Provides sweetness in moderate amounts.", evidence: "WHO recommends limiting free sugar intake.", source: "WHO Guidelines" },
      ],
      alternativeSuggestions: [
        { title: "Lower Sugar Options", description: "Look for protein bars with less than 5g of added sugar." },
      ],
      evidenceSources: [
        { sourceName: "USDA FoodData Central", sourceType: "Government Database", summary: "Comprehensive nutrient data for foods." },
      ],
      nutrition: { calories: 250, sugar: "8g", sodium: "180mg", saturatedFat: "2g", protein: "15g", fibre: "4g", servingSize: "1 bar (60g)" },
    },
  },
  {
    id: "hist-003",
    name: "FreshGlow Shampoo",
    brand: "FreshGlow",
    category: "personal_care",
    barcode: "8901234567892",
    scannedAt: "2026-08-08",
    assessment: "high",
    score: 35,
    analysis: {
      id: "prod-003",
      name: "FreshGlow Shampoo",
      brand: "FreshGlow",
      category: "personal_care",
      barcode: "8901234567892",
      scanDate: "2026-08-08",
      assessment: "high",
      assessmentDescription: "Several ingredients may warrant closer attention. Consider reviewing the full ingredient list.",
      score: 35,
      positivePoints: [{ text: "Contains phenoxyethanol as a widely accepted preservative" }],
      attentionPoints: [
        { name: "SLS + SLES Combination", reason: "Dual sulfate surfactants increase irritation risk", severity: "high" },
        { name: "Formaldehyde Releasers", reason: "Releases small amounts of formaldehyde, classified as a known carcinogen", severity: "high" },
        { name: "Parabens", reason: "Endocrine disruption concerns documented in multiple studies", severity: "high" },
      ],
      ingredients: [
        { name: "Sodium Laureth Sulfate (SLES)", function: "Surfactant", assessment: "moderate", explanation: "Foaming agent gentler than SLS but still potentially irritating.", evidence: "EU regulations require 1,4-dioxane levels below 10ppm.", source: "EU Cosmetics Regulation" },
        { name: "Sodium Lauryl Sulfate (SLS)", function: "Surfactant", assessment: "high", explanation: "Strong surfactant with well-documented irritation potential.", evidence: "Multiple clinical studies confirm irritant potential.", source: "Contact Dermatitis Journal" },
        { name: "Parabens (Mixed)", function: "Preservative", assessment: "high", explanation: "Group of preservatives with potential endocrine interaction.", evidence: "EU has restricted certain paraben types.", source: "FDA Paraben Safety Assessment" },
        { name: "DMDM Hydantoin", function: "Preservative", assessment: "high", explanation: "Releases formaldehyde as a preservative mechanism.", evidence: "IARC classifies formaldehyde as Group 1 carcinogen.", source: "IARC Monographs" },
      ],
      alternativeSuggestions: [
        { title: "Sulfate-Free Shampoos", description: "Look for cocamidopropyl betaine or coco-glucoside as primary surfactants." },
        { title: "Paraben-Free Products", description: "Choose products preserved with phenoxyethanol or potassium sorbate." },
      ],
      evidenceSources: [
        { sourceName: "IARC Monographs", sourceType: "International Research Agency", summary: "Comprehensive evaluations of carcinogenic risks." },
        { sourceName: "EU Cosmetics Regulation", sourceType: "Regulatory Framework", summary: "EU regulation governing cosmetic product safety." },
      ],
    },
  },
  {
    id: "hist-004",
    name: "NatureBest Orange Juice",
    brand: "NatureBest",
    category: "food",
    barcode: "8901234567893",
    scannedAt: "2026-08-08",
    assessment: "low",
    score: 92,
    analysis: {
      id: "prod-004",
      name: "NatureBest Orange Juice",
      brand: "NatureBest",
      category: "food",
      barcode: "8901234567893",
      scanDate: "2026-08-08",
      assessment: "low",
      assessmentDescription: "Clean ingredient profile with no significant concerns. Good source of Vitamin C.",
      score: 92,
      positivePoints: [
        { text: "Good source of Vitamin C (ascorbic acid)" },
        { text: "No artificial colors or flavors" },
        { text: "Low sodium content" },
      ],
      attentionPoints: [{ name: "Natural Sugars", amount: "22g per serving", reason: "Naturally occurring fruit sugars", severity: "low" }],
      ingredients: [
        { name: "Orange Juice", function: "Base Ingredient", assessment: "low", explanation: "Primary ingredient. Reconstituted orange juice from concentrate.", evidence: "Standard processing method.", source: "USDA Food Standards" },
        { name: "Ascorbic Acid (Vitamin C)", function: "Nutrient", assessment: "low", explanation: "Added as nutritional supplement and preservative.", evidence: "Essential nutrient with established daily recommendations.", source: "National Institutes of Health" },
      ],
      alternativeSuggestions: [{ title: "Lower Sugar Options", description: "Consider whole fruit or low-sugar juice blends." }],
      evidenceSources: [{ sourceName: "USDA FoodData Central", sourceType: "Government Database", summary: "Comprehensive nutrient data for foods." }],
      nutrition: { calories: 110, sugar: "22g", sodium: "0mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "8 fl oz (240ml)" },
    },
  },
  {
    id: "hist-005",
    name: "CleanHome Floor Cleaner",
    brand: "CleanHome",
    category: "household",
    barcode: "8901234567894",
    scannedAt: "2026-08-07",
    assessment: "moderate",
    score: 45,
    analysis: {
      id: "prod-005",
      name: "CleanHome Floor Cleaner",
      brand: "CleanHome",
      category: "household",
      barcode: "8901234567894",
      scanDate: "2026-08-07",
      assessment: "moderate",
      assessmentDescription: "Some ingredients deserve attention. Consider ventilation during use.",
      score: 45,
      positivePoints: [
        { text: "Effective cleaning surfactant system" },
        { text: "Potassium sorbate is a low-concern preservative" },
      ],
      attentionPoints: [
        { name: "Triclosan", reason: "Banned in consumer hand soaps by FDA (2016). Potential endocrine disruptor", severity: "high" },
        { name: "SLS", reason: "Skin irritant — wear gloves during extended use", severity: "moderate" },
        { name: "Fragrance", reason: "May cause respiratory sensitivity in enclosed spaces", severity: "moderate" },
      ],
      ingredients: [
        { name: "Water", function: "Solvent", assessment: "low", explanation: "Base solvent for the cleaning solution.", evidence: "No concerns.", source: "General safety data" },
        { name: "Triclosan", function: "Antimicrobial Agent", assessment: "high", explanation: "Banned in consumer hand soaps. Persists in the environment.", evidence: "FDA Final Rule on Antiseptic Wash Products (2016).", source: "FDA Antiseptic Wash Products Rule" },
        { name: "Sodium Benzoate", function: "Preservative", assessment: "moderate", explanation: "May form trace benzene when combined with vitamin C.", evidence: "FDA studies indicate levels are generally safe.", source: "FDA Benzene in Soft Drinks Report" },
      ],
      alternativeSuggestions: [
        { title: "Triclosan-Free Products", description: "Choose cleaners without antimicrobial agents." },
        { title: "Plant-Based Surfactants", description: "Look for coconut-derived or plant-based cleaning agents." },
      ],
      evidenceSources: [
        { sourceName: "FDA Final Rule on Antiseptic Wash Products", sourceType: "Government Regulation", summary: "2016 ruling banning triclosan in consumer antiseptic wash products." },
      ],
    },
  },
  {
    id: "hist-006",
    name: "DermaShield Sunscreen SPF 50",
    brand: "DermaShield",
    category: "cosmetics",
    barcode: "8901234567895",
    scannedAt: "2026-08-07",
    assessment: "high",
    score: 28,
    analysis: {
      id: "prod-006",
      name: "DermaShield Sunscreen SPF 50",
      brand: "DermaShield",
      category: "cosmetics",
      barcode: "8901234567895",
      scanDate: "2026-08-07",
      assessment: "high",
      assessmentDescription: "Contains several chemical UV filters with documented concerns. Consider mineral-based alternatives.",
      score: 28,
      positivePoints: [
        { text: "Provides SPF 50 broad-spectrum protection" },
        { text: "Contains dimethicone for smooth application" },
      ],
      attentionPoints: [
        { name: "Oxybenzone", reason: "Detected in human blood. Potential endocrine disruptor. Banned in Hawaii", severity: "high" },
        { name: "Octinoxate", reason: "Potential endocrine disruptor. Banned in Hawaii for coral reef damage", severity: "high" },
        { name: "Methylparaben", reason: "Endocrine disruption concerns", severity: "moderate" },
      ],
      ingredients: [
        { name: "Oxybenzone", function: "Chemical UV Filter", assessment: "high", explanation: "Absorbs UV radiation but detected in human blood and breast milk.", evidence: "FDA classified as Category III (insufficient safety data).", source: "FDA Sunscreen Monograph" },
        { name: "Octinoxate", function: "Chemical UV Filter", assessment: "high", explanation: "Absorbs UV-B radiation. Studies suggest potential endocrine disruption.", evidence: "Hawaii Act 104 (2018) bans sale.", source: "Hawaii sunscreen legislation" },
        { name: "Titanium Dioxide", function: "Mineral UV Filter", assessment: "low", explanation: "Physical UV filter. Generally considered safe for topical application.", evidence: "Classified as safe for topical use by FDA.", source: "FDA Sunscreen Monograph" },
      ],
      alternativeSuggestions: [
        { title: "Mineral Sunscreens", description: "Look for products using only zinc oxide and/or titanium dioxide." },
        { title: "Reef-Safe Formulas", description: "Choose sunscreens without oxybenzone or octinoxate." },
      ],
      evidenceSources: [
        { sourceName: "FDA Sunscreen Monograph", sourceType: "Government Safety Review", summary: "FDA proposed rule updating safety data requirements for sunscreen ingredients." },
      ],
    },
  },
  {
    id: "hist-007",
    name: "HerbalFresh Toothpaste",
    brand: "HerbalFresh",
    category: "personal_care",
    barcode: "8901234567896",
    scannedAt: "2026-08-06",
    assessment: "low",
    score: 75,
    analysis: {
      id: "prod-007",
      name: "HerbalFresh Toothpaste",
      brand: "HerbalFresh",
      category: "personal_care",
      barcode: "8901234567896",
      scanDate: "2026-08-06",
      assessment: "low",
      assessmentDescription: "Clean ingredient profile with no significant concerns. Suitable for regular use.",
      score: 75,
      positivePoints: [
        { text: "Simple, recognizable ingredient list" },
        { text: "No artificial colors" },
      ],
      attentionPoints: [{ name: "Sodium Chloride", amount: "Present", reason: "Common salt — generally safe in toothpaste amounts", severity: "low" }],
      ingredients: [
        { name: "Water", function: "Solvent", assessment: "low", explanation: "Primary solvent for the toothpaste formulation.", evidence: "No concerns.", source: "General safety data" },
        { name: "Glycerin", function: "Humectant", assessment: "low", explanation: "Helps maintain moisture and texture.", evidence: "Safe for oral use.", source: "CIR Expert Panel" },
        { name: "Citric Acid", function: "pH Adjuster", assessment: "low", explanation: "Natural acid that adjusts pH.", evidence: "Safe for oral care products.", source: "FDA GRAS Database" },
      ],
      alternativeSuggestions: [{ title: "Fluoride Options", description: "Consider toothpastes with fluoride for cavity protection." }],
      evidenceSources: [{ sourceName: "CIR Expert Panel", sourceType: "Industry Safety Review", summary: "Independent panel evaluating cosmetic ingredient safety." }],
    },
  },
  {
    id: "hist-008",
    name: "EnergyBoost Drink",
    brand: "EnergyBoost",
    category: "food",
    barcode: "8901234567897",
    scannedAt: "2026-08-06",
    assessment: "moderate",
    score: 55,
    analysis: {
      id: "prod-008",
      name: "EnergyBoost Drink",
      brand: "EnergyBoost",
      category: "food",
      barcode: "8901234567897",
      scanDate: "2026-08-06",
      assessment: "moderate",
      assessmentDescription: "High sugar and caffeine levels. Consider moderation.",
      score: 55,
      positivePoints: [
        { text: "Contains Vitamin B12 and taurine" },
        { text: "No fat content" },
      ],
      attentionPoints: [
        { name: "High Sugar", amount: "38g per serving", reason: "Exceeds WHO recommended daily limit in a single serving", severity: "high" },
        { name: "High Caffeine", reason: "Not recommended for children or those with caffeine sensitivity", severity: "moderate" },
        { name: "Artificial Colors", reason: "May cause hyperactivity in children", severity: "moderate" },
      ],
      ingredients: [
        { name: "Water", function: "Base", assessment: "low", explanation: "Primary ingredient.", evidence: "No concerns.", source: "General safety data" },
        { name: "Sugar", function: "Sweetener", assessment: "moderate", explanation: "Primary sweetener. High sugar content.", evidence: "WHO recommends limiting free sugars.", source: "WHO Sugar Guidelines" },
        { name: "Caffeine", function: "Stimulant", assessment: "moderate", explanation: "Natural stimulant. High levels may cause anxiety.", evidence: "FDA recommends max 400mg daily.", source: "FDA Caffeine Guidance" },
      ],
      alternativeSuggestions: [
        { title: "Lower Sugar Energy Options", description: "Look for drinks with less than 10g sugar per serving." },
      ],
      evidenceSources: [
        { sourceName: "WHO Sugar Guidelines", sourceType: "International Health Organization", summary: "Guidelines on limiting free sugar intake." },
      ],
      nutrition: { calories: 160, sugar: "38g", sodium: "250mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "16 fl oz (473ml)" },
    },
  },
  {
    id: "hist-009",
    name: "PureGlow Hand Cream",
    brand: "PureGlow",
    category: "cosmetics",
    barcode: "8901234567898",
    scannedAt: "2026-08-05",
    assessment: "low",
    score: 85,
    analysis: {
      id: "prod-009",
      name: "PureGlow Hand Cream",
      brand: "PureGlow",
      category: "cosmetics",
      barcode: "8901234567898",
      scanDate: "2026-08-05",
      assessment: "low",
      assessmentDescription: "Clean formulation with well-tolerated moisturizing ingredients.",
      score: 85,
      positivePoints: [
        { text: "Rich in shea butter for deep moisturizing" },
        { text: "No parabens or sulfates" },
        { text: "Fragrance-free formula" },
      ],
      attentionPoints: [],
      ingredients: [
        { name: "Shea Butter", function: "Emollient", assessment: "low", explanation: "Natural moisturizer rich in fatty acids.", evidence: "Widely recognized as safe and effective.", source: "EWG Skin Deep" },
        { name: "Aloe Vera", function: "Soothing Agent", assessment: "low", explanation: "Natural ingredient with skin-soothing properties.", evidence: "Consistently rated safe.", source: "CIR Expert Panel" },
      ],
      alternativeSuggestions: [],
      evidenceSources: [{ sourceName: "EWG Skin Deep Database", sourceType: "Ingredient Safety Database", summary: "Comprehensive database rating cosmetic ingredients." }],
    },
  },
  {
    id: "hist-010",
    name: "QuickClean Dish Soap",
    brand: "QuickClean",
    category: "household",
    barcode: "8901234567899",
    scannedAt: "2026-08-05",
    assessment: "low",
    score: 80,
    analysis: {
      id: "prod-010",
      name: "QuickClean Dish Soap",
      brand: "QuickClean",
      category: "household",
      barcode: "8901234567899",
      scanDate: "2026-08-05",
      assessment: "low",
      assessmentDescription: "Simple cleaning formulation with low-concern ingredients.",
      score: 80,
      positivePoints: [
        { text: "Plant-based surfactants" },
        { text: "No triclosan or antibacterial agents" },
      ],
      attentionPoints: [{ name: "Citrus Fragrance", reason: "May cause mild sensitivity in some individuals", severity: "low" }],
      ingredients: [
        { name: "Water", function: "Solvent", assessment: "low", explanation: "Base solvent.", evidence: "No concerns.", source: "General safety data" },
        { name: "Cocamidopropyl Betaine", function: "Surfactant", assessment: "low", explanation: "Mild, plant-derived surfactant.", evidence: "Generally recognized as safe.", source: "FDA GRAS" },
      ],
      alternativeSuggestions: [{ title: "Fragrance-Free Options", description: "Choose fragrance-free dish soaps for sensitive skin." }],
      evidenceSources: [{ sourceName: "FDA GRAS Database", sourceType: "Government Database", summary: "Generally Recognized As Safe substances." }],
    },
  },
];

export function getHistoryItems(): HistoryItem[] {
  return [...MOCK_HISTORY];
}

export function getHistoryItemById(id: string): HistoryItem | null {
  return MOCK_HISTORY.find((item) => item.id === id) ?? null;
}

export function searchHistory(
  items: HistoryItem[],
  query: string,
  filters: HistoryFilter,
): HistoryItem[] {
  let filtered = [...items];

  if (query.trim()) {
    const lower = query.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        item.name.toLowerCase().includes(lower) ||
        item.brand.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower) ||
        item.analysis.ingredients.some((ing) =>
          ing.name.toLowerCase().includes(lower),
        ),
    );
  }

  if (filters.assessment !== "all") {
    filtered = filtered.filter((item) => item.assessment === filters.assessment);
  }

  if (filters.category !== "all") {
    filtered = filtered.filter((item) => item.category === filters.category);
  }

  if (filters.dateRange === "recent") {
    filtered = filtered.filter((item) => {
      const d = new Date(item.scannedAt);
      const now = new Date("2026-08-09");
      const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 3;
    });
  } else if (filters.dateRange === "older") {
    filtered = filtered.filter((item) => {
      const d = new Date(item.scannedAt);
      const now = new Date("2026-08-09");
      const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays > 3;
    });
  }

  return filtered.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
}

export function getHistoryCounts(items: HistoryItem[]) {
  return {
    high: items.filter((i) => i.assessment === "high").length,
    moderate: items.filter((i) => i.assessment === "moderate").length,
    low: items.filter((i) => i.assessment === "low").length,
    total: items.length,
  };
}

export const CATEGORIES = [
  { value: "all" as const, label: "All Categories" },
  { value: "food" as const, label: "Food" },
  { value: "cosmetics" as const, label: "Cosmetics" },
  { value: "personal_care" as const, label: "Personal Care" },
  { value: "household" as const, label: "Household" },
];

export const DATE_RANGES = [
  { value: "all" as const, label: "All Time" },
  { value: "recent" as const, label: "Last 3 Days" },
  { value: "older" as const, label: "Older" },
];
