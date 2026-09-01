// Types mirroring the existing frontend data contracts (src/data/*.ts).
// Kept here so backend route responses stay compatible with the UI.

export type NutritionField = {
  label: string;
  value: string | number;
  unit: string;
  available: boolean;
  sourceValue?: number;
  sourceUnit?: string;
  normalizedValue?: number;
  normalizedUnit?: string;
  basis?: string;
};
