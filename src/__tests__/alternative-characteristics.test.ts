import { describe, it, expect } from "vitest";
import {
  getAlternativeCharacteristic,
  getAlternativeCharacteristics,
  getCharacteristicByKey,
} from "@/lib/alternative-characteristics";

describe("getAlternativeCharacteristic", () => {
  it("maps sodium to LOWER_SODIUM", () => {
    const c = getAlternativeCharacteristic("sodium");
    expect(c).not.toBeNull();
    expect(c?.key).toBe("LOWER_SODIUM");
    expect(c?.issueKey).toBe("sodium");
    expect(c?.label).toBe("Lower sodium");
    expect(c?.category).toBe("nutrition");
    expect(c?.searchTerms.length).toBeGreaterThan(0);
  });

  it("maps addedSugars to LOWER_ADDED_SUGAR", () => {
    expect(getAlternativeCharacteristic("addedSugars")?.key).toBe("LOWER_ADDED_SUGAR");
  });

  it("maps saturatedFat to LOWER_SATURATED_FAT", () => {
    expect(getAlternativeCharacteristic("saturatedFat")?.key).toBe("LOWER_SATURATED_FAT");
  });

  it("maps totalFat to LOWER_TOTAL_FAT", () => {
    expect(getAlternativeCharacteristic("totalFat")?.key).toBe("LOWER_TOTAL_FAT");
  });

  it("maps transFat to LOWER_TRANS_FAT", () => {
    expect(getAlternativeCharacteristic("transFat")?.key).toBe("LOWER_TRANS_FAT");
  });

  it("maps salt to LOWER_SALT", () => {
    expect(getAlternativeCharacteristic("salt")?.key).toBe("LOWER_SALT");
  });

  it("maps total sugars to LOWER_SUGAR", () => {
    expect(getAlternativeCharacteristic("sugars")?.key).toBe("LOWER_SUGAR");
  });

  it("maps Palm Oil (canonical name) to PALM_OIL_FREE", () => {
    const c = getAlternativeCharacteristic("Palm Oil");
    expect(c?.key).toBe("PALM_OIL_FREE");
    expect(c?.issueKey).toBe("Palm Oil");
    expect(c?.category).toBe("ingredient");
  });

  it("maps a palm-oil alias to PALM_OIL_FREE", () => {
    expect(getAlternativeCharacteristic("Palmolein")?.key).toBe("PALM_OIL_FREE");
    expect(getAlternativeCharacteristic("palm oil")?.key).toBe("PALM_OIL_FREE");
  });

  it("maps maida / Refined Wheat Flour to WHOLE_GRAIN", () => {
    expect(getAlternativeCharacteristic("maida")?.key).toBe("WHOLE_GRAIN");
    expect(getAlternativeCharacteristic("Refined Wheat Flour (Maida)")?.key).toBe("WHOLE_GRAIN");
  });

  it("maps an allergen to ALLERGEN_FREE", () => {
    const c = getAlternativeCharacteristic("milk");
    expect(c?.key).toBe("ALLERGEN_FREE");
    expect(c?.allergen).toBe("milk");
    expect(c?.category).toBe("allergen");
    expect(getAlternativeCharacteristic("peanut")?.allergen).toBe("peanut");
    expect(getAlternativeCharacteristic("gluten")?.allergen).toBe("gluten");
  });

  it("returns null for unknown issues", () => {
    expect(getAlternativeCharacteristic("UNKNOWN_ISSUE")).toBeNull();
    expect(getAlternativeCharacteristic("")).toBeNull();
    expect(getAlternativeCharacteristic("gluten-free baking powder")).toBeNull();
  });

  it("does not invent a characteristic for unrelated text containing 'palm'", () => {
    expect(getAlternativeCharacteristic("palm kernel oil")).toBeNull();
    expect(getAlternativeCharacteristic("date palm sugar")).toBeNull();
  });
});

describe("getAlternativeCharacteristics", () => {
  it("maps multiple issues preserving order", () => {
    const out = getAlternativeCharacteristics(["sodium", "saturatedFat", "milk"]);
    expect(out.map((c) => c.key)).toEqual(["LOWER_SODIUM", "LOWER_SATURATED_FAT", "ALLERGEN_FREE"]);
  });

  it("removes duplicate characteristics", () => {
    const out = getAlternativeCharacteristics(["sodium", "sodium", "Sodium"]);
    expect(out.map((c) => c.key)).toEqual(["LOWER_SODIUM"]);
  });

  it("ignores issues with no mapping", () => {
    const out = getAlternativeCharacteristics(["sodium", "NO_SUCH_ISSUE", "addedSugars"]);
    expect(out.map((c) => c.key)).toEqual(["LOWER_SODIUM", "LOWER_ADDED_SUGAR"]);
  });

  it("accepts { issue } wrapper objects", () => {
    const out = getAlternativeCharacteristics([{ issue: "salt" }, "sodium"]);
    expect(out.map((c) => c.key)).toEqual(["LOWER_SALT", "LOWER_SODIUM"]);
  });

  it("returns empty array for empty input", () => {
    expect(getAlternativeCharacteristics([])).toEqual([]);
  });
});

describe("getCharacteristicByKey", () => {
  it("resolves stable keys back to a characteristic", () => {
    expect(getCharacteristicByKey("LOWER_SODIUM")?.label).toBe("Lower sodium");
    expect(getCharacteristicByKey("PALM_OIL_FREE")?.key).toBe("PALM_OIL_FREE");
    expect(getCharacteristicByKey("WHOLE_GRAIN")?.key).toBe("WHOLE_GRAIN");
    expect(getCharacteristicByKey("NOT_A_KEY")).toBeNull();
  });
});