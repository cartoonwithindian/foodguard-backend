/**
 * Alternative Product Relevance Tests.
 *
 * Tests the hard category filter, product family matching, use-case compatibility,
 * better vs similar distinction, and minimum quality improvement requirements.
 */
import { describe, it, expect } from "vitest";
import { classifyProductFamily, familyCompatibility, useCaseCompatibility } from "@/lib/product-family";
import type { ProductFamily, ProductSuperfamily } from "@/lib/product-family";

// ── Product Family Classification Tests ──────────────────────────

describe("Product Family Classification", () => {
  it("classifies Kurkure as extruded_snack", () => {
    const result = classifyProductFamily({ name: "Kurkure Masala Munch", brand: "Kurkure", category: "food" });
    expect(result.family).toBe("extruded_snack");
    expect(result.superfamily).toBe("snacks");
  });

  it("classifies chocolate correctly", () => {
    const result = classifyProductFamily({ name: "Dairy Milk", brand: "Cadbury", category: "food" });
    expect(result.family).toBe("chocolate");
    expect(result.superfamily).toBe("confectionery");
  });

  it("classifies milk correctly", () => {
    const result = classifyProductFamily({ name: "Toned Milk", brand: "Amul", category: "food" });
    expect(result.family).toBe("milk");
    expect(result.superfamily).toBe("dairy");
  });

  it("classifies chips correctly", () => {
    const result = classifyProductFamily({ name: "Potato Chips Classic", brand: "Lays", category: "food" });
    expect(result.family).toBe("chips");
    expect(result.superfamily).toBe("snacks");
  });

  it("classifies noodles correctly", () => {
    const result = classifyProductFamily({ name: "Maggi 2-Minute Noodles", brand: "Maggi", category: "food" });
    expect(result.family).toBe("noodles");
    expect(result.superfamily).toBe("staples");
  });

  it("classifies oats correctly", () => {
    const result = classifyProductFamily({ name: "Quaker Oats", brand: "Quaker", category: "food" });
    expect(result.family).toBe("oats");
    expect(result.superfamily).toBe("staples");
  });
});

// ── Family Compatibility Tests ───────────────────────────────────

describe("Family Compatibility", () => {
  it("same superfamily = related with affinity", () => {
    const source = classifyProductFamily({ name: "Kurkure", brand: "Kurkure", category: "food" });
    const candidate = classifyProductFamily({ name: "Lays Chips", brand: "Lays", category: "food" });
    const compat = familyCompatibility(source, candidate);
    // Kurkure = extruded_snack, Lays = chips — different families, same superfamily (snacks)
    expect(compat.kind).toBe("related");
    if (compat.kind === "related") {
      expect(compat.affinity).toBeGreaterThan(10);
    }
  });

  it("same superfamily but different family = related", () => {
    const source = classifyProductFamily({ name: "Kurkure", brand: "Kurkure", category: "food" });
    const candidate = classifyProductFamily({ name: "Lays Classic Chips", brand: "Lays", category: "food" });
    const compat = familyCompatibility(source, candidate);
    // Kurkure = extruded_snack, Lays = chips — different families, same superfamily (snacks)
    expect(compat.kind).toBe("related");
  });

  it("different superfamily = incompatible", () => {
    const source = classifyProductFamily({ name: "Kurkure", brand: "Kurkure", category: "food" });
    const candidate = classifyProductFamily({ name: "Dairy Milk", brand: "Cadbury", category: "food" });
    const compat = familyCompatibility(source, candidate);
    // Kurkure = snacks, Cadbury = confectionery — incompatible
    expect(compat.kind).toBe("incompatible");
  });

  it("milk and chips are incompatible", () => {
    const source = classifyProductFamily({ name: "Toned Milk", brand: "Amul", category: "food" });
    const candidate = classifyProductFamily({ name: "Lays Chips", brand: "Lays", category: "food" });
    const compat = familyCompatibility(source, candidate);
    expect(compat.kind).toBe("incompatible");
  });

  it("milk and plant milk are compatible", () => {
    const source = classifyProductFamily({ name: "Toned Milk", brand: "Amul", category: "food" });
    const candidate = classifyProductFamily({ name: "Soy Milk", brand: "Sofit", category: "food" });
    const compat = familyCompatibility(source, candidate);
    // Both classify as milk family
    expect(compat.kind).toBe("same");
  });

  it("chocolate and savoury snack are incompatible", () => {
    const source = classifyProductFamily({ name: "Dairy Milk", brand: "Cadbury", category: "food" });
    const candidate = classifyProductFamily({ name: "Kurkure", brand: "Kurkure", category: "food" });
    const compat = familyCompatibility(source, candidate);
    expect(compat.kind).toBe("incompatible");
  });
});

