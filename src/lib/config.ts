export const config = {
  databaseUrl: process.env.DATABASE_URL || "",
  redisUrl: process.env.REDIS_URL || "",
  ai: {
    provider: process.env.AI_PROVIDER || "mock",
    apiKey: process.env.AI_API_KEY || "",
    baseUrl:
      // Groq uses an OpenAI-compatible endpoint
      process.env.AI_PROVIDER === "groq"
        ? process.env.AI_BASE_URL || "https://api.groq.com/openai/v1"
        : process.env.AI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.AI_MODEL || "gpt-4o-mini",
    // Gemini-specific: some models don't support response_format JSON mode
    supportsJsonMode: process.env.AI_SUPPORTS_JSON_MODE !== "false",
  },
  ocr: {
    provider: process.env.OCR_PROVIDER || "mock",
    fallback: process.env.OCR_FALLBACK || "tesseract",
    apiKey: process.env.OCR_API_KEY || "",
    lang: process.env.OCR_ENGINE_LANG || "eng",
    puterAuthToken: process.env.PUTER_AUTH_TOKEN || "",
  },
  productData: {
    provider: process.env.PRODUCT_DATA_PROVIDER || "mock",
    apiKey: process.env.PRODUCT_DATA_API_KEY || "",
  },
  productLookup: {
    // External fallback chain (google -> barcode-list -> barcodesdatabase
    // -> barcodespider -> OCR+google). Disable to keep lookups local only.
    fallbackEnabled: process.env.PRODUCT_LOOKUP_FALLBACKS !== "disabled",
  },
  external: {
    usdaFdc: {
      apiKey: process.env.USDA_FDC_API_KEY || "",
      baseUrl: "https://api.nal.usda.gov/fdc/v1",
    },
    fda: {
      baseUrl: "https://api.fda.gov",
    },
    pubchem: {
      baseUrl: "https://pubchem.ncbi.nlm.nih.gov/rest/pug",
    },
    who: {
      baseUrl: "https://ghoapi.azureedge.net/api",
    },
    apiNinjas: {
      apiKey: process.env.API_NINJAS_API_KEY || "",
      baseUrl: "https://api.api-ninjas.com/v1",
      calorieninjasBaseUrl: "https://api.calorieninjas.com/v1",
    } satisfies { apiKey: string; baseUrl: string; calorieninjasBaseUrl: string },
    barcodeSpider: {
      apiKey: process.env.BARCODE_SPIDER_API_KEY || "",
      baseUrl: "https://api.barcodespider.com/v1",
    },
    google: {
      searchApiKey: process.env.GOOGLE_SEARCH_API_KEY || "",
      searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID || "",
    },
    // ── Web Search Providers (fallback chain) ──
    searxng: {
      baseUrl: process.env.SEARXNG_BASE_URL || "",
      apiKey: process.env.SEARXNG_API_KEY || "",
    },
    firecrawl: {
      apiKey: process.env.FIRECRAWL_API_KEY || "",
      baseUrl: process.env.FIRECRAWL_BASE_URL || "https://api.firecrawl.dev",
    },
    openSearp: {
      baseUrl: process.env.OPENSEARP_BASE_URL || "",
    },
    agentReach: {
      baseUrl: process.env.AGENT_REACH_BASE_URL || "",
      apiKey: process.env.AGENT_REACH_API_KEY || "",
    },
    // Gemini with built-in Google Search grounding (search + read + summarize)
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || "",
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      baseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta",
    },
    // Brave Search API (independent index, free tier available)
    brave: {
      apiKey: process.env.BRAVE_SEARCH_API_KEY || "",
      baseUrl: process.env.BRAVE_SEARCH_BASE_URL || "https://api.search.brave.com/res/v1",
    },
  },
  // ── Web Search Configuration ──
  webSearch: {
    // Primary provider: google | searxng | firecrawl | opensearp | duckduckgo
    primaryProvider: (process.env.WEB_SEARCH_PRIMARY_PROVIDER || "google") as "google" | "searxng" | "firecrawl" | "opensearp" | "duckduckgo",
    // Fallback providers in order (if primary fails)
    fallbackProviders: (process.env.WEB_SEARCH_FALLBACK_PROVIDERS || "searxng,firecrawl,duckduckgo").split(",").map(p => p.trim()) as Array<"google" | "searxng" | "firecrawl" | "opensearp" | "duckduckgo">,
    // Enable Agent Reach for social media queries
    enableAgentReach: process.env.ENABLE_AGENT_REACH === "true",
  },
  evidence: {
    provider: process.env.EVIDENCE_PROVIDER || "curated",
  },
  auth: {
    // JWT expiry. The signing secret is resolved server-side (see
    // src/lib/server/auth-secret.ts) so `node:crypto` never enters the
    // browser bundle.
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
  limits: {
    maxBodyMb: Number(process.env.MAX_REQUEST_BODY_MB || 8),
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120),
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  },
  seed: {
    enabled: (process.env.SEED_DEMO_DATA || "true") !== "false",
    adminEmail: process.env.DEMO_ADMIN_EMAIL || "admin@foodgaurd.app",
    adminPassword: process.env.DEMO_ADMIN_PASSWORD || "FoodGaurd@Admin1",
    userEmail: process.env.DEMO_USER_EMAIL || "user@foodgaurd.app",
    userPassword: process.env.DEMO_USER_PASSWORD || "FoodGaurd@User1",
  },
  // Configurable FSSAI reporting channel. The reporting CTA in the
  // assistant UI is only shown when this URL is configured. Leave
  // empty (the default) in dev to keep the user inside FoodGuard and
  // avoid impersonating FSSAI.
  fssai: {
    reportingUrl: process.env.FSSAI_REPORTING_URL || "",
    // General-purpose informational site — already used in seeded
    // evidence data; surfaces as a fallback link.
    informationalUrl: process.env.FSSAI_INFORMATIONAL_URL || "https://www.fssai.gov.in",
    // Standalone FoodGuard FSSAI Regulatory API (Python/FastAPI service).
    // The main app talks to it over HTTP for regulatory facts. Set to the
    // deployed service URL in production. When unreachable, compliance is
    // reported as SERVICE_UNAVAILABLE — it never crashes the analysis.
    apiUrl: process.env.FSSAI_API_URL || "http://127.0.0.1:8000",
    // Optional bearer token forwarded as `Authorization: Bearer <key>` when
    // the FSSAI service has authentication enabled (FOODGUARD_API_KEY there).
    apiKey: process.env.FSSAI_API_KEY || "",
    // Read-only lookup requests (rules/additives/contaminants/categories/
    // evidence) are cached for this long. Compliance results carry their own
    // (shorter) TTL because they depend on measured amounts.
    lookupCacheTtlSeconds: Number(process.env.FSSAI_LOOKUP_CACHE_TTL_SECONDS || 3600),
    timeoutMs: Number(process.env.FSSAI_TIMEOUT_MS || 10_000),
  },
  // Standalone FoodGuard Visual Product Search API (Python/FastAPI CLIP+FAISS).
  // The main app calls it over HTTP for visually-similar products when a
  // scanned barcode cannot be matched. When unreachable, similar-product
  // results are simply omitted — scanning never crashes or blocks on it.
  visualSearch: {
    apiUrl: process.env.VISUAL_SEARCH_API_URL || "https://foodguard-visual-search.onrender.com",
    apiKey: process.env.VISUAL_SEARCH_API_KEY || "",
    timeoutMs: Number(process.env.VISUAL_SEARCH_TIMEOUT_MS || 30_000),
    // Embed product photos in the browser (transformers.js) so the backend
    // only runs FAISS. Disable to skip visual-similarity candidates entirely
    // (faster scans, no ~model download on first use).
    clientEmbed: process.env.VISUAL_SEARCH_CLIENT_EMBED !== "false",
  },
} as const;

/** True when running without a configured database (in-memory store). */
export function isMockMode(): boolean {
  return !config.databaseUrl;
}

/** True when the AI provider is configured and ready to use. */
export function isAIReady(): boolean {
  return config.ai.provider !== "mock" && !!config.ai.apiKey;
}
