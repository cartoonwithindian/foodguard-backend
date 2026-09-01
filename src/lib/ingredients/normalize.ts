import type { NormalizedIngredient } from "@/types/domain";
import { ingredientIndex, normalizeText } from "./index";

const E_NUMBER_RE = /\b(?:e\s*)?(\d{3,4})\b/i;
const INS_NUMBER_RE = /\b(?:ins|आईएनएस)\s*[-:\s]*\s*(\d{3,4})\b/i;

function toResult(raw: string, matched: boolean, confidence: number, overrides: Partial<NormalizedIngredient> = {}): NormalizedIngredient {
  return { rawName: raw.trim(), matched, confidence, ...overrides };
}

/**
 * Resolves one ingredient string to a canonical entity.
 *
 *   normalizeIngredient("Monosodium Glutamate (INS 621)")
 *   -> canonicalName: "Monosodium Glutamate", identifier: "INS 621",
 *      function: "flavour enhancer", matched: true, confidence: 0.9
 *
 * Handles: E-numbers, INS numbers, abbreviations (MSG), common names,
 * scientific names, capitalization, Hindi names, parenthesised codes.
 */
export function normalizeIngredient(raw: string): NormalizedIngredient {
  const trimmed = raw.trim();
  if (!trimmed) return toResult(raw, false, 0.2);

  // 0) INS/E-number detection MUST run before any number stripping,
  //    otherwise "INS 621" would lose its digits and never match.
  const insMatch = INS_NUMBER_RE.exec(trimmed);
  if (insMatch) {
    const record = ingredientIndex.resolveByIns(insMatch[1]);
    if (record) {
      return toResult(raw, true, 0.97, {
        canonicalName: record.canonicalName,
        identifier: `INS ${record.insCode ?? insMatch[1]}`,
        aliases: [record.canonicalName, ...record.aliases.map((a) => a.alias)],
        function: record.function,
      });
    }
  }

  const eMatch = E_NUMBER_RE.exec(trimmed);
  if (eMatch) {
    const record = ingredientIndex.resolveByE(`e${eMatch[1]}`);
    if (record) {
      return toResult(raw, true, 0.97, {
        canonicalName: record.canonicalName,
        identifier: record.eNumber?.toUpperCase() ?? `E${eMatch[1]}`,
        aliases: [record.canonicalName, ...record.aliases.map((a) => a.alias)],
        function: record.function,
      });
    }
    const byIns = ingredientIndex.resolveByIns(eMatch[1]);
    if (byIns) {
      return toResult(raw, true, 0.95, {
        canonicalName: byIns.canonicalName,
        identifier: byIns.insCode ? `INS ${byIns.insCode}` : `E${eMatch[1]}`,
        aliases: [byIns.canonicalName, ...byIns.aliases.map((a) => a.alias)],
        function: byIns.function,
      });
    }
  }

  // Name-only version: parentheses and quantities removed, numbers kept
  // so alphanumeric identifiers like "E621" survive for alias matching.
  const cleaned = trimmed
    .replace(/[()\[\]{}]/g, " ")
    .replace(/\b(?:as\s*)?\d{1,3}\s*%?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return toResult(raw, false, 0.3);

  // 3) Exact alias or canonical match
  const direct = ingredientIndex.resolveByAlias(cleaned) ?? ingredientIndex.resolveByCanonical(cleaned);
  if (direct) {
    return toResult(raw, true, 0.95, {
      canonicalName: direct.canonicalName,
      identifier: direct.eNumber ? direct.eNumber.toUpperCase() : direct.insCode ? `INS ${direct.insCode}` : undefined,
      aliases: [direct.canonicalName, ...direct.aliases.map((a) => a.alias)],
      function: direct.function,
    });
  }

  // 4) Contains-match on longer aliases (e.g. "sodium chloride" inside a
  //    longer compound). Guard against matching single generic words.
  const lower = normalizeText(cleaned);
  if (lower.length >= 4) {
    const contains = ingredientIndex.all().find((record) =>
      record.aliases.some(
        (a) => a.alias.length >= 4 && lower.includes(normalizeText(a.alias)),
      ),
    );
    if (contains) {
      return toResult(raw, true, 0.75, {
        canonicalName: contains.canonicalName,
        identifier: contains.eNumber ? contains.eNumber.toUpperCase() : contains.insCode ? `INS ${contains.insCode}` : undefined,
        aliases: [contains.canonicalName, ...contains.aliases.map((a) => a.alias)],
        function: contains.function,
        spellingCorrected: lower !== normalizeText(contains.canonicalName),
      });
    }
  }

  // 5) Unresolved - never guess.
  return toResult(raw, false, 0.3);
}

/** Resolves a barcode-independent display label for unmatched ingredients. */
export function normalizedDisplayName(normalized: NormalizedIngredient): string {
  if (normalized.matched && normalized.canonicalName) return normalized.canonicalName;
  return normalized.rawName;
}
