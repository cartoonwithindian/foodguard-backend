import { describe, it, expect } from "vitest";
import { analyzeIngredients } from "@/services/ingredient.service";

/**
 * Separation invariant: USDA-derived intelligence is auxiliary metadata on
 * analysis items. It must never upgrade an unresolved ingredient or change
 * the deterministic FSSAI-grounded assessment.
 */
describe("ingredient analysis intelligence enrichment", () => {
  it("still resolves known additives deterministically", async () => {
    const result = await analyzeIngredients({ ingredients: ["sodium benzoate"] });
    const item = result.items.find((i) => i.rawName.toLowerCase() === "sodium benzoate");
    expect(item).toBeDefined();
    expect(item!.matched).toBe(true);
    // Regulatory assessment comes from the FSSAI registry record, unchanged.
    expect(item!.evidence.length).toBeGreaterThan(0);
  });

  it("attaches non-regulatory intelligence provenance when the corpus matches", async () => {
    const result = await analyzeIngredients({
      ingredients: ["Sodium Benzoate (preservative)"],
    });
    const withIntel = result.items.find((i) => i.intelligence);
    if (withIntel?.intelligence) {
      expect(withIntel.intelligence.source.regulatory).toBe(false);
      expect(withIntel.intelligence.source.type).toBe("ingredient_intelligence");
      expect(withIntel.intelligence.regulatoryStatus).toBe("INSUFFICIENT_DATA");
      expect(withIntel.intelligence.evidence.productOccurrences).toBeGreaterThan(0);
    }
  });

  it("never upgrades unresolved ingredients via intelligence", async () => {
    const result = await analyzeIngredients({
      ingredients: ["sodium benzoate usp grade microfine"],
    });
    const unmatched = result.items.filter((i) => !i.matched);
    for (const item of unmatched) {
      expect(item.assessment).toBe("insufficient_evidence");
      if (item.intelligence) {
        expect(item.intelligence.regulatoryStatus).toBe("INSUFFICIENT_DATA");
        expect(item.intelligence.source.regulatory).toBe(false);
        expect(item.explanation).toMatch(/regulatory status/i);
      }
    }
  });
});
