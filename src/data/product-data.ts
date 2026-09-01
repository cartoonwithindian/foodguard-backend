import type { ProductCategory, ConcernLevel } from "./mock-data";

export type IngredientConcern = {
  name: string;
  level: ConcernLevel;
  description: string;
};

export type ProductAnalysis = {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  barcode: string;
  safetyScore: number;
  ingredients: IngredientConcern[];
  warnings: string[];
};

const INGREDIENT_DATABASE: Record<string, IngredientConcern> = {
  water: { name: "Water", level: "low", description: "Safe base ingredient" },
  glycerin: {
    name: "Glycerin",
    level: "low",
    description: "Humectant, generally safe",
  },
  "sodium lauryl sulfate": {
    name: "Sodium Lauryl Sulfate (SLS)",
    level: "high",
    description: "Potential skin irritant, may cause dryness",
  },
  "sodium laureth sulfate": {
    name: "Sodium Laureth Sulfate (SLES)",
    level: "moderate",
    description: "Milder than SLS but may still irritate sensitive skin",
  },
  paraben: {
    name: "Parabens",
    level: "high",
    description: "Preservative linked to endocrine disruption concerns",
  },
  methylparaben: {
    name: "Methylparaben",
    level: "high",
    description: "Preservative, potential endocrine disruptor",
  },
  propylparaben: {
    name: "Propylparaben",
    level: "high",
    description: "Preservative, potential endocrine disruptor",
  },
  fragrance: {
    name: "Fragrance/Parfum",
    level: "moderate",
    description: "May contain allergens, can irritate sensitive skin",
  },
  "citric acid": {
    name: "Citric Acid",
    level: "low",
    description: "Natural pH adjuster, generally safe",
  },
  "ascorbic acid": {
    name: "Ascorbic Acid (Vitamin C)",
    level: "low",
    description: "Antioxidant, beneficial for skin",
  },
  niacinamide: {
    name: "Niacinamide (Vitamin B3)",
    level: "low",
    description: "Beneficial for skin barrier",
  },
  "hyaluronic acid": {
    name: "Hyaluronic Acid",
    level: "low",
    description: "Excellent hydrator, safe for all skin types",
  },
  "salicylic acid": {
    name: "Salicylic Acid",
    level: "moderate",
    description: "BHA exfoliant, may irritate if overused",
  },
  "benzoyl peroxide": {
    name: "Benzoyl Peroxide",
    level: "moderate",
    description: "Acne treatment, may cause dryness and irritation",
  },
  retinol: {
    name: "Retinol",
    level: "moderate",
    description: "Vitamin A derivative, may cause sensitivity in sunlight",
  },
  "formaldehyde releasers": {
    name: "Formaldehyde Releasers",
    level: "high",
    description: "Preservatives that release formaldehyde, potential carcinogen",
  },
  "phenoxyethanol": {
    name: "Phenoxyethanol",
    level: "low",
    description: "Preservative, generally safe in low concentrations",
  },
  "cetearyl alcohol": {
    name: "Cetearyl Alcohol",
    level: "low",
    description: "Fatty alcohol, emollient, safe",
  },
  "dimethicone": {
    name: "Dimethicone",
    level: "low",
    description: "Silicone-based skin protectant, safe",
  },
  "titanium dioxide": {
    name: "Titanium Dioxide",
    level: "low",
    description: "Mineral UV filter, safe for topical use",
  },
  "zinc oxide": {
    name: "Zinc Oxide",
    level: "low",
    description: "Mineral UV filter, safe and soothing",
  },
  "oxybenzone": {
    name: "Oxybenzone",
    level: "high",
    description: "Chemical UV filter, potential endocrine disruptor",
  },
  "octinoxate": {
    name: "Octinoxate",
    level: "high",
    description: "Chemical UV filter, potential endocrine disruptor",
  },
  "triclosan": {
    name: "Triclosan",
    level: "high",
    description: "Antibacterial agent, potential endocrine disruptor",
  },
  "phthalates": {
    name: "Phthalates",
    level: "high",
    description: "Plasticizers linked to reproductive harm",
  },
  "sodium chloride": {
    name: "Sodium Chloride",
    level: "low",
    description: "Common salt, safe",
  },
  sugar: { name: "Sugar", level: "low", description: "Natural sweetener" },
  "high fructose corn syrup": {
    name: "High Fructose Corn Syrup",
    level: "moderate",
    description: "Linked to metabolic concerns when consumed excessively",
  },
  "palm oil": {
    name: "Palm Oil",
    level: "moderate",
    description: "High in saturated fat, environmental concerns",
  },
  "soy lecithin": {
    name: "Soy Lecithin",
    level: "low",
    description: "Emulsifier, generally safe",
  },
  "artificial colors": {
    name: "Artificial Colors",
    level: "moderate",
    description: "May cause hyperactivity in children, potential allergen",
  },
  "msg": {
    name: "Monosodium Glutamate (MSG)",
    level: "moderate",
    description: "Flavor enhancer, may cause headaches in sensitive individuals",
  },
  "caffeine": {
    name: "Caffeine",
    level: "low",
    description: "Stimulant, safe in moderate amounts",
  },
  "taurine": {
    name: "Taurine",
    level: "low",
    description: "Amino acid, generally safe",
  },
  "vitamin b12": {
    name: "Vitamin B12",
    level: "low",
    description: "Essential nutrient, safe",
  },
  "iron": { name: "Iron", level: "low", description: "Essential mineral" },
  oats: {
    name: "Oats",
    level: "low",
    description: "Whole grain, good source of fiber",
  },
  calcium: { name: "Calcium", level: "low", description: "Essential mineral" },
  potassium: {
    name: "Potassium",
    level: "low",
    description: "Essential mineral",
  },
  "sodium benzoate": {
    name: "Sodium Benzoate",
    level: "moderate",
    description: "Preservative, may form benzene with vitamin C",
  },
  "potassium sorbate": {
    name: "Potassium Sorbate",
    level: "low",
    description: "Preservative, generally safe",
  },
};

