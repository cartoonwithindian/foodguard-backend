/**
 * Special Food Checker — KB Integration Tests
 *
 * Tests that the enhanced SpecialFoodChecker correctly:
 *  - Loads and indexes actual FSSAI special_food_rules.json
 *  - Matches food categories against KB rules
 *  - Falls back to hardcoded rules for well-known categories
 *  - Returns empty results for non-matching categories
 */

import { describe, it, expect } from "vitest";
import { SpecialFoodChecker } from "@/services/regulatory/fssai/special-food-checker";

describe("SpecialFoodChecker", () => {
  const checker = new SpecialFoodChecker();

  it("returns results for infant food category", async () => {
    const results = await checker.checkSpecialRules("Infant Food");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.category.toLowerCase().includes("infant"))).toBe(true);
  });

  it("returns results for organic food", async () => {
    const results = await checker.checkSpecialRules("Organic Food");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.category.toLowerCase().includes("organic"))).toBe(true);
  });

  it("returns results for alcoholic beverage", async () => {
    const results = await checker.checkSpecialRules("Alcoholic Beverage");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.category.toLowerCase().includes("alcoholic"))).toBe(true);
  });

  it("returns results for nutraceutical", async () => {
    const results = await checker.checkSpecialRules("Nutraceutical Health Supplement");
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns fewer results for a nonsense category than a real one", async () => {
    const nonsense = await checker.checkSpecialRules("xyzzyplugh12345");
    const real = await checker.checkSpecialRules("Infant Food");
    expect(nonsense.length).toBeLessThan(real.length);
  });

  it("returns empty array for undefined category", async () => {
    const results = await checker.checkSpecialRules(undefined);
    expect(results).toEqual([]);
  });

  it("each result has required fields", async () => {
    const results = await checker.checkSpecialRules("Infant Food");
    for (const result of results) {
      expect(result.category).toBeTruthy();
      expect(result.requirement).toBeTruthy();
      expect(Array.isArray(result.sourceReferences)).toBe(true);
      expect(result.sourceReferences.length).toBeGreaterThan(0);
    }
  });

  it("matches milk category", async () => {
    const results = await checker.checkSpecialRules("Milk and Milk Products");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.requirement.length > 10)).toBe(true);
  });
});
