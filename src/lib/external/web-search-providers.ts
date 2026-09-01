import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

/**
 * Multi-provider Web Search Module.
 *
 * Supports multiple search backends with automatic fallback:
 * 1. Google Custom Search (primary, requires API key)
 * 2. SearXNG (self-hosted, free, no rate limits - best for search)
 * 3. Firecrawl (AI web research - search + full page extraction)
 * 4. OpenSearp (lightweight search + extraction)
 * 5. Agent Reach (social media queries)
 *
 * Provider Comparison:
 * ┌─────────────┬───────────┬───────────┬────────┬──────────────────┬────────────────────┐
 * │ Provider    │ Open Source│ Self-host │ Search │ Page Extraction  │ Best Use           │
 * ├─────────────┼───────────┼───────────┼────────┼──────────────────┼────────────────────┤
 * │ SearXNG     │ ✅        │ ✅        │ ✅     │ Limited          │ Search engine      │
 * │ Firecrawl   │ ✅        │ ✅        │ ✅     │ ✅               │ AI web research    │
 * │ OpenSearp   │ ✅        │ ✅        │ ✅     │ ✅               │ Lightweight search │
 * │ Google      │ ❌        │ ❌        │ ✅     │ ❌               │ Quick search       │
 * └─────────────┴───────────┴───────────┴────────┴──────────────────┴────────────────────┘
 *
 * All providers return normalized WebSearchResult format.
 * API keys are NEVER exposed to the frontend.
 *
 * @see https://github.com/searxng/searxng
 * @see https://github.com/firecrawl/firecrawl
 */

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  retrievedAt: string;
  provider: string;
  relevance?: number;
};

export type WebSearchResponse = {
  results: WebSearchResult[];
  totalResults: number;
  searchQuery: string;
  performed: boolean;
  provider: string;
  error?: string;
};

export type SearchProvider = "google" | "searxng" | "firecrawl" | "opensearp" | "agent_reach" | "duckduckgo";

// ── Authoritative Domains ──────────────────────────────────────

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
  "chemidplus.nlm.nih.gov",
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

// ── Utility Functions ──────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isAuthoritative(domain: string): boolean {
  return (
    AUTHORITATIVE_DOMAINS.has(domain) ||
    [...AUTHORITATIVE_DOMAINS].some(
      (d) => domain.endsWith(`.${d}`) || domain.endsWith(d)
    )
  );
}

function isLowPriority(domain: string): boolean {
  return (
    LOW_PRIORITY_DOMAINS.has(domain) ||
    [...LOW_PRIORITY_DOMAINS].some((d) => domain.endsWith(`.${d}`))
  );
}

function scoreResult(result: WebSearchResult): number {
  let score = 50;

  if (isAuthoritative(result.domain)) score += 30;
  if (isLowPriority(result.domain)) score -= 20;

  const titleLower = result.title.toLowerCase();
  if (titleLower.includes("fssai") || titleLower.includes("food safety")) score += 10;
  if (titleLower.includes("regulation") || titleLower.includes("standard")) score += 5;
  if (titleLower.includes("study") || titleLower.includes("research")) score += 5;
  if (titleLower.includes("review") || titleLower.includes("meta-analysis")) score += 8;

  if (result.snippet.length > 100) score += 5;
  if (result.snippet.includes("evidence") || result.snippet.includes("study")) score += 5;

  return score;
}