const MOCK_PRODUCTS: Record<string, ProductAnalysis> = {
  "8901234567890": {
    id: "prod-001",
    name: "GlowCare Face Wash",
    brand: "GlowCare",
    category: "cosmetics",
    barcode: "8901234567890",
    safetyScore: 62,
    ingredients: [
      INGREDIENT_DATABASE.water,
      INGREDIENT_DATABASE["sodium lauryl sulfate"],
      INGREDIENT_DATABASE.glycerin,
      INGREDIENT_DATABASE.fragrance,
      INGREDIENT_DATABASE["citric acid"],
      INGREDIENT_DATABASE.methylparaben,
      INGREDIENT_DATABASE.phenoxyethanol,
    ],
    warnings: [
      "Contains SLS — may irritate sensitive skin",
      "Contains methylparaben — potential endocrine concern",
    ],
  },
  "8901234567891": {
    id: "prod-002",
    name: "OatPlus Protein Bar",
    brand: "OatPlus",
    category: "food",
    barcode: "8901234567891",
    safetyScore: 88,
    ingredients: [
      INGREDIENT_DATABASE.oats,
      INGREDIENT_DATABASE["soy lecithin"],
      INGREDIENT_DATABASE.sugar,
      INGREDIENT_DATABASE["sodium chloride"],
      INGREDIENT_DATABASE.caffeine,
      INGREDIENT_DATABASE["vitamin b12"],
      INGREDIENT_DATABASE.iron,
      INGREDIENT_DATABASE.potassium,
    ],
    warnings: [],
  },
  "8901234567892": {
    id: "prod-003",
    name: "FreshGlow Shampoo",
    brand: "FreshGlow",
    category: "personal_care",
    barcode: "8901234567892",
    safetyScore: 35,
    ingredients: [
      INGREDIENT_DATABASE.water,
      INGREDIENT_DATABASE["sodium laureth sulfate"],
      INGREDIENT_DATABASE["sodium lauryl sulfate"],
      INGREDIENT_DATABASE.fragrance,
      INGREDIENT_DATABASE.paraben,
      INGREDIENT_DATABASE["formaldehyde releasers"],
      INGREDIENT_DATABASE["artificial colors"],
      INGREDIENT_DATABASE["phenoxyethanol"],
    ],
    warnings: [
      "Contains SLS and SLES — high irritation risk",
      "Contains parabens — endocrine disruption concern",
      "Contains formaldehyde releasers — potential carcinogen",
      "Contains artificial colors — may cause allergic reactions",
    ],
  },
  "8901234567893": {
    id: "prod-004",
    name: "NatureBest Orange Juice",
    brand: "NatureBest",
    category: "food",
    barcode: "8901234567893",
    safetyScore: 92,
    ingredients: [
      INGREDIENT_DATABASE.water,
      INGREDIENT_DATABASE["ascorbic acid"],
      INGREDIENT_DATABASE["citric acid"],
      INGREDIENT_DATABASE["potassium sorbate"],
      INGREDIENT_DATABASE.calcium,
      INGREDIENT_DATABASE.potassium,
    ],
    warnings: [],
  },
  "8901234567894": {
    id: "prod-005",
    name: "CleanHome Floor Cleaner",
    brand: "CleanHome",
    category: "household",
    barcode: "8901234567894",
    safetyScore: 45,
    ingredients: [
      INGREDIENT_DATABASE.water,
      INGREDIENT_DATABASE["sodium lauryl sulfate"],
      INGREDIENT_DATABASE.fragrance,
      INGREDIENT_DATABASE.triclosan,
      INGREDIENT_DATABASE["sodium benzoate"],
      INGREDIENT_DATABASE["artificial colors"],
    ],
    warnings: [
      "Contains triclosan — potential endocrine disruptor",
      "Contains SLS — skin irritant",
      "Keep away from children and pets",
    ],
  },
  "8901234567895": {
    id: "prod-006",
    name: "DermaShield Sunscreen SPF 50",
    brand: "DermaShield",
    category: "cosmetics",
    barcode: "8901234567895",
    safetyScore: 28,
    ingredients: [
      INGREDIENT_DATABASE.water,
      INGREDIENT_DATABASE.oxybenzone,
      INGREDIENT_DATABASE.octinoxate,
      INGREDIENT_DATABASE["titanium dioxide"],
      INGREDIENT_DATABASE.glycerin,
      INGREDIENT_DATABASE.fragrance,
      INGREDIENT_DATABASE.dimethicone,
      INGREDIENT_DATABASE.methylparaben,
    ],
    warnings: [
      "Contains oxybenzone — endocrine disruptor, avoid on children",
      "Contains octinoxate — potential endocrine disruptor",
      "Contains methylparaben — potential endocrine concern",
    ],
  },
  "8901234567896": {
    id: "prod-007",
    name: "HerbalFresh Toothpaste",
    brand: "HerbalFresh",
    category: "personal_care",
    barcode: "8901234567896",
    safetyScore: 75,
    ingredients: [
      INGREDIENT_DATABASE.water,
      INGREDIENT_DATABASE["sodium chloride"],
      INGREDIENT_DATABASE["citric acid"],
      INGREDIENT_DATABASE.glycerin,
      INGREDIENT_DATABASE["phenoxyethanol"],
      INGREDIENT_DATABASE["potassium sorbate"],
      INGREDIENT_DATABASE.caffeine,
    ],
    warnings: [],
  },
  "8901234567897": {
    id: "prod-008",
    name: "EnergyBoost Drink",
    brand: "EnergyBoost",
    category: "food",
    barcode: "8901234567897",
    safetyScore: 55,
    ingredients: [
      INGREDIENT_DATABASE.water,
      INGREDIENT_DATABASE.sugar,
      INGREDIENT_DATABASE["high fructose corn syrup"],
      INGREDIENT_DATABASE.caffeine,
      INGREDIENT_DATABASE.taurine,
      INGREDIENT_DATABASE["vitamin b12"],
      INGREDIENT_DATABASE["artificial colors"],
      INGREDIENT_DATABASE["sodium benzoate"],
      INGREDIENT_DATABASE.fragrance,
    ],
    warnings: [
      "High sugar content — consume in moderation",
      "High caffeine content — not recommended for children",
      "Contains artificial colors — may cause hyperactivity",
    ],
  },
};

