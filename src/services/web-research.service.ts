import {
  googleSearch,
  buildIngredientSearchQueries,
  isAuthoritativeSource,
  getSourceTypeFromDomain,
  type WebSearchResult,
  type WebSearchResponse,
} from "@/lib/external/google-search";
import {
  webSearchWithFallback,
  extractUrlContent,
  getAvailableProviders,
  type WebSearchResult as MultiProviderResult,
} from "@/lib/external/web-search-providers";
import { logger } from "@/lib/logger";
import type { EvidenceRef, IngredientAnalysisItem } from "@/types/domain";

/**
 * Web Research service.
 *
 * Performs web searches SELECTIVELY to discover evidence for ingredients, products,
 * and safety information. Results are filtered for authoritative sources
 * and normalized into EvidenceRef format for the analysis pipeline.
 *
 * IMPORTANT: Web search is NOT a generic search box.
 * It is used only when:
 * - Evidence is missing (no existing evidence from internal KB/FSSAI/PubChem)
 * - Evidence is outdated (older than 2 years for safety data)
 * - Evidence is conflicting (contradictory information)
 * - Current information is required (regulatory changes, recent safety alerts)
 *
 * The web layer returns EVIDENCE, not safety verdicts.
 */

/**
 * Check if an ingredient needs web research.
 * Returns true only when existing evidence is insufficient.
 */
export function needsWebResearch(item: IngredientAnalysisItem): boolean {
  // No evidence at all - needs research
  if (!item.evidence || item.evidence.length === 0) {
    return true;
  }

  // Insufficient evidence assessment - needs more data
  if (item.assessment === "insufficient_evidence") {
    return true;
  }

  // Low confidence with limited evidence - needs verification
  if (item.confidence < 0.5 && item.evidence.length < 2) {
    return true;
  }

  // Check if evidence is from authoritative sources
  const hasAuthoritativeEvidence = item.evidence.some(e => {
    const org = e.organization.toLowerCase();
    return (
      org.includes("fssai") ||
      org.includes("fda") ||
      org.includes("nih") ||
      org.includes("pubmed") ||
      org.includes("who") ||
      org.includes("government")
    );
  });

  // If no authoritative evidence and assessment is concerning, research
  if (!hasAuthoritativeEvidence && item.assessment === "potentially_concerning") {
    return true;
  }

  return false;
}

/**
 * Check if web research should be performed for the product.
 * This is a high-level check before running any searches.
 */
export function shouldPerformWebResearch(
  ingredientItems: IngredientAnalysisItem[],
  hasFssaiResult: boolean,
  hasNutritionData: boolean,
): { needed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Count ingredients needing research
  const ingredientsNeedingResearch = ingredientItems.filter(needsWebResearch);

  if (ingredientsNeedingResearch.length > 0) {
    reasons.push(`${ingredientsNeedingResearch.length} ingredient(s) lack sufficient evidence`);
  }

  // If FSSAI result exists and is comprehensive, reduce research need
  if (hasFssaiResult && ingredientsNeedingResearch.length <= 1) {
    // FSSAI provides strong regulatory evidence, so we can skip web research
    // unless there are multiple ingredients lacking evidence
    return { needed: false, reasons: ["Sufficient evidence from FSSAI and internal knowledge base"] };
  }

  // If we have nutrition data and only 1 ingredient needs research,
  // the internal knowledge base can handle it - no web search needed.
  if (hasNutritionData && ingredientsNeedingResearch.length === 1) {
    return { needed: false, reasons: ["Single ingredient can be handled by internal knowledge base"] };
  }

  return { needed: reasons.length > 0, reasons };
}

export type WebResearchResult = {
  performed: boolean;
  sources: WebResearchEvidence[];
  queries: string[];
  totalResults: number;
  error?: string;
};

export type WebResearchEvidence = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  sourceType: string;
  authority: "primary" | "scientific" | "supporting";
  relevance: number; // 0..1
  retrievedAt: string;
};

export type IngredientResearchInput = {
  ingredientName: string;
  insCode?: string;
  eNumber?: string;
  context?: string;
  category?: string;
};

export type ProductResearchInput = {
  productName: string;
  brand?: string;
  category: string;
  barcode?: string;
  countryCode?: string;
};

/**
 * Research an ingredient via web search with fallback providers.
 * Returns evidence sources, NOT safety verdicts.
 *
 * Uses the multi-provider fallback chain:
 * 1. Primary provider (Google/SearXNG/Firecrawl)
 * 2. Fallback providers if primary fails
 * 3. Agent Reach for social media (if enabled)
 */
