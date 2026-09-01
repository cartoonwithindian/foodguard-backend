/**
 * Splits an ingredient list (label text) into individual ingredient strings.
 * Handles commas, semicolons, parenthesised codes, quantity prefixes and
 * per-cent modifiers, e.g.:
 *
 *   "Sugar, Glucose Syrup (10%), Salt, INS 621, Spices"
 *   -> ["Sugar", "Glucose Syrup", "Salt", "INS 621", "Spices"]
 */

const SECTION_RE =
  /(ingredients|ingrediente|संघटक|सामग्री)\s*[:\-]?\s*([\s\S]*?)(?=nutrition|nutrition\s+facts|न्यूट्रिशन|allergen|allergy|manufacturer|मार्केटेड|imported|best\s+before|use\s+by|storage|net\s+weight|$)/i;

const NUTRITION_FRAGMENT_RE =
  /^(?:calories?|energy|total\s*fat|saturated\s*fat|trans\s*fat|protein|carbohydrates?|sugars?|added\s*sugars?|sodium|fibre|fiber|salt)\s*[:=]?\s*\d[\d.,]*\s*(?:mg|g|kcal|kj|mcg|µg|ug)?(?:\s*(?:per|\/).*)?$/i;

function isNutritionFragment(value: string): boolean {
  return NUTRITION_FRAGMENT_RE.test(value.trim()) ||
    /(?:nutrition\s+facts|energy\s+\d|sodium\s+\d|saturated\s+fat\s+\d|total\s+fat\s+\d)/i.test(value);
}

export function extractIngredientsSection(fullText: string): string | null {
  const match = SECTION_RE.exec(fullText);
  if (match && match[2]) {
    const value = match[2].replace(/^\s*[:\-]\s*/, "").trim();
    if (value) return value;
  }
  return null;
}

export function splitIngredientList(listText: string): string[] {
  const text = listText
    .replace(/may contain[^,;.]*\.?/gi, "")
    .replace(/processed in a facility[^,;]*/gi, "")
    .replace(/contains[^,;]*/gi, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ");

  const parts = text
    .split(/,|;/)
    .map((p) => p.trim())
    .filter((p) => p && !isNutritionFragment(p));

  const cleaned = parts.map((part) => {
    // Protect INS/E codes ("INS 621", "E621") from the bare-number strip.
    // The placeholder must contain no digits so the number strip can't touch it.
    const codes: string[] = [];
    const safe = part.replace(/\b(?:ins|e)\s*\d{3,4}\b/gi, (m) => {
      codes.push(m);
      return "__INS__";
    });
    const cleanedPart = safe
      .replace(/^\(|\)$/g, "")
      .replace(/\b(?:less than|up to|minimum|maximum|not more than|as\s*a\s*(?:flavour|colour|preservative)?)\b/gi, "")
      // Percentages first (consume the "%"), then bare numbers.
      .replace(/\d+(?:\.\d+)?\s*%/g, "")
      .replace(/\b\d{1,3}\b/g, "")
      .replace(/[()[\]]/g, " ")
      .replace(/\.+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleanedPart.replace(/__INS__/g, () => codes.shift() ?? "");
  });

  return cleaned.filter((part) => part && !isNutritionFragment(part));
}

/** Extracts the ingredient list from arbitrary label text. */
export function parseIngredientText(fullText: string): { listText: string | null; ingredients: string[] } {
  const section = extractIngredientsSection(fullText);
  const listText = section ?? fullText;
  return { listText, ingredients: splitIngredientList(listText) };
}
