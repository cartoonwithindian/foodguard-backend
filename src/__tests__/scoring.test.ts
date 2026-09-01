import { describe, it, expect } from "vitest";
import { computeScore, scoreToAssessment, scoreNutrition, assessmentToSeverity } from "@/lib/scoring";
import type { IngredientAnalysisItem, NutritionFacts } from "@/types/domain";

function item(name: string, assessment: IngredientAnalysisItem["assessment"]): IngredientAnalysisItem {
  return {
    rawName: name,
    name,
    function: "test",
    assessment,
    severity: "low",
    explanation: "",
    evidence: [],
    confidence: 0.9,
    flags: [],
    allergens: [],
    matched: true,
  };
}

describe("product scoring", () => {
  it("starts at 70 and applies factor deltas", () => {
    const { score } = computeScore([{ factor: "x", impact: -10, explanation: "", category: "nutrition" }]);
    expect(score).toBe(60);
  });

  it("clamps the score", () => {
    expect(computeScore([{ factor: "x", impact: -100, explanation: "", category: "nutrition" }]).score).toBe(50);
    expect(computeScore([{ factor: "x", impact: 100, explanation: "", category: "nutrition" }]).score).toBe(90);
  });

  it("maps scores to assessment levels", () => {
    expect(scoreToAssessment(90, 0.9)).toBe("low");
    expect(scoreToAssessment(70, 0.9)).toBe("moderate");
    expect(scoreToAssessment(40, 0.9)).toBe("high");
    expect(scoreToAssessment(80, 0.3)).toBe("insufficient");
  });

  it("concerning ingredients reduce the score", () => {
    const ingredients = [item("TBHQ", "potentially_concerning")];
    const factors = ingredients.map((i) =>
      ({ factor: `ing_${i.name}`, impact: i.assessment === "potentially_concerning" ? -6 : 0, explanation: "", category: "ingredients" as const }),
    );
    const { score } = computeScore(factors);
    expect(score).toBe(64);
  });

  it("nutrition concerns reduce the score with reasons", () => {
    const nutrition: NutritionFacts = {
      basis: "PER_100G",
      nutrients: { sodium: { value: 1500, unit: "mg", confidence: 0.9 } },
    };
    const { factors } = scoreNutrition(nutrition);
    expect(factors.some((f) => f.factor === "nutrition_sodium" && f.impact < 0)).toBe(true);
    expect(factors[0]?.explanation.length).toBeGreaterThan(10);
  });

  it("severity mapping is consistent", () => {
    expect(assessmentToSeverity("potentially_concerning")).toBe("high");
    expect(assessmentToSeverity("allergen")).toBe("high");
    expect(assessmentToSeverity("noteworthy")).toBe("moderate");
    expect(assessmentToSeverity("beneficial")).toBe("low");
  });
});
