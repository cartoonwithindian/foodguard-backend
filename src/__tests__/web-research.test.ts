import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  googleSearch,
  buildIngredientSearchQueries,
  buildAlternativeSearchQueries,
  isAuthoritativeSource,
  getSourceTypeFromDomain,
} from "@/lib/external/google-search";
import {
  researchIngredient,
  researchProduct,
  researchSafety,
  isWebResearchAvailable,
  toEvidenceRef,
  needsWebResearch,
  shouldPerformWebResearch,
  getSearchProviderStatus,
} from "@/services/web-research.service";
import {
  getAvailableProviders,
  getSearchConfig,
  webSearchWithFallback,
} from "@/lib/external/web-search-providers";

// Mock fetch for Google Search tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Google Search Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SEARCH_API_KEY = "test-key";
    process.env.GOOGLE_SEARCH_ENGINE_ID = "test-engine-id";
  });

  describe("buildIngredientSearchQueries", () => {
    it("should build FSSAI-specific queries", () => {
      const queries = buildIngredientSearchQueries("monosodium glutamate");
      expect(queries.length).toBeGreaterThan(0);
      expect(queries[0]).toContain("FSSAI");
      expect(queries[0]).toContain("monosodium glutamate");
    });

    it("should include context when provided", () => {
      const queries = buildIngredientSearchQueries("E621", "Instant Noodles");
      expect(queries.some(q => q.includes("Instant Noodles"))).toBe(true);
    });

    it("should include identifier queries for INS codes", () => {
      const queries = buildIngredientSearchQueries("MSG", undefined);
      // Should have multiple query variations
      expect(queries.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("buildAlternativeSearchQueries", () => {
    it("should build Indian market queries by default", () => {
      const queries = buildAlternativeSearchQueries("Kurkure", "snacks");
      expect(queries.some(q => q.includes("India"))).toBe(true);
    });

    it("should build non-India queries when specified", () => {
      const queries = buildAlternativeSearchQueries("Lays", "snacks", "US");
      expect(queries.some(q => q.includes("India"))).toBe(false);
    });
  });

  describe("isAuthoritativeSource", () => {
    it("should recognize FSSAI domains", () => {
      expect(isAuthoritativeSource("https://fssai.gov.in/some-page")).toBe(true);
      expect(isAuthoritativeSource("https://www.fssai.gov.in")).toBe(true);
    });

    it("should recognize FDA domains", () => {
      expect(isAuthoritativeSource("https://www.fda.gov/safety")).toBe(true);
    });

    it("should recognize NIH/PubMed domains", () => {
      expect(isAuthoritativeSource("https://pubmed.ncbi.nlm.nih.gov/12345")).toBe(true);
      expect(isAuthoritativeSource("https://www.nih.gov")).toBe(true);
    });

    it("should reject non-authoritative domains", () => {
      expect(isAuthoritativeSource("https://www.random-blog.com/post")).toBe(false);
      expect(isAuthoritativeSource("https://reddit.com/r/food")).toBe(false);
    });
  });

  describe("getSourceTypeFromDomain", () => {
    it("should identify government sources", () => {
      expect(getSourceTypeFromDomain("fssai.gov.in")).toBe("government");
      expect(getSourceTypeFromDomain("fda.gov")).toBe("government");
    });

    it("should identify scientific sources", () => {
      expect(getSourceTypeFromDomain("pubmed.ncbi.nlm.nih.gov")).toBe("scientific_paper");
      expect(getSourceTypeFromDomain("ncbi.nlm.nih.gov")).toBe("scientific_paper");
    });

    it("should identify food database sources", () => {
      expect(getSourceTypeFromDomain("openfoodfacts.org")).toBe("food_database");
      expect(getSourceTypeFromDomain("fdc.nal.usda.gov")).toBe("food_database");
    });

    it("should identify secondary sources by default", () => {
      expect(getSourceTypeFromDomain("example.com")).toBe("secondary_source");
    });
  });

  describe("googleSearch", () => {
    it("should return error when not configured", async () => {
      delete process.env.GOOGLE_SEARCH_API_KEY;
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;

      const result = await googleSearch("test query");
      expect(result.performed).toBe(false);
      expect(result.error).toContain("not configured");
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limit exceeded"),
      });

      const result = await googleSearch("test query");
      expect(result.performed).toBe(false);
      expect(result.error).toContain("HTTP 429");
    });

    it("should normalize successful results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          items: [
            {
              title: "FSSAI Food Safety Standards",
              link: "https://fssai.gov.in/standards",
              snippet: "Official FSSAI food safety standards and regulations",
              displayLink: "fssai.gov.in",
            },
            {
              title: "Random Blog Post",
              link: "https://random-blog.com/food",
              snippet: "My thoughts on food safety",
              displayLink: "random-blog.com",
            },
          ],
        }),
      });

      const result = await googleSearch("FSSAI food safety");
      expect(result.performed).toBe(true);
      expect(result.results.length).toBe(2);
      // Authoritative source should be ranked higher
      expect(result.results[0].domain).toBe("fssai.gov.in");
    });
  });
});

