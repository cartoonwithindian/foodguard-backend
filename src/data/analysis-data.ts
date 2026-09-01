import type { ProductCategory } from "./mock-data";
import type { FSSAIAnalysisResult } from "@/services/regulatory/fssai";
import type { LegalMetrologyResult } from "@/services/regulatory/legal-metrology";
import type { EnhancedAlternative } from "@/services/recommendation.service";
import type { AlternativeCharacteristicInfo } from "@/lib/alternative-characteristics";

export type AssessmentLevel = "low" | "moderate" | "high" | "insufficient";

export type PositivePoint = {
  text: string;
};

export type AttentionPoint = {
  name: string;
  /** Human-readable display name (e.g. "Saturated Fat" instead of "saturatedFat"). */
  displayName?: string;
  amount?: string;
  value?: number;
  unit?: string;
  basis?: string;
  reason: string;
  severity: AssessmentLevel;
  source?: string;
};

export type IngredientAnalysis = {
  name: string;
  function: string;
  assessment: AssessmentLevel;
  explanation: string;
  evidence: string;
  source?: string;
};

export type EvidenceSource = {
  sourceName: string;
  sourceType: string;
  evidenceCategory?: "PRODUCT_DATA" | "REGULATORY_REFERENCE" | "NUTRITION_GUIDANCE" | "SCIENTIFIC_REFERENCE";
  summary: string;
  url?: string;
};

export type AlternativeSuggestion = {
  title: string;
  description: string;
};

export type FoodGuardScoreComponent = {
  score: number;
  weight: number;
  status: "available" | "derived" | "insufficient";
};

export type FoodGuardScoreResult = {
  final_score: number;
  rating: string;
  confidence: number;
  components: {
    nutrient: FoodGuardScoreComponent;
    ingredient_profile: FoodGuardScoreComponent;
    ingredient_concern: FoodGuardScoreComponent;
    processing: FoodGuardScoreComponent & { level: number };
  };
  positive_factors: string[];
  negative_factors: string[];
  explanation: string;
  missing_data: string[];
  debug?: {
    nutrient_contribution: number;
    ingredient_profile_contribution: number;
    ingredient_concern_contribution: number;
    processing_contribution: number;
    raw_final_score: number;
    display_score: number;
  };
};

export type ProductAnalysisResult = {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  barcode: string;
  scanDate: string;
  imageUrl?: string;
  assessment: AssessmentLevel;
  assessmentDescription: string;
  /** Health score 0.0–5.0 (canonical FoodGuard score). */
  score: number;
  positivePoints: PositivePoint[];
  attentionPoints: AttentionPoint[];
  ingredients: IngredientAnalysis[];
  alternativeSuggestions: AlternativeSuggestion[];
  evidenceSources: EvidenceSource[];
  nutrition?: {
    calories: number | string;
    sugar: string;
    sodium: string;
    saturatedFat: string;
    protein: string;
    fibre: string;
    servingSize: string;
  };
  /** Four-component FoodGuard score breakdown. */
  foodguardScore?: FoodGuardScoreResult;
  regulatory?: FSSAIAnalysisResult | null;
  /** Normalized FSSAI regulatory compliance (HTTP-backed). */
  regulatoryCompliance?: import("@/types/domain").RegulatoryCompliance | null;
  legalMetrology?: LegalMetrologyResult | null;
  alternatives?: EnhancedAlternative[];
  /** Phase 5: characteristics derived from the scanned product's issues. */
  alternativeCharacteristics?: AlternativeCharacteristicInfo[];
  /** Phase 5: criteria metadata (validated vs unsupported characteristics). */
  alternativeCriteria?: {
    preferredCharacteristics: string[];
    unsupported: string[];
  };
};

