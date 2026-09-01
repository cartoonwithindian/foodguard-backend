import type { Alternative, AlternativeReason, NutritionFacts, ProductInfo } from "@/types/domain";
import { getStore } from "@/lib/store";
import { parseIngredientText } from "@/lib/ingredients/parse";
import { ingredientIndex } from "@/lib/ingredients";
import { normalizeIngredient } from "@/lib/ingredients/normalize";
import { getCache } from "@/lib/cache";
import { FSSAIAnalyzer } from "@/services/regulatory/fssai";
import type { FSSAIAnalysisResult } from "@/services/regulatory/fssai";
import { getCachedFSSAIResult, setCachedFSSAIResult } from "@/lib/fssai-cache";
import { calculateAlternativeScore } from "@/services/alternative-scoring.service";
import { classifyProductFamily, familyCompatibility, useCaseCompatibility, unknownFamilyAdjustedAffinity } from "@/lib/product-family";
import type { FamilyClassification, ProductFamily, ProductSuperfamily, UseCaseCompatibility } from "@/lib/product-family";
import type { AlternativeSearchCriteria } from "@/lib/alternative-search-criteria";
import { buildAlternativeSearchCriteriaList } from "@/lib/alternative-search-criteria";
import type { AlternativeCharacteristic } from "@/lib/alternative-characteristics";
import { getAlternativeCharacteristics } from "@/lib/alternative-characteristics";
import { mergeCriteriaList, validateCandidateAgainstCriteria, detectAlternativeIssues } from "@/lib/alternative-retrieval";
import { lookupIndianProductByBarcode, searchIndianProducts } from "@/lib/india-dataset";
import { fetchOffImageUrl } from "@/lib/external/off-image";
import { logger } from "@/lib/logger";

/**
 * Enhanced Alternative Product Engine.
 *
 * Pipeline:
 * 1. Find candidate products with RELEVANCE-FIRST retrieval — targeted family /
 *    name-token searches, never the old blind top-100-by-completeness scan.
 * 2. HARD GATE on product-family compatibility BEFORE any health/nutrition
 *    ranking. A packet of Kurkure can no longer be "matched" with bottled water
 *    or ice cream merely because both rows carry `category: "food"`.
 * 3. Dedupe by barcode → normalized name → id (same duplicated-import guard the
 *    catalog search uses).
 * 4. Score with cheap signals first, then run expensive FSSAI analysis only for
 *    the shortlist.
 * 5. Return fewer results (including none) when evidence is insufficient.
 *
 * Alternatives respect user dietary preferences and allergies.
 */

export type AlternativeEngineInput = {
  product: ProductInfo;
  nutrition: NutritionFacts | null;
  userPreferences?: {
    vegetarian?: boolean;
    vegan?: boolean;
    allergies?: string[];
    dietaryRestrictions?: string[];
    avoidIngredients?: string[];
    healthGoals?: string[];
  } | null;
  /**
   * Phase 3/4 structured criteria. When present, candidates that violate a
   * SUPPORTED criterion are rejected BEFORE ranking (e.g. a candidate with
   * sodium >= the scanned product never satisfies LOWER_SODIUM). This is an
   * opt-in gate — when absent, behaviour is exactly the previous engine.
   */
  alternativeCriteria?: AlternativeSearchCriteria | AlternativeSearchCriteria[] | null;
  limit?: number;
};

export type EnhancedAlternative = Alternative & {
  fssai?: {
    overallStatus: string;
    additiveCount: number;
    concernsCount: number;
  };
  preferenceAlignment?: number;
  dataConfidence: number;
  source: "local" | "openfoodfacts" | "web_search";
  verified: boolean;
};

type ScoredCandidate = {
  product: ProductInfo;
  scoring: {
    overallScore: number;
    similarityScore: number;
    improvement: Record<string, string>;
    reasons: AlternativeReason[];
  };
  dataConfidence: number;
  family: FamilyClassification;
  useCase: UseCaseCompatibility;
};