function normalizeAndScoreResults(
  results: WebSearchResult[],
  query: string,
  provider: string
): WebSearchResponse {
  const scored = results
    .map((r) => ({
      ...r,
      _score: scoreResult(r),
      provider,
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 10);

  return {
    results: scored,
    totalResults: scored.length,
    searchQuery: query,
    performed: true,
    provider,
  };
}

// ── Google Custom Search Provider ──────────────────────────────

async function googleSearch(
  query: string,
  options: { numResults?: number; language?: string } = {}
): Promise<WebSearchResponse> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY || config.external.google?.searchApiKey || "";
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID || config.external.google?.searchEngineId || "";

  if (!apiKey || !engineId) {
    return {
      results: [],
      totalResults: 0,
      searchQuery: query,
      performed: false,
      provider: "google",
      error: "Google Search not configured",
    };
  }

  try {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", engineId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(options.numResults ?? 10));
    if (options.language) url.searchParams.set("lr", `lang_${options.language}`);

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "FoodGaurdAI/0.2 (research)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.error("google_search_api_error", { status: response.status, query });
      return {
        results: [],
        totalResults: 0,
        searchQuery: query,
        performed: false,
        provider: "google",
        error: `Google Search API returned HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      items?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
      }>;
    };

    const now = new Date().toISOString();
    const results: WebSearchResult[] = (data.items ?? [])
      .filter((item) => item.link && item.title)
      .map((item) => ({
        title: item.title || "",
        url: item.link || "",
        snippet: item.snippet || "",
        domain: extractDomain(item.link || ""),
        retrievedAt: now,
        provider: "google",
      }));

    return normalizeAndScoreResults(results, query, "google");
  } catch (error) {
    logger.error("google_search_failed", { query, error: String(error) });
    return {
      results: [],
      totalResults: 0,
      searchQuery: query,
      performed: false,
      provider: "google",
      error: "Google Search request failed",
    };
  }
}

// ── SearXNG Provider ───────────────────────────────────────────

/**
 * SearXNG - Privacy-respecting metasearch engine.
 * Self-hosted, free, no rate limits.
 * Aggregates results from 70+ search engines.
 *
 * Supports multiple instances via SEARXNG_BASE_URLS (comma-separated);
 * each instance is tried in order until one returns results.
 *
 * @see https://docs.searxng.org/
 */
async function searxngSearch(
  query: string,
  options: { numResults?: number; language?: string } = {}
): Promise<WebSearchResponse> {
  const baseUrls = (process.env.SEARXNG_BASE_URLS || process.env.SEARXNG_BASE_URL || config.external.searxng?.baseUrl || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  const apiKey = config.external.searxng?.apiKey;

  if (baseUrls.length === 0) {
    return {
      results: [],
      totalResults: 0,
      searchQuery: query,
      performed: false,
      provider: "searxng",
      error: "SearXNG not configured. Set SEARXNG_BASE_URL or SEARXNG_BASE_URLS.",
    };
  }

  const instanceErrors: string[] = [];

  for (const base of baseUrls) {
    try {
      const url = new URL(`${base.replace(/\/$/, "")}/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("categories", "general,science");
      if (options.language) url.searchParams.set("language", options.language);

      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "FoodGaurdAI/0.2 (research)",
      };

      // Some SearXNG instances require API key
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(15000), // SearXNG can be slower
      });

      if (!response.ok) {
        logger.error("searxng_api_error", { status: response.status, instance: base, query });
        instanceErrors.push(`HTTP ${response.status}`);
        continue;
      }

      const data = (await response.json()) as {
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
          engine?: string;
        }>;
        number_of_results?: number;
      };

      if (!Array.isArray(data.results)) {
        instanceErrors.push("non-JSON response (instance likely blocks the JSON API)");
        continue;
      }

      const now = new Date().toISOString();
      const results: WebSearchResult[] = (data.results ?? [])
        .filter((item) => item.url && item.title)
        .slice(0, options.numResults ?? 10)
        .map((item) => ({
          title: item.title || "",
          url: item.url || "",
          snippet: item.content || "",
          domain: extractDomain(item.url || ""),
          retrievedAt: now,
          provider: `searxng:${item.engine || "unknown"}`,
        }));

      if (results.length === 0) {
        instanceErrors.push("no results");
        continue;
      }

      return normalizeAndScoreResults(results, query, "searxng");
    } catch (error) {
      logger.error("searxng_search_failed", { instance: base, query, error: String(error) });
      instanceErrors.push(String(error));
    }
  }

  return {
    results: [],
    totalResults: 0,
    searchQuery: query,
    performed: false,
    provider: "searxng",
    error: `SearXNG request failed (${instanceErrors.join("; ")}).`,
  };
}

// ── DuckDuckGo Lite Provider ───────────────────────────────────

/**
 * DuckDuckGo Lite - keyless HTML search endpoint.
 * Free, no API key required. Used as an always-available fallback so
 * web research works out of the box even when no paid providers are configured.
 *
 * NOTE: Uses DuckDuckGo's public lite endpoint, which is subject to
 * rate limiting. Disable with ENABLE_DUCKDUCKGO_SEARCH=false.
 *
 * @see https://lite.duckduckgo.com/lite/
 */
