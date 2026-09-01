import type { NutritionFacts, NutrientValue } from "@/types/domain";

export type NutritionConversion = {
  sourceUnit: string;
  normalizedUnit: string;
  factor: number;
};

export type NormalizedNutritionValue = NutrientValue & {
  sourceValue: number;
  sourceUnit: string;
  normalizedValue: number;
  normalizedUnit: string;
};

const UNIT_ALIASES: Record<string, string> = {
  "": "g",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  milligram: "mg",
  milligrams: "mg",
  microgram: "mcg",
  micrograms: "mcg",
  μg: "mcg",
  µg: "mcg",
  ug: "mcg",
  kcal: "kcal",
  calorie: "kcal",
  calories: "kcal",
  kj: "kJ",
  kJ: "kJ",
};

function canonicalUnit(unit: string): string {
  const trimmed = unit.trim();
  return UNIT_ALIASES[trimmed.toLowerCase()] ?? UNIT_ALIASES[trimmed] ?? trimmed;
}

/**
 * Convert a nutrition value without losing what the source actually reported.
 * `value`/`unit` remain the normalized pair for backwards compatibility;
 * sourceValue/sourceUnit and normalizedValue/normalizedUnit are the auditable
 * representation used by the Nutrition Details API.
 */
export function normalizeNutritionValue(
  value: number,
  sourceUnit: string,
  targetUnit: string,
  confidence = 0.7,
  basis: NutritionFacts["basis"] = "PER_100G",
): NormalizedNutritionValue {
  const source = canonicalUnit(sourceUnit);
  const target = canonicalUnit(targetUnit);
  let factor = 1;

  if (source === target) {
    factor = 1;
  } else if (source === "g" && target === "mg") {
    factor = 1000;
  } else if (source === "mg" && target === "g") {
    factor = 0.001;
  } else if (source === "kg" && target === "g") {
    factor = 1000;
  } else if (source === "g" && target === "kg") {
    factor = 0.001;
  } else if (source === "mcg" && target === "mg") {
    factor = 0.001;
  } else if (source === "mg" && target === "mcg") {
    factor = 1000;
  } else if (source !== target) {
    throw new Error(`Unsupported nutrition unit conversion: ${sourceUnit} -> ${targetUnit}`);
  }

  const normalizedValue = Math.round(value * factor * 1_000_000) / 1_000_000;
  return {
    value: normalizedValue,
    unit: target,
    sourceValue: value,
    sourceUnit: source,
    normalizedValue,
    normalizedUnit: target,
    basis,
    confidence,
    ...(factor === 1
      ? {}
      : { conversion: { sourceUnit: source, normalizedUnit: target, factor } }),
  };
}

function targetUnitForNutrient(key: string, sourceUnit: string): string {
  if (key === "calories") return "kcal";
  if (["sodium", "potassium", "cholesterol"].includes(key)) return "mg";
  if (key === "energyKj") return "kJ";
  if (sourceUnit.trim()) return canonicalUnit(sourceUnit);
  return "g";
}

/** Normalize all nutrient values to stable display/threshold units. */
export function normalizeNutritionFacts(nutrition: NutritionFacts): NutritionFacts {
  const nutrients: NutritionFacts["nutrients"] = {};
  for (const [key, nutrient] of Object.entries(nutrition.nutrients)) {
    const basis = nutrition.basis;

    // A normalized value may pass through several layers (provider -> service
    // -> response). Do not apply its conversion factor a second time.
    if (
      nutrient.sourceValue !== undefined &&
      nutrient.sourceUnit &&
      nutrient.normalizedValue !== undefined &&
      nutrient.normalizedUnit &&
      nutrient.unit === nutrient.normalizedUnit
    ) {
      nutrients[key] = { ...nutrient, value: nutrient.normalizedValue, unit: nutrient.normalizedUnit, basis };
      continue;
    }

    const sourceValue = nutrient.sourceValue ?? nutrient.value;
    const sourceUnit = nutrient.sourceUnit ?? nutrient.unit;
    const targetUnit = nutrient.normalizedUnit ?? targetUnitForNutrient(key, sourceUnit);
    try {
      nutrients[key] = normalizeNutritionValue(
        sourceValue,
        sourceUnit,
        targetUnit,
        nutrient.confidence,
        basis,
      );
    } catch {
      // Preserve an unknown source rather than inventing a conversion.
      nutrients[key] = {
        ...nutrient,
        value: nutrient.value,
        unit: nutrient.unit,
        sourceValue,
        sourceUnit,
        normalizedValue: nutrient.value,
        normalizedUnit: nutrient.unit,
        basis,
      };
    }
  }
  return { ...nutrition, nutrients };
}