export async function researchIngredient(
  input: IngredientResearchInput,
): Promise<WebResearchResult> {
  const startTime = Date.now();
  const allResults: MultiProviderResult[] = [];
  const queries: string[] = [];
  const errors: string[] = [];

  try {
    // Build search queries
    const searchQueries = buildIngredientSearchQueries(
      input.ingredientName,
      input.context,
    );

    // Add identifier-specific queries
    if (input.insCode) {
      searchQueries.push(`INS ${input.insCode} FSSAI additive`);
    }
    if (input.eNumber) {
      searchQueries.push(`${input.eNumber} food additive safety`);
    }

    // Execute searches with fallback (limit to 2 to avoid excessive API calls)
    const queriesToRun = searchQueries.slice(0, 2);

    for (const query of queriesToRun) {
      queries.push(query);
      // Use the unified search with fallback
      const response = await webSearchWithFallback(query, {
        numResults: 5,
        includeSocial: false, // Don't use social media for ingredient research
      });
      if (response.performed && response.results.length > 0) {
        allResults.push(...response.results);
        logger.debug("ingredient_search_success", {
          query,
          provider: response.provider,
          results: response.results.length,
        });
      } else if (response.error) {
        errors.push(response.error);
      }
    }

    // Normalize and filter results
    const evidence = normalizeSearchResults(allResults);

    // Optionally extract content from top authoritative sources
    if (evidence.length > 0) {
      const topAuthoritative = evidence.find(e => e.authority === "primary" && e.url);
      if (topAuthoritative) {
        try {
          const extracted = await extractUrlContent(topAuthoritative.url, { format: "markdown" });
          if (extracted.success && extracted.content.length > 100) {
            // Enhance the snippet with extracted content
            topAuthoritative.snippet = extracted.content.slice(0, 500) + "...";
            logger.debug("content_extracted", {
              url: topAuthoritative.url,
              contentLength: extracted.content.length,
            });
          }
        } catch (extractError) {
          logger.warn("content_extraction_failed", {
            url: topAuthoritative.url,
            error: String(extractError),
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    const providers = getAvailableProviders();
    logger.info("web_research_completed", {
      ingredient: input.ingredientName,
      queries: queries.length,
      results: evidence.length,
      durationMs: duration,
      providersAvailable: providers,
    });

    if (evidence.length === 0) {
      return {
        performed: false,
        sources: [],
        queries,
        totalResults: 0,
        error: errors[0] ?? "No search results found",
      };
    }

    return {
      performed: true,
      sources: evidence,
      queries,
      totalResults: evidence.length,
    };
  } catch (error) {
    logger.error("web_research_failed", {
      ingredient: input.ingredientName,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      performed: false,
      sources: [],
      queries,
      totalResults: 0,
      error: "Web research failed",
    };
  }
}

/**
 * Research a product via web search with fallback providers.
 * Returns evidence sources for product information.
 */
export async function researchProduct(
  input: ProductResearchInput,
): Promise<WebResearchResult> {
  const startTime = Date.now();
  const allResults: MultiProviderResult[] = [];
  const queries: string[] = [];
  const errors: string[] = [];

  try {
    // Build product-specific queries
    const searchQueries: string[] = [];

    // Product name + brand search
    if (input.brand) {
      searchQueries.push(`"${input.brand}" "${input.productName}" ingredients India`);
    } else {
      searchQueries.push(`"${input.productName}" ingredients India`);
    }

    // Category-specific search
    searchQueries.push(`${input.category} product safety India FSSAI`);

    // Barcode search if available
    if (input.barcode) {
      searchQueries.push(`barcode ${input.barcode} product information`);
    }

    const queriesToRun = searchQueries.slice(0, 2);

    for (const query of queriesToRun) {
      queries.push(query);
      // Use unified search with fallback
      const response = await webSearchWithFallback(query, {
        numResults: 5,
        includeSocial: true, // Include social media for product research
      });
      if (response.performed && response.results.length > 0) {
        allResults.push(...response.results);
        logger.debug("product_search_success", {
          query,
          provider: response.provider,
          results: response.results.length,
        });
      } else if (response.error) {
        errors.push(response.error);
      }
    }

    const evidence = normalizeSearchResults(allResults);

    const duration = Date.now() - startTime;
    logger.info("web_research_product_completed", {
      product: input.productName,
      queries: queries.length,
      results: evidence.length,
      durationMs: duration,
    });

    if (evidence.length === 0) {
      return {
        performed: false,
        sources: [],
        queries,
        totalResults: 0,
        error: errors[0] ?? "No search results found",
      };
    }

    return {
      performed: true,
      sources: evidence,
      queries,
      totalResults: evidence.length,
    };
  } catch (error) {
    logger.error("web_research_product_failed", {
      product: input.productName,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      performed: false,
      sources: [],
      queries,
      totalResults: 0,
      error: "Web research failed",
    };
  }
}

/**
 * Research safety information for specific ingredients or concerns.
 */
export async function researchSafety(
  query: string,
  context?: string,
): Promise<WebResearchResult> {
  const startTime = Date.now();
  const allResults: MultiProviderResult[] = [];
  const queries: string[] = [];
  const errors: string[] = [];

  try {
    // Build safety-specific queries
    const searchQueries: string[] = [
      `"${query}" food safety evidence`,
      `"${query}" FSSAI regulation India`,
    ];

    if (context) {
      searchQueries.push(`"${query}" ${context} safety`);
    }

    const queriesToRun = searchQueries.slice(0, 2);

    for (const searchQuery of queriesToRun) {
      queries.push(searchQuery);
      // Use unified search with fallback
      const response = await webSearchWithFallback(searchQuery, {
        numResults: 5,
        includeSocial: false, // Don't use social media for safety research
      });
      if (response.performed && response.results.length > 0) {
        allResults.push(...response.results);
      } else if (response.error) {
        errors.push(response.error);
      }
    }

    const evidence = normalizeSearchResults(allResults);

    const duration = Date.now() - startTime;
    logger.info("web_research_safety_completed", {
      query,
      queries: queries.length,
      results: evidence.length,
      durationMs: duration,
    });

    if (evidence.length === 0) {
      return {
        performed: false,
        sources: [],
        queries,
        totalResults: 0,
        error: errors[0] ?? "No search results found",
      };
    }

    return {
      performed: true,
      sources: evidence,
      queries,
      totalResults: evidence.length,
    };
  } catch (error) {
    logger.error("web_research_safety_failed", {
      query,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      performed: false,
      sources: [],
      queries,
      totalResults: 0,
      error: "Web research failed",
    };
  }
}

/**
 * Normalize raw search results into WebResearchEvidence format.
 * Filters for quality and assigns authority levels.
 */
function normalizeSearchResults(results: WebSearchResult[]): WebResearchEvidence[] {
  const seen = new Set<string>();
  const evidence: WebResearchEvidence[] = [];

  for (const result of results) {
    // Deduplicate by URL
    if (seen.has(result.url)) continue;
    seen.add(result.url);

    // Skip low-quality results
    if (!result.title || !result.snippet) continue;
    if (result.snippet.length < 20) continue;

    const domain = result.domain;
    const sourceType = getSourceTypeFromDomain(domain);
    const isAuthoritative = isAuthoritativeSource(result.url);

    // Calculate relevance score
    let relevance = 0.5; // base

    if (isAuthoritative) relevance += 0.3;
    if (sourceType === "government" || sourceType === "regulatory") relevance += 0.2;
    if (sourceType === "scientific_paper") relevance += 0.15;
    if (result.snippet.includes("evidence") || result.snippet.includes("study")) relevance += 0.1;
    if (result.snippet.includes("FSSAI") || result.snippet.includes("food safety")) relevance += 0.1;

    relevance = Math.min(1, relevance);

    // Determine authority level
    let authority: WebResearchEvidence["authority"] = "supporting";
    if (sourceType === "government" || sourceType === "regulatory") {
      authority = "primary";
    } else if (sourceType === "scientific_paper" || sourceType === "academic_database") {
      authority = "scientific";
    }

    evidence.push({
      title: result.title,
      url: result.url,
      domain,
      snippet: result.snippet,
      sourceType,
      authority,
      relevance,
      retrievedAt: result.retrievedAt,
    });
  }

  // Sort by relevance (highest first)
  evidence.sort((a, b) => b.relevance - a.relevance);

  // Return top 8 results
  return evidence.slice(0, 8);
}

/**
 * Convert WebResearchEvidence to EvidenceRef format for the analysis pipeline.
 */
export function toEvidenceRef(evidence: WebResearchEvidence, id: string): EvidenceRef {
  return {
    id,
    title: evidence.title,
    organization: evidence.domain,
    url: evidence.url,
    sourceType: evidence.sourceType as EvidenceRef["sourceType"],
    evidenceLevel: evidence.authority === "primary" ? "high" : evidence.authority === "scientific" ? "medium" : "low",
    summary: evidence.snippet,
  };
}

/**
 * Check if web research is configured and available.
 * Returns true if ANY search provider is available
 * (DuckDuckGo Lite is keyless and always available unless disabled).
 */
export function isWebResearchAvailable(): boolean {
  const providers = getAvailableProviders();
  return providers.google || providers.searxng || providers.firecrawl || providers.duckduckgo;
}

/**
 * Get status of all available search providers.
 */
export function getSearchProviderStatus(): {
  google: boolean;
  searxng: boolean;
  firecrawl: boolean;
  openSearp: boolean;
  agentReach: boolean;
  duckduckgo: boolean;
  anyAvailable: boolean;
} {
  const providers = getAvailableProviders();
  return {
    ...providers,
    anyAvailable: providers.google || providers.searxng || providers.firecrawl || providers.openSearp || providers.duckduckgo,
  };
}
