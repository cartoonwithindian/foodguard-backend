import { describe, it, expect } from "vitest";
import {
  lookupIngredientIntelligence,
  getIntelligenceByCategory,
  ingredientSimilarity,
  usdaIntelligenceStats,
} from "@/lib/ingredients/usda-intelligence";
import { resolveRegulatoryStatus, isRegulatorySource, compareSources, STANDARD_PROVENANCE } from "@/lib/sources/priority";

describe("USDA-derived intelligence loader", () => {
  it("loads snapshot with integrity invariants", () => {
    const stats = usdaIntelligenceStats();
    expect(stats.regulatoryAuthority).toBe(false);
    expect(stats.role).toBe("ingredient_intelligence");
    expect(stats.recordCount).toBeGreaterThan(0);
    expect(stats.fssaiMatchedRecords).toBeGreaterThan(0);
    expect(stats.aliasCount).toBeGreaterThan(0);
    expect(stats.sourceDataset.underlying_source).toContain("USDA FoodData Central");
  });

  it("resolves canonical and alias surface forms case-insensitively", () => {
    const hit = lookupIngredientIntelligence("Sodium Benzoate");
    expect(hit.matched).toBe(true);
    expect(hit.canonicalName!.toLowerCase()).toBe("sodium benzoate");
    expect(hit.sources[0].regulatory).toBe(false);
    expect(hit.sources[0].type).toBe("ingredient_intelligence");

    const aliasHit = lookupIngredientIntelligence(hit.canonicalName!);
    expect(aliasHit.matched).toBe(true);
  });

  it("returns an unmatched result for unseen text without guessing", () => {
    const hit = lookupIngredientIntelligence("zzz totally unknown compound xyz");
    expect(hit.matched).toBe(false);
    expect(hit.matchType).toBe("none");
    expect(hit.classification.confidence).toBe(0);
    expect(hit.sources).toEqual([]);
  });

  it("every returned record carries non-regulatory provenance", () => {
    for (const name of ["sodium benzoate", "citric acid", "xanthan gum", "guar gum"]) {
      const hit = lookupIngredientIntelligence(name);
      if (hit.matched) {
        expect(hit.sources[0].type).toBe("ingredient_intelligence");
        expect(hit.sources[0].regulatory).toBe(false);
      }
    }
  });

  it("category queries return records sorted by corpus frequency", () => {
    const recs = getIntelligenceByCategory("Preservative");
    if (recs.length > 1) {
      for (let i = 1; i < recs.length; i++) {
        expect(recs[i - 1].occurrenceCount).toBeGreaterThanOrEqual(recs[i].occurrenceCount);
      }
    }
  });

  it("similarity is bounded and symmetric", () => {
    const s1 = ingredientSimilarity("sodium benzoate", "sodium benzoate");
    expect(s1).toBeCloseTo(1);
    const s2 = ingredientSimilarity("sodium benzoate", "potassium sorbate");
    expect(s2).toBeGreaterThanOrEqual(0);
    expect(s2).toBeLessThanOrEqual(1);
    expect(
      ingredientSimilarity("sodium benzoate", "potassium sorbate"),
    ).toBeCloseTo(ingredientSimilarity("potassium sorbate", "sodium benzoate"));
  });
});

describe("source priority & regulatory guard", () => {
  it("never lets intelligence sources answer regulatory questions", () => {
    const resolution = resolveRegulatoryStatus([STANDARD_PROVENANCE.usdaIngredientIntelligence()]);
    expect(resolution.status).toBe("INSUFFICIENT_DATA");
    expect(resolution.detail).toMatch(/cannot establish/i);
  });

  it("prefers the highest-authority regulatory source", () => {
    const resolution = resolveRegulatoryStatus([
      STANDARD_PROVENANCE.usdaIngredientIntelligence(),
      STANDARD_PROVENANCE.fssai(),
    ]);
    expect(resolution.status).toBe("verified");
    expect(resolution.authority!.type).toBe("fssai_regulatory");
  });

  it("isRegulatorySource requires both flag and type agreement", () => {
    expect(isRegulatorySource(STANDARD_PROVENANCE.fssai())).toBe(true);
    expect(
      isRegulatorySource({
        name: "spoof",
        type: "ingredient_intelligence",
        regulatory: true,
      }),
    ).toBe(false);
  });

  it("compareSources ranks regulatory above intelligence regardless of names", () => {
    expect(compareSources(STANDARD_PROVENANCE.fssai(), STANDARD_PROVENANCE.usdaIngredientIntelligence())).toBeLessThan(0);
    expect(compareSources(STANDARD_PROVENANCE.usdaIngredientIntelligence(), { name: "a", type: "other_dataset", regulatory: false })).toBeLessThan(0);
  });
});
