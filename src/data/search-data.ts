import type { ProductCategory, ConcernLevel } from "./mock-data";

export type SearchProduct = {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  barcode: string;
  score: number;
  concernLevel: ConcernLevel;
  ingredients: string[];
  matchedIngredients: string[];
  missingIngredients: string[];
  matchPercentage: number;
  matchReasons: string[];
  nutrition: {
    calories: number;
    sugar: string;
    sodium: string;
    saturatedFat: string;
    protein: string;
    fibre: string;
    servingSize: string;
  };
  summary: string;
};

export type NutritionPreference =
  | "lower_sugar"
  | "lower_sodium"
  | "lower_saturated_fat"
  | "higher_protein"
  | "higher_fibre";

export type IngredientPreference =
  | "avoid_specific"
  | "prefer_specific"
  | "fewer_attention"
  | "custom";

export type UserCriteria = {
  nutritionPreferences: NutritionPreference[];
  ingredientPreferences: IngredientPreference[];
  avoidIngredients: string[];
  preferIngredients: string[];
  customCriteria: string;
};

export type SearchFilters = {
  category: ProductCategory | "all";
  ingredientPreferences: string[];
  concernLevel: ConcernLevel | "all";
  nutritionPreferences: NutritionPreference[];
};

export type SortOption = "match" | "concern_low" | "concern_high" | "relevance";

export type ComparisonItem = {
  product: SearchProduct;
  whyMatched: string;
};

