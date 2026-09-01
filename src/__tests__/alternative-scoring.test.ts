import { describe, it, expect } from "vitest";
import { calculateAlternativeScore, type ScoringInput } from "@/services/alternative-scoring.service";
import type { ProductInfo, NutritionFacts } from "@/types/domain";

// Helper to create mock product
function createMockProduct(overrides: Partial<ProductInfo> = {}): ProductInfo {
  return {
    id: "test-product-1",
    barcode: "1234567890",
    name: "Test Product",
    brand: "Test Brand",
    category: "food",
    country: "IN",
    servingSize: "100g",
    imageUrl: null,
    ingredientsRaw: "sugar, salt, oil",
    ingredientsNormalized: ["sugar", "salt", "oil"],
    source: "mock",
    sourceUrl: null,
    verified: true,
    productDataConfidence: 0.8,
    isDemo: false,
    ...overrides,
  };
}

// Helper to create mock nutrition
function createMockNutrition(overrides: Record<string, number> = {}): NutritionFacts {
  return {
    basis: "PER_100G",
    nutrients: {
      calories: { value: overrides.calories ?? 200, unit: "kcal", confidence: 0.8 },
      sugars: { value: overrides.sugars ?? 10, unit: "g", confidence: 0.8 },
      sodium: { value: overrides.sodium ?? 200, unit: "mg", confidence: 0.8 },
      saturatedFat: { value: overrides.saturatedFat ?? 5, unit: "g", confidence: 0.8 },
      protein: { value: overrides.protein ?? 5, unit: "g", confidence: 0.8 },
      fiber: { value: overrides.fiber ?? 2, unit: "g", confidence: 0.8 },
    },
  };
}