async function duckduckgoSearch(
  query: string,
  options: { numResults?: number } = {}
): Promise<WebSearchResponse> {
  if (process.env.ENABLE_DUCKDUCKGO_SEARCH === "false") {
    return {
      results: [],
      totalResults: 0,
      searchQuery: query,
      performed: false,
      provider: "duckduckgo",
      error: "DuckDuckGo disabled via ENABLE_DUCKDUCKGO_SEARCH=false",
    };
  }

  const attempt = async (): Promise<{ html: string } | { rateLimited: boolean }> => {
    const url = new URL("https://lite.duckduckgo.com/lite/");
    url.searchParams.set("q", query);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64; rv:115.0) Gecko/20100101 Firefox/115.0",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      logger.error("duckduckgo_api_error", { status: response.status, query });
      return { rateLimited: response.status === 202 || response.status === 429 };
    }

    const html = await response.text();
    if (html.includes("anomaly") || html.includes("captcha") || !html.includes("result-link")) {
      return { rateLimited: true };
    }
    return { html };
  };

  try {
    let result = await attempt();

    // DuckDuckGo Lite rate-limits aggressively under bursts; retry once
    // after a short pause before giving up and letting the chain fall through.
    if ("rateLimited" in result) {
      logger.warn("duckduckgo_rate_limited_retrying", { query });
      await new Promise((resolve) => setTimeout(resolve, 2500));
      result = await attempt();
    }

    if ("rateLimited" in result) {
      return {
        results: [],
        totalResults: 0,
        searchQuery: query,
        performed: false,
        provider: "duckduckgo",
        error: "DuckDuckGo returned an anomaly/captcha page (rate limited)",
      };
    }

    const html = result.html;

    const now = new Date().toISOString();
    const titleLinks = [...html.matchAll(
      /<a rel="nofollow" href="([^"]+)"[^>]*class='result-link'[^>]*>([\s\S]*?)<\/a>/g
    )];
    const snippets = [...html.matchAll(
      /class='result-snippet'>([\s\S]*?)<\/td>/g
    )];

    const results: WebSearchResult[] = [];
    for (let i = 0; i < titleLinks.length; i++) {
      const [_, rawHref, rawTitle] = titleLinks[i];
      const href = rawHref.replace(/&amp;/g, "&");
      const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
      if (!uddgMatch) continue;
      let realUrl = "";
      try {
        realUrl = decodeURIComponent(uddgMatch[1]);
      } catch {
        continue;
      }
      if (!realUrl.startsWith("http")) continue;

      const title = rawTitle.replace(/<[^>]+>/g, "").trim();
      if (!title) continue;

      const snippet = snippets[i] ? snippets[i][1].replace(/<[^>]+>/g, "").trim() : "";

      results.push({
        title,
        url: realUrl,
        snippet,
        domain: extractDomain(realUrl),
        retrievedAt: now,
        provider: "duckduckgo",
      });
    }

    if (results.length === 0) {
      return {
        results: [],
        totalResults: 0,
        searchQuery: query,
        performed: false,
        provider: "duckduckgo",
        error: "No parseable results from DuckDuckGo Lite",
      };
    }

    return normalizeAndScoreResults(results.slice(0, options.numResults ?? 10), query, "duckduckgo");
  } catch (error) {
    logger.error("duckduckgo_search_failed", { query, error: String(error) });
    return {
      results: [],
      totalResults: 0,
      searchQuery: query,
      performed: false,
      provider: "duckduckgo",
      error: "DuckDuckGo request failed",
    };
  }
}

// ── Firecrawl Provider ─────────────────────────────────────────

/**
 * Firecrawl - The context API to search, scrape, and interact with the web.
 * Best for AI web research - combines search + full page extraction.
 *
 * Features:
 * - Search: Find information across the web with full content
 * - Scrape: Convert any URL to clean Markdown or structured JSON
 * - Interact: Click, scroll, write, wait before extracting
 * - 96% web coverage, P95 latency of 3.4s
 *
 * @see https://github.com/firecrawl/firecrawl
 * @see https://firecrawl.dev
 */
