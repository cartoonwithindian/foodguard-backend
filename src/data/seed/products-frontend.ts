import type { ProductCategory, NutritionFacts } from "@/types/domain";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";

export type ProductSeed = {
  barcode: string;
  name: string;
  brand: string;
  category: ProductCategory;
  country?: string;
  servingSize?: string;
  imageUrl?: string;
  ingredientsRaw: string;
  nutrition?: {
    servingSize?: string;
    servingsPerContainer?: string;
    per100g: Record<string, { value: number; unit: string }>;
    perServing?: Record<string, { value: number; unit: string }>;
  };
  source: string;
  sourceUrl?: string;
  verified: boolean;
  isDemo: boolean;
  confidence: number;
};

export function buildNutrition(seed: ProductSeed["nutrition"]): NutritionFacts | null {
  if (!seed) return null;
  const nutrients = (basis: "PER_100G" | "PER_SERVING", map: Record<string, { value: number; unit: string }>) =>
    Object.fromEntries(
      Object.entries(map).map(([key, nv]) => [key, { value: nv.value, unit: nv.unit, confidence: 0.7 }]),
    );
  return normalizeNutritionFacts({
    servingSize: seed.servingSize,
    servingsPerContainer: seed.servingsPerContainer,
    basis: "PER_100G",
    nutrients: nutrients("PER_100G", seed.per100g),
  });
}

/**
 * The 8 demo products the existing frontend references (SAMPLE_BARCODES).
 * Kept identical so barcode scans return the same products the UI shows.
 * All marked isDemo: true - they are illustrative, not verified retail data.
 */
