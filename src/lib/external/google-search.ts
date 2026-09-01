import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import {
  webSearchWithFallback,
  type WebSearchResult,
  type WebSearchResponse,
} from "./web-search-providers";

/**
 * Web Search Module - Unified Interface.
 *
 * This module provides a unified interface for web search with automatic
 * fallback between multiple providers:
 * - Google Custom Search (primary)
 * - SearXNG (self-hosted, free, no rate limits)
 * - Firecrawl (content extraction)
 * - Agent Reach (social media queries)
 *
 * API keys are NEVER exposed to the frontend — this module runs server-side only.
 *
 * @see https://developers.google.com/custom-search/v1/overview
 * @see https://docs.searxng.org/
 * @see https://github.com/mendableai/firecrawl
 */

export type { WebSearchResult, WebSearchResponse };

// Authoritative domains that should be prioritized
const AUTHORITATIVE_DOMAINS = new Set([
  "fssai.gov.in",
  "fssaiindia.gov.in",
  "india.gov.in",
  "nia.nic.in",
  "fda.gov",
  "nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "who.int",
  "cdc.gov",
  "efsa.europa.eu",
  "food.gov.uk",
  "healthcanada.gc.ca",
  "fsanz.gov.au",
  "codexalimentarius.net",
  "openfoodfacts.org",
  "fdc.nal.usda.gov",
  "chem似idplus.nlm.nih.gov",
  "scopus.com",
  "scholar.google.com",
  "nature.com",
  "sciencedirect.com",
  "springer.com",
  "wiley.com",
  "jamanetwork.com",
  "thelancet.com",
  "bmj.com",
  "plos.org",
  "mdpi.com",
]);

// Domains to deprioritize (blogs, forums, etc.)
const LOW_PRIORITY_DOMAINS = new Set([
  "reddit.com",
  "quora.com",
  "medium.com",
  "wordpress.com",
  "blogspot.com",
  "tumblr.com",
  "pinterest.com",
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
]);

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isAuthoritative(domain: string): boolean {
  return AUTHORITATIVE_DOMAINS.has(domain) ||
    [...AUTHORITATIVE_DOMAINS].some(d => domain.endsWith(`.${d}`) || domain.endsWith(d));
}

function isLowPriority(domain: string): boolean {
  return LOW_PRIORITY_DOMAINS.has(domain) ||
    [...LOW_PRIORITY_DOMAINS].some(d => domain.endsWith(`.${d}`));
}

/**
 * Score a search result for relevance and authority.
 * Higher scores = more authoritative and relevant.
 */
function scoreResult(result: WebSearchResult): number {
  let score = 50; // base score

  // Authoritative domain bonus
  if (isAuthoritative(result.domain)) {
    score += 30;
  }

  // Low priority domain penalty
  if (isLowPriority(result.domain)) {
    score -= 20;
  }

  // Title relevance (if query terms appear in title)
  const titleLower = result.title.toLowerCase();
  if (titleLower.includes("fssai") || titleLower.includes("food safety")) score += 10;
  if (titleLower.includes("regulation") || titleLower.includes("standard")) score += 5;
  if (titleLower.includes("study") || titleLower.includes("research")) score += 5;
  if (titleLower.includes("review") || titleLower.includes("meta-analysis")) score += 8;

  // Snippet quality
  if (result.snippet.length > 100) score += 5;
  if (result.snippet.includes("evidence") || result.snippet.includes("study")) score += 5;

  return score;
}

/**
 * Normalize Google Custom Search API response into our standard format.
 */
function normalizeResults(
  items: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    displayLink?: string;
  }>,
  query: string,
): WebSearchResponse {
  const now = new Date().toISOString();

  const results: WebSearchResult[] = items
    .filter((item) => item.link && item.title)
    .map((item) => ({
      title: item.title || "",
      url: item.link || "",
      snippet: item.snippet || "",
      domain: extractDomain(item.link || ""),
      retrievedAt: now,
      provider: "google",
    }))
    .map((result) => ({
      ...result,
      // Add computed score as metadata (not in the type, but useful internally)
      _score: scoreResult(result),
    }))
    .sort((a, b) => (b as WebSearchResult & { _score: number })._score - (a as WebSearchResult & { _score: number })._score)
    .slice(0, 10); // Limit to top 10 results

  return {
    results,
    totalResults: results.length,
    searchQuery: query,
    performed: true,
    provider: "google",
  };
}

/**
 * Perform a web search with automatic fallback between providers.
 *
 * This is the main entry point for web search. It will:
 * 1. Try the primary provider (Google, SearXNG, or Firecrawl)
 * 2. Fall back to other configured providers if the primary fails
 * 3. Optionally use Agent Reach for social media queries
 *
 * @param query - The search query
 * @param options - Optional configuration
 * @returns Normalized search results from the first successful provider
 */
export async function googleSearch(
  query: string,
  options: {
    numResults?: number;
    language?: string;
    country?: string;
  } = {},
): Promise<WebSearchResponse> {
  return webSearchWithFallback(query, {
    numResults: options.numResults,
    language: options.language,
  });
}

/**
 * Build optimized search queries for ingredient research.
 */
export function buildIngredientSearchQueries(
  ingredientName: string,
  context?: string,
): string[] {
  const queries: string[] = [];

  // Primary: FSSAI-specific search
  queries.push(`"${ingredientName}" FSSAI food safety India`);

  // Secondary: scientific research
  queries.push(`"${ingredientName}" food additive safety evidence`);

  // Tertiary: general safety information
  queries.push(`${ingredientName} ingredient safety assessment`);

  // Context-specific if available
  if (context) {
    queries.push(`"${ingredientName}" ${context} food product`);
  }

  return queries;
}

/**
 * Build search queries for alternative product discovery.
 */
export function buildAlternativeSearchQueries(
  productName: string,
  category: string,
  countryCode: string = "IN",
): string[] {
  const queries: string[] = [];

  // Indian market alternatives
  if (countryCode === "IN") {
    queries.push(`${productName} alternative India healthier option`);
    queries.push(`${category} products India better ingredients`);
  } else {
    queries.push(`${productName} alternative healthier option`);
    queries.push(`${category} products better nutrition`);
  }

  return queries;
}

/**
 * Check if a URL is from an authoritative source.
 */
export function isAuthoritativeSource(url: string): boolean {
  const domain = extractDomain(url);
  return isAuthoritative(domain);
}

/**
 * Get source type from domain.
 */
export function getSourceTypeFromDomain(domain: string): string {
  if (domain.includes("pubmed") || domain.includes("ncbi") || domain.includes("nih")) return "scientific_paper";
  if (domain.includes("openfoodfacts") || domain.includes("fdc.nal.usda")) return "food_database";
  if (domain.includes("gov") || domain.includes("gov.in")) return "government";
  if (domain.includes("fssai") || domain.includes("fda") || domain.includes("who")) return "regulatory";
  if (domain.includes("edu") || domain.includes("ac.uk")) return "academic_database";
  if (domain.includes("manufacturer") || domain.includes("brand")) return "manufacturer";
  return "secondary_source";
}
