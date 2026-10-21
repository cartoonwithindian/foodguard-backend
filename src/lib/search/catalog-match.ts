import { STOPWORDS } from "@/lib/embeddings";

/**
 * Query noise that carries no product intent. `STOPWORDS` covers English
 * function words; shoppers also add generic catalog nouns ("products",
 * "snacks") and superlatives ("best") that would otherwise match everything.
 */
const CATALOG_QUERY_STOPWORDS = new Set([
  ...STOPWORDS,
  "product",
  "products",
  "item",
  "items",
  "food",
  "foods",
  "snack",
  "snacks",
  "drink",
  "drinks",
  "beverage",
  "beverages",
  "brand",
  "brands",
  "best",
  "good",
  "buy",
  "shop",
  "online",
  "cheapest",
  "options",
  "variety",
  "kinds",
  "types",
  "list",
  "near",
  "me",
  "show",
  "find",
  "search",
]);

/**
 * Split a shopper query into meaningful terms.
 *
 * Previously the whole query was matched as a single literal substring, so
 * "low sugar products" found nothing while "sugar" found 129 rows: the extra
 * words were treated as part of the phrase rather than as separate filters.
 */
export function tokenizeCatalogQuery(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !CATALOG_QUERY_STOPWORDS.has(t));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary match so a term does not fire inside another word
 * ("low" must not match "flower", "salt" must not match "salted-cod"... it may,
 * but "low" in "flowered greens" is a false positive we want to avoid).
 */
function matchesTerm(haystack: string | null | undefined, term: string, wordBoundary: boolean): boolean {
  if (!haystack) return false;
  const value = haystack.toLowerCase();
  if (!wordBoundary) return value.includes(term);
  return new RegExp(`\\b${escapeRegExp(term)}`).test(value);
}

export type CatalogMatchFields = {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  ingredients?: string | null;
};

export type CatalogMatchScore = {
  /** How many distinct query terms hit this product. */
  matched: number;
  /** Relevance weight; higher sorts first. */
  score: number;
};

const FIELD_WEIGHTS = {
  name: 100,
  barcode: 80,
  brand: 60,
  ingredients: 30,
} as const;

/**
 * Score a product against the query terms.
 *
 * Uses OR semantics across terms so multi-word queries still return rows,
 * while `matched` lets callers rank products that hit *every* term first.
 * Text fields are matched on word boundaries: plain substring matching made
 * "low" match "yellow" and "low" match "flowered".
 */
export function scoreCatalogMatch(
  tokens: string[],
  fields: CatalogMatchFields,
): CatalogMatchScore {
  if (tokens.length === 0) return { matched: 0, score: 0 };

  let matched = 0;
  let score = 0;

  for (const token of tokens) {
    let termScore = 0;
    if (matchesTerm(fields.name, token, true)) termScore += FIELD_WEIGHTS.name;
    if (fields.barcode && fields.barcode.toLowerCase().includes(token)) {
      termScore += FIELD_WEIGHTS.barcode;
    }
    if (matchesTerm(fields.brand, token, true)) termScore += FIELD_WEIGHTS.brand;
    if (matchesTerm(fields.ingredients, token, true)) termScore += FIELD_WEIGHTS.ingredients;
    if (termScore > 0) {
      matched += 1;
      score += termScore;
    }
  }

  return { matched, score };
}
/** True when any query term matches this field. */
export function matchesCatalogTerm(
  field: string | null | undefined,
  tokens: string[],
): boolean {
  return tokens.some((token) => matchesTerm(field, token, true));
}
