/**
 * Web Product Enrichment Service
 *
 * Searches the web for product information, fetches pages,
 * extracts ingredients/nutrition using regex + AI (when available),
 * and saves enriched data to the database.
 */

import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { webSearchWithFallback } from "@/lib/external/web-search-providers";
import { getStore } from "@/lib/store";
import type { ProductInfo, NutritionFacts, NutrientValue, ProductCategory } from "@/types/domain";
import type { ProductLookupResult } from "@/lib/product-provider";

// ── Types ──────────────────────────────────────────────────

/** Raw nutrition values extracted from the web — flat key→number map. */
export type RawNutrition = Record<string, number>;

export type EnrichmentResult = {
  success: boolean;
  source: string;
  sourceUrl: string | null;
  ingredientsRaw: string | null;
  nutrition: RawNutrition | null;
  productName: string | null;
  brand: string | null;
  category: ProductCategory | null;
  imageUrl: string | null;
  evidence: string[];
};

// ── Regex Patterns for Ingredient Extraction ───────────────

const INGREDIENT_PATTERNS = [
  // "Ingredients: Rice, Sugar, Salt..." (common on food labels)
  /ingredients?\s*[:]\s*([A-Z][^.]{10,500})/gi,
  // "Contains: Rice, Sugar, Salt..."
  /contains?\s*[:]\s*([A-Z][^.]{10,500})/gi,
  // "Composition: Rice, Sugar, Salt..."
  /composition\s*[:]\s*([A-Z][^.]{10,500})/gi,
  // On Indian sites: "Ingredients listed as comma-separated after the word"
  /(?:ingredients|成分|料)[：:\s]+([a-zA-Z][^.\n]{10,500})/gi,
];

const NUTRITION_PATTERNS = {
  energy: [
    /energy[:\s]*(\d+\.?\d*)\s*(kcal|kj|cal)/gi,
    /(\d+\.?\d*)\s*kcal/gi,
  ],
  protein: [
    /protein[:\s]*(\d+\.?\d*)\s*g/gi,
    /prot[eé]in[es]*[:\s]*(\d+\.?\d*)\s*g/gi,
  ],
  fat: [
    /(?:total\s+)?fat[:\s]*(\d+\.?\d*)\s*g/gi,
    /(?:total\s+)?(?:fat|lipid)[es]*[:\s]*(\d+\.?\d*)\s*g/gi,
  ],
  carbohydrates: [
    /(?:total\s+)?carbo(?:hydrates?|hs?)[:\s]*(\d+\.?\d*)\s*g/gi,
    /carb(?:s|ohydrates?)?[:\s]*(\d+\.?\d*)\s*g/gi,
  ],
  sugar: [
    /(?:total\s+)?sugars?[:\s]*(\d+\.?\d*)\s*g/gi,
    /(?:total\s+)?(?:sugar|sucre)[:\s]*(\d+\.?\d*)\s*g/gi,
  ],
  salt: [
    /salt[:\s]*(\d+\.?\d*)\s*g/gi,
    /sodium[:\s]*(\d+\.?\d*)\s*(mg|g)/gi,
  ],
  saturatedFat: [
    /saturated\s+fat[:\s]*(\d+\.?\d*)\s*g/gi,
    /saturates?[:\s]*(\d+\.?\d*)\s*g/gi,
  ],
  fiber: [
    /(?:dietary\s+)?fib(?:re|er)[:\s]*(\d+\.?\d*)\s*g/gi,
  ],
};

// ── Page Fetching ──────────────────────────────────────────

async function fetchPageContent(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      logger.debug("fetch_page_failed", { url, status: response.status });
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    const html = await response.text();
    return html;
  } catch (error) {
    logger.debug("fetch_page_error", { url, error: String(error) });
    return null;
  }
}

// ── HTML Cleaning ──────────────────────────────────────────

function cleanHtml(html: string): string {
  // Remove scripts, styles, nav, footer, header
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");

  // Convert common tags to text
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'");

  // Collapse whitespace
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();

  return text;
}

// ── Ingredient Extraction ──────────────────────────────────

