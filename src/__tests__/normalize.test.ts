import { describe, it, expect } from "vitest";
import { normalizeIngredient } from "@/lib/ingredients/normalize";
import { splitIngredientList, parseIngredientText } from "@/lib/ingredients/parse";

describe("normalizeIngredient", () => {
  it("resolves E621 to Monosodium Glutamate", () => {
    const result = normalizeIngredient("E621");
    expect(result.matched).toBe(true);
    expect(result.canonicalName).toBe("Monosodium Glutamate");
    expect(result.identifier?.toUpperCase()).toBe("E621");
    expect(result.function).toContain("flavour");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("resolves INS 621 to Monosodium Glutamate", () => {
    const result = normalizeIngredient("INS 621");
    expect(result.matched).toBe(true);
    expect(result.canonicalName).toBe("Monosodium Glutamate");
    expect(result.identifier).toBe("INS 621");
  });

  it("resolves the abbreviation MSG", () => {
    const result = normalizeIngredient("MSG");
    expect(result.matched).toBe(true);
    expect(result.canonicalName).toBe("Monosodium Glutamate");
  });

  it("resolves a full common name with parenthesised code", () => {
    const result = normalizeIngredient("Monosodium Glutamate (INS 621)");
    expect(result.matched).toBe(true);
    expect(result.canonicalName).toBe("Monosodium Glutamate");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("handles capitalization and extra whitespace", () => {
    const result = normalizeIngredient("  sodium   chloride ");
    expect(result.matched).toBe(true);
    expect(result.canonicalName).toBe("Salt");
  });

  it("resolves a Hindi name", () => {
    const result = normalizeIngredient("चीनी");
    expect(result.matched).toBe(true);
    expect(result.canonicalName).toBe("Sugar");
  });

  it("resolves E250 sodium nitrite", () => {
    const result = normalizeIngredient("E250");
    expect(result.matched).toBe(true);
    expect(result.canonicalName).toBe("Sodium Nitrite");
  });

  it("does not fabricate unknown ingredients", () => {
    const result = normalizeIngredient("XYZ-123");
    expect(result.matched).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.canonicalName).toBeUndefined();
  });

  it("resolves a quantity-prefixed ingredient", () => {
    const result = normalizeIngredient("2% palm oil");
    expect(result.matched).toBe(true);
    expect(result.canonicalName).toBe("Palm Oil");
  });
});

describe("splitIngredientList", () => {
  it("splits on commas", () => {
    expect(splitIngredientList("potato, salt, sugar")).toEqual(["potato", "salt", "sugar"]);
  });

  it("removes quantity prefixes", () => {
    expect(splitIngredientList("Potato (45%), Palm Oil (30%), Salt (2%)")).toEqual(["Potato", "Palm Oil", "Salt"]);
  });

  it("removes may-contain statements", () => {
    const result = splitIngredientList("Potato, Salt. May contain traces of peanuts");
    expect(result).toEqual(["Potato", "Salt"]);
    expect(result.join()).not.toContain("peanut");
  });
});

describe("parseIngredientText", () => {
  it("extracts the ingredients section from a full label", () => {
    const { listText, ingredients } = parseIngredientText(
      "Nutrition Facts: Energy 500 kcal. Ingredients: Corn Flour, Palm Oil, Salt, INS 621. May contain peanuts.",
    );
    expect(listText).toBeDefined();
    expect(ingredients).toContain("Corn Flour");
    expect(ingredients).toContain("INS 621");
  });
});