async function firecrawlSearch(
  query: string,
  options: { numResults?: number } = {}
): Promise<WebSearchResponse> {
  const apiKey = config.external.firecrawl?.apiKey;
  const baseUrl = config.external.firecrawl?.baseUrl;

  if (!apiKey) {
    return {
      results: [],
      totalResults: 0,
      searchQuery: query,
      performed: false,
      provider: "firecrawl",
      error: "Firecrawl not configured. Set FIRECRAWL_API_KEY.",
    };
  }

  try {
    // Firecrawl v2 search endpoint (current API)
    const url = `${baseUrl?.replace(/\/$/, "") || "https://api.firecrawl.dev"}/v2/search`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "FoodGaurdAI/0.2 (research)",
      },
      body: JSON.stringify({
        query,
        limit: options.numResults ?? 10,
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
        },
      }),
      signal: AbortSignal.timeout(20000), // Firecrawl can be slow for full extraction
    });

    if (!response.ok) {
      logger.error("firecrawl_api_error", { status: response.status, query });
      return {
        results: [],
        totalResults: 0,
        searchQuery: query,
        performed: false,
        provider: "firecrawl",
        error: `Firecrawl returned HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      success?: boolean;
      data?: Array<{
        url?: string;
        title?: string;
        markdown?: string;
        description?: string;
        metadata?: {
          title?: string;
          description?: string;
        };
      }>;
    };

    const now = new Date().toISOString();
    const results: WebSearchResult[] = (data.data ?? [])
      .filter((item) => item.url && (item.title || item.metadata?.title))
      .map((item) => ({
        title: item.title || item.metadata?.title || "",
        url: item.url || "",
        snippet: item.description || item.metadata?.description || item.markdown?.slice(0, 300) || "",
        domain: extractDomain(item.url || ""),
        retrievedAt: now,
        provider: "firecrawl",
      }));

    return normalizeAndScoreResults(results, query, "firecrawl");
  } catch (error) {
    logger.error("firecrawl_search_failed", { query, error: String(error) });
    return {
      results: [],
      totalResults: 0,
      searchQuery: query,
      performed: false,
      provider: "firecrawl",
      error: "Firecrawl request failed",
    };
  }
}

// ── OpenSearp Provider ─────────────────────────────────────────

/**
 * OpenSearp - Lightweight search + extraction.
 * Open source, self-hosted, combines search with content extraction.
 *
 * @see https://github.com/opensearp/opensearp
 */
async function openSearpSearch(
  query: string,
  options: { numResults?: number } = {}
): Promise<WebSearchResponse> {
  const baseUrl = config.external.openSearp?.baseUrl;

  if (!baseUrl) {
    return {
      results: [],
      totalResults: 0,
      searchQuery: query,
      performed: false,
      provider: "opensearp",
      error: "OpenSearp not configured. Set OPENSEARP_BASE_URL.",
    };
  }

  try {
    const url = `${baseUrl.replace(/\/$/, "")}/search`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "FoodGaurdAI/0.2 (research)",
      },
      body: JSON.stringify({
        query,
        limit: options.numResults ?? 10,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      logger.error("opensearp_api_error", { status: response.status, query });
      return {
        results: [],
        totalResults: 0,
        searchQuery: query,
        performed: false,
        provider: "opensearp",
        error: `OpenSearp returned HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      results?: Array<{
        title?: string;
        url?: string;
        snippet?: string;
        content?: string;
      }>;
    };

    const now = new Date().toISOString();
    const results: WebSearchResult[] = (data.results ?? [])
      .filter((item) => item.url && item.title)
      .map((item) => ({
        title: item.title || "",
        url: item.url || "",
        snippet: item.snippet || item.content?.slice(0, 300) || "",
        domain: extractDomain(item.url || ""),
        retrievedAt: now,
        provider: "opensearp",
      }));

    return normalizeAndScoreResults(results, query, "opensearp");
  } catch (error) {
    logger.error("opensearp_search_failed", { query, error: String(error) });
    return {
      results: [],
      totalResults: 0,
      searchQuery: query,
      performed: false,
      provider: "opensearp",
      error: "OpenSearp request failed",
    };
  }
}

// ── Agent Reach Provider ───────────────────────────────────────

/**
 * Agent Reach - Open-source infrastructure for AI agents.
 * Query multiple platforms (X/Twitter, Reddit, YouTube) via unified API.
 *
 * @see https://github.com/agentreach
 */
export type AgentReachPlatform = "twitter" | "reddit" | "youtube";

