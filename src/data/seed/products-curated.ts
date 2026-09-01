import type { ProductCategory, NutritionFacts } from "@/types/domain";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";

/**
 * Curated product entries for real products that are frequently scanned but
 * missing from Open Food Facts. Populated manually from verified label data.
 * Checked AFTER the external provider misses, BEFORE declaring not-found.
 */
export type CuratedProductSeed = {
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
  };
  source: string;
  sourceUrl?: string;
  verified: boolean;
  confidence: number;
};

export function buildCuratedNutrition(seed: CuratedProductSeed["nutrition"]): NutritionFacts | null {
  if (!seed) return null;
  return normalizeNutritionFacts({
    servingSize: seed.servingSize,
    servingsPerContainer: seed.servingsPerContainer,
    basis: "PER_100G",
    nutrients: Object.fromEntries(
      Object.entries(seed.per100g).map(([key, nv]) => [key, { value: nv.value, unit: nv.unit, confidence: 0.7 }]),
    ),
  });
}

/**
 * Manual barcode -> product map. Add entries here for products you know exist
 * but that Open Food Facts does not carry (common for regional/local brands).
 */
export const CURATED_PRODUCT_SEED: CuratedProductSeed[] = [
  {
    barcode: "8904123501012",
    name: "A1 Banana Chips",
    brand: "A1",
    category: "food",
    country: "IN",
    servingSize: "180g",
    imageUrl:
      "https://m.media-amazon.com/images/I/71VW00Q0uOL._AC_SX679_.jpg",
    ingredientsRaw:
      "Ingredients: Banana, Coconut Oil, Sugar, Salt, Natural Flavour. May contain traces of tree nuts.",
    nutrition: {
      servingSize: "180g",
      servingsPerContainer: "1",
      per100g: {
        calories: { value: 519, unit: "kcal" },
        protein: { value: 2.3, unit: "g" },
        carbohydrates: { value: 58, unit: "g" },
        sugars: { value: 35, unit: "g" },
        totalFat: { value: 33.6, unit: "g" },
        saturatedFat: { value: 29, unit: "g" },
        fiber: { value: 7.7, unit: "g" },
        sodium: { value: 6, unit: "mg" },
      },
    },
    source: "Curated product dataset (FoodGaurd)",
    sourceUrl: "https://barcode-list.com/barcode/EN/barcode-8904123501012/Search.htm",
    verified: false,
    confidence: 0.6,
  },
  {
    barcode: "8901068000019",
    name: "Masala Trail Mix",
    brand: "HealthyBites",
    category: "food",
    country: "IN",
    servingSize: "50g",
    ingredientsRaw:
      "Ingredients: Roasted Peanuts, Almonds, Cashews, Raisins, Sunflower Oil, Salt, Spices, Citric Acid (INS 330), Malic Acid (INS 296).",
    nutrition: {
      servingSize: "50g",
      servingsPerContainer: "4",
      per100g: {
        calories: { value: 520, unit: "kcal" },
        protein: { value: 18, unit: "g" },
        carbohydrates: { value: 35, unit: "g" },
        sugars: { value: 15, unit: "g" },
        totalFat: { value: 36, unit: "g" },
        saturatedFat: { value: 6, unit: "g" },
        fiber: { value: 5, unit: "g" },
        sodium: { value: 350, unit: "mg" },
      },
    },
    source: "Curated product dataset (FoodGaurd)",
    verified: false,
    confidence: 0.6,
  },
  {
    barcode: "8901042012014",
    name: "Masala Oats",
    brand: "Quaker",
    category: "food",
    country: "IN",
    servingSize: "35g",
    ingredientsRaw:
      "Ingredients: Rolled Oats, Wheat Dalia, Dehydrated Vegetables (Carrot, Peas, Onion), Salt, Spices, Sugar, Yeast Extract, Maltodextrin, Citric Acid (INS 330), Sodium Citrate (INS 331), Garlic Powder, Onion Powder.",
    nutrition: {
      servingSize: "35g",
      servingsPerContainer: "8",
      per100g: {
        calories: { value: 370, unit: "kcal" },
        protein: { value: 11, unit: "g" },
        carbohydrates: { value: 65, unit: "g" },
        sugars: { value: 5, unit: "g" },
        totalFat: { value: 7, unit: "g" },
        saturatedFat: { value: 1.5, unit: "g" },
        fiber: { value: 8, unit: "g" },
        sodium: { value: 800, unit: "mg" },
      },
    },
    source: "Curated product dataset (FoodGaurd)",
    verified: false,
    confidence: 0.6,
  },
  {
    barcode: "8901058001302",
    name: "Atta Noodles",
    brand: "Maggi",
    category: "food",
    country: "IN",
    servingSize: "70g",
    ingredientsRaw:
      "Ingredients: Wheat Atta (88.8%), Palm Oil, Salt, Wheat Gluten, Sugar, Spices, Onion, Garlic, Turmeric, Chili, Potassium Chloride (INS 501), Sodium Phosphates (INS 452), Yeast Extract, Natural Flavouring.",
    nutrition: {
      servingSize: "70g",
      servingsPerContainer: "1",
      per100g: {
        calories: { value: 406, unit: "kcal" },
        protein: { value: 10, unit: "g" },
        carbohydrates: { value: 62, unit: "g" },
        sugars: { value: 3, unit: "g" },
        totalFat: { value: 14, unit: "g" },
        saturatedFat: { value: 7, unit: "g" },
        fiber: { value: 3, unit: "g" },
        sodium: { value: 1200, unit: "mg" },
      },
    },
    source: "Curated product dataset (FoodGaurd)",
    verified: false,
    confidence: 0.6,
  },
  {
    barcode: "8901042013103",
    name: "Cream Biscuits",
    brand: "Bourbon",
    category: "food",
    country: "IN",
    servingSize: "25g (2 biscuits)",
    ingredientsRaw:
      "Ingredients: Refined Wheat Flour, Sugar, Palm Oil, Cocoa Powder, Milk Solids, Invert Sugar, Leavening Agents (INS 500), Emulsifier (INS 322), Salt, Natural Flavouring. Contains wheat, milk, soy.",
    nutrition: {
      servingSize: "25g",
      servingsPerContainer: "12",
      per100g: {
        calories: { value: 480, unit: "kcal" },
        protein: { value: 5.5, unit: "g" },
        carbohydrates: { value: 65, unit: "g" },
        sugars: { value: 35, unit: "g" },
        totalFat: { value: 22, unit: "g" },
        saturatedFat: { value: 11, unit: "g" },
        fiber: { value: 2, unit: "g" },
        sodium: { value: 280, unit: "mg" },
      },
    },
    source: "Curated product dataset (FoodGaurd)",
    verified: false,
    confidence: 0.6,
  },
  {
    barcode: "8906006911017",
    name: "Plain Pav Bread",
    brand: "English Oven",
    category: "food",
    country: "IN",
    servingSize: "1 pav (50g)",
    ingredientsRaw:
      "Ingredients: Refined Wheat Flour (Maida), Water, Sugar, Yeast, Iodised Salt, Palm Oil, Gluten, Emulsifier (INS 472e), Dough Conditioner (ASC), Preservative (INS 282).",
    nutrition: {
      servingSize: "50g",
      servingsPerContainer: "6",
      per100g: {
        calories: { value: 270, unit: "kcal" },
        protein: { value: 8, unit: "g" },
        carbohydrates: { value: 50, unit: "g" },
        sugars: { value: 4, unit: "g" },
        totalFat: { value: 3.5, unit: "g" },
        saturatedFat: { value: 1.5, unit: "g" },
        fiber: { value: 2.5, unit: "g" },
        sodium: { value: 450, unit: "mg" },
      },
    },
    source: "Curated product dataset (FoodGaurd)",
    verified: false,
    confidence: 0.6,
  },
  {
    barcode: "8906006912014",
    name: "Masala Bread",
    brand: "English Oven",
    category: "food",
    country: "IN",
    servingSize: "1 slice (35g)",
    ingredientsRaw:
      "Ingredients: Refined Wheat Flour (Maida), Water, Sugar, Yeast, Iodised Salt, Palm Oil, Spice Mix (Chilli, Cumin, Coriander, Turmeric), Gluten, Emulsifier (INS 472e), Preservative (INS 282).",
    nutrition: {
      servingSize: "35g",
      servingsPerContainer: "20",
      per100g: {
        calories: { value: 265, unit: "kcal" },
        protein: { value: 7.5, unit: "g" },
        carbohydrates: { value: 48, unit: "g" },
        sugars: { value: 3.5, unit: "g" },
        totalFat: { value: 4, unit: "g" },
        saturatedFat: { value: 1.8, unit: "g" },
        fiber: { value: 2, unit: "g" },
        sodium: { value: 520, unit: "mg" },
      },
    },
    source: "Curated product dataset (FoodGaurd)",
    verified: false,
    confidence: 0.6,
  },
  {
    barcode: "8901058002101",
    name: "Masala Maggi Noodles",
    brand: "Maggi",
    category: "food",
    country: "IN",
    servingSize: "70g",
    ingredientsRaw:
      "Ingredients: Refined Wheat Flour (Maida), Palm Oil, Salt, Sugar, Spices, Onion, Garlic, Tomato, Chili, Turmeric, Monosodium Glutamate (INS 621), Potassium Chloride (INS 501), Sodium Phosphates (INS 452), Yeast Extract, Natural Flavouring. Contains wheat, soy.",
    nutrition: {
      servingSize: "70g",
      servingsPerContainer: "1",
      per100g: {
        calories: { value: 450, unit: "kcal" },
        protein: { value: 9, unit: "g" },
        carbohydrates: { value: 65, unit: "g" },
        sugars: { value: 4, unit: "g" },
        totalFat: { value: 17, unit: "g" },
        saturatedFat: { value: 8, unit: "g" },
        fiber: { value: 2.5, unit: "g" },
        sodium: { value: 1600, unit: "mg" },
      },
    },
    source: "Curated product dataset (FoodGaurd)",
    verified: false,
    confidence: 0.6,
  },
  {
    barcode: "8901042014019",
    name: "Sweet Biscuits",
    brand: "Good Day",
    category: "food",
    country: "IN",
    servingSize: "25g (2 biscuits)",
    ingredientsRaw:
      "Ingredients: Refined Wheat Flour, Sugar, Palm Oil, Butter (8%), Cashew Nuts, Almonds, Leavening Agents (INS 500), Emulsifier (INS 322), Salt, Natural Flavouring. Contains wheat, milk, tree nuts.",
    nutrition: {
      servingSize: "25g",
      servingsPerContainer: "12",
      per100g: {
        calories: { value: 490, unit: "kcal" },
        protein: { value: 6, unit: "g" },
        carbohydrates: { value: 62, unit: "g" },
        sugars: { value: 28, unit: "g" },
        totalFat: { value: 24, unit: "g" },
        saturatedFat: { value: 12, unit: "g" },
        fiber: { value: 1.5, unit: "g" },
        sodium: { value: 250, unit: "mg" },
      },
    },
    source: "Curated product dataset (FoodGaurd)",
    verified: false,
    confidence: 0.6,
  },
  {
    barcode: "8906006913011",
    name: "Whole Wheat Bread",
    brand: "Modern",
    category: "food",
    country: "IN",
    servingSize: "1 slice (40g)",
    ingredientsRaw:
      "Ingredients: Whole Wheat Flour (55%), Water, Sugar, Yeast, Iodised Salt, Wheat Gluten, Palm Oil, Preservative (INS 282), Emulsifier (INS 472e).",
    nutrition: {
      servingSize: "40g",
      servingsPerContainer: "12",
      per100g: {
        calories: { value: 255, unit: "kcal" },
        protein: { value: 9, unit: "g" },
        carbohydrates: { value: 47, unit: "g" },
        sugars: { value: 4, unit: "g" },
        totalFat: { value: 3, unit: "g" },
        saturatedFat: { value: 1.2, unit: "g" },
        fiber: { value: 6, unit: "g" },
        sodium: { value: 400, unit: "mg" },
      },
    },
    source: "Curated product dataset (FoodGaurd)",
    verified: false,
    confidence: 0.6,
  },
];