export function lookupProductByBarcode(
  barcode: string,
): ProductAnalysis | null {
  return MOCK_PRODUCTS[barcode.trim()] ?? null;
}

export function analyzeIngredientText(text: string): ProductAnalysis {
  const found: IngredientConcern[] = [];
  const keys = Object.keys(INGREDIENT_DATABASE).sort((a, b) => b.length - a.length);
  let remaining = text.toLowerCase();

  for (const key of keys) {
    if (remaining.includes(key)) {
      found.push(INGREDIENT_DATABASE[key]);
      remaining = remaining.split(key).join(" ");
    }
  }

  if (found.length === 0) {
    found.push({
      name: "Unrecognized Ingredients",
      level: "moderate",
      description:
        "Could not identify ingredients in our database. Manual review recommended.",
    });
  }

  const highCount = found.filter((i) => i.level === "high").length;
  const moderateCount = found.filter((i) => i.level === "moderate").length;
  const score = Math.max(
    10,
    100 - highCount * 20 - moderateCount * 8,
  );

  const warnings = found
    .filter((i) => i.level === "high")
    .map((i) => `${i.name} — ${i.description}`);

  return {
    id: `custom-${Date.now()}`,
    name: "Custom Product",
    brand: "Manual Entry",
    category: "other",
    barcode: "",
    safetyScore: score,
    ingredients: found,
    warnings,
  };
}

export const SAMPLE_BARCODES = [
  { barcode: "8901234567890", name: "GlowCare Face Wash" },
  { barcode: "8901234567891", name: "OatPlus Protein Bar" },
  { barcode: "8901234567892", name: "FreshGlow Shampoo" },
  { barcode: "8901234567893", name: "NatureBest Orange Juice" },
  { barcode: "8901234567894", name: "CleanHome Floor Cleaner" },
  { barcode: "8901234567895", name: "DermaShield Sunscreen SPF 50" },
  { barcode: "8901234567896", name: "HerbalFresh Toothpaste" },
  { barcode: "8901234567897", name: "EnergyBoost Drink" },
];