const MOCK_ANALYSIS: Record<string, ProductAnalysisResult> = {
  "8901234567890": {
    id: "prod-001",
    name: "GlowCare Face Wash",
    brand: "GlowCare",
    category: "cosmetics",
    barcode: "8901234567890",
    scanDate: "Just now",
    assessment: "moderate",
    assessmentDescription:
      "Some aspects of this product deserve closer attention based on its ingredient profile. While generally safe for most users, certain ingredients may warrant consideration for sensitive individuals.",
    score: 3.1,
    positivePoints: [
      { text: "Contains glycerin — effective humectant for skin hydration" },
      { text: "Citric acid as pH adjuster is generally well-tolerated" },
      { text: "Phenoxyethanol is a widely accepted preservative at low concentrations" },
    ],
    attentionPoints: [
      {
        name: "Sodium Lauryl Sulfate (SLS)",
        reason: "Known skin irritant that may cause dryness or discomfort with repeated use",
        severity: "high",
      },
      {
        name: "Methylparaben",
        reason: "Preservative with potential endocrine disruption concerns under review by regulatory bodies",
        severity: "moderate",
      },
      {
        name: "Fragrance / Parfum",
        reason: "Proprietary blend that may contain allergens not individually disclosed",
        severity: "moderate",
      },
    ],
    ingredients: [
      {
        name: "Water (Aqua)",
        function: "Solvent / Base",
        assessment: "low",
        explanation: "Primary solvent used as the base for the formulation. No concerns identified.",
        evidence: "Widely recognized as safe for topical use. Listed in all major cosmetic databases.",
        source: "EWG Skin Deep Database",
      },
      {
        name: "Sodium Lauryl Sulfate",
        function: "Surfactant / Cleansing Agent",
        assessment: "high",
        explanation: "A strong surfactant that creates foam but can strip natural oils from the skin. May cause irritation, especially with frequent use or on sensitive skin.",
        evidence: "The American Academy of Dermatology notes SLS may aggravate skin conditions. Multiple clinical studies have documented irritant potential.",
        source: "Journal of the American Academy of Dermatology",
      },
      {
        name: "Glycerin",
        function: "Humectant / Moisturizer",
        assessment: "low",
        explanation: "A natural humectant that draws moisture to the skin. Well-tolerated across skin types.",
        evidence: "Consistently rated as safe and effective by dermatological research.",
        source: "International Journal of Cosmetic Science",
      },
      {
        name: "Fragrance (Parfum)",
        function: "Scent / Sensory Enhancer",
        assessment: "moderate",
        explanation: "A proprietary blend of chemicals that provides scent. Individual components are not required to be disclosed under current regulations.",
        evidence: "The International Fragrance Association (IFRA) sets voluntary standards. Some fragrance components have been identified as potential allergens in patch-test studies.",
        source: "Contact Dermatitis Journal",
      },
      {
        name: "Citric Acid",
        function: "pH Adjuster",
        assessment: "low",
        explanation: "Naturally occurring acid used to adjust product pH to match skin's acid mantle.",
        evidence: "Generally recognized as safe. Found naturally in citrus fruits.",
        source: "CosIng Database (EU)",
      },
      {
        name: "Methylparaben",
        function: "Preservative",
        assessment: "moderate",
        explanation: "Effective preservative that prevents microbial growth. Part of the paraben family which has raised endocrine disruption concerns.",
        evidence: "The European Scientific Committee on Consumer Safety (SCCS) has reviewed parabens and restricted certain concentrations. Current evidence suggests low risk at typical cosmetic levels.",
        source: "EU SCCS Opinion on Parabens",
      },
      {
        name: "Phenoxyethanol",
        function: "Preservative",
        assessment: "low",
        explanation: "Common preservative used at low concentrations (typically under 1%). Generally well-tolerated.",
        evidence: "Rated as safe for cosmetic use at concentrations up to 1% by the CIR Expert Panel.",
        source: "Cosmetic Ingredient Review (CIR)",
      },
    ],
    alternativeSuggestions: [
      {
        title: "Sulfate-Free Cleansers",
        description: "Look for products using coco-glucoside or decyl glucoside as gentler surfactant alternatives.",
      },
      {
        title: "Fragrance-Free Formulations",
        description: "Choose products labeled 'fragrance-free' rather than 'unscented' to avoid hidden fragrance chemicals.",
      },
      {
        title: "Paraben-Free Preservative Systems",
        description: "Products using phenoxyethanol, sodium benzoate, or potassium sorbate as alternatives.",
      },
    ],
    evidenceSources: [
      {
        sourceName: "EWG Skin Deep Database",
        sourceType: "Ingredient Safety Database",
        summary: "Comprehensive database rating cosmetic ingredients based on available safety data.",
      },
      {
        sourceName: "EU Scientific Committee on Consumer Safety",
        sourceType: "Regulatory Body",
        summary: "Provides scientific opinions on the safety of cosmetic ingredients sold in the European Union.",
      },
      {
        sourceName: "Contact Dermatitis Journal",
        sourceType: "Peer-Reviewed Research",
        summary: "Published research on skin reactions and allergies related to cosmetic ingredients.",
      },
    ],
  },
  "8901234567891": {
    id: "prod-002",
    name: "OatPlus Protein Bar",
    brand: "OatPlus",
    category: "food",
    barcode: "8901234567891",
    scanDate: "Just now",
    assessment: "low",
    assessmentDescription:
      "No major concerns were identified. This product has a relatively clean ingredient profile with recognizable ingredients.",
    score: 4.4,
    positivePoints: [
      { text: "Good protein content from whole grain oats" },
      { text: "No artificial colors or flavors" },
      { text: "Contains essential vitamins (B12) and minerals (Iron, Potassium)" },
      { text: "Low saturated fat content" },
    ],
    attentionPoints: [
      {
        name: "Added Sugar",
        amount: "8g per bar",
        reason: "Contains added sugar, though moderate for a protein bar",
        severity: "low",
      },
    ],
    ingredients: [
      {
        name: "Oats",
        function: "Whole Grain / Base Ingredient",
        assessment: "low",
        explanation: "Primary ingredient providing complex carbohydrates, fiber, and plant-based protein.",
        evidence: "Whole oats are recognized as a heart-healthy food by the FDA. Rich in beta-glucan fiber.",
        source: "USDA FoodData Central",
      },
      {
        name: "Soy Lecithin",
        function: "Emulsifier",
        assessment: "low",
        explanation: "Natural emulsifier derived from soybeans. Helps blend ingredients and improve texture.",
        evidence: "Generally recognized as safe for food use by the FDA.",
        source: "FDA GRAS Notices",
      },
      {
        name: "Sugar",
        function: "Sweetener",
        assessment: "low",
        explanation: "Provides sweetness. Used in moderate amounts.",
        evidence: "WHO recommends limiting free sugar intake to less than 10% of total energy.",
        source: "WHO Guidelines on Sugar Intake",
      },
      {
        name: "Vitamin B12",
        function: "Fortification / Nutrient",
        assessment: "low",
        explanation: "Essential vitamin added for nutritional benefit. Supports nerve function and red blood cell formation.",
        evidence: "No safety concerns at fortification levels.",
        source: "National Institutes of Health",
      },
      {
        name: "Iron",
        function: "Fortification / Mineral",
        assessment: "low",
        explanation: "Essential mineral for oxygen transport in the blood.",
        evidence: "Added at safe levels for nutritional fortification.",
        source: "WHO Guidelines on Iron Fortification",
      },
    ],
    alternativeSuggestions: [
      {
        title: "Lower Sugar Options",
        description: "Look for protein bars with less than 5g of added sugar per serving.",
      },
      {
        title: "Minimal Ingredient Lists",
        description: "Choose bars with fewer, recognizable whole-food ingredients.",
      },
    ],
    evidenceSources: [
      {
        sourceName: "USDA FoodData Central",
        sourceType: "Government Nutrition Database",
        summary: "Comprehensive nutrient data for foods, maintained by the USDA Agricultural Research Service.",
      },
      {
        sourceName: "WHO Guidelines",
        sourceType: "International Health Organization",
        summary: "Evidence-based guidelines on dietary sugar, sodium, and fat intake.",
      },
    ],
    nutrition: {
      calories: 250,
      sugar: "8g",
      sodium: "180mg",
      saturatedFat: "2g",
      protein: "15g",
      fibre: "4g",
      servingSize: "1 bar (60g)",
    },
  },
  "8901234567892": {
    id: "prod-003",
    name: "FreshGlow Shampoo",
    brand: "FreshGlow",
    category: "personal_care",
    barcode: "8901234567892",
    scanDate: "Just now",
    assessment: "high",
    assessmentDescription:
      "Several ingredients in this product may warrant closer attention. Consider reviewing the full ingredient list, especially if you have sensitive skin or specific health concerns.",
    score: 1.8,
    positivePoints: [
      { text: "Contains phenoxyethanol as a widely accepted preservative" },
    ],
    attentionPoints: [
      {
        name: "SLS + SLES Combination",
        reason: "Dual sulfate surfactants increase irritation risk significantly",
        severity: "high",
      },
      {
        name: "Formaldehyde Releasers",
        reason: "Preservatives that release small amounts of formaldehyde, classified as a known carcinogen by IARC",
        severity: "high",
      },
      {
        name: "Parabens",
        reason: "Endocrine disruption concerns documented in multiple studies",
        severity: "high",
      },
      {
        name: "Artificial Colors",
        reason: "Synthetic color additives with potential hyperactivity links in children",
        severity: "moderate",
      },
    ],
    ingredients: [
      {
        name: "Sodium Laureth Sulfate (SLES)",
        function: "Surfactant",
        assessment: "moderate",
        explanation: "Foaming agent gentler than SLS but still potentially irritating. Trace 1,4-dioxane contamination is a manufacturing concern.",
        evidence: "EU regulations require 1,4-dioxane levels below 10ppm in cosmetic products.",
        source: "EU Cosmetics Regulation",
      },
      {
        name: "Sodium Lauryl Sulfate (SLS)",
        function: "Surfactant",
        assessment: "high",
        explanation: "Strong surfactant with well-documented irritation potential. May strip natural oils and compromise skin barrier.",
        evidence: "Multiple clinical studies confirm irritant potential, especially with repeated exposure.",
        source: "Contact Dermatitis Journal",
      },
      {
        name: "Parabens (Mixed)",
        function: "Preservative",
        assessment: "high",
        explanation: "Group of preservatives that have detected in human tissue samples. Potential endocrine interaction documented.",
        evidence: "FDA ongoing review. EU has restricted certain paraben types and concentrations.",
        source: "FDA Paraben Safety Assessment",
      },
      {
        name: "DMDM Hydantoin",
        function: "Preservative (Formaldehyde Releaser)",
        assessment: "high",
        explanation: "Releases formaldehyde as a preservative mechanism. Formaldehyde is classified as a known human carcinogen.",
        evidence: "IARC Monograph Vol. 100F classifies formaldehyde as Group 1 carcinogen.",
        source: "IARC Monographs",
      },
      {
        name: "Artificial Colors (FD&C)",
        function: "Color Additive",
        assessment: "moderate",
        explanation: "Synthetic dyes derived from petroleum. Some studies suggest links to hyperactivity in children.",
        evidence: "EU requires warning labels on products containing certain artificial colors (Annex II色素).",
        source: "EU Food Safety Authority",
      },
    ],
    alternativeSuggestions: [
      {
        title: "Sulfate-Free Shampoos",
        description: "Look for products using cocamidopropyl betaine or coco-glucoside as primary surfactants.",
      },
      {
        title: "Paraben-Free Products",
        description: "Choose products preserved with phenoxyethanol, sodium benzoate, or potassium sorbate.",
      },
      {
        title: "Fragrance-Free Formulas",
        description: "Opt for unscented products to reduce potential allergen exposure.",
      },
      {
        title: "Natural Colorants",
        description: "Look for products using plant-derived colorants instead of FD&C dyes.",
      },
    ],
    evidenceSources: [
      {
        sourceName: "IARC Monographs on Carcinogenic Risks",
        sourceType: "International Research Agency",
        summary: "Comprehensive evaluations of carcinogenic risks to humans, maintained by WHO.",
      },
      {
        sourceName: "EU Cosmetics Regulation (EC 1223/2009)",
        sourceType: "Regulatory Framework",
        summary: "European Union regulation governing the safety and labeling of cosmetic products.",
      },
      {
        sourceName: "FDA Safety Assessment of Parabens",
        sourceType: "Government Regulatory Review",
        summary: "FDA ongoing evaluation of paraben safety in consumer products.",
      },
    ],
  },
  "8901234567893": {
    id: "prod-004",
    name: "NatureBest Orange Juice",
    brand: "NatureBest",
    category: "food",
    barcode: "8901234567893",
    scanDate: "Just now",
    assessment: "low",
    assessmentDescription:
      "This product has a clean ingredient profile with no significant concerns identified. A good source of Vitamin C with minimal processing.",
    score: 4.6,
    positivePoints: [
      { text: "Good source of Vitamin C (ascorbic acid)" },
      { text: "No artificial colors or flavors" },
      { text: "Low sodium content" },
      { text: "Natural citric acid as preservative" },
    ],
    attentionPoints: [
      {
        name: "Natural Sugars",
        amount: "22g per serving",
        reason: "Naturally occurring fruit sugars — expected in juice products",
        severity: "low",
      },
    ],
    ingredients: [
      {
        name: "Orange Juice (Filtered Water, Orange Concentrate)",
        function: "Base Ingredient",
        assessment: "low",
        explanation: "Primary ingredient. Reconstituted orange juice from concentrate.",
        evidence: "Standard processing method for juice products.",
        source: "USDA Food Standards",
      },
      {
        name: "Ascorbic Acid (Vitamin C)",
        function: "Nutrient / Preservative",
        assessment: "low",
        explanation: "Added as both a nutritional supplement and natural preservative to prevent oxidation.",
        evidence: "Essential nutrient with established daily intake recommendations.",
        source: "National Institutes of Health",
      },
      {
        name: "Citric Acid",
        function: "Acidity Regulator",
        assessment: "low",
        explanation: "Naturally occurring acid that maintains freshness and flavor.",
        evidence: "Generally recognized as safe for food use.",
        source: "FDA GRAS Database",
      },
      {
        name: "Potassium Sorbate",
        function: "Preservative",
        assessment: "low",
        explanation: "Common food preservative that prevents mold and yeast growth.",
        evidence: "Established safety profile at typical food usage levels.",
        source: "JECFA (Joint FAO/WHO Expert Committee)",
      },
    ],
    alternativeSuggestions: [
      {
        title: "Lower Sugar Options",
        description: "Consider whole fruit or low-sugar juice blends for reduced sugar intake.",
      },
    ],
    evidenceSources: [
      {
        sourceName: "USDA FoodData Central",
        sourceType: "Government Nutrition Database",
        summary: "Comprehensive nutrient data for foods.",
      },
    ],
    nutrition: {
      calories: 110,
      sugar: "22g",
      sodium: "0mg",
      saturatedFat: "0g",
      protein: "0g",
      fibre: "0g",
      servingSize: "8 fl oz (240ml)",
    },
  },
  "8901234567894": {
    id: "prod-005",
    name: "CleanHome Floor Cleaner",
    brand: "CleanHome",
    category: "household",
    barcode: "8901234567894",
    scanDate: "Just now",
    assessment: "moderate",
    assessmentDescription:
      "Some ingredients in this household product deserve attention. Consider ventilation during use and keep away from children and pets.",
    score: 2.3,
    positivePoints: [
      { text: "Effective cleaning surfactant system" },
      { text: "Potassium sorbate is a low-concern preservative" },
    ],
    attentionPoints: [
      {
        name: "Triclosan",
        reason: "Banned in consumer hand soaps by FDA (2016). Potential endocrine disruptor and contributor to antibiotic resistance",
        severity: "high",
      },
      {
        name: "SLS",
        reason: "Skin irritant — wear gloves during extended use",
        severity: "moderate",
      },
      {
        name: "Fragrance",
        reason: "May cause respiratory sensitivity in enclosed spaces",
        severity: "moderate",
      },
    ],
    ingredients: [
      {
        name: "Water",
        function: "Solvent",
        assessment: "low",
        explanation: "Base solvent for the cleaning solution.",
        evidence: "No concerns.",
        source: "General safety data",
      },
      {
        name: "Sodium Lauryl Sulfate",
        function: "Surfactant / Cleaning Agent",
        assessment: "moderate",
        explanation: "Effective cleaning agent but can cause skin irritation with direct contact.",
        evidence: "Known irritant for prolonged skin contact.",
        source: "EPA Chemical Safety Data",
      },
      {
        name: "Triclosan",
        function: "Antimicrobial Agent",
        assessment: "high",
        explanation: "Antibacterial agent banned in consumer hand soaps by FDA. Persists in the environment and may contribute to antibiotic resistance.",
        evidence: "FDA Final Rule on Antiseptic Wash Products (2016). EPA Registration Review.",
        source: "FDA Antiseptic Wash Products Rule",
      },
      {
        name: "Sodium Benzoate",
        function: "Preservative",
        assessment: "moderate",
        explanation: "Effective preservative but may form trace benzene when combined with vitamin C under certain conditions.",
        evidence: "FDA has studied this interaction and determined levels in consumer products are generally safe.",
        source: "FDA Benzene in Soft Drinks Report",
      },
    ],
    alternativeSuggestions: [
      {
        title: "Triclosan-Free Products",
        description: "Choose cleaners without antimicrobial agents — regular cleaning is sufficient for most household needs.",
      },
      {
        title: "Plant-Based Surfactants",
        description: "Look for cleaners using coconut-derived or plant-based cleaning agents.",
      },
      {
        title: "Fragrance-Free Formulas",
        description: "Select fragrance-free options for better indoor air quality.",
      },
    ],
    evidenceSources: [
      {
        sourceName: "FDA Final Rule on Antiseptic Wash Products",
        sourceType: "Government Regulation",
        summary: "2016 ruling banning triclosan in consumer antiseptic wash products due to insufficient safety and efficacy data.",
      },
      {
        sourceName: "EPA Chemical Safety",
        sourceType: "Environmental Regulatory Body",
        summary: "Environmental and health safety assessments for chemicals used in consumer products.",
      },
    ],
  },
  "8901234567895": {
    id: "prod-006",
    name: "DermaShield Sunscreen SPF 50",
    brand: "DermaShield",
    category: "cosmetics",
    barcode: "8901234567895",
    scanDate: "Just now",
    assessment: "high",
    assessmentDescription:
      "This sunscreen contains several chemical UV filters with documented concerns. Consider mineral-based alternatives, especially for children or those with sensitive skin.",
    score: 1.4,
    positivePoints: [
      { text: "Provides SPF 50 broad-spectrum protection" },
      { text: "Contains dimethicone for smooth application" },
      { text: "Glycerin provides moisturizing benefit" },
    ],
    attentionPoints: [
      {
        name: "Oxybenzone",
        reason: "Detected in human blood after topical application. Potential endocrine disruptor. Banned in Hawaii for coral reef damage",
        severity: "high",
      },
      {
        name: "Octinoxate",
        reason: "Potential endocrine disruptor. Banned in Hawaii for coral reef damage",
        severity: "high",
      },
      {
        name: "Methylparaben",
        reason: "Endocrine disruption concerns",
        severity: "moderate",
      },
      {
        name: "Fragrance",
        reason: "May cause skin sensitivity, especially on sun-exposed skin",
        severity: "moderate",
      },
    ],
    ingredients: [
      {
        name: "Oxybenzone",
        function: "Chemical UV Filter",
        assessment: "high",
        explanation: "Absorbs UV radiation but has been detected in human blood and breast milk. Potential endocrine disruption activity documented in studies.",
        evidence: "FDA has classified oxybenzone as Category III (insufficient safety data). Hawaii banned oxybenzone-containing sunscreens.",
        source: "FDA Sunscreen Monograph",
      },
      {
        name: "Octinoxate",
        function: "Chemical UV Filter",
        assessment: "high",
        explanation: "Absorbs UV-B radiation. Studies suggest potential endocrine disruption. Banned in Hawaii for coral reef damage.",
        evidence: "Hawaii Act 104 (2018) bans sale of sunscreens containing octinoxate.",
        source: "Hawaii sunscreen legislation",
      },
      {
        name: "Titanium Dioxide",
        function: "Mineral UV Filter",
        assessment: "low",
        explanation: "Physical UV filter that reflects and scatters radiation. Generally considered safe for topical application.",
        evidence: "Classified as safe for topical use by FDA. Concerns relate to inhalation of powder form only.",
        source: "FDA Sunscreen Monograph",
      },
      {
        name: "Glycerin",
        function: "Humectant",
        assessment: "low",
        explanation: "Helps maintain skin hydration. Well-tolerated ingredient.",
        evidence: "Consistently rated safe by dermatological research.",
        source: "EWG Skin Deep",
      },
      {
        name: "Dimethicone",
        function: "Skin Protectant",
        assessment: "low",
        explanation: "Silicone-based ingredient that creates a protective barrier and improves product spreadability.",
        evidence: "Generally recognized as safe for topical use.",
        source: "CIR Expert Panel",
      },
      {
        name: "Methylparaben",
        function: "Preservative",
        assessment: "moderate",
        explanation: "Effective preservative with endocrine disruption concerns. Part of the paraben family.",
        evidence: "EU has restricted certain paraben concentrations. Ongoing safety review.",
        source: "EU SCCS Opinion",
      },
    ],
    alternativeSuggestions: [
      {
        title: "Mineral Sunscreens",
        description: "Look for products using only zinc oxide and/or titanium dioxide as UV filters.",
      },
      {
        title: "Reef-Safe Formulas",
        description: "Choose sunscreens without oxybenzone or octinoxate to support marine ecosystem health.",
      },
      {
        title: "Fragrance-Free Sunscreens",
        description: "Fragrance-free formulas reduce irritation risk on sun-exposed skin.",
      },
    ],
    evidenceSources: [
      {
        sourceName: "FDA Sunscreen Monograph",
        sourceType: "Government Safety Review",
        summary: "FDA proposed rule updating safety data requirements for sunscreen active ingredients.",
      },
      {
        sourceName: "Hawaii Act 104",
        sourceType: "State Legislation",
        summary: "Law banning sale of sunscreens containing oxybenzone and octinoxate to protect coral reefs.",
      },
    ],
  },
  "8901234567896": {
    id: "prod-007",
    name: "HerbalFresh Toothpaste",
    brand: "HerbalFresh",
    category: "personal_care",
    barcode: "8901234567896",
    scanDate: "Just now",
    assessment: "low",
    assessmentDescription:
      "This toothpaste has a clean ingredient profile with no significant concerns identified. Suitable for regular use.",
    score: 3.8,
    positivePoints: [
      { text: "Simple, recognizable ingredient list" },
      { text: "No artificial colors" },
      { text: "Phenoxyethanol is a widely accepted preservative" },
    ],
    attentionPoints: [
      {
        name: "Sodium Chloride",
        amount: "Present",
        reason: "Common salt — generally safe in toothpaste amounts",
        severity: "low",
      },
    ],
    ingredients: [
      {
        name: "Water",
        function: "Solvent / Base",
        assessment: "low",
        explanation: "Primary solvent for the toothpaste formulation.",
        evidence: "No concerns.",
        source: "General safety data",
      },
      {
        name: "Glycerin",
        function: "Humectant",
        assessment: "low",
        explanation: "Helps maintain moisture and texture in the toothpaste.",
        evidence: "Safe for oral use in toothpaste concentrations.",
        source: "CIR Expert Panel",
      },
      {
        name: "Citric Acid",
        function: "pH Adjuster / Flavor",
        assessment: "low",
        explanation: "Natural acid that adjusts pH and provides mild flavor.",
        evidence: "Safe for oral care products.",
        source: "FDA GRAS Database",
      },
      {
        name: "Phenoxyethanol",
        function: "Preservative",
        assessment: "low",
        explanation: "Common preservative effective at low concentrations.",
        evidence: "Safe for use in oral care products at typical levels.",
        source: "CIR Expert Panel",
      },
    ],
    alternativeSuggestions: [
      {
        title: "Fluoride Options",
        description: "Consider toothpastes with fluoride for cavity protection if not already using fluoridated products.",
      },
    ],
    evidenceSources: [
      {
        sourceName: "CIR Expert Panel",
        sourceType: "Industry Safety Review",
        summary: "Independent panel that evaluates the safety of cosmetic ingredients.",
      },
    ],
  },
  "8901234567897": {
    id: "prod-008",
    name: "EnergyBoost Drink",
    brand: "EnergyBoost",
    category: "food",
    barcode: "8901234567897",
    scanDate: "Just now",
    assessment: "moderate",
    assessmentDescription:
      "This energy drink contains high sugar and caffeine levels. Consider moderation, especially for children and those with caffeine sensitivity.",
    score: 2.8,
    positivePoints: [
      { text: "Contains Vitamin B12 and taurine" },
      { text: "No fat content" },
    ],
    attentionPoints: [
      {
        name: "High Sugar",
        amount: "38g per serving",
        reason: "Exceeds WHO recommended daily free sugar limit in a single serving",
        severity: "high",
      },
      {
        name: "High Caffeine",
        reason: "Not recommended for children, pregnant women, or those with caffeine sensitivity",
        severity: "moderate",
      },
      {
        name: "High Fructose Corn Syrup",
        reason: "Linked to metabolic concerns when consumed excessively",
        severity: "moderate",
      },
      {
        name: "Artificial Colors",
        reason: "May cause hyperactivity in children",
        severity: "moderate",
      },
      {
        name: "Sodium Benzoate",
        reason: "May form trace benzene when combined with vitamin C",
        severity: "low",
      },
    ],
    ingredients: [
      {
        name: "Water",
        function: "Base Ingredient",
        assessment: "low",
        explanation: "Primary ingredient.",
        evidence: "No concerns.",
        source: "General safety data",
      },
      {
        name: "Sugar",
        function: "Sweetener",
        assessment: "moderate",
        explanation: "Primary sweetener. High sugar content per serving.",
        evidence: "WHO recommends limiting free sugars to less than 10% of total energy intake.",
        source: "WHO Sugar Guidelines",
      },
      {
        name: "High Fructose Corn Syrup",
        function: "Sweetener",
        assessment: "moderate",
        explanation: "Liquid sweetener linked to metabolic concerns with excessive consumption.",
        evidence: "Research associates HFCS overconsumption with weight gain and insulin resistance.",
        source: "American Journal of Clinical Nutrition",
      },
      {
        name: "Caffeine",
        function: "Stimulant",
        assessment: "moderate",
        explanation: "Natural stimulant. High levels may cause anxiety, insomnia, or increased heart rate.",
        evidence: "FDA recommends maximum 400mg daily for healthy adults. Not recommended for children.",
        source: "FDA Caffeine Guidance",
      },
      {
        name: "Taurine",
        function: "Amino Acid",
        assessment: "low",
        explanation: "Amino acid naturally produced in the body. Added for potential performance benefits.",
        evidence: "Generally recognized as safe at typical beverage concentrations.",
        source: "EFSA Scientific Opinion",
      },
      {
        name: "Vitamin B12",
        function: "Fortification",
        assessment: "low",
        explanation: "Essential vitamin for nerve function and energy metabolism.",
        evidence: "Safe at fortification levels.",
        source: "National Institutes of Health",
      },
      {
        name: "Artificial Colors (FD&C)",
        function: "Color Additive",
        assessment: "moderate",
        explanation: "Synthetic dyes that may cause hyperactivity in sensitive children.",
        evidence: "EU requires warning labels on products with certain artificial colors.",
        source: "EFSA Color Safety Review",
      },
      {
        name: "Sodium Benzoate",
        function: "Preservative",
        assessment: "low",
        explanation: "Common preservative. May form trace benzene with vitamin C under specific conditions.",
        evidence: "FDA studies indicate levels in beverages are generally safe.",
        source: "FDA Benzene Report",
      },
    ],
    alternativeSuggestions: [
      {
        title: "Lower Sugar Energy Options",
        description: "Look for drinks with less than 10g sugar per serving or unsweetened alternatives.",
      },
      {
        title: "Natural Caffeine Sources",
        description: "Consider green tea or yerba mate for moderate caffeine with additional antioxidants.",
      },
      {
        title: "No Artificial Colors",
        description: "Choose products without FD&C dyes for a cleaner ingredient profile.",
      },
    ],
    evidenceSources: [
      {
        sourceName: "WHO Sugar Guidelines",
        sourceType: "International Health Organization",
        summary: "Guidelines on limiting free sugar intake to reduce noncommunicable disease risk.",
      },
      {
        sourceName: "FDA Caffeine Consumer Guidance",
        sourceType: "Government Safety Agency",
        summary: "Recommendations on safe caffeine intake levels for different population groups.",
      },
    ],
    nutrition: {
      calories: 160,
      sugar: "38g",
      sodium: "250mg",
      saturatedFat: "0g",
      protein: "0g",
      fibre: "0g",
      servingSize: "16 fl oz (473ml)",
    },
  },
};

