import { describe, it, expect } from "vitest";
import { assessNutrition } from "@/lib/nutrition/analyze";
import { detectPalmOil, detectMaida } from "@/lib/ingredients/detection";
import { getAlternativeCharacteristic } from "@/lib/alternative-characteristics";
import type { NutritionFacts } from "@/types/domain";

function nutrition(nutrients: Record<string, number>): NutritionFacts {
  return {
    basis: "PER_100G",
    nutrients: Object.fromEntries(
      Object.entries(nutrients).map(([k, value]) => [k, { value, unit: "g", confidence: 0.9 }]),
    ),
  };
}

describe("added-sugar detection", () => {
  it("flags a valid high addedSugars value", () => {
    const assessment = assessNutrition(nutrition({ addedSugars: 30 }));
    const concern = assessment.concerns.find((c) => c.nutrient === "addedSugars");
    expect(concern).toBeDefined();
    expect(concern?.level).toBe("high");
  });

  it("produces the correct issue signal for high added sugar", () => {
    const assessment = assessNutrition(nutrition({ addedSugars: 30 }));
    const concern = assessment.concerns.find((c) => c.nutrient === "addedSugars");
    expect(getAlternativeCharacteristic(concern?.nutrient ?? "")?.key).toBe("LOWER_ADDED_SUGAR");
  });

  it("does NOT treat total sugar alone as added sugar", () => {
    const assessment = assessNutrition(nutrition({ sugars: 30 }));
    expect(assessment.concerns.some((c) => c.nutrient === "addedSugars")).toBe(false);
  });

  it("does not produce a false positive when addedSugars is missing", () => {
    const assessment = assessNutrition(nutrition({ sodium: 300 }));
    expect(assessment.concerns.some((c) => c.nutrient === "addedSugars")).toBe(false);
  });

  it("does not flag zero added sugar as high", () => {
    const assessment = assessNutrition(nutrition({ addedSugars: 0, sugars: 20 }));
    expect(assessment.concerns.some((c) => c.nutrient === "addedSugars")).toBe(false);
  });

  it("flags a moderate added sugar value as moderate", () => {
    const assessment = assessNutrition(nutrition({ addedSugars: 8 }));
    const concern = assessment.concerns.find((c) => c.nutrient === "addedSugars");
    expect(concern?.level).toBe("moderate");
  });
});

describe("palm-oil detection", () => {
  it("detects plain palm oil", () => {
    expect(detectPalmOil(["Sugar", "Palm Oil", "Salt"])).toBe("Palm Oil");
  });

  it("detects a declared palm-oil alias (Palmolein)", () => {
    expect(detectPalmOil(["Palmolein"])).toBe("Palm Oil");
  });

  it("detects another declared alias (RBD Palm Oil)", () => {
    expect(detectPalmOil(["RBD Palm Oil"])).toBe("Palm Oil");
  });

  it("does not falsely detect unrelated text containing 'palm'", () => {
    expect(detectPalmOil(["Palm Kernel Oil"])).toBeNull();
    expect(detectPalmOil(["Date Palm Sugar"])).toBeNull();
    expect(detectPalmOil(["palm wax"])).toBeNull();
  });

  it("returns null when no palm oil is present", () => {
    expect(detectPalmOil(["Sugar", "Salt", "Maida"])).toBeNull();
  });

  it("detects maida as the WHOLE_GRAIN signal", () => {
    expect(detectMaida(["Maida"])).toBe("Refined Wheat Flour (Maida)");
    expect(getAlternativeCharacteristic("Maida")?.key).toBe("WHOLE_GRAIN");
  });

  it("palm oil signal flows into the Phase 1 mapper", () => {
    expect(getAlternativeCharacteristic("Palm Oil")?.key).toBe("PALM_OIL_FREE");
    expect(getAlternativeCharacteristic(detectPalmOil(["Palmolein"]) ?? "")?.key).toBe("PALM_OIL_FREE");
  });
});