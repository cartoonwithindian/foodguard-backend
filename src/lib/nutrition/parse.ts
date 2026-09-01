import type { NutritionFacts } from "@/types/domain";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";

const NUTRIENT_KEYS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "calories", patterns: [/energy\b[^a-z]*kcal/i, /calories?/i] },
  { key: "energyKj", patterns: [/energy\s*\(?\s*kj/i] },
  { key: "protein", patterns: [/protein/i] },
  { key: "carbohydrates", patterns: [/carbohydrates?/i, /carbohydrates?\s*of\s*which/i] },
  { key: "sugars", patterns: [/sugars?\s*\(?\s*of\s*which\s*\)?\s*:\s*(?!added)/i, /total\s*sugars?/i, /sugars?\s*[0-9]/i] },
  { key: "addedSugars", patterns: [/added\s*sugars?/i] },
  { key: "totalFat", patterns: [/total\s*fat/i, /fat\s*[0-9]/i] },
  { key: "saturatedFat", patterns: [/of\s*which\s*saturates/i, /saturated\s*fat/i, /saturates?/i] },
  { key: "transFat", patterns: [/trans\s*fats?/i] },
  { key: "fiber", patterns: [/dietary\s*fibre/i, /dietary\s*fiber/i, /fibre/i, /fiber/i] },
  { key: "sodium", patterns: [/sodium/i] },
  { key: "salt", patterns: [/salt\s*$/i, /^\s*salt/i] },
];

const PER_100G_RE = /per\s*100\s*(g|ml|g\s*\/\s*ml)/i;

function extractValue(line: string): { value: number; unit: string } | null {
  const match = /([\d.,]+)\s*(mg|g|kcal|kj|mcg|µg|ug|ml)?/.exec(line);
  if (!match) return null;
  const raw = match[1].replace(/,/g, ".");
  const value = Number(raw);
  if (Number.isNaN(value)) return null;
  const unit = (match[2] ?? "").toLowerCase();
  if (unit === "kcal" || unit === "kj") return { value, unit: unit === "kcal" ? "kcal" : "kJ" };
  if (!unit) return { value, unit: "g" };
  return { value, unit };
}

function parseLine(line: string): { key: string; value: number; unit: string } | null {
  for (const entry of NUTRIENT_KEYS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(line)) {
        const extracted = extractValue(line);
        if (extracted) return { key: entry.key, ...extracted };
      }
    }
  }
  return null;
}

/**
 * Extracts a per-100g nutrition table from raw OCR/label text.
 * Never invents values - only numbers actually present in the text are kept.
 */
export function parseNutritionTable(text: string): NutritionFacts | null {
  if (!text) return null;
  const normalized = text.replace(/\r/g, "");

  const per100Section = normalized.split(PER_100G_RE);
  const section = per100Section.length >= 3 ? per100Section[2] ?? "" : normalized;

  const nutrients: NutritionFacts["nutrients"] = {};
  const lines = section.split("\n");
  let servingSize: string | undefined;
  let sawValues = false;

  const servingMatch = /serving\s*size\s*[:\-]?\s*(.+)/i.exec(normalized);
  if (servingMatch) servingSize = servingMatch[1].trim();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!/[\d.,]/.test(line)) continue;

    const parsed = parseLine(line);
    if (parsed) {
      nutrients[parsed.key] = { value: parsed.value, unit: parsed.unit, confidence: 0.8 };
      sawValues = true;
    }
  }

  if (!sawValues) return null;

  return {
    servingSize,
    basis: "PER_100G",
    nutrients,
  };
}

/** Normalize parsed values without deriving one nutrient from another. */
export function normalizeNutrition(nutrition: NutritionFacts): NutritionFacts {
  return normalizeNutritionFacts(nutrition);
}