export function lookupAnalysisByBarcode(
  barcode: string,
): ProductAnalysisResult | null {
  return MOCK_ANALYSIS[barcode.trim()] ?? null;
}

export function getAnalysisFromIngredients(
  text: string,
): ProductAnalysisResult {
  const found: IngredientAnalysis[] = [];

  const INGREDIENT_MAP: Record<string, Omit<IngredientAnalysis, "name">> = {
    water: {
      function: "Solvent / Base",
      assessment: "low",
      explanation: "Primary solvent. No concerns identified.",
      evidence: "Widely recognized as safe for topical and food use.",
      source: "General safety data",
    },
    glycerin: {
      function: "Humectant / Moisturizer",
      assessment: "low",
      explanation: "Natural humectant that draws moisture to skin or food products.",
      evidence: "Consistently rated safe by dermatological and food safety research.",
      source: "EWG / FDA GRAS",
    },
    "sodium lauryl sulfate": {
      function: "Surfactant / Cleansing Agent",
      assessment: "high",
      explanation: "Strong surfactant with documented irritation potential.",
      evidence: "Multiple clinical studies confirm irritant potential.",
      source: "Contact Dermatitis Journal",
    },
    fragrance: {
      function: "Scent / Sensory Enhancer",
      assessment: "moderate",
      explanation: "Proprietary blend that may contain undisclosed allergens.",
      evidence: "Some fragrance components identified as potential allergens.",
      source: "Contact Dermatitis Journal",
    },
    paraben: {
      function: "Preservative",
      assessment: "high",
      explanation: "Group of preservatives with endocrine disruption concerns.",
      evidence: "EU has restricted certain paraben types and concentrations.",
      source: "EU SCCS Opinion",
    },
    methylparaben: {
      function: "Preservative",
      assessment: "moderate",
      explanation: "Effective preservative with potential endocrine interaction.",
      evidence: "Ongoing regulatory review by FDA and EU.",
      source: "FDA / EU SCCS",
    },
    "artificial colors": {
      function: "Color Additive",
      assessment: "moderate",
      explanation: "Synthetic dyes that may cause hyperactivity in children.",
      evidence: "EU requires warning labels on products with certain artificial colors.",
      source: "EFSA Safety Review",
    },
    caffeine: {
      function: "Stimulant",
      assessment: "low",
      explanation: "Natural stimulant safe in moderate amounts.",
      evidence: "FDA recommends max 400mg daily for healthy adults.",
      source: "FDA Consumer Guidance",
    },
  };

  const keys = Object.keys(INGREDIENT_MAP).sort((a, b) => b.length - a.length);
  let remaining = text.toLowerCase();

  for (const key of keys) {
    if (remaining.includes(key)) {
      found.push({ name: key.charAt(0).toUpperCase() + key.slice(1), ...INGREDIENT_MAP[key] });
      remaining = remaining.split(key).join(" ");
    }
  }

  if (found.length === 0) {
    found.push({
      name: "Unrecognized Ingredients",
      function: "Unknown",
      assessment: "moderate",
      explanation: "Could not identify ingredients in our database. Manual review recommended.",
      evidence: "Ingredients not matched against our reference database.",
      source: "Internal database",
    });
  }

  const highCount = found.filter((i) => i.assessment === "high").length;
  const moderateCount = found.filter((i) => i.assessment === "moderate").length;
  // New FoodGuard 0.0–5.0 scoring for inline/manual products.
  const score = Math.round(Math.max(0.5, Math.min(5.0, 4.5 - highCount * 1.0 - moderateCount * 0.4)) * 10) / 10;

  const assessment: AssessmentLevel =
    highCount > 0 ? "high" : moderateCount > 0 ? "moderate" : "low";

  const assessmentDescription =
    assessment === "high"
      ? "Several ingredients may warrant closer attention based on the available information."
      : assessment === "moderate"
        ? "Some aspects of this product deserve closer attention based on its ingredient profile."
        : "No major concerns were identified. This product has a relatively clean ingredient profile.";

  return {
    id: `custom-${Date.now()}`,
    name: "Custom Product",
    brand: "Manual Entry",
    category: "other",
    barcode: "",
    scanDate: "Just now",
    assessment,
    assessmentDescription,
    score,
    positivePoints: found
      .filter((i) => i.assessment === "low")
      .map((i) => ({ text: `${i.name} — ${i.explanation}` })),
    attentionPoints: found
      .filter((i) => i.assessment !== "low")
      .map((i) => ({
        name: i.name,
        reason: i.explanation,
        severity: i.assessment,
      })),
    ingredients: found,
    alternativeSuggestions: [],
    evidenceSources: [],
  };
}