function extractIngredients(text: string): string | null {
  const clean = cleanHtml(text);

  for (const pattern of INGREDIENT_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(clean);
    if (match && match[1]) {
      const raw = match[1].trim();
      // Validate: should contain commas (multiple ingredients)
      if (raw.includes(",") && raw.length > 10 && raw.length < 1000) {
        // Clean up the extracted text
        const cleaned = raw
          .replace(/\s+/g, " ")
          .replace(/\.$/, "")
          .trim();
        return cleaned;
      }
    }
  }

  return null;
}

// ── Nutrition Extraction ───────────────────────────────────

function extractNutrition(text: string): RawNutrition | null {
  const clean = cleanHtml(text);
  const nutrition: Record<string, number> = {};
  let found = 0;

  for (const [key, patterns] of Object.entries(NUTRITION_PATTERNS)) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(clean);
      if (match && match[1]) {
        const value = parseFloat(match[1]);
        if (!isNaN(value) && value > 0 && value < 10000) {
          nutrition[key] = value;
          found++;
          break;
        }
      }
    }
  }

  return found >= 2 ? nutrition : null;
}

// ── AI Extraction (when API key available) ─────────────────

async function aiExtractProductInfo(
  pageContent: string,
  productName: string,
): Promise<{
  ingredients: string | null;
  nutrition: RawNutrition | null;
} | null> {
  if (!config.ai.apiKey) return null;

  try {
    const truncated = pageContent.slice(0, 4000);
    const systemPrompt = `You are a food product data extractor. Given a web page about a food product, extract:
1. ingredientsRaw: The full ingredients list as a comma-separated string
2. nutrition: An object with numeric values for any of: energy, protein, fat, carbohydrates, sugar, salt, saturatedFat, fiber

Return ONLY valid JSON with these fields. If a field cannot be determined, use null.
Example: {"ingredientsRaw": "Rice, Sugar, Salt, Spices", "nutrition": {"energy": 388, "protein": 1.1, "fat": 4.7}}`;

    const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Product: ${productName}\n\nPage content:\n${truncated}` },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      ingredients: parsed.ingredientsRaw || null,
      nutrition: parsed.nutrition || null,
    };
  } catch (error) {
    logger.debug("ai_extract_failed", { error: String(error) });
    return null;
  }
}

// ── Gemini Grounded Search (search + read pages + extract in one call) ──

/**
 * Uses Gemini's built-in Google Search grounding to find and extract
 * product information. Gemini performs the search, reads the result
 * pages, and returns structured data with citations.
 */
async function geminiGroundedExtract(
  productName: string,
  barcode?: string,
  brand?: string,
): Promise<{
  ingredients: string | null;
  nutrition: RawNutrition | null;
  sources: string[];
} | null> {
  const apiKey = config.external.gemini?.apiKey;
  if (!apiKey) return null;

  const model = config.external.gemini?.model || "gemini-2.0-flash";
  const baseUrl = config.external.gemini?.baseUrl || "https://generativelanguage.googleapis.com/v1beta";

  const query = [
    brand ? `${brand} ${productName}` : productName,
    barcode ? `barcode ${barcode}` : "",
    "ingredients list and nutrition facts India",
  ].filter(Boolean).join(" ");

  const prompt = `Search the web for the food product: "${query}"

Find the official ingredients list and nutrition facts. Look at manufacturer websites, retailer pages (Amazon, BigBasket, Blinkit, Flipkart), and food databases.

Return ONLY a JSON object with this exact shape:
{
  "ingredientsRaw": "comma-separated ingredients exactly as printed on the pack, or null if not found",
  "nutrition": {
    "energy": <kcal per 100g as number or null>,
    "protein": <g per 100g or null>,
    "fat": <g per 100g or null>,
    "saturatedFat": <g per 100g or null>,
    "carbohydrates": <g per 100g or null>,
    "sugar": <g per 100g or null>,
    "fiber": <g per 100g or null>,
    "salt": <g per 100g or null>
  }
}

Do not invent values. Use null for anything you cannot verify from a source.`;

  try {
    const response = await fetch(
      `${baseUrl}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      logger.warn("gemini_grounded_http_error", { status: response.status, error: errText.slice(0, 300) });
      return null;
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text).filter(Boolean).join("") ?? "";
    if (!text) return null;

    // Collect grounding source URLs for evidence
    const sources: string[] = [];
    const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      if (uri) sources.push(uri);
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const rawIngredients = typeof parsed.ingredientsRaw === "string" ? parsed.ingredientsRaw.trim() : null;

    // Drop nulls out of the nutrition object
    let nutrition: RawNutrition | null = null;
    if (parsed.nutrition && typeof parsed.nutrition === "object") {
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed.nutrition)) {
        if (typeof v === "number" && !isNaN(v)) cleaned[k] = v;
      }
      if (Object.keys(cleaned).length >= 2) nutrition = cleaned;
    }

    logger.info("gemini_grounded_extract", {
      productName,
      hasIngredients: !!rawIngredients,
      hasNutrition: !!nutrition,
      sources: sources.length,
    });

    return {
      ingredients: rawIngredients && rawIngredients.length > 10 ? rawIngredients : null,
      nutrition,
      sources,
    };
  } catch (error) {
    logger.warn("gemini_grounded_failed", { error: String(error) });
    return null;
  }
}