/** Family → representative search terms used to pull candidates from the catalog. */
const FAMILY_SEARCH_TERMS: Partial<Record<ProductFamily, string[]>> = {
  extruded_snack: ["snack", "kurkure", "puff"],
  chips: ["chips", "potato chips", "banana chips", "crisps"],
  namkeen: ["namkeen", "bhujia", "mixture"],
  popcorn: ["popcorn"],
  trail_mix: ["trail mix", "nuts mix"],
  frozen_snack: ["samosa", "spring roll", "kebab"],
  biscuit: ["biscuit", "cream biscuit", "rusk"],
  cookie: ["cookie", "chocolate chip"],
  cracker: ["cracker", "monaco"],
  rusk: ["rusk"],
  bread: ["bread", "pav", "sandwich"],
  bun: ["bun"],
  cake: ["cake"],
  pastry: ["pastry", "muffin"],
  chocolate: ["chocolate", "choco", "cadbury", "wafer"],
  candy: ["candy", "toffee", "lollipop"],
  chewing_gum: ["chewing gum"],
  wafer_sweet: ["wafer", "chocobar"],
  mithai: ["mithai", "barfi", "halwa", "ladoo", "peda"],
  ice_cream: ["ice cream", "kulfi", "cone"],
  frozen_dessert: ["frozen dessert", "sorbet"],
  milk: ["milk", "toned milk", "milk powder"],
  curd: ["curd", "dahi", "yogurt"],
  buttermilk: ["buttermilk", "chaach"],
  lassi: ["lassi"],
  milk_drink: ["milk drink", "flavoured milk", "milkshake"],
  butter: ["butter"],
  cheese: ["cheese", "paneer"],
  paneer: ["paneer"],
  cream: ["cream"],
  ghee: ["ghee"],
  water: ["water", "mineral water"],
  juice: ["juice", "squash", "nectar"],
  soft_drink: ["soda", "cola", "soft drink", "fizz"],
  energy_drink: ["energy drink", "glucose"],
  health_drink: ["horlicks", "boost", "health drink"],
  tea: ["tea", "chai"],
  coffee: ["coffee"],
  coconut_water: ["coconut water"],
  rice: ["rice", "basmati"],
  flour: ["atta", "flour", "maida", "besan"],
  pulses: ["dal", "lentil", "moong", "chana", "rajma"],
  cereal: ["cereal", "cornflakes", "muesli", "oats"],
  oats: ["oats", "oatmeal"],
  pasta: ["pasta", "macaroni"],
  noodles: ["noodles", "noodle", "maggi", "vermicelli"],
  instant_mix: ["instant mix", "ready mix"],
  sugar_sweetener: ["sugar", "jaggery", "honey"],
  salt_staple: ["salt"],
  pickle: ["pickle", "achaar"],
  chutney: ["chutney"],
  sauce: ["sauce", "ketchup", "mayonnaise"],
  jam_spread: ["jam", "jelly", "chocolate spread", "spread"],
  peanut_butter: ["peanut butter"],
  edible_oil: ["oil", "refined oil", "sunflower oil"],
  spices: ["masala", "spice", "turmeric", "cumin"],
  meat_poultry: ["chicken", "mutton", "meat"],
  fish_seafood: ["fish", "prawn"],
  eggs: ["egg"],
  soy_protein: ["soya chunk", "soy chunk"],
  ready_to_eat: ["ready to eat"],
  soup: ["soup"],
  frozen_food: ["frozen", "paratha", "pizza"],
};

/** Representative keywords used to build candidate search terms from a source. */
function familySearchTerms(cls: FamilyClassification): string[] {
  if (!cls.family) return [];
  return FAMILY_SEARCH_TERMS[cls.family] ?? [cls.family.replace(/_/g, " ")];
}

/**
 * Superfamily → representative search terms. Used to widen retrieval so a
 * snack source (e.g. Kurkure) can surface other snack-family products (chips,
 * namkeen, popcorn) from the catalog. The compatibility gate below still drops
 * anything from a genuinely different superfamily, so broadening here is safe.
 */