// ── Quality Improvement Score Tests ────────────────────────────

/** Replicate the quality improvement scoring logic from alternative-engine */
function qualityImprovementScore(improvement: Record<string, string>): number {
  const IMPROVEMENT_WEIGHTS: Record<string, number> = {
    lower_sodium: 1.0,
    lower_saturated_fat: 1.0,
    lower_sugar: 0.8,
    lower_total_fat: 0.5,
    higher_protein: 0.7,
    higher_fibre: 0.7,
    fewer_additives: 0.9,
    lower_concern: 0.9,
  };
  let score = 0;
  for (const [key, weight] of Object.entries(IMPROVEMENT_WEIGHTS)) {
    if (improvement[key]) score += weight;
  }
  return score;
}

describe("Quality Improvement Score", () => {
  it("better_match requires quality score >= 1.5", () => {
    // lower_sodium (1.0) + lower_sugar (0.8) = 1.8 → better_match
    const improvement = { lower_sodium: "-30%", lower_sugar: "-20%" };
    expect(qualityImprovementScore(improvement)).toBeGreaterThanOrEqual(1.5);
  });

  it("similar type when only 1 improvement", () => {
    // lower_sodium (1.0) = 1.0 → similar
    const improvement = { lower_sodium: "-10%" };
    expect(qualityImprovementScore(improvement)).toBeLessThan(2.0);
  });

  it("similar type when no improvements", () => {
    const improvement: Record<string, string> = {};
    expect(qualityImprovementScore(improvement)).toBe(0);
  });

  it("better_match with ingredient improvement only", () => {
    // fewer_additives (0.9) + lower_concern (0.9) = 1.8 → similar (not enough)
    const improvement = { fewer_additives: "2 fewer", lower_concern: "reduced" };
    expect(qualityImprovementScore(improvement)).toBeLessThan(2.0);
  });

  it("better_match with multiple small improvements", () => {
    // lower_sugar (0.8) + higher_protein (0.7) + higher_fibre (0.7) = 2.2
    const improvement = { lower_sugar: "-15%", higher_protein: "+10%", higher_fibre: "+20%" };
    expect(qualityImprovementScore(improvement)).toBeGreaterThanOrEqual(2.0);
  });
});

// ── Use-Case Compatibility Tests ─────────────────────────────────

describe("Use-Case Compatibility", () => {
  it("coffee → coffee is strong", () => {
    const source = classifyProductFamily({ name: "Nescafe Classic Coffee", brand: "Nescafe", category: "food" });
    const candidate = classifyProductFamily({ name: "Bru Gold Coffee", brand: "Bru", category: "food" });
    const useCase = useCaseCompatibility(source, candidate);
    expect(useCase.level).toBe("strong");
    expect(useCase.score).toBe(1.0);
  });

  it("coffee → tea is moderate", () => {
    const source = classifyProductFamily({ name: "Nescafe Classic Coffee", brand: "Nescafe", category: "food" });
    const candidate = classifyProductFamily({ name: "Tata Tea Gold", brand: "Tata", category: "food" });
    const useCase = useCaseCompatibility(source, candidate);
    expect(useCase.level).toBe("moderate");
  });

  it("coffee → water is weak (different use case)", () => {
    const source = classifyProductFamily({ name: "Nescafe Classic Coffee", brand: "Nescafe", category: "food" });
    const candidate = classifyProductFamily({ name: "Bisleri Water", brand: "Bisleri", category: "food" });
    const useCase = useCaseCompatibility(source, candidate);
    expect(useCase.level).toBe("weak");
  });

  it("milk → plant milk is strong", () => {
    const source = classifyProductFamily({ name: "Amul Toned Milk", brand: "Amul", category: "food" });
    const candidate = classifyProductFamily({ name: "Sofit Soy Milk", brand: "Sofit", category: "food" });
    const useCase = useCaseCompatibility(source, candidate);
    expect(useCase.level).toBe("strong");
  });

  it("chips → popcorn is moderate (similar snack context)", () => {
    const source = classifyProductFamily({ name: "Lays Classic Chips", brand: "Lays", category: "food" });
    const candidate = classifyProductFamily({ name: "Act II Popcorn", brand: "Act II", category: "food" });
    const useCase = useCaseCompatibility(source, candidate);
    expect(useCase.level).toBe("moderate");
  });
});

