import { describe, it, expect, beforeAll } from "vitest";
import { personalize } from "@/services/personalization.service";
import { getStore } from "@/lib/store";
import type { IngredientAnalysisItem, AllergenMatch } from "@/types/domain";

beforeAll(() => {
  process.env.DATABASE_URL = "";
});

function item(name: string): IngredientAnalysisItem {
  return {
    rawName: name,
    name,
    function: "",
    assessment: "generally_accepted",
    severity: "low",
    explanation: "",
    evidence: [],
    confidence: 0.95,
    flags: [],
    allergens: [],
    matched: true,
  };
}

describe("personalization", () => {
  it("flags avoid-list conflicts without touching objective facts", async () => {
    const result = await personalize(
      null,
      [item("Palm Oil")],
      [],
      null,
      { avoidIngredients: ["palm oil"] },
    );
    expect(result.flags.some((f) => f.type === "preference_conflict" && f.ingredient === "Palm Oil")).toBe(true);
    expect(result.compatible).toBe(true);
  });

  it("raises high-severity allergen alerts for declared allergies", async () => {
    const allergens: AllergenMatch[] = [
      { allergen: "peanut", type: "contains", confidence: 0.97, evidence: "contains peanut" },
    ];
    const result = await personalize(null, [], allergens, null, { allergies: ["peanut"] });
    const flag = result.flags.find((f) => f.type === "allergen_alert");
    expect(flag?.severity).toBe("high");
    expect(result.compatible).toBe(false);
  });

  it("treats may-contain allergens as moderate, not high", async () => {
    const allergens: AllergenMatch[] = [
      { allergen: "milk", type: "may_contain", confidence: 0.6, evidence: "may contain traces of milk" },
    ];
    const result = await personalize(null, [], allergens, null, { allergies: ["milk"] });
    const flag = result.flags.find((f) => f.type === "allergen_alert");
    expect(flag?.severity).toBe("moderate");
  });

  it("flags vegan conflicts from knowledge-base dietary status", async () => {
    const store = getStore();
    const milk = await store.getIngredientByCanonical("Milk Solids");
    if (!milk) return;
    const result = await personalize(
      null,
      [item(milk.canonicalName)],
      [],
      null,
      { vegan: true },
    );
    expect(result.flags.some((f) => f.type === "dietary_conflict")).toBe(true);
  });

  it("returns compatible when no preferences are set", async () => {
    const result = await personalize(null, [item("Sugar")], [], null, undefined);
    expect(result.compatible).toBe(true);
    expect(result.flags).toEqual([]);
  });
});