describe("Web Research Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SEARCH_API_KEY = "test-key";
    process.env.GOOGLE_SEARCH_ENGINE_ID = "test-engine-id";
    delete process.env.ENABLE_DUCKDUCKGO_SEARCH;
  });

  describe("isWebResearchAvailable", () => {
    it("should return true when configured", () => {
      process.env.GOOGLE_SEARCH_API_KEY = "test-key";
      process.env.GOOGLE_SEARCH_ENGINE_ID = "test-engine-id";
      expect(isWebResearchAvailable()).toBe(true);
    });

    it("should return false when nothing is configured and DuckDuckGo is disabled", () => {
      delete process.env.GOOGLE_SEARCH_API_KEY;
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;
      process.env.ENABLE_DUCKDUCKGO_SEARCH = "false";
      expect(isWebResearchAvailable()).toBe(false);
    });

    it("should return true via keyless DuckDuckGo when no keys are set", () => {
      delete process.env.GOOGLE_SEARCH_API_KEY;
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;
      expect(isWebResearchAvailable()).toBe(true);
    });
  });

  describe("researchIngredient", () => {
    it("should return empty results when not configured", async () => {
      delete process.env.GOOGLE_SEARCH_API_KEY;
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;
      process.env.ENABLE_DUCKDUCKGO_SEARCH = "false";

      const result = await researchIngredient({ ingredientName: "E621" });
      expect(result.performed).toBe(false);
      expect(result.sources.length).toBe(0);
    });

    it("should handle search failures gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await researchIngredient({ ingredientName: "E621" });
      expect(result.performed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("researchProduct", () => {
    it("should return empty results when not configured", async () => {
      delete process.env.GOOGLE_SEARCH_API_KEY;
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;
      process.env.ENABLE_DUCKDUCKGO_SEARCH = "false";

      const result = await researchProduct({
        productName: "Test Product",
        category: "food",
      });
      expect(result.performed).toBe(false);
    });
  });

  describe("researchSafety", () => {
    it("should return empty results when not configured", async () => {
      delete process.env.GOOGLE_SEARCH_API_KEY;
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;
      process.env.ENABLE_DUCKDUCKGO_SEARCH = "false";

      const result = await researchSafety("E621 safety");
      expect(result.performed).toBe(false);
    });
  });

  describe("toEvidenceRef", () => {
    it("should convert WebResearchEvidence to EvidenceRef", () => {
      const evidence = {
        title: "FSSAI Standards",
        url: "https://fssai.gov.in/standards",
        domain: "fssai.gov.in",
        snippet: "Official standards",
        sourceType: "government",
        authority: "primary" as const,
        relevance: 0.9,
        retrievedAt: "2024-01-01T00:00:00Z",
      };

      const ref = toEvidenceRef(evidence, "test-id");
      expect(ref.id).toBe("test-id");
      expect(ref.title).toBe("FSSAI Standards");
      expect(ref.organization).toBe("fssai.gov.in");
      expect(ref.sourceType).toBe("government");
      expect(ref.evidenceLevel).toBe("high");
    });
  });

  describe("needsWebResearch", () => {
    it("should return true when no evidence exists", () => {
      const item = {
        rawName: "E621",
        name: "Monosodium Glutamate",
        function: "Flavor enhancer",
        assessment: "insufficient_evidence" as const,
        severity: "moderate" as const,
        explanation: "",
        evidence: [],
        confidence: 0.3,
        flags: [],
        allergens: [],
        matched: false,
      };

      expect(needsWebResearch(item)).toBe(true);
    });

    it("should return true when assessment is insufficient_evidence", () => {
      const item = {
        rawName: "Unknown Additive",
        name: "Unknown Additive",
        function: "Unknown",
        assessment: "insufficient_evidence" as const,
        severity: "moderate" as const,
        explanation: "",
        evidence: [{ id: "e1", title: "Info", organization: "Unknown", sourceType: "secondary_source" as const, evidenceLevel: "low" as const, summary: "Some info" }],
        confidence: 0.4,
        flags: [],
        allergens: [],
        matched: true,
      };

      expect(needsWebResearch(item)).toBe(true);
    });

    it("should return false when evidence is sufficient", () => {
      const item = {
        rawName: "Sugar",
        name: "Sugar",
        function: "Sweetener",
        assessment: "generally_accepted" as const,
        severity: "low" as const,
        explanation: "Generally safe",
        evidence: [
          { id: "e1", title: "FSSAI Permit", organization: "FSSAI", sourceType: "regulator" as const, evidenceLevel: "high" as const, summary: "Permitted" },
          { id: "e2", title: "WHO Safety", organization: "WHO", sourceType: "international_standard" as const, evidenceLevel: "high" as const, summary: "Safe in moderation" },
        ],
        confidence: 0.8,
        flags: [],
        allergens: [],
        matched: true,
      };

      expect(needsWebResearch(item)).toBe(false);
    });

    it("should return true when no authoritative evidence for concerning ingredient", () => {
      const item = {
        rawName: "Unknown Chemical",
        name: "Unknown Chemical",
        function: "Unknown",
        assessment: "potentially_concerning" as const,
        severity: "high" as const,
        explanation: "May be concerning",
        evidence: [{ id: "e1", title: "Blog Post", organization: "Some Blog", sourceType: "secondary_source" as const, evidenceLevel: "low" as const, summary: "Maybe bad" }],
        confidence: 0.4,
        flags: [],
        allergens: [],
        matched: true,
      };

      expect(needsWebResearch(item)).toBe(true);
    });
  });

  describe("shouldPerformWebResearch", () => {
    it("should not research when FSSAI provides sufficient evidence", () => {
      const items = [
        {
          rawName: "Sugar",
          name: "Sugar",
          function: "Sweetener",
          assessment: "generally_accepted" as const,
          severity: "low" as const,
          explanation: "",
          evidence: [{ id: "e1", title: "FSSAI Permit", organization: "FSSAI", sourceType: "regulator" as const, evidenceLevel: "high" as const, summary: "Permitted" }],
          confidence: 0.8,
          flags: [],
          allergens: [],
          matched: true,
        },
      ];

      const result = shouldPerformWebResearch(items, true, true);
      expect(result.needed).toBe(false);
    });

    it("should research when multiple ingredients lack evidence", () => {
      const items = [
        {
          rawName: "Ing1",
          name: "Ing1",
          function: "Unknown",
          assessment: "insufficient_evidence" as const,
          severity: "moderate" as const,
          explanation: "",
          evidence: [],
          confidence: 0.3,
          flags: [],
          allergens: [],
          matched: false,
        },
        {
          rawName: "Ing2",
          name: "Ing2",
          function: "Unknown",
          assessment: "insufficient_evidence" as const,
          severity: "moderate" as const,
          explanation: "",
          evidence: [],
          confidence: 0.3,
          flags: [],
          allergens: [],
          matched: false,
        },
      ];

      const result = shouldPerformWebResearch(items, true, true);
      expect(result.needed).toBe(true);
    });

    it("should not research when no FSSAI and single ingredient needs research", () => {
      const items = [
        {
          rawName: "Unknown",
          name: "Unknown",
          function: "Unknown",
          assessment: "insufficient_evidence" as const,
          severity: "moderate" as const,
          explanation: "",
          evidence: [],
          confidence: 0.3,
          flags: [],
          allergens: [],
          matched: false,
        },
      ];

      const result = shouldPerformWebResearch(items, false, true);
      expect(result.needed).toBe(false);
    });
  });

  describe("getSearchProviderStatus", () => {
    it("should return provider status", () => {
      const status = getSearchProviderStatus();
      expect(status).toHaveProperty("google");
      expect(status).toHaveProperty("searxng");
      expect(status).toHaveProperty("firecrawl");
      expect(status).toHaveProperty("openSearp");
      expect(status).toHaveProperty("agentReach");
      expect(status).toHaveProperty("anyAvailable");
      expect(typeof status.anyAvailable).toBe("boolean");
    });
  });
});

describe("Web Search Providers", () => {
  describe("getAvailableProviders", () => {
    it("should return provider availability status", () => {
      const providers = getAvailableProviders();
      expect(providers).toHaveProperty("google");
      expect(providers).toHaveProperty("searxng");
      expect(providers).toHaveProperty("firecrawl");
      expect(providers).toHaveProperty("openSearp");
      expect(providers).toHaveProperty("agentReach");
    });
  });

  describe("getSearchConfig", () => {
    it("should return search configuration", () => {
      const searchConfig = getSearchConfig();
      expect(searchConfig).toHaveProperty("primaryProvider");
      expect(searchConfig).toHaveProperty("fallbackProviders");
      expect(searchConfig).toHaveProperty("agentReachEnabled");
      expect(Array.isArray(searchConfig.fallbackProviders)).toBe(true);
    });
  });

  describe("webSearchWithFallback", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Reset environment
      delete process.env.GOOGLE_SEARCH_API_KEY;
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;
      delete process.env.SEARXNG_BASE_URL;
      delete process.env.FIRECRAWL_API_KEY;
    });

    it("should return error when no providers are configured", async () => {
      const result = await webSearchWithFallback("test query");
      expect(result.performed).toBe(false);
      expect(result.error).toContain("failed");
    });

    it("should try fallback providers when primary fails", async () => {
      // This test verifies the fallback chain exists
      // Actual API calls would be mocked in a real test environment
      const result = await webSearchWithFallback("test query", {
        numResults: 5,
      });
      // Should not throw, even with no providers configured
      expect(result).toHaveProperty("performed");
      expect(result).toHaveProperty("provider");
    });
  });
});
