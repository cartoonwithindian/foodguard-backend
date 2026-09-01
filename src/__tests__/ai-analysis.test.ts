import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAIProvider, type AnalysisExplanationInput } from "@/lib/ai";

// Mock config
vi.mock("@/lib/config", () => ({
  config: {
    ai: {
      provider: "mock",
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    },
  },
}));

describe("AI Analysis Explanation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("MockAIProvider", () => {
    it("should provide structured analysis explanation", async () => {
      const provider = getAIProvider();

      const input: AnalysisExplanationInput = {
        product: {
          name: "Test Product",
          brand: "Test Brand",
          category: "food",
        },
        ingredients: [
          {
            name: "Sugar",
            function: "Sweetener",
            assessment: "generally_accepted",
            severity: "low",
            evidence: [
              { organization: "WHO", summary: "Sugar is generally safe in moderation" },
            ],
          },
          {
            name: "E621",
            function: "Flavor enhancer",
            assessment: "noteworthy",
            severity: "moderate",
            evidence: [
              { organization: "FSSAI", summary: "Permitted with conditions" },
            ],
          },
        ],
        nutrition: {
          calories: 200,
          sugar: 10,
          sodium: 200,
          saturatedFat: 5,
          protein: 5,
          fiber: 2,
        },
        regulatory: [
          {
            type: "FSSAI",
            status: "COMPLIANT",
            details: "Product meets FSSAI standards",
          },
        ],
        chemicalInfo: [],
        webEvidence: [
          {
            title: "FSSAI Standards",
            url: "https://fssai.gov.in",
            snippet: "Official FSSAI standards",
            sourceType: "government",
            authority: "primary",
          },
        ],
        safetyAlerts: [],
        healthContext: [],
        userPreferences: {
          vegetarian: true,
          allergies: [],
          healthGoals: ["weight_loss"],
        },
      };

      const result = await provider.explainAnalysis!(input);

      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.positivePoints).toBeDefined();
      expect(result.concerns).toBeDefined();
      expect(result.ingredientExplanations).toBeDefined();
      expect(result.ingredientExplanations.length).toBe(2);
      expect(result.nutritionExplanation).toBeDefined();
      expect(result.recommendation).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("should categorize ingredients correctly", async () => {
      const provider = getAIProvider();

      const input: AnalysisExplanationInput = {
        product: {
          name: "Test Product",
          category: "food",
        },
        ingredients: [
          {
            name: "Vitamin C",
            function: "Nutrient",
            assessment: "beneficial",
            severity: "low",
            evidence: [],
          },
          {
            name: "Unknown Additive",
            function: "Unknown",
            assessment: "insufficient_evidence",
            severity: "moderate",
            evidence: [],
          },
          {
            name: "Peanuts",
            function: "Allergen",
            assessment: "allergen",
            severity: "high",
            evidence: [],
          },
        ],
        nutrition: null,
        regulatory: [],
        chemicalInfo: [],
        webEvidence: [],
        safetyAlerts: [],
        healthContext: [],
        userPreferences: null,
      };

      const result = await provider.explainAnalysis!(input);

      expect(result.ingredientExplanations.length).toBe(3);

      const vitaminC = result.ingredientExplanations.find(e => e.name === "Vitamin C");
      expect(vitaminC?.category).toBe("health_evidence");

      const unknown = result.ingredientExplanations.find(e => e.name === "Unknown Additive");
      expect(unknown?.category).toBe("uncertainty");

      const peanuts = result.ingredientExplanations.find(e => e.name === "Peanuts");
      expect(peanuts?.category).toBe("fact");
    });

    it("should handle missing nutrition data", async () => {
      const provider = getAIProvider();

      const input: AnalysisExplanationInput = {
        product: {
          name: "Test Product",
          category: "food",
        },
        ingredients: [],
        nutrition: null,
        regulatory: [],
        chemicalInfo: [],
        webEvidence: [],
        safetyAlerts: [],
        healthContext: [],
        userPreferences: null,
      };

      const result = await provider.explainAnalysis!(input);

      expect(result.nutritionExplanation).toBe("No nutrition data available.");
    });

    it("should calculate confidence based on data completeness", async () => {
      const provider = getAIProvider();

      // Low data input
      const lowDataInput: AnalysisExplanationInput = {
        product: {
          name: "Test Product",
          category: "food",
        },
        ingredients: [],
        nutrition: null,
        regulatory: [],
        chemicalInfo: [],
        webEvidence: [],
        safetyAlerts: [],
        healthContext: [],
        userPreferences: null,
      };

      const lowResult = await provider.explainAnalysis!(lowDataInput);

      // High data input
      const highDataInput: AnalysisExplanationInput = {
        ...lowDataInput,
        ingredients: [
          { name: "Ing1", function: "F1", assessment: "beneficial", severity: "low", evidence: [] },
          { name: "Ing2", function: "F2", assessment: "neutral", severity: "low", evidence: [] },
        ],
        nutrition: { calories: 100 },
        regulatory: [{ type: "FSSAI", status: "OK", details: "Details" }],
        webEvidence: [{ title: "Title", url: "https://example.com", snippet: "Snippet", sourceType: "government", authority: "primary" }],
      };

      const highResult = await provider.explainAnalysis!(highDataInput);

      expect(highResult.confidence).toBeGreaterThan(lowResult.confidence);
    });

    it("should provide health goal recommendations", async () => {
      const provider = getAIProvider();

      const input: AnalysisExplanationInput = {
        product: {
          name: "High Sugar Product",
          category: "food",
        },
        ingredients: [
          {
            name: "Sugar",
            function: "Sweetener",
            assessment: "generally_accepted",
            severity: "low",
            evidence: [],
          },
        ],
        nutrition: {
          calories: 300,
          sugar: 25,
          sodium: 500,
        },
        regulatory: [],
        chemicalInfo: [],
        webEvidence: [],
        safetyAlerts: ["High sugar content"],
        healthContext: [],
        userPreferences: {
          healthGoals: ["weight_loss"],
        },
      };

      const result = await provider.explainAnalysis!(input);

      expect(result.concerns.length).toBeGreaterThan(0);
      expect(result.recommendation).toBeDefined();
    });
  });
});