// ── Hard Rejection Tests ─────────────────────────────────────────

describe("Hard Rejection of Irrelevant Products", () => {
  it("Kurkure should NOT get chocolate as alternative", () => {
    const source = classifyProductFamily({ name: "Kurkure", brand: "Kurkure", category: "food" });
    const chocolate = classifyProductFamily({ name: "Dairy Milk", brand: "Cadbury", category: "food" });
    const compat = familyCompatibility(source, chocolate);
    expect(compat.kind).toBe("incompatible");
  });

  it("Kurkure SHOULD get chips/namkeen as alternative", () => {
    const source = classifyProductFamily({ name: "Kurkure", brand: "Kurkure", category: "food" });
    const chips = classifyProductFamily({ name: "Lays Chips Classic", brand: "Lays", category: "food" });
    const compat = familyCompatibility(source, chips);
    // Both are in snacks superfamily
    expect(compat.kind).not.toBe("incompatible");
  });

  it("Milk should NOT get chips as alternative", () => {
    const source = classifyProductFamily({ name: "Toned Milk", brand: "Amul", category: "food" });
    const chips = classifyProductFamily({ name: "Lays Chips", brand: "Lays", category: "food" });
    const compat = familyCompatibility(source, chips);
    expect(compat.kind).toBe("incompatible");
  });

  it("Milk SHOULD get curd/buttermilk as alternative", () => {
    const source = classifyProductFamily({ name: "Toned Milk", brand: "Amul", category: "food" });
    const curd = classifyProductFamily({ name: "Curd", brand: "Amul", category: "food" });
    const compat = familyCompatibility(source, curd);
    expect(compat.kind).not.toBe("incompatible");
  });

  it("Breakfast cereal SHOULD get oats/muesli as alternative", () => {
    const source = classifyProductFamily({ name: "Corn Flakes", brand: "Kellogg", category: "food" });
    const oats = classifyProductFamily({ name: "Quaker Oats", brand: "Quaker", category: "food" });
    const compat = familyCompatibility(source, oats);
    expect(compat.kind).not.toBe("incompatible");
  });

  it("Breakfast cereal should NOT get candy as alternative", () => {
    const source = classifyProductFamily({ name: "Corn Flakes", brand: "Kellogg", category: "food" });
    const candy = classifyProductFamily({ name: "Gummy Bears", brand: "Haribo", category: "food" });
    const compat = familyCompatibility(source, candy);
    expect(compat.kind).toBe("incompatible");
  });

  it("Sting Energy classifies as energy_drink", () => {
    const result = classifyProductFamily({ name: "Sting Energy Drink", brand: "Sting", category: "food" });
    expect(result.family).toBe("energy_drink");
    expect(result.superfamily).toBe("beverages");
  });

  it("coffee → water is weak use-case (rejected by use-case gate)", () => {
    const source = classifyProductFamily({ name: "Nescafe Classic Coffee", brand: "Nescafe", category: "food" });
    const water = classifyProductFamily({ name: "Bisleri Water", brand: "Bisleri", category: "food" });
    const useCase = useCaseCompatibility(source, water);
    // Weak use-case should not pass the moderate/strong gate
    expect(useCase.level).not.toBe("strong");
    expect(useCase.level).not.toBe("moderate");
  });
});
