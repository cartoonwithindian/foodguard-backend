import type { ProductCategory } from "./mock-data";

export type NutritionField = {
  label: string;
  value: string | number;
  unit: string;
  available: boolean;
};

export type DetailedNutrition = {
  calories: NutritionField;
  totalFat: NutritionField;
  saturatedFat: NutritionField;
  transFat: NutritionField;
  cholesterol: NutritionField;
  sodium: NutritionField;
  totalCarbohydrates: NutritionField;
  dietaryFibre: NutritionField;
  totalSugars: NutritionField;
  addedSugars: NutritionField;
  protein: NutritionField;
  vitaminD: NutritionField;
  calcium: NutritionField;
  iron: NutritionField;
  potassium: NutritionField;
  salt?: NutritionField;
};

export type NutritionAttentionArea = {
  name: string;
  nutrient?: string;
  value: string;
  unit?: string;
  basis?: string;
  threshold?: number;
  reason: string;
  severity: "low" | "moderate" | "high";
  source?: string;
};

export type NutritionPositivePoint = {
  name: string;
  value: string;
  description: string;
};

export type NutritionSourceInfo = {
  sourceName: string;
  sourceType: string;
  database?: string;
  summary: string;
  url?: string;
};

export type NutritionProductDetail = {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  barcode: string;
  scanDate: string;
  servingSize: string;
  servingsPerContainer?: string;
  nutrition: DetailedNutrition;
  attentionAreas: NutritionAttentionArea[];
  positivePoints: NutritionPositivePoint[];
  context: string;
  dataQuality: "high" | "medium" | "low";
  dataQualityExplanation: string;
  source?: NutritionSourceInfo;
};

function nf(
  label: string,
  value: string | number,
  unit: string,
  available = true,
): NutritionField {
  return { label, value, unit, available };
}