// ── Brave Search ───────────────────────────────────────────

async function braveSearch(
  query: string,
  count = 5,
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const apiKey = config.external.brave?.apiKey;
  if (!apiKey) return [];

  const baseUrl = config.external.brave?.baseUrl || "https://api.search.brave.com/res/v1";

  try {
    const url = new URL(`${baseUrl}/web/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));
    url.searchParams.set("country", "IN");

    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.warn("brave_search_http_error", { status: response.status });
      return [];
    }

    const data = await response.json();
    const results = data.web?.results ?? [];
    return results.map((r: { title?: string; url?: string; description?: string }) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.description ?? "",
    })).filter((r: { url: string }) => r.url);
  } catch (error) {
    logger.warn("brave_search_failed", { error: String(error) });
    return [];
  }
}

// ── Main Enrichment Function ───────────────────────────────

export async function enrichProductFromWeb(
  productName: string,
  barcode?: string,
  brand?: string,
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  const evidence: string[] = [];

  logger.info("web_enrichment_started", { productName, barcode });

  // ── Step 0: Gemini grounded search (search + read pages + extract) ──
  // This is the strongest path: Gemini runs a real Google search, opens the
  // result pages, and returns structured data with citations in one call.
  let bestIngredients: string | null = null;
  let bestNutrition: RawNutrition | null = null;
  let bestSourceUrl: string | null = null;
  let bestProductName: string | null = null;
  let bestBrand: string | null = null;
  let bestCategory: ProductCategory | null = null;
  let bestImageUrl: string | null = null;

  const gemini = await geminiGroundedExtract(productName, barcode, brand);
  if (gemini) {
    if (gemini.ingredients) {
      bestIngredients = gemini.ingredients;
      bestSourceUrl = gemini.sources[0] ?? null;
      evidence.push(`Gemini grounded search extracted ingredients from ${gemini.sources.length} source(s)`);
    }
    if (gemini.nutrition) {
      bestNutrition = gemini.nutrition;
      evidence.push("Gemini grounded search extracted nutrition");
    }
    for (const src of gemini.sources.slice(0, 5)) evidence.push(`Source: ${src}`);
  }

  // If Gemini already answered both, skip the manual scrape entirely.
  if (bestIngredients && bestNutrition) {
    logger.info("web_enrichment_completed_via_gemini", { productName });
    return {
      success: true,
      source: "gemini_grounded",
      sourceUrl: bestSourceUrl,
      ingredientsRaw: bestIngredients,
      nutrition: bestNutrition,
      productName: null,
      brand: null,
      category: null,
      imageUrl: null,
      evidence,
    };
  }

  // Step 1: Search for the product
  const searchQueries: string[] = [];
  if (barcode) {
    searchQueries.push(`barcode ${barcode} product ingredients India`);
  }
  if (brand) {
    searchQueries.push(`"${brand}" "${productName}" ingredients India`);
  }
  searchQueries.push(`"${productName}" ingredients list India`);
  searchQueries.push(`${productName} nutrition facts`);

  let searchResults: Array<{ title: string; url: string; snippet: string }> = [];

  for (const query of searchQueries.slice(0, 3)) {
    // Brave first (independent index, better coverage than DDG Lite)
    const brave = await braveSearch(query, 5);
    if (brave.length > 0) {
      searchResults.push(...brave);
      evidence.push(`Search: "${query}" → ${brave.length} results via brave`);
      break;
    }

    try {
      const result = await webSearchWithFallback(query, { numResults: 5 });
      if (result.performed && result.results.length > 0) {
        searchResults.push(...result.results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        })));
        evidence.push(`Search: "${query}" → ${result.results.length} results via ${result.provider}`);
        break; // Got results, stop searching
      }
    } catch (error) {
      logger.debug("web_search_error", { query, error: String(error) });
    }
  }

  if (searchResults.length === 0) {
    logger.info("web_enrichment_no_results", { productName });
    return { success: false, source: "web", sourceUrl: null, ingredientsRaw: null, nutrition: null, productName: null, brand: null, category: null, imageUrl: null, evidence };
  }

  // Step 2: Fetch top pages and extract data
  // Try top 3 URLs
  const urlsToFetch = searchResults
    .filter(r => r.url && !r.url.includes("youtube.com") && !r.url.includes("twitter.com"))
    .slice(0, 3);

  for (const result of urlsToFetch) {
    const html = await fetchPageContent(result.url);
    if (!html) continue;

    evidence.push(`Fetched: ${result.url}`);

    // Regex extraction
    const ingredients = extractIngredients(html);
    const nutrition = extractNutrition(html);

    if (ingredients && !bestIngredients) {
      bestIngredients = ingredients;
      bestSourceUrl = result.url;
    }
    if (nutrition && !bestNutrition) {
      bestNutrition = nutrition;
    }

    // Try AI extraction for better results
    if (!bestIngredients || !bestNutrition) {
      const aiResult = await aiExtractProductInfo(html, productName);
      if (aiResult) {
        if (aiResult.ingredients && !bestIngredients) {
          bestIngredients = aiResult.ingredients;
          bestSourceUrl = result.url;
          evidence.push("AI extracted ingredients");
        }
        if (aiResult.nutrition && !bestNutrition) {
          bestNutrition = aiResult.nutrition;
          evidence.push("AI extracted nutrition");
        }
      }
    }

    // Extract product name and brand from page
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && !bestProductName) {
      bestProductName = titleMatch[1].replace(/\s*[-|–].*$/, "").trim();
    }

    // Extract image
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (ogImageMatch && !bestImageUrl) {
      bestImageUrl = ogImageMatch[1];
    }

    // If we have enough data, stop
    if (bestIngredients && bestNutrition) break;
  }

  // Step 3: Try to fetch from Open Food Facts as fallback
  if (!bestIngredients && barcode) {
    try {
      const offUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`;
      const offResponse = await fetch(offUrl, { signal: AbortSignal.timeout(5000) });
      if (offResponse.ok) {
        const offData = await offResponse.json();
        if (offData.status === 1 && offData.product) {
          const product = offData.product;
          if (product.ingredients_text) {
            bestIngredients = product.ingredients_text;
            bestSourceUrl = offUrl;
            evidence.push("Open Food Facts ingredients");
          }
          if (product.nutriments) {
            const n: Record<string, number> = {};
            if (product.nutriments.energy_kcal_100g) n.energy = product.nutriments.energy_kcal_100g;
            else if (product.nutriments["energy-kcal_100g"]) n.energy = product.nutriments["energy-kcal_100g"];
            if (product.nutriments.proteins_100g) n.protein = product.nutriments.proteins_100g;
            if (product.nutriments.fat_100g) n.fat = product.nutriments.fat_100g;
            if (product.nutriments.carbohydrates_100g) n.carbohydrates = product.nutriments.carbohydrates_100g;
            if (product.nutriments.sugars_100g) n.sugar = product.nutriments.sugars_100g;
            if (product.nutriments.salt_100g) n.salt = product.nutriments.salt_100g;
            if (product.nutriments["saturated-fat_100g"]) n.saturatedFat = product.nutriments["saturated-fat_100g"];
            if (product.nutriments.fiber_100g) n.fiber = product.nutriments.fiber_100g;
            if (Object.keys(n).length >= 2) {
              bestNutrition = n;
              evidence.push("Open Food Facts nutrition");
            }
          }
          if (product.brands) bestBrand = product.brands;
          if (product.categories) {
            const cat = product.categories.toLowerCase();
            // Map to valid ProductCategory values
            if (cat.includes("snack") || cat.includes("cereal") || cat.includes("grain") ||
                cat.includes("candy") || cat.includes("confection") || cat.includes("condiment") ||
                cat.includes("sauce") || cat.includes("fruit") || cat.includes("vegetable") ||
                cat.includes("meat") || cat.includes("fish") || cat.includes("bakery") ||
                cat.includes("bread")) {
              bestCategory = "food";
            } else if (cat.includes("beverage") || cat.includes("drink")) {
              bestCategory = "food"; // beverages are food category
            } else if (cat.includes("dairy") || cat.includes("milk")) {
              bestCategory = "food";
            } else if (cat.includes("cosmetic") || cat.includes("makeup")) {
              bestCategory = "cosmetics";
            } else if (cat.includes("personal care") || cat.includes("shampoo") || cat.includes("soap")) {
              bestCategory = "personal_care";
            } else if (cat.includes("clean") || cat.includes("detergent")) {
              bestCategory = "household";
            } else {
              bestCategory = "food";
            }
          }
          if (product.image_url) bestImageUrl = product.image_url;
        }
      }
    } catch (error) {
      logger.debug("off_fallback_error", { error: String(error) });
    }
  }

  const duration = Date.now() - startTime;
  logger.info("web_enrichment_completed", {
    productName,
    ingredients: !!bestIngredients,
    nutrition: !!bestNutrition,
    durationMs: duration,
    evidence: evidence.length,
  });

  return {
    success: !!(bestIngredients || bestNutrition),
    source: "web",
    sourceUrl: bestSourceUrl,
    ingredientsRaw: bestIngredients,
    nutrition: bestNutrition,
    productName: bestProductName,
    brand: bestBrand,
    category: bestCategory,
    imageUrl: bestImageUrl,
    evidence,
  };
}

