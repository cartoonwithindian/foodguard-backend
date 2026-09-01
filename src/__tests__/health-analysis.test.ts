/**
 * Health Analysis Engine — Regression Tests (Cases A–H)
 *
 * Tests the deterministic health findings engine and anti-hallucination validator.
 */

import { describe, it, expect } from "vitest";
import { generateHealthFindings, validateFindings } from "@/lib/health-analysis";
import type { HealthAnalysisInput } from "@/lib/health-analysis";

function makeInput(overrides: Partial<HealthAnalysisInput> = {}): HealthAnalysisInput {
  return {
    product: { name: "Test Product", brand: "TestBrand", category: "food" },
    nutrition: null,
    ingredients: [],
    ...overrides,
  };
}

describe("Health Findings Engine", () => {
  // ── Test A: High saturated fat ──
  it("Test A — generates HIGH_SATURATED_FAT for 12.9g/100g, does NOT mention palm oil unless present", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { saturatedFat: 12.9, calories: 500 },
      }),
    );
    const satFatFindings = result.findings.filter((f) => f.category === "saturated_fat");
    expect(satFatFindings.length).toBeGreaterThan(0);

    const highSatFat = satFatFindings.find((f) => f.severity === "high");
    expect(highSatFat).toBeDefined();
    expect(highSatFat!.value).toBe(12.9);

    // Must NOT mention palm oil unless it's in ingredients
    const allText = result.findings.map((f) => f.explanation).join(" ");
    expect(allText.toLowerCase()).not.toContain("palmolein");
    expect(allText.toLowerCase()).not.toContain("palm oil");
  });

  // ── Test B: High sodium, no package size ──
  it("Test B — generates HIGH_SODIUM for 880mg/100g, does NOT claim per-package", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { sodium: 880, calories: 500 },
      }),
    );
    const sodiumFindings = result.findings.filter((f) => f.category === "sodium");
    expect(sodiumFindings.length).toBeGreaterThan(0);

    const highSodium = sodiumFindings.find((f) => f.severity === "high" && f.basis === "per_100g");
    expect(highSodium).toBeDefined();
    expect(highSodium!.value).toBe(880);

    // Must NOT have per-package finding (no package weight)
    const packageFindings = sodiumFindings.filter((f) => f.basis === "per_package");
    expect(packageFindings.length).toBe(0);
  });

  // ── Test C: Known package size ──
  it("Test C — calculates 440mg sodium per package for 880mg/100g × 50g package", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { sodium: 880, calories: 500, packageWeight: 50 },
      }),
    );
    const packageSodium = result.findings.find(
      (f) => f.category === "sodium" && f.basis === "per_package",
    );
    expect(packageSodium).toBeDefined();
    expect(packageSodium!.value).toBe(440); // 880 * 50 / 100
  });

  // ── Test D: Low sugar + maltodextrin ──
  it("Test D — LOW_SUGAR for 0.5g, does NOT claim maltodextrin causes blood sugar crashes", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { sugars: 0.5, calories: 300 },
        ingredients: [
          { name: "Maltodextrin", function: "refined carbohydrate", assessment: "neutral", severity: "low" },
        ],
      }),
    );
    const sugarFindings = result.findings.filter((f) => f.category === "sugar");
    expect(sugarFindings.length).toBeGreaterThan(0);

    const lowSugar = sugarFindings.find((f) => f.severity === "low" || f.severity === "moderate");
    expect(lowSugar).toBeDefined();

    // Must NOT claim maltodextrin causes blood sugar crashes
    const allText = result.findings.map((f) => f.explanation + " " + f.recommendation).join(" ");
    expect(allText.toLowerCase()).not.toContain("causes blood sugar crashes");
    expect(allText.toLowerCase()).not.toContain("spikes and crashes");
  });

  // ── Test E: Processing score ──
  it("Test E — processing finding follows actual FoodGuard methodology", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { calories: 500 },
        processingScore: 1.0,
        processingLevel: 4,
      }),
    );
    const processingFinding = result.findings.find((f) => f.category === "processing");
    expect(processingFinding).toBeDefined();
    expect(processingFinding!.value).toBe(4);
    expect(processingFinding!.explanation.toLowerCase()).toContain("ultra-processed");
  });

  // ── Test F: Missing nutrition ──
  it("Test F — does NOT generate sodium warning when sodium is missing", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { calories: 500, saturatedFat: 5 },
      }),
    );
    const sodiumFindings = result.findings.filter((f) => f.category === "sodium");
    expect(sodiumFindings.length).toBe(0);
    expect(result.missing_data).toContain("sodium");
  });

  // ── Test G: Unsupported ingredient ──
  it("Test G — does NOT mention palmolein when not in ingredients", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { saturatedFat: 12.9, calories: 500 },
        ingredients: [
          { name: "Wheat Flour", function: "base ingredient", assessment: "neutral", severity: "low" },
        ],
      }),
    );
    const allText = result.findings
      .map((f) => f.explanation + " " + f.recommendation + " " + f.title)
      .join(" ");
    expect(allText.toLowerCase()).not.toContain("palmolein");
    expect(allText.toLowerCase()).not.toContain("palm oil");
  });

  // ── Test H: No package size ──
  it("Test H — does NOT generate package-level calculations when package size unknown", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { sodium: 880, saturatedFat: 7.7, calories: 557 },
      }),
    );
    const packageFindings = result.findings.filter((f) => f.basis === "per_package");
    expect(packageFindings.length).toBe(0);
  });
});