async function agentReachSearch(
  query: string,
  platforms: AgentReachPlatform[] = ["reddit", "youtube"],
  options: { numResults?: number } = {}
): Promise<WebSearchResponse> {
  const baseUrl = config.external.agentReach?.baseUrl;
  const apiKey = config.external.agentReach?.apiKey;

  if (!baseUrl) {
    return {
      results: [],
      totalResults: 0,
      searchQuery: query,
      performed: false,
      provider: "agent_reach",
      error: "Agent Reach not configured. Set AGENT_REACH_BASE_URL.",
    };
  }

  try {
    const allResults: WebSearchResult[] = [];
    const now = new Date().toISOString();

    // Query each platform
    for (const platform of platforms) {
      try {
        const url = `${baseUrl.replace(/\/$/, "")}/${platform}/search`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "FoodGaurdAI/0.2 (research)",
        };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            query,
            limit: Math.ceil((options.numResults ?? 10) / platforms.length),
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) continue;

        const data = (await response.json()) as {
          results?: Array<{
            title?: string;
            url?: string;
            text?: string;
            author?: string;
          }>;
        };

        const platformResults: WebSearchResult[] = (data.results ?? [])
          .filter((item) => item.url)
          .map((item) => ({
            title: item.title || `Post by ${item.author || "unknown"}`,
            url: item.url || "",
            snippet: item.text?.slice(0, 200) || "",
            domain: extractDomain(item.url || ""),
            retrievedAt: now,
            provider: `agent_reach:${platform}`,
          }));

        allResults.push(...platformResults);
      } catch (platformError) {
        logger.warn("agent_reach_platform_failed", {
          platform,
          error: String(platformError),
        });
      }
    }

    return normalizeAndScoreResults(allResults, query, "agent_reach");
  } catch (error) {
    logger.error("agent_reach_search_failed", { query, error: String(error) });
    return {
      results: [],
      totalResults: 0,
      searchQuery: query,
      performed: false,
      provider: "agent_reach",
      error: "Agent Reach request failed",
    };
  }
}

// ── Unified Search with Fallback ───────────────────────────────

/**
 * Perform web search with automatic fallback between providers.
 *
 * Fallback chain:
 * 1. Primary provider (configurable: google/searxng/firecrawl)
 * 2. Fallback providers (in order)
 * 3. Agent Reach (for social media, if enabled)
 *
 * @param query - The search query
 * @param options - Configuration options
 * @returns Normalized search results from the first successful provider
 */
export async function webSearchWithFallback(
  query: string,
  options: {
    numResults?: number;
    language?: string;
    provider?: SearchProvider;
    includeSocial?: boolean;
  } = {}
): Promise<WebSearchResponse> {
  const startTime = Date.now();
  const providers: Array<{ name: SearchProvider; fn: () => Promise<WebSearchResponse> }> = [];

  // Build provider chain
  const primaryProvider = options.provider || config.webSearch.primaryProvider;

  // Add primary provider
  switch (primaryProvider) {
    case "google":
      providers.push({ name: "google", fn: () => googleSearch(query, options) });
      break;
    case "searxng":
      providers.push({ name: "searxng", fn: () => searxngSearch(query, options) });
      break;
    case "firecrawl":
      providers.push({ name: "firecrawl", fn: () => firecrawlSearch(query, options) });
      break;
    case "duckduckgo":
      providers.push({ name: "duckduckgo", fn: () => duckduckgoSearch(query, options) });
      break;
  }

  // Add fallback providers (excluding the primary)
  for (const fallback of config.webSearch.fallbackProviders) {
    if (fallback === primaryProvider) continue;

    switch (fallback) {
      case "google":
        providers.push({ name: "google", fn: () => googleSearch(query, options) });
        break;
      case "searxng":
        providers.push({ name: "searxng", fn: () => searxngSearch(query, options) });
        break;
      case "firecrawl":
        providers.push({ name: "firecrawl", fn: () => firecrawlSearch(query, options) });
        break;
      case "opensearp":
        providers.push({ name: "opensearp", fn: () => openSearpSearch(query, options) });
        break;
      case "duckduckgo":
        providers.push({ name: "duckduckgo", fn: () => duckduckgoSearch(query, options) });
        break;
    }
  }

  // Try each provider until one succeeds
  const providerErrors: string[] = [];
  for (const provider of providers) {
    try {
      const result = await provider.fn();
      if (result.performed && result.results.length > 0) {
        const duration = Date.now() - startTime;
        logger.info("web_search_success", {
          provider: provider.name,
          query,
          results: result.results.length,
          durationMs: duration,
        });
        return result;
      }
      if (result.error) providerErrors.push(`${provider.name}: ${result.error}`);
    } catch (error) {
      logger.warn("web_search_provider_failed", {
        provider: provider.name,
        query,
        error: String(error),
      });
      providerErrors.push(`${provider.name}: ${String(error)}`);
    }
  }

  // If all providers fail, try Agent Reach for social media (if enabled)
  if (config.webSearch.enableAgentReach && options.includeSocial !== false) {
    try {
      const socialResult = await agentReachSearch(query, ["reddit", "youtube"], options);
      if (socialResult.performed && socialResult.results.length > 0) {
        logger.info("web_search_agent_reach_fallback", {
          query,
          results: socialResult.results.length,
        });
        return socialResult;
      }
      if (socialResult.error) providerErrors.push(`agent_reach: ${socialResult.error}`);
    } catch (error) {
      logger.warn("agent_reach_fallback_failed", { query, error: String(error) });
      providerErrors.push(`agent_reach: ${String(error)}`);
    }
  }

  const duration = Date.now() - startTime;
  logger.error("web_search_all_providers_failed", {
    query,
    providersTried: providers.map((p) => p.name),
    durationMs: duration,
  });

  return {
    results: [],
    totalResults: 0,
    searchQuery: query,
    performed: false,
    provider: "none",
    error: `All search providers failed: ${providerErrors.join("; ") || "no search providers not configured"}`,
  };
}