// ── Save Enriched Product to DB ────────────────────────────

export async function saveEnrichedProduct(
  enrichment: EnrichmentResult,
  originalName: string,
  barcode?: string,
): Promise<ProductLookupResult | null> {
  if (!enrichment.success) return null;

  const store = getStore();

  // Check if product already exists
  if (barcode) {
    const existing = await store.getProductByBarcode(barcode);
    if (existing) {
      // Update with enriched data if we have better info
      if (enrichment.ingredientsRaw && !existing.ingredientsRaw) {
        // Product exists but has no ingredients - we can't update in memory store
        // but we can return the enriched version for this session
        logger.info("enriched_existing_product", { barcode, name: existing.name });
      }
      return { product: existing, nutrition: await store.getNutritionForProduct(existing.id), source: "web_enrichment" };
    }
  }

  // Create new product from enriched data
  const product: ProductInfo = {
    id: `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    barcode: barcode || "",
    name: enrichment.productName || originalName,
    brand: enrichment.brand || null,
    category: enrichment.category || "other",
    country: "IN",
    servingSize: null,
    imageUrl: enrichment.imageUrl || null,
    ingredientsRaw: enrichment.ingredientsRaw || "",
    ingredientsNormalized: enrichment.ingredientsRaw
      ? enrichment.ingredientsRaw.split(/[,;]/).map(i => i.trim()).filter(Boolean)
      : [],
    source: "web_enrichment",
    sourceUrl: enrichment.sourceUrl,
    verified: false,
    productDataConfidence: 0.6,
    isDemo: false,
  };

  const nutrition: NutritionFacts | null = enrichment.nutrition
    ? {
        basis: "PER_100G",
        servingSize: "100g",
        nutrients: Object.fromEntries(
          Object.entries(enrichment.nutrition)
            .filter(([_, v]) => typeof v === "number" && !isNaN(v))
            .map(([k, v]) => [k, { value: v, unit: "g", confidence: 0.6 } satisfies NutrientValue])
        ),
      }
    : null;

  const lookup: ProductLookupResult = {
    product,
    nutrition,
    source: "web_enrichment",
  };

  const saved = await store.saveProductFromProvider(lookup);
  if (saved.product) {
    logger.info("enriched_product_saved", {
      id: saved.product.id,
      name: saved.product.name,
      barcode: saved.product.barcode,
      hasIngredients: !!enrichment.ingredientsRaw,
      hasNutrition: !!enrichment.nutrition,
    });
  }

  return saved;
}