const ALL_PRODUCTS: SearchProduct[] = [
  {
    id: "s1",
    name: "PureGlow Gentle Cleanser",
    brand: "PureGlow",
    category: "cosmetics",
    barcode: "8901234567890",
    score: 85,
    concernLevel: "low",
    ingredients: ["Water", "Glycerin", "Ceramides", "Niacinamide", "Phenoxyethanol"],
    matchedIngredients: ["Glycerin", "Niacinamide", "Ceramides"],
    missingIngredients: ["Hyaluronic Acid"],
    matchPercentage: 94,
    matchReasons: ["Low concern level", "Contains gentle surfactants", "No parabens or sulfates"],
    nutrition: { calories: 0, sugar: "0g", sodium: "0mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "N/A" },
    summary: "Gentle facial cleanser with skin-barrier-supporting ceramides and niacinamide.",
  },
  {
    id: "s2",
    name: "FreshStart Protein Bar",
    brand: "FreshStart",
    category: "food",
    barcode: "8901234567891",
    score: 88,
    concernLevel: "low",
    ingredients: ["Oats", "Soy Lecithin", "Sugar", "Vitamin B12", "Iron"],
    matchedIngredients: ["Oats", "Vitamin B12", "Iron"],
    missingIngredients: ["Whey Protein"],
    matchPercentage: 89,
    matchReasons: ["High protein content", "Low sugar for a protein bar", "No artificial colors"],
    nutrition: { calories: 250, sugar: "8g", sodium: "180mg", saturatedFat: "2g", protein: "15g", fibre: "4g", servingSize: "1 bar (60g)" },
    summary: "Whole-grain oat protein bar with essential vitamins and minerals.",
  },
  {
    id: "s3",
    name: "CleanHome Surface Cleaner",
    brand: "CleanHome",
    category: "household",
    barcode: "8901234567894",
    score: 72,
    concernLevel: "moderate",
    ingredients: ["Water", "Plant-based Surfactants", "Citric Acid", "Potassium Sorbate"],
    matchedIngredients: ["Plant-based Surfactants", "Citric Acid"],
    missingIngredients: [],
    matchPercentage: 91,
    matchReasons: ["Plant-based cleaning agents", "No triclosan", "Biodegradable formula"],
    nutrition: { calories: 0, sugar: "0g", sodium: "0mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "N/A" },
    summary: "Plant-based surface cleaner with biodegradable surfactants.",
  },
  {
    id: "s4",
    name: "DermaSoft Sensitive Moisturizer",
    brand: "DermaSoft",
    category: "cosmetics",
    barcode: "8901234567895",
    score: 92,
    concernLevel: "low",
    ingredients: ["Water", "Glycerin", "Ceramides", "Hyaluronic Acid", "Niacinamide", "Phenoxyethanol"],
    matchedIngredients: ["Glycerin", "Hyaluronic Acid", "Niacinamide", "Ceramides"],
    missingIngredients: [],
    matchPercentage: 96,
    matchReasons: ["Very low concern level", "Fragrance-free formula", "Suitable for sensitive skin"],
    nutrition: { calories: 0, sugar: "0g", sodium: "0mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "N/A" },
    summary: "Fragrance-free moisturizer formulated for sensitive skin with ceramides and hyaluronic acid.",
  },
  {
    id: "s5",
    name: "NatureBest Green Tea",
    brand: "NatureBest",
    category: "food",
    barcode: "8901234567893",
    score: 95,
    concernLevel: "low",
    ingredients: ["Green Tea Extract", "Vitamin C", "Citric Acid", "Potassium Sorbate"],
    matchedIngredients: ["Vitamin C", "Citric Acid"],
    missingIngredients: [],
    matchPercentage: 88,
    matchReasons: ["Very low concern level", "Natural ingredients", "Rich in antioxidants"],
    nutrition: { calories: 5, sugar: "0g", sodium: "10mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "8 fl oz (240ml)" },
    summary: "Natural green tea extract beverage with added vitamin C.",
  },
  {
    id: "s6",
    name: "GentleCare Baby Shampoo",
    brand: "GentleCare",
    category: "personal_care",
    barcode: "8901234567896",
    score: 90,
    concernLevel: "low",
    ingredients: ["Water", "Coco-Glucoside", "Glycerin", "Chamomile Extract", "Phenoxyethanol"],
    matchedIngredients: ["Glycerin", "Coco-Glucoside"],
    missingIngredients: ["Oat Extract"],
    matchPercentage: 82,
    matchReasons: ["Sulfate-free formula", "Fragrance-free", "Designed for sensitive skin"],
    nutrition: { calories: 0, sugar: "0g", sodium: "0mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "N/A" },
    summary: "Sulfate-free baby shampoo with chamomile extract for gentle cleansing.",
  },
  {
    id: "s7",
    name: "HerbalFresh Toothpaste",
    brand: "HerbalFresh",
    category: "personal_care",
    barcode: "8901234567897",
    score: 75,
    concernLevel: "low",
    ingredients: ["Water", "Sodium Chloride", "Citric Acid", "Glycerin", "Phenoxyethanol"],
    matchedIngredients: ["Glycerin", "Citric Acid"],
    missingIngredients: ["Fluoride"],
    matchPercentage: 78,
    matchReasons: ["Simple ingredient list", "No artificial colors", "Paraben-free"],
    nutrition: { calories: 0, sugar: "0g", sodium: "0mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "N/A" },
    summary: "Herbal toothpaste with a simple, recognizable ingredient list.",
  },
  {
    id: "s8",
    name: "SkinGuard SPF 50 Sunscreen",
    brand: "SkinGuard",
    category: "cosmetics",
    barcode: "8901234567898",
    score: 88,
    concernLevel: "low",
    ingredients: ["Water", "Zinc Oxide", "Titanium Dioxide", "Glycerin", "Dimethicone"],
    matchedIngredients: ["Zinc Oxide", "Glycerin"],
    missingIngredients: ["Vitamin E"],
    matchPercentage: 85,
    matchReasons: ["Mineral-based UV filters", "No oxybenzone or octinoxate", "Reef-safe formula"],
    nutrition: { calories: 0, sugar: "0g", sodium: "0mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "N/A" },
    summary: "Mineral sunscreen using zinc oxide and titanium dioxide for broad-spectrum protection.",
  },
  {
    id: "s9",
    name: "EcoClean Dish Soap",
    brand: "EcoClean",
    category: "household",
    barcode: "8901234567899",
    score: 80,
    concernLevel: "low",
    ingredients: ["Water", "Plant-based Surfactants", "Lemon Extract", "Potassium Sorbate"],
    matchedIngredients: ["Plant-based Surfactants"],
    missingIngredients: [],
    matchPercentage: 76,
    matchReasons: ["Plant-derived surfactants", "No synthetic fragrances", "Biodegradable"],
    nutrition: { calories: 0, sugar: "0g", sodium: "0mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "N/A" },
    summary: "Eco-friendly dish soap with plant-based cleaning agents and natural lemon extract.",
  },
  {
    id: "s10",
    name: "NutriBoost Protein Shake",
    brand: "NutriBoost",
    category: "food",
    barcode: "8901234567900",
    score: 82,
    concernLevel: "moderate",
    ingredients: ["Whey Protein", "Sugar", "Soy Lecithin", "Vitamin B12", "Iron", "Calcium"],
    matchedIngredients: ["Whey Protein", "Vitamin B12", "Iron"],
    missingIngredients: [],
    matchPercentage: 87,
    matchReasons: ["High protein content", "Contains essential vitamins", "Good mineral profile"],
    nutrition: { calories: 200, sugar: "12g", sodium: "150mg", saturatedFat: "1.5g", protein: "25g", fibre: "2g", servingSize: "1 scoop (30g)" },
    summary: "Whey protein shake with added vitamins and minerals for nutritional support.",
  },
  {
    id: "s11",
    name: "CalmaBody Relaxation Lotion",
    brand: "CalmaBody",
    category: "personal_care",
    barcode: "8901234567901",
    score: 86,
    concernLevel: "low",
    ingredients: ["Water", "Glycerin", "Lavender Oil", "Aloe Vera", "Cetearyl Alcohol"],
    matchedIngredients: ["Glycerin", "Aloe Vera"],
    missingIngredients: ["Shea Butter"],
    matchPercentage: 80,
    matchReasons: ["Natural moisturizing ingredients", "No parabens", "Suitable for sensitive skin"],
    nutrition: { calories: 0, sugar: "0g", sodium: "0mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "N/A" },
    summary: "Relaxing body lotion with aloe vera and natural lavender oil.",
  },
  {
    id: "s12",
    name: "VitalCare Multivitamin",
    brand: "VitalCare",
    category: "food",
    barcode: "8901234567902",
    score: 91,
    concernLevel: "low",
    ingredients: ["Vitamin A", "Vitamin C", "Vitamin D", "Vitamin B12", "Iron", "Calcium", "Potassium"],
    matchedIngredients: ["Vitamin C", "Vitamin B12", "Iron"],
    missingIngredients: [],
    matchPercentage: 93,
    matchReasons: ["Comprehensive vitamin profile", "Low concern level", "No artificial additives"],
    nutrition: { calories: 10, sugar: "0g", sodium: "0mg", saturatedFat: "0g", protein: "0g", fibre: "0g", servingSize: "1 tablet" },
    summary: "Complete multivitamin with essential vitamins and minerals.",
  },
];

export const SEARCH_SUGGESTIONS = [
  "Low sugar products",
  "Fragrance-free skincare",
  "High protein foods",
  "Products without artificial colors",
  "Sensitive skin products",
];

export const POPULAR_CATEGORIES: { key: ProductCategory; label: string }[] = [
  { key: "food", label: "Food & Beverage" },
  { key: "cosmetics", label: "Cosmetics & Skincare" },
  { key: "personal_care", label: "Personal Care" },
  { key: "household", label: "Household" },
];

export const INGREDIENT_PREFERENCES = [
  "Low sugar",
  "High protein",
  "Fragrance-free",
  "Paraben-free",
  "Artificial-color-free",
  "Sulfate-free",
];

export const NUTRITION_PREFERENCES: { key: NutritionPreference; label: string }[] = [
  { key: "lower_sugar", label: "Lower Sugar" },
  { key: "lower_sodium", label: "Lower Sodium" },
  { key: "lower_saturated_fat", label: "Lower Saturated Fat" },
  { key: "higher_protein", label: "Higher Protein" },
  { key: "higher_fibre", label: "Higher Fibre" },
];

export const CRITERIA_OPTIONS: { key: string; label: string; description: string }[] = [
  { key: "lower_sodium", label: "Lower Sodium", description: "Find products with less sodium per serving" },
  { key: "lower_sugar", label: "Lower Sugar", description: "Find products with reduced sugar content" },
  { key: "lower_saturated_fat", label: "Lower Saturated Fat", description: "Find products with less saturated fat" },
  { key: "higher_protein", label: "Higher Protein", description: "Find products with more protein" },
  { key: "higher_fibre", label: "Higher Fibre", description: "Find products with more dietary fibre" },
  { key: "avoid_ingredient", label: "Avoid a Specific Ingredient", description: "Exclude products containing a particular ingredient" },
  { key: "similar_different", label: "Similar Product, Different Ingredients", description: "Find products in the same category with cleaner ingredients" },
  { key: "custom", label: "Custom Criteria", description: "Define your own search criteria" },
];

export function searchProducts(
  query: string,
  filters: SearchFilters,
  sortBy: SortOption,
): SearchProduct[] {
  let results = [...ALL_PRODUCTS];

  if (filters.category !== "all") {
    results = results.filter((p) => p.category === filters.category);
  }

  if (filters.concernLevel !== "all") {
    results = results.filter((p) => p.concernLevel === filters.concernLevel);
  }

  if (filters.nutritionPreferences.length > 0) {
    results = results.filter((p) => {
      return filters.nutritionPreferences.every((pref) => {
        switch (pref) {
          case "lower_sugar":
            return parseInt(p.nutrition.sugar) <= 10;
          case "lower_sodium":
            return parseInt(p.nutrition.sodium) <= 200;
          case "lower_saturated_fat":
            return parseFloat(p.nutrition.saturatedFat) <= 2;
          case "higher_protein":
            return parseInt(p.nutrition.protein) >= 10;
          case "higher_fibre":
            return parseInt(p.nutrition.fibre) >= 3;
          default:
            return true;
        }
      });
    });
  }

  if (query.trim()) {
    const lower = query.toLowerCase();
    const terms = lower.split(/[,\s]+/).filter(Boolean);

    results = results.filter((p) => {
      const searchable = [
        p.name.toLowerCase(),
        p.brand.toLowerCase(),
        p.category.toLowerCase(),
        p.summary.toLowerCase(),
        ...p.ingredients.map((i) => i.toLowerCase()),
      ].join(" ");

      return terms.some((term) => searchable.includes(term));
    });

    results = results.map((p) => {
      const matched = p.ingredients.filter((ing) =>
        terms.some((t) => ing.toLowerCase().includes(t)),
      );
      const matchPct =
        p.ingredients.length > 0
          ? Math.round((matched.length / p.ingredients.length) * 100)
          : 0;
      return {
        ...p,
        matchedIngredients: matched.length > 0 ? matched : p.matchedIngredients,
        matchPercentage: Math.max(matchPct, p.matchPercentage),
      };
    });
  }

  switch (sortBy) {
    case "match":
      results.sort((a, b) => b.matchPercentage - a.matchPercentage);
      break;
    case "concern_low":
      results.sort((a, b) => b.score - a.score);
      break;
    case "concern_high":
      results.sort((a, b) => a.score - b.score);
      break;
    default:
      break;
  }

  return results;
}

export function findAlternatives(
  criteria: UserCriteria,
  allProducts: SearchProduct[] = ALL_PRODUCTS,
): SearchProduct[] {
  let results = [...allProducts];

  if (criteria.nutritionPreferences.length > 0) {
    results = results.filter((p) =>
      criteria.nutritionPreferences.every((pref) => {
        switch (pref) {
          case "lower_sugar":
            return parseInt(p.nutrition.sugar) <= 10;
          case "lower_sodium":
            return parseInt(p.nutrition.sodium) <= 200;
          case "lower_saturated_fat":
            return parseFloat(p.nutrition.saturatedFat) <= 2;
          case "higher_protein":
            return parseInt(p.nutrition.protein) >= 10;
          case "higher_fibre":
            return parseInt(p.nutrition.fibre) >= 3;
          default:
            return true;
        }
      }),
    );
  }

  if (criteria.avoidIngredients.length > 0) {
    results = results.filter((p) =>
      criteria.avoidIngredients.every(
        (avoid) =>
          !p.ingredients.some((ing) =>
            ing.toLowerCase().includes(avoid.toLowerCase()),
          ),
      ),
    );
  }

  if (criteria.preferIngredients.length > 0) {
    results = results.filter((p) =>
      criteria.preferIngredients.some((prefer) =>
        p.ingredients.some((ing) =>
          ing.toLowerCase().includes(prefer.toLowerCase()),
        ),
      ),
    );
  }

  if (
    criteria.ingredientPreferences.includes("fewer_attention")
  ) {
    results = results.filter((p) => p.concernLevel === "low");
  }

  results = results.map((p) => ({
    ...p,
    matchPercentage: calculateMatchScore(p, criteria),
  }));

  results.sort((a, b) => b.matchPercentage - a.matchPercentage);

  return results.slice(0, 8);
}

function calculateMatchScore(
  product: SearchProduct,
  criteria: UserCriteria,
): number {
  let score = product.score;

  if (criteria.nutritionPreferences.includes("lower_sugar")) {
    const sugar = parseInt(product.nutrition.sugar);
    if (sugar <= 5) score += 10;
    else if (sugar <= 10) score += 5;
  }
  if (criteria.nutritionPreferences.includes("higher_protein")) {
    const protein = parseInt(product.nutrition.protein);
    if (protein >= 15) score += 10;
    else if (protein >= 10) score += 5;
  }
  if (criteria.ingredientPreferences.includes("fewer_attention")) {
    if (product.concernLevel === "low") score += 10;
  }

  return Math.min(100, score);
}

export function detectInputType(input: string): "ingredient_list" | "product_name" | "ingredient" {
  const trimmed = input.trim();
  if (trimmed.includes(",")) return "ingredient_list";
  const words = trimmed.split(/\s+/);
  if (words.length > 3) return "ingredient_list";
  const commonIngredients = [
    "water", "sugar", "salt", "oil", "flour", "sodium", "citric",
    "glycerin", "fragrance", "paraben", "sulfate", "acid",
  ];
  if (commonIngredients.some((ci) => trimmed.toLowerCase().includes(ci))) {
    return "ingredient";
  }
  return "product_name";
}