/**
 * Extract content from a specific URL using Firecrawl.
 * Useful for getting detailed information from authoritative sources.
 *
 * Supports:
 * - Clean Markdown extraction
 * - Structured JSON output
 * - Screenshots
 * - 96% web coverage including JS-heavy pages
 */
export async function extractUrlContent(
  url: string,
  options: { format?: "markdown" | "json" } = {}
): Promise<{ content: string; title?: string; success: boolean; error?: string }> {
  const apiKey = config.external.firecrawl?.apiKey;
  const baseUrl = config.external.firecrawl?.baseUrl;

  if (!apiKey) {
    return {
      content: "",
      success: false,
      error: "Firecrawl not configured for URL extraction",
    };
  }

  try {
    // Firecrawl v2 scrape endpoint
    const endpoint = `${baseUrl?.replace(/\/$/, "") || "https://api.firecrawl.dev"}/v2/scrape`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: [options.format || "markdown"],
        onlyMainContent: true,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      return {
        content: "",
        success: false,
        error: `Firecrawl returned HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      success?: boolean;
      data?: {
        markdown?: string;
        title?: string;
        metadata?: {
          title?: string;
        };
      };
    };

    return {
      content: data.data?.markdown || "",
      title: data.data?.title || data.data?.metadata?.title,
      success: data.success ?? true,
    };
  } catch (error) {
    return {
      content: "",
      success: false,
      error: String(error),
    };
  }
}

/**
 * Check which search providers are configured and available.
 * DuckDuckGo Lite is keyless, so it is always available unless
 * explicitly disabled with ENABLE_DUCKDUCKGO_SEARCH=false.
 */
export function getAvailableProviders(): {
  google: boolean;
  searxng: boolean;
  firecrawl: boolean;
  openSearp: boolean;
  agentReach: boolean;
  duckduckgo: boolean;
} {
  const googleKey = process.env.GOOGLE_SEARCH_API_KEY || config.external.google?.searchApiKey || "";
  const googleEngine = process.env.GOOGLE_SEARCH_ENGINE_ID || config.external.google?.searchEngineId || "";
  const searxngBase = process.env.SEARXNG_BASE_URLS || process.env.SEARXNG_BASE_URL || config.external.searxng?.baseUrl || "";
  const firecrawlKey = process.env.FIRECRAWL_API_KEY || config.external.firecrawl?.apiKey || "";
  const openSearpBase = process.env.OPENSEARP_BASE_URL || config.external.openSearp?.baseUrl || "";
  const agentReachBase = process.env.AGENT_REACH_BASE_URL || config.external.agentReach?.baseUrl || "";
  return {
    google: !!(googleKey && googleEngine),
    searxng: !!searxngBase,
    firecrawl: !!firecrawlKey,
    openSearp: !!openSearpBase,
    agentReach: !!agentReachBase,
    duckduckgo: process.env.ENABLE_DUCKDUCKGO_SEARCH !== "false",
  };
}

/**
 * Get the current search configuration.
 */
export function getSearchConfig(): {
  primaryProvider: string;
  fallbackProviders: string[];
  agentReachEnabled: boolean;
} {
  return {
    primaryProvider: config.webSearch.primaryProvider,
    fallbackProviders: config.webSearch.fallbackProviders,
    agentReachEnabled: config.webSearch.enableAgentReach,
  };
}
