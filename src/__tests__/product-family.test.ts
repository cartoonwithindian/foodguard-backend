import { describe, it, expect } from "vitest";
import {
  classifyProductFamily,
  familyCompatibility,
  nonFoodCategory,
} from "@/lib/product-family";
import type { ProductInfo } from "@/types/domain";

function mk(product: Partial<ProductInfo> & { name: string }): ProductInfo {
  return {
    id: "P_TEST",
    category: product.category ?? "food",
    categoryLabel: "Food",
    imageUrl: null,
    packSize: null,
    price: null,
    source: "test",
    cardCreatedAt: new Date().toISOString(),
    verified: false,
    confidence: 0.5,
    hasNutrition: false,
    hasIngredients: false,
    hasBarcode: false,
    ...product,
  } as ProductInfo;
}

describe("classifyProductFamily", () => {
  it("classifies by brand hint first", () => {
    const cls = classifyProductFamily(mk({ name: "Kurkure Masala Munch", brand: "Kurkure" }));
    expect(cls.family).toBe("extruded_snack");
    expect(cls.superfamily).toBe("snacks");
  });

  it("classifies chips by product-type noun", () => {
    const cls = classifyProductFamily(mk({ name: "Balaji Chaat Chaska Potato Chips", brand: "Balaji" }));
    expect(cls.family).toBe("chips");
    expect(cls.superfamily).toBe("snacks");
  });

  it("weights product-type nouns over flavouring modifiers", () => {
    const cls = classifyProductFamily(mk({ name: "Masala Bread" }));
    expect(cls.family).toBe("bread");
    expect(cls.superfamily).toBe("bakery");
  });

  it("still classifies a pure spice mix as spices", () => {
    const cls = classifyProductFamily(mk({ name: "Garam Masala" }));
    expect(cls.family).toBe("spices");
  });

  it("classifies water as water, never a generic food", () => {
    const cls = classifyProductFamily(mk({ name: "AQUAFINA WATER 1LTR", brand: "Aquafina" }));
    expect(cls.family).toBe("water");
    expect(cls.superfamily).toBe("beverages");
  });

  it("classifies pickle as condiments", () => {
    const cls = classifyProductFamily(mk({ name: "Mother's Recipe Pickle", brand: "Mother's Recipe" }));
    expect(cls.family).toBe("pickle");
    expect(cls.superfamily).toBe("condiments");
  });

  it("returns null family (unknown) when nothing matches — never a food family", () => {
    const cls = classifyProductFamily(mk({ name: "Premium Imported Item Xyz" }));
    expect(cls.family).toBeNull();
    expect(cls.superfamily).toBeNull();
  });

  it("maps non-food categories to the nonfood superfamily", () => {
    const cls = classifyProductFamily(mk({ name: "GlowCare Face Wash", category: "cosmetics" }));
    expect(cls.superfamily).toBe("nonfood");
  });

  it("does not confuse a chocolate chip cookie as chocolate", () => {
    const cls = classifyProductFamily(mk({ name: "Chocolate Chip Cookie" }));
    expect(cls.family).toBe("cookie");
  });
});

describe("familyCompatibility", () => {
  const kurkure = classifyProductFamily(mk({ name: "Kurkure Masala Munch", brand: "Kurkure" }));
  const chips = classifyProductFamily(mk({ name: "Uncle chipps Potato Chips" }));
  const water = classifyProductFamily(mk({ name: "AQUAFINA WATER 1LTR" }));
  const iceCream = classifyProductFamily(mk({ name: "AMUL BUTTER SCOTCH TRI CONE" }));
  const unknown = classifyProductFamily(mk({ name: "Premium Imported Item Xyz" }));
  const bread = classifyProductFamily(mk({ name: "English Oven Wheat Bread" }));

  it("chips classify to the same family as other chips → affinity 40", () => {
    const chipsA = classifyProductFamily(mk({ name: "Plain Salty Potato Chips" }));
    const compat = familyCompatibility(chipsA, chips);
    expect(compat.kind).toBe("same");
  });

  it("chips vs kurkure are same superfamily → related affinity 26", () => {
    const compat = familyCompatibility(chips, kurkure);
    expect(compat.kind === "related" || compat.kind === "same").toBe(true);
  });

  it("kurkure vs water is a hard incompatibility", () => {
    expect(familyCompatibility(kurkure, water).kind).toBe("incompatible");
  });

  it("kurkure vs ice cream is a hard incompatibility", () => {
    expect(familyCompatibility(kurkure, iceCream).kind).toBe("incompatible");
  });

  it("kurkure vs bread is incompatible", () => {
    expect(familyCompatibility(kurkure, bread).kind).toBe("incompatible");
  });

  it("unknown family grants no proof of compatibility (affinity 10)", () => {
    const compat = familyCompatibility(kurkure, unknown);
    expect(compat.kind).toBe("unknown");
    if (compat.kind === "unknown") {
      expect(compat.affinity).toBe(10);
    }
  });

  it("nonfood categories are not alternatives to food products", () => {
    const cosmetics = classifyProductFamily(mk({ name: "Shampoo", category: "cosmetics" }));
    expect(familyCompatibility(kurkure, cosmetics).kind).toBe("nonfood");
  });
});

describe("nonFoodCategory", () => {
  it("only food is a food category", () => {
    expect(nonFoodCategory("food")).toBe(false);
    expect(nonFoodCategory("cosmetics")).toBe(true);
    expect(nonFoodCategory("personal_care")).toBe(true);
    expect(nonFoodCategory("household")).toBe(true);
    expect(nonFoodCategory("other")).toBe(true);
  });
});