describe("Anti-Hallucination Validator", () => {
  it("rejects findings referencing ingredients not in source data", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { sodium: 880 },
      }),
    );
    // Manually add a bad finding
    result.findings.push({
      finding_id: "bad-1",
      category: "ingredient",
      severity: "high",
      title: "Palmolein concern",
      metric: "ingredient_palmolein",
      value: null,
      unit: "",
      basis: "per_100g",
      threshold: null,
      threshold_unit: null,
      evidence: ["ingredient.palmolein"],
      confidence: "high",
      claim_type: "inference",
      explanation: "The palmolein oil is causing the high saturated fat.",
      recommendation: "",
    });

    const validation = validateFindings(result, makeInput({ nutrition: { sodium: 880 } }));
    expect(validation.rejected.length).toBeGreaterThan(0);
    expect(validation.rejected[0].reason).toContain("palmolein");
  });

  it("rejects findings with unsupported causation claims", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { sodium: 880, sugars: 30 },
      }),
    );
    // Manually add a bad finding with causation
    result.findings.push({
      finding_id: "bad-2",
      category: "sugar",
      severity: "high",
      title: "Sugar danger",
      metric: "sugars",
      value: 30,
      unit: "g",
      basis: "per_100g",
      threshold: 22.5,
      threshold_unit: "g",
      evidence: ["nutrition.sugars"],
      confidence: "high",
      claim_type: "fact",
      explanation: "This product will cause diabetes.",
      recommendation: "",
    });

    const validation = validateFindings(
      result,
      makeInput({ nutrition: { sodium: 880, sugars: 30 } }),
    );
    expect(validation.rejected.length).toBeGreaterThan(0);
    expect(validation.rejected.some((r) => r.reason.toLowerCase().includes("unsupported health claim"))).toBe(true);
  });

  it("passes valid findings through", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { sodium: 880, saturatedFat: 12.9, calories: 500, sugars: 0.5, protein: 6 },
      }),
    );
    const validation = validateFindings(
      result,
      makeInput({
        nutrition: { sodium: 880, saturatedFat: 12.9, calories: 500, sugars: 0.5, protein: 6 },
      }),
    );
    expect(validation.rejected.length).toBe(0);
    expect(validation.valid.length).toBe(result.findings.length);
  });
});

describe("Score bounds", () => {
  it("all findings have valid severity levels", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: {
          sodium: 880,
          saturatedFat: 12.9,
          calories: 557,
          sugars: 2.2,
          protein: 6,
          fiber: 0,
        },
        processingScore: 1.0,
        processingLevel: 4,
      }),
    );
    for (const f of result.findings) {
      expect(["low", "moderate", "high"]).toContain(f.severity);
      expect(["fact", "inference", "recommendation"]).toContain(f.claim_type);
      expect(["high", "medium", "low"]).toContain(f.confidence);
    }
  });

  it("confidence is between 0 and 1", () => {
    const result = generateHealthFindings(
      makeInput({
        nutrition: { sodium: 880, saturatedFat: 5, calories: 400, sugars: 10, protein: 8 },
      }),
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
