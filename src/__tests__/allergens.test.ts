import { describe, it, expect } from "vitest";
import { detectAllergens } from "@/lib/allergens";

describe("detectAllergens", () => {
  it("detects confirmed milk via declaration", () => {
    const matches = detectAllergens("Ingredients: Sugar, Cocoa Solids, Milk Solids. Contains milk.");
    const milk = matches.find((m) => m.allergen === "milk");
    expect(milk).toBeDefined();
    expect(milk?.type).toBe("contains");
    expect(milk?.confidence).toBeGreaterThan(0.9);
  });

  it("detects may-contain as weaker than contains", () => {
    const contains = detectAllergens("Contains peanuts");
    const may = detectAllergens("May contain traces of peanuts");
    const c = contains.find((m) => m.allergen === "peanut");
    const m = may.find((m) => m.allergen === "peanut");
    expect(c?.type).toBe("contains");
    expect(m?.type).toBe("may_contain");
    expect((c?.confidence ?? 0)).toBeGreaterThan(m?.confidence ?? 1);
  });

  it("detects processed-in-facility statements", () => {
    const matches = detectAllergens("Processed in a facility with milk");
    const milk = matches.find((m) => m.allergen === "milk");
    expect(milk?.type).toBe("processed_in_facility");
  });

  it("detects gluten from wheat flour", () => {
    const matches = detectAllergens("Refined Wheat Flour (Maida)");
    expect(matches.some((m) => m.allergen === "gluten")).toBe(true);
  });

  it("detects Hindi allergen names", () => {
    const matches = detectAllergens("मूंगफली");
    expect(matches.some((m) => m.allergen === "peanut")).toBe(true);
  });

  it("returns empty for benign text", () => {
    expect(detectAllergens("Water, Salt")).toEqual([]);
  });
});