const SUPERFAMILY_SEARCH_TERMS: Partial<Record<ProductSuperfamily, string[]>> = {
  snacks: ["snack", "chips", "namkeen", "popcorn"],
  bakery: ["biscuit", "bread", "rusk", "cake"],
  confectionery: ["chocolate", "candy", "wafer", "mithai"],
  frozen_dairy: ["ice cream", "frozen dessert"],
  dairy: ["milk", "curd", "buttermilk", "cheese"],
  beverages: ["drink", "juice", "water", "tea"],
  staples: ["rice", "flour", "dal", "oats"],
  condiments: ["pickle", "sauce", "chutney", "ketchup"],
  fats_oils: ["oil", "ghee", "butter"],
  spices: ["masala", "spice"],
  proteins: ["paneer", "egg", "chicken", "fish"],
  ready_meals: ["ready to eat", "instant mix", "soup", "frozen"],
};

const STOP_TOKENS = new Set([
  "food", "pack", "packet", "pouch", "jar", "bottle", "ml", "g", "kg", "ltr",
  "l", "liter", "litre", "gm", "grams", "new", "premium", "special", "classic",
  "original", "natural", "fresh", "value", "regular", "large", "small",
]);

/** Extract meaningful name/brand tokens to search on (stopwords removed). */
function nameSearchTokens(product: ProductInfo): string[] {
  const raw = `${product.name ?? ""} ${product.brand ?? ""}`.toLowerCase();
  const tokens = raw
    .replace(/[^a-z0-9&'.]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOP_TOKENS.has(t));
  return [...new Set(tokens)].slice(0, 4);
}

/** Build the relevance-first list of search terms for the source product. */
function buildSearchTerms(product: ProductInfo, cls: FamilyClassification): string[] {
  const terms = new Set<string>();
  for (const term of familySearchTerms(cls)) {
    terms.add(term);
  }
  if (cls.superfamily) {
    for (const term of SUPERFAMILY_SEARCH_TERMS[cls.superfamily] ?? []) {
      terms.add(term);
    }
  }
  for (const token of nameSearchTokens(product)) {
    terms.add(token);
  }
  return [...terms].slice(0, 8);
}

/**
 * Dedupe products the same way the catalog search does: by barcode, then
 * normalized name, then id. Guards against the duplicated-import rows that
 * the FoodGuard database ships (the same soda barcode repeated across rows).
 */
function dedupeByKey<T extends { product: { id: string; name: string; barcode: string } }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const p = item.product;
    const key = p.barcode && p.barcode.trim()
      ? `bc:${p.barcode.trim().toLowerCase()}`
      : p.name && p.name.trim()
        ? `name:${p.name.trim().toLowerCase()}`
        : `id:${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Get normalized ingredient IDs for a product.
 */
async function getNormalizedIngredientIds(product: ProductInfo): Promise<string[]> {
  const cache = getCache();
  const cached = await cache.get<string[]>(`ing-ids:${product.id}`);
  if (cached) return cached;

  const { ingredients } = parseIngredientText(product.ingredientsRaw);
  const ids = ingredients
    .map((i) => normalizeIngredient(i))
    .filter((n) => n.matched)
    .map((n) => n.canonicalName as string);

  await cache.set(`ing-ids:${product.id}`, ids, 3600);
  return ids;
}

/**
 * Calculate concern score for ingredient IDs.
 */
function concernScore(ingredientIds: string[]): number {
  let score = 0;
  const records = ingredientIndex.all();
  for (const id of ingredientIds) {
    const record = records.find((r) => r.canonicalName === id);
    if (!record) continue;
    if (record.assessment === "potentially_concerning") score += 2;
    else if (record.assessment === "noteworthy") score += 1;
    else if (record.assessment === "beneficial") score -= 1;
  }
  return score;
}

/**
 * Check if a candidate is compatible with user preferences.
 *
 * IMPORTANT: Allergen conflicts result in IMMEDIATE REJECTION.
 * This is a hard constraint, not a scoring factor.
 */
function isCompatibleWithPreferences(
  candidateIngredients: string[],
  userPreferences: AlternativeEngineInput["userPreferences"],
): { compatible: boolean; conflicts: string[]; hasAllergen: boolean } {
  if (!userPreferences) return { compatible: true, conflicts: [], hasAllergen: false };

  const conflicts: string[] = [];
  let hasAllergen = false;
  const avoidSet = new Set((userPreferences.avoidIngredients ?? []).map((s) => s.toLowerCase()));
  const allergySet = new Set((userPreferences.allergies ?? []).map((a) => a.toLowerCase()));

  for (const ing of candidateIngredients) {
    const ingLower = ing.toLowerCase();

    // Check allergies - IMMEDIATE REJECTION
    if (allergySet.has(ingLower)) {
      hasAllergen = true;
      conflicts.push(`Contains allergen: ${ing}`);
      // Don't break - collect all allergen conflicts for logging
    }

    // Check avoid list
    if (avoidSet.has(ingLower) && !hasAllergen) {
      conflicts.push(`Contains avoided ingredient: ${ing}`);
    }
  }

  return { compatible: conflicts.length === 0, conflicts, hasAllergen };
}

/**
 * Run FSSAI analysis for a product (with caching).
 */
async function runFSSAIForProduct(
  product: ProductInfo,
  ingredientsRaw: string,
): Promise<FSSAIAnalysisResult | null> {
  const cached = await getCachedFSSAIResult(product.id);
  if (cached) return cached;

  try {
    const analyzer = FSSAIAnalyzer.singleton();
    const result = await analyzer.analyze({
      product: { name: product.name, category: product.category, barcode: product.barcode },
      ingredients: parseIngredientText(ingredientsRaw).ingredients,
      category: product.category,
    });
    await setCachedFSSAIResult(product.id, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Calculate preference alignment from scoring reasons.
 */
function calculatePreferenceAlignment(
  reasons: AlternativeReason[],
  userPreferences: AlternativeEngineInput["userPreferences"],
): number | undefined {
  if (!userPreferences?.healthGoals || userPreferences.healthGoals.length === 0) {
    return undefined;
  }

  let matches = 0;
  const relevantFactors = reasons.map((r) => r.factor);

  if (relevantFactors.includes("lower_sodium") && userPreferences.healthGoals.includes("improve_nutrition")) matches++;
  if (relevantFactors.includes("lower_sugar") && userPreferences.healthGoals.includes("weight_loss")) matches++;
  if (relevantFactors.includes("lower_saturated_fat") && userPreferences.healthGoals.includes("heart_health")) matches++;
  if (relevantFactors.includes("fewer_additives") && userPreferences.healthGoals.includes("fewer_additives")) matches++;

  return matches / userPreferences.healthGoals.length;
}

/**
 * Calculate data confidence for a candidate.
 */
function calculateDataConfidence(
  nutrition: NutritionFacts | null,
  ingredientIds: string[],
  similarity: number,
): number {
  let confidence = 0;
  if (nutrition && Object.keys(nutrition.nutrients).length > 0) confidence += 0.4;
  if (ingredientIds.length > 0) confidence += 0.3;
  if (similarity > 0.3) confidence += 0.2;
  confidence += 0.1; // base
  return Math.min(1, confidence);
}

/**
 * Find alternatives from the local Indian product dataset.
 */
async function findLocalAlternatives(
  input: AlternativeEngineInput,
  sourceIngredientIds: string[],
  sourceConcern: number,
): Promise<EnhancedAlternative[]> {
  const store = getStore();
  const sourceFamily = classifyProductFamily(input.product);
  const limit = input.limit ?? 5;

  // Phase 4: normalize optional structured criteria to a single merged object.
  const criteriaList = input.alternativeCriteria
    ? Array.isArray(input.alternativeCriteria)
      ? input.alternativeCriteria
      : [input.alternativeCriteria]
    : [];
  const mergedCriteria = criteriaList.length > 0 ? mergeCriteriaList(criteriaList) : null;

  // ── 1. Relevance-first candidate retrieval ─────────────────────────
  const terms = buildSearchTerms(input.product, sourceFamily);
  const pool = new Map<string, { product: ProductInfo }>();
  for (const term of terms) {
    const results = await store.searchProducts(term);
    for (const r of results) {
      if (!pool.has(r.product.id)) pool.set(r.product.id, { product: r.product });
    }
  }
  // Widen the pool with the bundled Indian dataset (~19k real Open Food Facts
  // products). Essential on deployments whose database catalog is sparse or
  // empty (e.g. a fresh Postgres): without it the alternatives engine finds
  // zero candidates. Dataset rows carry ingredients + nutrition inline, so
  // their nutrition is kept aside and used instead of a store lookup later.
  const datasetNutritionById = new Map<string, NutritionFacts | null>();
  for (const term of terms) {
    for (const hit of searchIndianProducts(term, 8)) {
      const bc = hit.product.barcode?.trim();
      if (!bc || pool.has(`bc:${bc}`)) continue;
      const lookedUp = lookupIndianProductByBarcode(bc);
      if (!lookedUp || !lookedUp.product) continue;
      // Synthesize a stable id — dataset rows ship with an empty one.
      const dsId = `ds-${bc}`;
      if (pool.has(dsId)) continue;
      pool.set(dsId, { product: { ...lookedUp.product, id: dsId } });
      datasetNutritionById.set(dsId, lookedUp.nutrition);
    }
  }
  // Only widen with the completeness-ordered fallback scan when the targeted
  // searches did not surface enough candidates (keeps the hot path fast and
  // avoids the old blind top-100-by-completeness domination).
  if (pool.size < Math.min(limit * 2, 12)) {
    const fallback = await store.searchProducts("");
    for (const r of fallback) {
      if (!pool.has(r.product.id)) pool.set(r.product.id, { product: r.product });
    }
  }

  // ── 2. Hard filters: real rows, real barcode, and the family gate ──
  const eligible: Array<{
    product: ProductInfo;
    family: FamilyClassification;
    compat: ReturnType<typeof familyCompatibility>;
    useCase: UseCaseCompatibility;
  }> = [];
  for (const { product } of pool.values()) {
    // Only real database records may be alternatives. Bundled illustrative
    // products and web-discovered records are never recommendations.
    if (product.isDemo || product.source === "web_search") continue;
    if (!product.barcode || !product.barcode.trim() || !product.ingredientsRaw.trim()) continue;
    // Skip the source product itself (same id or same barcode across rows).
    if (product.id === input.product.id || product.barcode === input.product.barcode) continue;

    // HARD GATE: unrelated product families are NEVER alternatives, regardless
    // of how "healthy" they are. Kurkure → water / ice cream / shampoo / oil
    // must not survive this cut. A generic "food" category grants nothing.
    const candFamily = classifyProductFamily(product);
    const compat = familyCompatibility(sourceFamily, candFamily);
    if (compat.kind === "incompatible" || compat.kind === "nonfood") {
      logger.debug("alternative_rejected_family", {
        source: input.product.name,
        candidate: product.name,
        compat: compat.kind,
      });
      continue;
    }

    // USE-CASE GATE: Even within the same superfamily, reject candidates that
    // are not realistic substitutes. coffee → water is technically "beverages"
    // but not a realistic substitute. This uses use-case groups defined in
    // product-family.ts to evaluate substitution realism.
    const useCase = useCaseCompatibility(sourceFamily, candFamily);
    if (useCase.level === "none") {
      logger.debug("alternative_rejected_usecase", {
        source: input.product.name,
        candidate: product.name,
        useCase: useCase.reason,
      });
      continue;
    }

    eligible.push({ product, family: candFamily, compat, useCase });
  }

  // ── 3. Dedupe duplicated-import rows (barcode → name → id) ─────────
  const deduped = dedupeByKey(eligible);

  // ── 4. Cheap ranking (no FSSAI yet) ────────────────────────────────
  const ranked: ScoredCandidate[] = [];
  let satisfiedCriteria: string[] = [];
  for (const candidate of deduped) {
    const { product, compat, useCase } = candidate;
    // `compat` re-narrowed here: the earlier gate guarantees kind ∈
    // same | related | unknown, all of which carry `affinity` + `label`.
    if (compat.kind === "incompatible" || compat.kind === "nonfood") continue;
    // Use-case gate passed during eligibility, but re-check for safety
    if (useCase.level === "none") continue;
    const candidateIngs = await getNormalizedIngredientIds(product);
    // Dataset candidates carry their nutrition inline; database rows resolve
    // it through the store.
    const datasetNutrition = datasetNutritionById.get(product.id);
    const candidateNutrition =
      datasetNutrition !== undefined
        ? datasetNutrition
        : await store.getNutritionForProduct(product.id);
    if (candidateIngs.length === 0 || !candidateNutrition || Object.keys(candidateNutrition.nutrients).length === 0) continue;

    // Phase 4: structured-criteria gate. A candidate that violates any
    // supported criterion (higher sodium, contains palm oil, ...) is rejected
    // before scoring — missing nutrition never counts as "lower".
    if (mergedCriteria) {
      const validation = validateCandidateAgainstCriteria(product, candidateNutrition, mergedCriteria, input.nutrition);
      if (!validation.valid) {
        logger.debug("alternative_rejected_criteria", {
          candidate: product.name,
          violations: validation.violations,
        });
        continue;
      }
      satisfiedCriteria = validation.satisfied;
    }

    // Check ingredient compatibility with user preferences
    const rawIngredients = parseIngredientText(product.ingredientsRaw).ingredients;
    const { compatible, hasAllergen } = isCompatibleWithPreferences(rawIngredients, input.userPreferences);

    // IMMEDIATE REJECTION: Allergen conflicts are hard constraints
    if (hasAllergen) {
      logger.debug("alternative_rejected_allergen", {
        candidate: product.name,
        allergen: input.userPreferences?.allergies?.find((a) =>
          rawIngredients.some((ing) => ing.toLowerCase() === a.toLowerCase()),
        ),
      });
      continue;
    }

    // REJECTION: Other preference conflicts
    if (!compatible) continue;

    const candidateConcern = concernScore(candidateIngs);

    // For unknown-family candidates, require stronger evidence of relevance.
    // Calculate ingredient overlap (Jaccard) and name token overlap to adjust
    // the base affinity upward only when real evidence supports compatibility.
    let effectiveAffinity = compat.affinity;
    if (compat.kind === "unknown") {
      const sourceSet = new Set(sourceIngredientIds);
      const candSet = new Set(candidateIngs);
      const intersection = [...sourceSet].filter((x) => candSet.has(x)).length;
      const union = new Set([...sourceSet, ...candSet]).size;
      const ingredientOverlap = union > 0 ? intersection / union : 0;
      const srcTokens = nameSearchTokens(input.product);
      const candTokens = nameSearchTokens(product);
      const tokenIntersection = srcTokens.filter((t) => candTokens.includes(t)).length;
      const tokenUnion = new Set([...srcTokens, ...candTokens]).size;
      const nameOverlap = tokenUnion > 0 ? tokenIntersection / tokenUnion : 0;
      effectiveAffinity = unknownFamilyAdjustedAffinity(compat.affinity, ingredientOverlap, nameOverlap);
    }

    const dataConfidence = calculateDataConfidence(candidateNutrition, candidateIngs, effectiveAffinity / 100);

    const scoring = calculateAlternativeScore(
      {
        sourceProduct: input.product,
        candidateProduct: product,
        sourceNutrition: input.nutrition,
        candidateNutrition,
        sourceIngredientIds,
        candidateIngredientIds: candidateIngs,
        sourceConcernScore: sourceConcern,
        candidateConcernScore: candidateConcern,
        userPreferences: input.userPreferences ?? null,
        dataConfidence,
        familyAffinity: effectiveAffinity,
        familyLabel: compat.kind === "same" || compat.kind === "related" ? compat.label : undefined,
      },
      (name) => {
        const record = ingredientIndex.all().find((r) => r.canonicalName === name);
        return record ? { dietaryStatus: record.dietaryStatus } : null;
      },
    );

    // Skip if similarity too low — unknown-family candidates need real
    // overlap; same/related families already carry affinity 26-40.
    if (scoring.similarityScore < 15) continue;

    // Phase 4: explain WHY the candidate qualified on structured criteria.
    // These are generated from validated data only (never from names/marketing).
    if (satisfiedCriteria.length > 0) {
      const existingDetails = new Set(scoring.reasons.map((r) => r.detail));
      for (const detail of satisfiedCriteria) {
        if (existingDetails.has(detail)) continue;
        existingDetails.add(detail);
        scoring.reasons.push({ factor: "better_nutrition", detail });
      }
    }

    ranked.push({
      product,
      scoring,
      dataConfidence,
      family: candidate.family,
      useCase: candidate.useCase,
    });
  }

  // ── 5. Shortlist for the expensive FSSAI pass ─────────────────────
  ranked.sort(
    (a, b) =>
      b.scoring.similarityScore - a.scoring.similarityScore ||
      b.scoring.overallScore - a.scoring.overallScore,
  );
  const shortlist = ranked.slice(0, Math.min(limit * 3, 12));

  const results: EnhancedAlternative[] = [];
  for (const candidate of shortlist) {
    const { product, scoring, dataConfidence, useCase } = candidate;

    // Apply use-case compatibility multiplier to the overall score.
    // Strong = 1.0 (no penalty), Moderate = 0.85, Weak = 0.65, None = 0 (rejected above)
    const useCaseMultiplier = useCase.level === "strong" ? 1.0
      : useCase.level === "moderate" ? 0.85
      : useCase.level === "weak" ? 0.65
      : 0;
    const adjustedScore = scoring.overallScore * useCaseMultiplier;

    let fssai: FSSAIAnalysisResult | null = null;
    try {
      fssai = await runFSSAIForProduct(product, product.ingredientsRaw);
    } catch {
      // FSSAI failure is not fatal
    }

    // Determine recommendation type:
    // - "better_match" = relevant product with meaningful quality improvement
    // - "similar" = relevant product but not clearly better
    // Quality improvement score: weighted sum of meaningful improvements.
    // Keys match the scoring service's improvement object: sodium, saturatedFat,
    // sugars, totalFat, protein, calories, fibre, etc.
    let qualityImprovementScore = 0;
    const IMPROVEMENT_WEIGHTS: Record<string, number> = {
      sodium: 1.0,
      saturatedFat: 1.0,
      sugars: 0.8,
      totalFat: 0.5,
      protein: 0.7,
      fibre: 0.7,
      calories: 0.3,
    };
    for (const [key, weight] of Object.entries(IMPROVEMENT_WEIGHTS)) {
      if (scoring.improvement[key]) {
        qualityImprovementScore += weight;
      }
    }
    // Also count ingredient-level improvements from reasons
    const hasIngredientImprovement = scoring.reasons.some(
      (r) => r.factor === "fewer_additives" || r.factor === "lower_concern",
    );
    if (hasIngredientImprovement) qualityImprovementScore += 0.9;

    // "better_match" requires at least 1.5 quality improvement points
    // (equivalent to e.g. lower sodium + lower sugar, or lower sat fat + higher fibre)
    const isMeaningfullyBetter = qualityImprovementScore >= 1.5;
    const recommendationType: "better_match" | "similar" = isMeaningfullyBetter ? "better_match" : "similar";

    // For "similar" type, only include if there is SOME evidence of improvement
    const evidence = Object.keys(scoring.improvement).length > 0;
    const whyBetter = recommendationType === "better_match"
      ? scoring.reasons.filter((r) => r.factor !== "similarity").slice(0, 2).map((r) => r.detail).join("; ") || "Similar product with improvements"
      : "Similar product in the same family";

    results.push({
      product,
      similarity: scoring.similarityScore / 100,
      improvement: scoring.improvement,
      recommendationScore: adjustedScore,
      reasons: scoring.reasons,
      whyBetter,
      recommendationType,
      fssai: fssai
        ? {
            overallStatus: fssai.overallStatus,
            additiveCount: fssai.additives?.length ?? 0,
            concernsCount: (fssai.additives ?? []).filter(
              (a) => a.status === "RESTRICTED" || a.status === "NOT_PERMITTED" || a.needsReview,
            ).length,
          }
        : undefined,
      preferenceAlignment: calculatePreferenceAlignment(scoring.reasons, input.userPreferences),
      dataConfidence,
      source: "local" as const,
      verified: true,
    });
  }

  // Attach product images (Open Food Facts, by barcode) — best-effort and
  // cached; a missing image never blocks an alternative from being shown.
  await Promise.all(
    results.map(async (alt) => {
      if (alt.product.imageUrl || !alt.product.barcode) return;
      const imageUrl = await fetchOffImageUrl(alt.product.barcode);
      if (imageUrl) alt.product = { ...alt.product, imageUrl };
    }),
  );

  return results;
}

/**
 * Main entry point: find alternatives with fallback pipeline.
 *
 * IMPORTANT: The alternative engine should NOT mean "find the healthiest product."
 * It should mean: "Find a product SIMILAR to what the user wanted, but with
 * a better overall profile for that particular user."
 *
 * Examples:
 * - Original: Kurkure Masala Munch (extruded salty snack)
 * - Candidate A: Same snack family, lower sodium → HIGH MATCH
 * - Candidate B: Much lower calories, but bottled water → REJECTED (family gate)
 * - Candidate C: Same family, but contains the user's allergen → REJECT
 */
export async function findAlternativesEnhanced(
  input: AlternativeEngineInput,
): Promise<EnhancedAlternative[]> {
  const startTime = Date.now();
  const limit = input.limit ?? 5;

  logger.info("alternative_engine_started", {
    product: input.product.name,
    category: input.product.category,
    hasPreferences: !!input.userPreferences,
    allergies: input.userPreferences?.allergies?.length ?? 0,
  });

  // Get source product data
  const sourceIngredientIds = await getNormalizedIngredientIds(input.product);
  const sourceConcern = concernScore(sourceIngredientIds);

  // Stage 1: Local Indian product dataset (primary)
  // This is the preferred source - Indian products are most relevant
  const alternatives = await findLocalAlternatives(input, sourceIngredientIds, sourceConcern);

  logger.info("alternative_local_completed", {
    product: input.product.name,
    candidates: alternatives.length,
    durationMs: Date.now() - startTime,
  });

  // Web research may discover names, but it does not provide the product
  // record, ingredients and nutrition required for a recommendation. Do not
  // use it as an alternative fallback.

  // Primary sort: similarity score (descending), then overall score.
  const final = alternatives
    .sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      if (Math.abs(a.similarity - b.similarity) > 0.1) {
        return b.similarity - a.similarity;
      }
      return b.recommendationScore - a.recommendationScore;
    })
    .slice(0, limit);

  const totalDuration = Date.now() - startTime;
  logger.info("alternative_engine_completed", {
    product: input.product.name,
    totalCandidates: final.length,
    verifiedCount: final.filter((a) => a.verified).length,
    durationMs: totalDuration,
  });

  return final;
}

/**
 * Phase 4 full flow (Alternative Ingredients):
 *
 *   Detected issues (existing signals)
 *       ↓ getAlternativeCharacteristics  (Phase 1)
 *       ↓ buildAlternativeSearchCriteriaList (Phase 3)
 *       ↓ findAlternativesEnhanced with criteria (Phase 4 retrieval gate)
 *       ↓ existing ranking
 *
 * Candidates that violate a supported criterion are rejected before ranking.
 *
 * Phase 5: the result also carries the characteristics and the criteria used,
 * so API consumers can render "What to look for" and per-alternative
 * validated reasons without re-running detection.
 */
export type AlternativePipelineResult = {
  alternatives: EnhancedAlternative[];
  /** Phase 1 characteristics derived from the scanned product's issues. */
  characteristics: AlternativeCharacteristic[];
  /** Phase 3 criteria fed into the engine (empty when no characteristics). */
  criteria: AlternativeSearchCriteria;
};

export async function findAlternativesForProduct(input: {
  product: ProductInfo;
  nutrition: NutritionFacts | null;
  userPreferences?: AlternativeEngineInput["userPreferences"];
  limit?: number;
}): Promise<AlternativePipelineResult> {
  const { product, nutrition } = input;

  const issues = detectAlternativeIssues({ product, nutrition });
  const characteristics = getAlternativeCharacteristics(issues);
  const criteria = buildAlternativeSearchCriteriaList(characteristics, {
    name: product.name,
    brand: product.brand,
    category: product.category,
    nutrition,
  });

  // When no characteristic could be derived, the engine must behave exactly
  // as it did before this pipeline existed (no criteria gate).
  const alternatives = await findAlternativesEnhanced({
    product,
    nutrition,
    userPreferences: input.userPreferences,
    alternativeCriteria: characteristics.length > 0 ? criteria : null,
    limit: input.limit ?? 5,
  });

  return { alternatives, characteristics, criteria };
}