describe("Alternative Scoring Service", () => {
  describe("calculateAlternativeScore", () => {
    it("should calculate score for similar products", () => {
      const sourceProduct = createMockProduct({ category: "food" });
      const candidateProduct = createMockProduct({
        id: "candidate-1",
        name: "Candidate Product",
        category: "food",
      });

      const input: ScoringInput = {
        sourceProduct,
        candidateProduct,
        sourceNutrition: createMockNutrition(),
        candidateNutrition: createMockNutrition({ sodium: 150, sugars: 8 }),
        sourceIngredientIds: ["sugar", "salt", "oil"],
        candidateIngredientIds: ["sugar", "salt", "oil"],
        sourceConcernScore: 1,
        candidateConcernScore: 0,
        userPreferences: null,
        dataConfidence: 0.7,
      };

      const result = calculateAlternativeScore(input, () => null);

      expect(result.overallScore).toBeGreaterThan(50);
      expect(result.similarityScore).toBeGreaterThan(50);
      expect(result.nutritionScore).toBeGreaterThan(50);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it("should give higher score for better nutrition", () => {
      const sourceProduct = createMockProduct();
      const candidateProduct = createMockProduct({ id: "candidate-1" });

      const input: ScoringInput = {
        sourceProduct,
        candidateProduct,
        sourceNutrition: createMockNutrition({ sodium: 500, sugars: 20 }),
        candidateNutrition: createMockNutrition({ sodium: 100, sugars: 5 }),
        sourceIngredientIds: ["sugar", "salt", "oil"],
        candidateIngredientIds: ["sugar", "salt", "oil"],
        sourceConcernScore: 2,
        candidateConcernScore: 0,
        userPreferences: null,
        dataConfidence: 0.8,
      };

      const result = calculateAlternativeScore(input, () => null);

      expect(result.nutritionScore).toBeGreaterThan(60);
      expect(result.improvement.sodium).toBeDefined();
      expect(result.improvement.sugars).toBeDefined();
    });

    it("should weight similarity higher than nutrition (similarity-first approach)", () => {
      const sourceProduct = createMockProduct({ category: "food" });
      
      // Candidate A: Very similar, slightly better nutrition
      const candidateA = createMockProduct({
        id: "candidate-a",
        name: "Similar Snack",
        category: "food",
      });

      // Candidate B: Different category, much better nutrition
      const candidateB = createMockProduct({
        id: "candidate-b",
        name: "Health Bar",
        category: "other",
      });

      const inputA: ScoringInput = {
        sourceProduct,
        candidateProduct: candidateA,
        sourceNutrition: createMockNutrition({ sodium: 500 }),
        candidateNutrition: createMockNutrition({ sodium: 400 }),
        sourceIngredientIds: ["sugar", "salt", "oil"],
        candidateIngredientIds: ["sugar", "salt", "oil"],
        sourceConcernScore: 1,
        candidateConcernScore: 0,
        userPreferences: null,
        dataConfidence: 0.7,
      };

      const inputB: ScoringInput = {
        sourceProduct,
        candidateProduct: candidateB,
        sourceNutrition: createMockNutrition({ sodium: 500 }),
        candidateNutrition: createMockNutrition({ sodium: 100 }),
        sourceIngredientIds: ["sugar", "salt", "oil"],
        candidateIngredientIds: ["protein", "fiber", "vitamins"],
        sourceConcernScore: 1,
        candidateConcernScore: 0,
        userPreferences: null,
        dataConfidence: 0.7,
      };

      const resultA = calculateAlternativeScore(inputA, () => null);
      const resultB = calculateAlternativeScore(inputB, () => null);

      // Candidate A should score higher because it's more similar
      // even though Candidate B has better nutrition
      expect(resultA.overallScore).toBeGreaterThan(resultB.overallScore);
      expect(resultA.similarityScore).toBeGreaterThan(resultB.similarityScore);
    });

    it("should penalize products with allergens when user has allergies", () => {
      const sourceProduct = createMockProduct();
      const candidateProduct = createMockProduct({
        id: "candidate-1",
        ingredientsRaw: "sugar, peanuts, salt",
      });

      const input: ScoringInput = {
        sourceProduct,
        candidateProduct,
        sourceNutrition: createMockNutrition(),
        candidateNutrition: createMockNutrition(),
        sourceIngredientIds: ["sugar", "salt"],
        candidateIngredientIds: ["sugar", "peanuts", "salt"],
        sourceConcernScore: 0,
        candidateConcernScore: 1,
        userPreferences: {
          allergies: ["peanuts"],
        },
        dataConfidence: 0.7,
      };

      const result = calculateAlternativeScore(input, () => null);

      expect(result.dietaryCompatibilityScore).toBeLessThan(50);
    });

    it("should handle missing nutrition data", () => {
      const sourceProduct = createMockProduct();
      const candidateProduct = createMockProduct({ id: "candidate-1" });

      const input: ScoringInput = {
        sourceProduct,
        candidateProduct,
        sourceNutrition: null,
        candidateNutrition: null,
        sourceIngredientIds: ["sugar", "salt"],
        candidateIngredientIds: ["sugar", "salt"],
        sourceConcernScore: 0,
        candidateConcernScore: 0,
        userPreferences: null,
        dataConfidence: 0.3,
      };

      const result = calculateAlternativeScore(input, () => null);

      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.evidenceQualityScore).toBeLessThan(50);
    });

    it("should calculate similarity based on ingredient overlap", () => {
      const sourceProduct = createMockProduct();
      const candidateProduct = createMockProduct({ id: "candidate-1" });

      // High overlap
      const inputHighOverlap: ScoringInput = {
        sourceProduct,
        candidateProduct,
        sourceNutrition: createMockNutrition(),
        candidateNutrition: createMockNutrition(),
        sourceIngredientIds: ["sugar", "salt", "oil", "flour"],
        candidateIngredientIds: ["sugar", "salt", "oil", "flour"],
        sourceConcernScore: 0,
        candidateConcernScore: 0,
        userPreferences: null,
        dataConfidence: 0.7,
      };

      const resultHigh = calculateAlternativeScore(inputHighOverlap, () => null);

      // Low overlap
      const inputLowOverlap: ScoringInput = {
        sourceProduct,
        candidateProduct,
        sourceNutrition: createMockNutrition(),
        candidateNutrition: createMockNutrition(),
        sourceIngredientIds: ["sugar", "salt", "oil", "flour"],
        candidateIngredientIds: ["water", "preservative", "color"],
        sourceConcernScore: 0,
        candidateConcernScore: 0,
        userPreferences: null,
        dataConfidence: 0.7,
      };

      const resultLow = calculateAlternativeScore(inputLowOverlap, () => null);

      expect(resultHigh.similarityScore).toBeGreaterThan(resultLow.similarityScore);
    });

    it("should respect vegetarian preferences", () => {
      const sourceProduct = createMockProduct();
      const candidateProduct = createMockProduct({ id: "candidate-1" });

      const input: ScoringInput = {
        sourceProduct,
        candidateProduct,
        sourceNutrition: createMockNutrition(),
        candidateNutrition: createMockNutrition(),
        sourceIngredientIds: ["sugar", "salt"],
        candidateIngredientIds: ["sugar", "gelatin", "salt"],
        sourceConcernScore: 0,
        candidateConcernScore: 0,
        userPreferences: {
          vegetarian: true,
        },
        dataConfidence: 0.7,
      };

      // Mock ingredient record for gelatin
      const result = calculateAlternativeScore(input, (name) => {
        if (name === "gelatin") {
          return { dietaryStatus: ["not_vegan", "contains_animal"] };
        }
        return null;
      });

      expect(result.dietaryCompatibilityScore).toBeLessThan(100);
    });

    it("should normalize scores to 0-100 range", () => {
      const sourceProduct = createMockProduct();
      const candidateProduct = createMockProduct({ id: "candidate-1" });

      const input: ScoringInput = {
        sourceProduct,
        candidateProduct,
        sourceNutrition: createMockNutrition(),
        candidateNutrition: createMockNutrition(),
        sourceIngredientIds: ["sugar", "salt"],
        candidateIngredientIds: ["sugar", "salt"],
        sourceConcernScore: 0,
        candidateConcernScore: 0,
        userPreferences: null,
        dataConfidence: 0.7,
      };

      const result = calculateAlternativeScore(input, () => null);

      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.similarityScore).toBeGreaterThanOrEqual(0);
      expect(result.similarityScore).toBeLessThanOrEqual(100);
      expect(result.nutritionScore).toBeGreaterThanOrEqual(0);
      expect(result.nutritionScore).toBeLessThanOrEqual(100);
    });
  });
});
