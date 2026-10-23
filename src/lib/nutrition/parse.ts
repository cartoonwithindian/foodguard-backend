import type { NutritionFacts } from "@/types/domain";
import { normalizeNutritionFacts } from "@/lib/nutrition/units";

const NUTRIENT_KEYS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "calories", patterns: [/energy\b[^a-z]*kcal/i, /calories?/i] },
  { key: "energyKj", patterns: [/energy\s*\(?\s*kj/i] },
  { key: "protein", patterns: [/protein/i] },
  { key: "carbohydrates", patterns: [/carbohydrates?/i, /carbohydrates?\s*of\s*which/i] },
  { key: "sugars", patterns: [/sugars?\s*\(?\s*of\s*which\s*\)?\s*:\s*(?!added)/i, /total\s*sugars?/i, /\bsugars?\b/i] },
  { key: "addedSugars", patterns: [/added\s*sugars?/i] },
  { key: "totalFat", patterns: [/total\s*fat/i, /\bfats?\b/i] },
  { key: "saturatedFat", patterns: [/of\s*which\s*saturates/i, /saturated\s*fat/i, /saturates?/i] },
  { key: "transFat", patterns: [/trans\s*fats?/i] },
  { key: "fiber", patterns: [/dietary\s*fibre/i, /dietary\s*fiber/i, /fibre/i, /fiber/i] },
  { key: "sodium", patterns: [/sodium/i] },
  { key: "salt", patterns: [/\bsalt\b/i] },
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

type ParsedNutrient = { key: string; value: number; unit: string; index: number };

/** Read the number right after a label, or the one the pattern consumed itself. */
function valueNear(line: string, labelMatch: RegExpExecArray): { value: number; unit: string } | null {
  // A pattern such as /energy\b[^a-z]*kcal/ already consumed its number;
  // prefer that over the next nutrient's value later on the same line.
  const own = /([\d.,]+)\s*(mg|g|kcal|kj|mcg|µg|ug|ml)\b/i.exec(labelMatch[0]);
  if (own) return extractValue(own[0]);
  return extractValue(line.slice(labelMatch.index + labelMatch[0].length));
}

/**
 * Parse every nutrient label on a line, not just the first one. OCR often
 * flattens a table into one line ("Fat 14 g Carbohydrate 52 g"); returning
 * only the first match used to record the fat value as carbohydrate.
 */
function parseLine(line: string): ParsedNutrient[] {
  const hits: ParsedNutrient[] = [];
  for (const entry of NUTRIENT_KEYS) {
    for (const pattern of entry.patterns) {
      const match = pattern.exec(line);
      if (!match) continue;
      // "saturated fat 3 g" must not also count as total fat.
      if (
        entry.key === "totalFat" &&
        /(saturated|trans)\s*fats?/i.test(line) &&
        !/total\s*fat/i.test(line)
      ) {
        break;
      }
      const extracted = valueNear(line, match);
      if (!extracted) continue;
      hits.push({ key: entry.key, ...extracted, index: match.index });
      break;
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.key)) return false;
    seen.add(hit.key);
    return true;
  });
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

    for (const parsed of parseLine(line)) {
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