export const FRONTEND_PRODUCT_SEED: ProductSeed[] = [
  {
    barcode: "8901234567890",
    name: "GlowCare Face Wash",
    brand: "GlowCare",
    category: "cosmetics",
    country: "IN",
    ingredientsRaw:
      "Ingredients: Aqua (Water), Sodium Lauryl Sulfate, Glycerin, Parfum (Fragrance), Citric Acid, Methylparaben, Phenoxyethanol.",
    source: "FoodGaurd demo dataset",
    verified: false,
    isDemo: true,
    confidence: 0.8,
  },
  {
    barcode: "8901234567891",
    name: "OatPlus Protein Bar",
    brand: "OatPlus",
    category: "food",
    country: "IN",
    servingSize: "1 bar (60g)",
    imageUrl: "/products/oatplus-bar.png",
    ingredientsRaw:
      "Ingredients: Oats, Soy Lecithin, Sugar, Sodium Chloride, Caffeine, Vitamin B12, Iron, Potassium.",
    nutrition: {
      servingSize: "1 bar (60g)",
      servingsPerContainer: "1",
      per100g: {
        calories: { value: 417, unit: "kcal" },
        protein: { value: 25, unit: "g" },
        carbohydrates: { value: 50, unit: "g" },
        sugars: { value: 13, unit: "g" },
        totalFat: { value: 12, unit: "g" },
        saturatedFat: { value: 3.3, unit: "g" },
        fiber: { value: 6.7, unit: "g" },
        sodium: { value: 300, unit: "mg" },
      },
      perServing: {
        calories: { value: 250, unit: "kcal" },
        protein: { value: 15, unit: "g" },
        carbohydrates: { value: 30, unit: "g" },
        sugars: { value: 8, unit: "g" },
        totalFat: { value: 7.2, unit: "g" },
        saturatedFat: { value: 2, unit: "g" },
        fiber: { value: 4, unit: "g" },
        sodium: { value: 180, unit: "mg" },
      },
    },
    source: "FoodGaurd demo dataset",
    verified: false,
    isDemo: true,
    confidence: 0.8,
  },
  {
    barcode: "8901234567892",
    name: "FreshGlow Shampoo",
    brand: "FreshGlow",
    category: "personal_care",
    country: "IN",
    ingredientsRaw:
      "Ingredients: Aqua (Water), Sodium Laureth Sulfate, Sodium Lauryl Sulfate, Parfum, Parabens, Formaldehyde Releasers, Artificial Colours, Phenoxyethanol.",
    source: "FoodGaurd demo dataset",
    verified: false,
    isDemo: true,
    confidence: 0.8,
  },
  {
    barcode: "8901234567893",
    name: "NatureBest Orange Juice",
    brand: "NatureBest",
    category: "food",
    country: "IN",
    servingSize: "200ml",
    imageUrl: "/products/orange-juice.png",
    ingredientsRaw:
      "Ingredients: Water, Orange Juice Concentrate, Ascorbic Acid (Vitamin C), Citric Acid, Potassium Sorbate, Calcium, Potassium.",
    nutrition: {
      servingSize: "200ml",
      servingsPerContainer: "5",
      per100g: {
        calories: { value: 46, unit: "kcal" },
        protein: { value: 0.7, unit: "g" },
        carbohydrates: { value: 10.4, unit: "g" },
        sugars: { value: 9, unit: "g" },
        totalFat: { value: 0.2, unit: "g" },
        saturatedFat: { value: 0, unit: "g" },
        fiber: { value: 0.2, unit: "g" },
        sodium: { value: 3, unit: "mg" },
      },
    },
    source: "FoodGaurd demo dataset",
    verified: false,
    isDemo: true,
    confidence: 0.8,
  },
  {
    barcode: "8901234567894",
    name: "CleanHome Floor Cleaner",
    brand: "CleanHome",
    category: "household",
    country: "IN",
    ingredientsRaw:
      "Ingredients: Water, Sodium Lauryl Sulfate, Parfum, Triclosan, Sodium Benzoate, Artificial Colours.",
    source: "FoodGaurd demo dataset",
    verified: false,
    isDemo: true,
    confidence: 0.8,
  },
  {
    barcode: "8901234567895",
    name: "DermaShield Sunscreen SPF 50",
    brand: "DermaShield",
    category: "cosmetics",
    country: "IN",
    ingredientsRaw:
      "Ingredients: Water, Oxybenzone, Octinoxate, Titanium Dioxide, Glycerin, Parfum, Dimethicone, Methylparaben.",
    source: "FoodGaurd demo dataset",
    verified: false,
    isDemo: true,
    confidence: 0.8,
  },
  {
    barcode: "8901234567896",
    name: "HerbalFresh Toothpaste",
    brand: "HerbalFresh",
    category: "personal_care",
    country: "IN",
    ingredientsRaw:
      "Ingredients: Water, Sodium Chloride, Citric Acid, Glycerin, Phenoxyethanol, Potassium Sorbate, Caffeine.",
    source: "FoodGaurd demo dataset",
    verified: false,
    isDemo: true,
    confidence: 0.8,
  },
  {
    barcode: "8901234567897",
    name: "EnergyBoost Drink",
    brand: "EnergyBoost",
    category: "food",
    country: "IN",
    servingSize: "250ml",
    imageUrl: "/products/energy-drink.png",
    ingredientsRaw:
      "Ingredients: Water, Sugar, High Fructose Corn Syrup, Caffeine, Taurine, Vitamin B12, Artificial Colours, Sodium Benzoate, Parfum.",
    nutrition: {
      servingSize: "250ml",
      servingsPerContainer: "1",
      per100g: {
        calories: { value: 45, unit: "kcal" },
        protein: { value: 0, unit: "g" },
        carbohydrates: { value: 11.2, unit: "g" },
        sugars: { value: 11, unit: "g" },
        totalFat: { value: 0, unit: "g" },
        saturatedFat: { value: 0, unit: "g" },
        fiber: { value: 0, unit: "g" },
        sodium: { value: 15, unit: "mg" },
      },
    },
    source: "FoodGaurd demo dataset",
    verified: false,
    isDemo: true,
    confidence: 0.8,
  },
];