const MOCK_NUTRITION: Record<string, NutritionProductDetail> = {
  "8901234567891": {
    id: "nut-002",
    name: "OatPlus Protein Bar",
    brand: "OatPlus",
    category: "food",
    barcode: "8901234567891",
    scanDate: "Just now",
    servingSize: "1 bar (60g)",
    servingsPerContainer: "1",
    nutrition: {
      calories: nf("Calories", 250, "kcal"),
      totalFat: nf("Total Fat", 7, "g"),
      saturatedFat: nf("Saturated Fat", 2, "g"),
      transFat: nf("Trans Fat", 0, "g"),
      cholesterol: nf("Cholesterol", 0, "mg"),
      sodium: nf("Sodium", 180, "mg"),
      totalCarbohydrates: nf("Total Carbohydrates", 32, "g"),
      dietaryFibre: nf("Dietary Fibre", 4, "g"),
      totalSugars: nf("Total Sugars", 8, "g"),
      addedSugars: nf("Added Sugars", 5, "g"),
      protein: nf("Protein", 15, "g"),
      vitaminD: nf("Vitamin D", 0, "mcg"),
      calcium: nf("Calcium", 120, "mg"),
      iron: nf("Iron", 3.6, "mg"),
      potassium: nf("Potassium", 200, "mg"),
    },
    attentionAreas: [
      {
        name: "Added Sugar",
        value: "5g",
        reason: "Moderate added sugar content for a protein bar. Within acceptable range but worth noting.",
        severity: "low",
      },
    ],
    positivePoints: [
      {
        name: "Protein",
        value: "15g",
        description: "Provides a meaningful amount of protein per serving, supporting satiety and muscle maintenance.",
      },
      {
        name: "Dietary Fibre",
        value: "4g",
        description: "Contains dietary fibre from whole grain oats, contributing to digestive health.",
      },
      {
        name: "Low Saturated Fat",
        value: "2g",
        description: "Low saturated fat content relative to serving size.",
      },
      {
        name: "No Cholesterol",
        value: "0mg",
        description: "Contains no cholesterol, consistent with plant-based ingredients.",
      },
    ],
    context:
      "This protein bar provides a balanced nutritional profile with good protein content and moderate calories. The sugar content is reasonable for a protein bar format. The fibre from whole grain oats adds nutritional value. Consider the serving size when evaluating these values in the context of your daily intake.",
    dataQuality: "high",
    dataQualityExplanation:
      "Nutrition data is based on complete product labeling information. All standard nutrition fields are available.",
    source: {
      sourceName: "Product Nutrition Label",
      sourceType: "Product Information",
      summary: "Data extracted from the product's official nutrition facts label.",
    },
  },
  "8901234567893": {
    id: "nut-004",
    name: "NatureBest Orange Juice",
    brand: "NatureBest",
    category: "food",
    barcode: "8901234567893",
    scanDate: "Just now",
    servingSize: "8 fl oz (240ml)",
    servingsPerContainer: "1",
    nutrition: {
      calories: nf("Calories", 110, "kcal"),
      totalFat: nf("Total Fat", 0, "g"),
      saturatedFat: nf("Saturated Fat", 0, "g"),
      transFat: nf("Trans Fat", 0, "g"),
      cholesterol: nf("Cholesterol", 0, "mg"),
      sodium: nf("Sodium", 0, "mg"),
      totalCarbohydrates: nf("Total Carbohydrates", 26, "g"),
      dietaryFibre: nf("Dietary Fibre", 0, "g"),
      totalSugars: nf("Total Sugars", 22, "g"),
      addedSugars: nf("Added Sugars", 0, "g"),
      protein: nf("Protein", 0, "g"),
      vitaminD: nf("Vitamin D", 0, "mcg"),
      calcium: nf("Calcium", 30, "mg"),
      iron: nf("Iron", 0, "mg"),
      potassium: nf("Potassium", 450, "mg"),
    },
    attentionAreas: [
      {
        name: "Total Sugars",
        value: "22g",
        reason: "Naturally occurring fruit sugars. Expected in juice products but worth considering for daily sugar intake.",
        severity: "low",
      },
    ],
    positivePoints: [
      {
        name: "No Added Sugar",
        value: "0g",
        description: "Contains no added sugars — all sugars are naturally occurring from the fruit.",
      },
      {
        name: "No Sodium",
        value: "0mg",
        description: "Contains no sodium, which is favorable for sodium-conscious diets.",
      },
      {
        name: "No Fat",
        value: "0g",
        description: "Contains no fat, saturated fat, or trans fat.",
      },
      {
        name: "Potassium",
        value: "450mg",
        description: "Good source of potassium, an important mineral for fluid balance.",
      },
    ],
    context:
      "This orange juice has a simple nutritional profile with no fat, sodium, or added sugars. The sugars present are naturally occurring from the fruit. It provides potassium but no fibre, which is typical for filtered juice products. The calorie content is moderate for a juice serving.",
    dataQuality: "high",
    dataQualityExplanation:
      "Nutrition data is based on complete product labeling information. All standard nutrition fields are available.",
    source: {
      sourceName: "Product Nutrition Label",
      sourceType: "Product Information",
      summary: "Data extracted from the product's official nutrition facts label.",
    },
  },
  "8901234567897": {
    id: "nut-008",
    name: "EnergyBoost Drink",
    brand: "EnergyBoost",
    category: "food",
    barcode: "8901234567897",
    scanDate: "Just now",
    servingSize: "16 fl oz (473ml)",
    servingsPerContainer: "1",
    nutrition: {
      calories: nf("Calories", 160, "kcal"),
      totalFat: nf("Total Fat", 0, "g"),
      saturatedFat: nf("Saturated Fat", 0, "g"),
      transFat: nf("Trans Fat", 0, "g"),
      cholesterol: nf("Cholesterol", 0, "mg"),
      sodium: nf("Sodium", 250, "mg"),
      totalCarbohydrates: nf("Total Carbohydrates", 42, "g"),
      dietaryFibre: nf("Dietary Fibre", 0, "g"),
      totalSugars: nf("Total Sugars", 38, "g"),
      addedSugars: nf("Added Sugars", 38, "g"),
      protein: nf("Protein", 0, "g"),
      vitaminD: nf("Vitamin D", 0, "mcg"),
      calcium: nf("Calcium", 0, "mg"),
      iron: nf("Iron", 0, "mg"),
      potassium: nf("Potassium", 30, "mg"),
    },
    attentionAreas: [
      {
        name: "Added Sugars",
        value: "38g",
        reason: "High added sugar content. The WHO recommends limiting free sugars to less than 10% of total energy intake, ideally below 5%. This single serving provides a significant portion of that limit.",
        severity: "high",
      },
      {
        name: "Sodium",
        value: "250mg",
        reason: "Moderate sodium content for a beverage. Contributes to daily sodium intake.",
        severity: "moderate",
      },
    ],
    positivePoints: [],
    context:
      "This energy drink has a high sugar content with 38g of added sugars per serving, which represents a significant portion of the recommended daily limit. The sodium content is moderate for a beverage. There is no protein, fibre, or significant micronutrient content. Consider the serving size and frequency of consumption when evaluating these values.",
    dataQuality: "high",
    dataQualityExplanation:
      "Nutrition data is based on complete product labeling information. All standard nutrition fields are available.",
    source: {
      sourceName: "Product Nutrition Label",
      sourceType: "Product Information",
      summary: "Data extracted from the product's official nutrition facts label.",
    },
  },
};

export function lookupNutrition(
  barcode: string,
): NutritionProductDetail | null {
  return MOCK_NUTRITION[barcode.trim()] ?? null;
}
