import type { ProductInfo, ProductCategory } from "@/types/domain";

/**
 * Product-family classification for alternative recommendations.
 *
 * The shipped FoodGuard catalog has no usable category column (`food_type` is
 * empty, `categories`/`brands` are empty, and `mapProductRow` hardcodes every
 * row to `category: "food"`), so the old engine rewarded ANY two products with
 * a bogus "same category" similarity bonus. That is why a packet of Kurkure
 * was "matched" with Aquafina Water and Amul ice cream.
 *
 * Instead we passively classify each product into a fine-grained FAMILY (e.g.
 * `extruded_snack`, `water`, `ice_cream`, `buttermilk`) and a SUPERFAMILY
 * (e.g. `snacks`, `beverages`, `dairy`). Two products are compatible ONLY when
 * they share a family (same product) or at least a superfamily (closely
 * related product). Generic words like "food" or "snack" never constitute a
 * family on their own — an unclassifiable product is treated as UNKNOWN, which
 * gives it no compatibility bonus and cannot beat real family evidence.
 */

export type ProductFamily =
  | "extruded_snack"
  | "chips"
  | "namkeen"
  | "popcorn"
  | "trail_mix"
  | "frozen_snack"
  | "biscuit"
  | "cookie"
  | "cracker"
  | "rusk"
  | "bread"
  | "bun"
  | "cake"
  | "pastry"
  | "chocolate"
  | "candy"
  | "chewing_gum"
  | "wafer_sweet"
  | "mithai"
  | "ice_cream"
  | "frozen_dessert"
  | "milk"
  | "curd"
  | "buttermilk"
  | "lassi"
  | "milk_drink"
  | "butter"
  | "cheese"
  | "paneer"
  | "cream"
  | "ghee"
  | "water"
  | "juice"
  | "soft_drink"
  | "energy_drink"
  | "health_drink"
  | "tea"
  | "coffee"
  | "coconut_water"
  | "rice"
  | "flour"
  | "pulses"
  | "cereal"
  | "oats"
  | "pasta"
  | "noodles"
  | "instant_mix"
  | "sugar_sweetener"
  | "salt_staple"
  | "pickle"
  | "chutney"
  | "sauce"
  | "jam_spread"
  | "peanut_butter"
  | "edible_oil"
  | "spices"
  | "meat_poultry"
  | "fish_seafood"
  | "eggs"
  | "soy_protein"
  | "ready_to_eat"
  | "soup"
  | "frozen_food";

export type ProductSuperfamily =
  | "snacks"
  | "bakery"
  | "confectionery"
  | "frozen_dairy"
  | "dairy"
  | "beverages"
  | "staples"
  | "condiments"
  | "fats_oils"
  | "spices"
  | "proteins"
  | "ready_meals"
  | "nonfood";

export type FamilyClassification = {
  family: ProductFamily | null;
  superfamily: ProductSuperfamily | null;
  matchedTerms: string[];
};

type Keyword = { kw: string; w: number };

type FamilyDef = {
  family: ProductFamily;
  superfamily: ProductSuperfamily;
  keywords: Keyword[];
};

/**
 * `w` (weight) separates strong product-type nouns (2) from generic flavour /
 * preparation modifiers such as "masala", "spice" or "flavoured" (1). A noun
 * always beats a modifier, so "Masala Bread" is bread, never spice; while a
 * product named "Garam Masala" (no noun) still classifies as spice.
 */
const w2 = (kw: string): Keyword => ({ kw, w: 2 });
const w1 = (kw: string): Keyword => ({ kw, w: 1 });

const FAMILY_DEFS: FamilyDef[] = [
  // ── snacks ──────────────────────────────────────────────────
  {
    family: "extruded_snack",
    superfamily: "snacks",
    keywords: [w2("kurkure"), w2("extruded"), w2("puff"), w1("snack"), w1("snax"), w2("nacho"), w2("masala munch"), w2("bhel")],
  },
  {
    family: "chips",
    superfamily: "snacks",
    keywords: [w2("chips"), w2("crisps"), w2("potato fry"), w2("banana chips"), w2("tortilla"), w1("potato snack"), w2("plantain")],
  },
  {
    family: "namkeen",
    superfamily: "snacks",
    keywords: [w2("namkeen"), w2("bhujia"), w2("chakli"), w2("chanachur"), w2("boondi"), w2("murmura"), w2("khakhra"), w2("gathiya"), w1("sev"), w1("mixture"), w2("chana jor garam"), w2("fryums")],
  },
  {
    family: "popcorn",
    superfamily: "snacks",
    keywords: [w2("popcorn"), w2("pop corn"), w2("corn puff")],
  },
  {
    family: "trail_mix",
    superfamily: "snacks",
    keywords: [w2("trail mix"), w2("nuts mix"), w2("dry fruit mix")],
  },
  {
    family: "frozen_snack",
    superfamily: "snacks",
    keywords: [w2("spring roll"), w2("samosa"), w2("vada"), w2("tikki"), w2("kebab"), w2("nugget")],
  },

  // ── bakery ──────────────────────────────────────────────────
  {
    family: "biscuit",
    superfamily: "bakery",
    keywords: [
      w2("biscuit"),
      w2("cream biscuit"),
      w2("good day"),
      w2("marie"),
      w2("parle"),
      w2("digestive"),
      w2("bourbon"),
      w2("krackjack"),
      w2("monaco"),
      w2("glucose biscuit"),
      w1("biscotti"),
    ],
  },
  {
    family: "cookie",
    superfamily: "bakery",
    keywords: [w2("cookie"), w2("choco chip"), w2("chocolate chip")],
  },
  {
    family: "cracker",
    superfamily: "bakery",
    keywords: [w2("cracker"), w2("saltine")],
  },
  {
    family: "rusk",
    superfamily: "bakery",
    keywords: [w2("rusk")],
  },
  {
    family: "bread",
    superfamily: "bakery",
    keywords: [w2("bread"), w2("pav"), w2("sandwich"), w2("banana bread")],
  },
  {
    family: "bun",
    superfamily: "bakery",
    keywords: [w2("bun")],
  },
  {
    family: "cake",
    superfamily: "bakery",
    keywords: [w2("cake"), w2("cupcake")],
  },
  {
    family: "pastry",
    superfamily: "bakery",
    keywords: [w2("pastry"), w2("croissant"), w2("muffin"), w2("donut"), w2("doughnut")],
  },

  // ── confectionery ───────────────────────────────────────────
  {
    family: "chocolate",
    superfamily: "confectionery",
    keywords: [w2("chocolate"), w2("choco"), w2("cadbury"), w2("dairy milk"), w2("kitkat"), w2("kit kat"), w2("milk chocolate"), w2("dark chocolate"), w2("cocoa"), w2("eclair")],
  },
  {
    family: "candy",
    superfamily: "confectionery",
    keywords: [w2("candy"), w2("toffee"), w2("lollipop"), w2("gummy"), w2("bubblegum"), w2("jelly bean")],
  },
  {
    family: "chewing_gum",
    superfamily: "confectionery",
    keywords: [w2("chewing gum"), w2("bubble gum")],
  },
  {
    family: "wafer_sweet",
    superfamily: "confectionery",
    keywords: [w2("wafer"), w2("waffle"), w2("chocobar"), w2("chocolate bar")],
  },
  {
    family: "mithai",
    superfamily: "confectionery",
    keywords: [w2("mithai"), w2("barfi"), w2("halwa"), w2("ladoo"), w2("laddu"), w2("peda"), w2("gulab jamun"), w2("rasgulla"), w2("jalebi"), w2("soan papdi"), w2("kaju katli"), w1("dessert")],
  },

  // ── frozen dairy ────────────────────────────────────────────
  {
    family: "ice_cream",
    superfamily: "frozen_dairy",
    keywords: [w2("ice cream"), w2("icecream"), w2("kulfi"), w2("cone"), w2("cassata"), w2("sundae")],
  },
  {
    family: "frozen_dessert",
    superfamily: "frozen_dairy",
    keywords: [w2("frozen dessert"), w2("sorbet"), w2("frozen yogurt")],
  },

  // ── dairy ───────────────────────────────────────────────────
  {
    family: "milk",
    superfamily: "dairy",
    keywords: [w2("milk"), w2("toned milk"), w2("milk powder"), w2("cow milk"), w2("buffalo milk")],
  },
  {
    family: "curd",
    superfamily: "dairy",
    keywords: [w2("curd"), w2("dahi"), w2("yogurt"), w2("yoghurt"), w2("misti doi")],
  },
  {
    family: "buttermilk",
    superfamily: "dairy",
    keywords: [w2("buttermilk"), w2("chaach"), w2("chhaas"), w2("matha"), w2("spiced buttermilk")],
  },
  {
    family: "lassi",
    superfamily: "dairy",
    keywords: [w2("lassi"), w2("sweet lassi")],
  },
  {
    family: "milk_drink",
    superfamily: "dairy",
    keywords: [w2("flavoured milk"), w2("flavored milk"), w2("milk shake"), w2("milkshake"), w2("kheer"), w2("smoothie"), w1("milk drink")],
  },
  {
    family: "butter",
    superfamily: "dairy",
    keywords: [w2("butter"), w2("white butter")],
  },
  {
    family: "cheese",
    superfamily: "dairy",
    keywords: [w2("cheese"), w2("mozzarella"), w2("cheddar"), w2("paneer")],
  },
  {
    family: "paneer",
    superfamily: "dairy",
    keywords: [w2("paneer"), w2("tofu")],
  },
  {
    family: "cream",
    superfamily: "dairy",
    keywords: [w2("fresh cream"), w2("whipping cream"), w1("malai"), w1("single cream")],
  },
  {
    family: "ghee",
    superfamily: "fats_oils",
    keywords: [w2("ghee"), w2("desi ghee")],
  },

  // ── beverages ───────────────────────────────────────────────
  {
    family: "water",
    superfamily: "beverages",
    keywords: [w2("mineral water"), w2("packaged drinking"), w2("drinking water"), w2("spring water"), w2("aquafina"), w2("kinley"), w2("bisleri")],
  },
  {
    family: "juice",
    superfamily: "beverages",
    keywords: [w2("juice"), w2("nectar"), w2("squash"), w2("mojito"), w2("tropicana"), w2("orange juice"), w2("mango juice"), w2("apple juice"), w2("pomegranate juice"), w1("fruit drink")],
  },
  {
    family: "soft_drink",
    superfamily: "beverages",
    keywords: [w2("cola"), w2("soda"), w2("fizz"), w2("soft drink"), w2("thums up"), w2("thumsup"), w2("pepsi"), w2("sprite"), w2("7up"), w2("fanta"), w2("mirinda"), w2("limca"), w2("mountain dew"), w2("jeera"), w2("soda water")],
  },
  {
    family: "energy_drink",
    superfamily: "beverages",
    keywords: [w2("energy drink"), w2("red bull"), w2("monster"), w2("sting"), w2("glucose"), w2("electrolyte"), w2("sports drink"), w2("oral rehydration"), w2("tiger"), w2("burn")],
  },
  {
    family: "health_drink",
    superfamily: "beverages",
    keywords: [w2("horlicks"), w2("boost"), w2("protinex"), w2("complan"), w2("pediasure"), w2("malted drink"), w1("health drink")],
  },
  {
    family: "tea",
    superfamily: "beverages",
    keywords: [w2("tea"), w2("chai"), w2("masala tea"), w2("green tea"), w2("lemon tea"), w2("ice tea"), w2("iced tea")],
  },
  {
    family: "coffee",
    superfamily: "beverages",
    keywords: [w2("coffee"), w2("cappuccino"), w2("latte"), w2("espresso"), w2("bru"), w2("nescafe")],
  },
  {
    family: "coconut_water",
    superfamily: "beverages",
    keywords: [w2("coconut water"), w2("nariyal pani")],
  },

  // ── staples ─────────────────────────────────────────────────
  {
    family: "rice",
    superfamily: "staples",
    keywords: [w2("rice"), w2("basmati"), w2("biryani rice"), w2("idli rice"), w2("brown rice")],
  },
  {
    family: "flour",
    superfamily: "staples",
    keywords: [w2("atta"), w2("flour"), w2("maida"), w2("besan"), w2("suji"), w2("sooji"), w2("rava")],
  },
  {
    family: "pulses",
    superfamily: "staples",
    keywords: [w2("dal"), w2("dahl"), w2("lentil"), w2("moong"), w2("chana"), w2("masoor"), w2("toor"), w2("urad"), w2("rajma"), w2("chickpea")],
  },
  {
    family: "cereal",
    superfamily: "staples",
    keywords: [w2("cereal"), w2("cornflakes"), w2("corn flakes"), w2("muesli"), w2("granola"), w2("wheat flakes"), w2("chocos")],
  },
  {
    family: "oats",
    superfamily: "staples",
    keywords: [w2("oats"), w2("oatmeal"), w2("porridge"), w2("dalia")],
  },
  {
    family: "pasta",
    superfamily: "staples",
    keywords: [w2("pasta"), w2("macaroni"), w2("spaghetti"), w2("penne"), w2("fusilli")],
  },
  {
    family: "noodles",
    superfamily: "staples",
    keywords: [w2("noodle"), w2("noodles"), w2("maggi"), w2("instant noodles"), w2("vermicelli"), w2("sevai"), w2("ramen")],
  },
  {
    family: "instant_mix",
    superfamily: "staples",
    keywords: [w2("instant mix"), w2("ready mix"), w2("pancake mix"), w2("idli mix"), w2("dosa mix"), w2("upma mix"), w2("cake mix"), w2("soup mix")],
  },
  {
    family: "sugar_sweetener",
    superfamily: "staples",
    keywords: [w2("sugar"), w2("jaggery"), w2("gur"), w2("honey"), w2("sweetener"), w2("stevia"), w2("brown sugar")],
  },
  {
    family: "salt_staple",
    superfamily: "staples",
    keywords: [w2("salt"), w2("sendha namak"), w2("rock salt"), w2("table salt")],
  },

  // ── condiments ──────────────────────────────────────────────
  {
    family: "pickle",
    superfamily: "condiments",
    keywords: [w2("pickle"), w2("pickles"), w2("achaar"), w2("achar"), w2("mango pickle"), w2("lemon pickle")],
  },
  {
    family: "chutney",
    superfamily: "condiments",
    keywords: [w2("chutney"), w2("chutni"), w2("tamarind chutney"), w2("mint chutney")],
  },
  {
    family: "sauce",
    superfamily: "condiments",
    keywords: [w2("sauce"), w2("ketchup"), w2("mayonnaise"), w2("mayo"), w2("soy sauce"), w2("chilli sauce"), w2("hot sauce"), w2("tomato sauce"), w1("dip")],
  },
  {
    family: "jam_spread",
    superfamily: "condiments",
    keywords: [w2("jam"), w2("jelly"), w2("marmalade"), w2("chocolate spread"), w2("nutella"), w1("spread"), w1("murabba")],
  },
  {
    family: "peanut_butter",
    superfamily: "condiments",
    keywords: [w2("peanut butter"), w2("peanut spread"), w2("almond butter"), w2("cashew butter")],
  },

  // ── fats & oils ─────────────────────────────────────────────
  {
    family: "edible_oil",
    superfamily: "fats_oils",
    keywords: [w2("oil"), w2("sunflower oil"), w2("refined oil"), w2("groundnut oil"), w2("mustard oil"), w2("olive oil"), w2("soyabean oil"), w2("rice bran oil"), w2("vanaspati")],
  },

  // ── spices ──────────────────────────────────────────────────
  {
    family: "spices",
    superfamily: "spices",
    keywords: [w1("masala"), w1("spice"), w1("turmeric"), w1("haldi"), w1("chilli powder"), w1("chili powder"), w1("garam masala"), w1("cumin"), w1("jeera"), w1("dhania"), w1("garlic paste"), w1("ginger paste"), w1("pepper"), w1("clove"), w1("cardamom"), w1("cinnamon"), w1("seasoning"), w1("tandoori"), w1("garam")],
  },

  // ── proteins ────────────────────────────────────────────────
  {
    family: "meat_poultry",
    superfamily: "proteins",
    keywords: [w2("chicken"), w2("mutton"), w2("meat"), w2("lamb"), w2("pork"), w2("sausage"), w2("keema"), w2("goat")],
  },
  {
    family: "fish_seafood",
    superfamily: "proteins",
    keywords: [w2("fish"), w2("prawn"), w2("shrimp"), w2("crab"), w2("seafood"), w2("sardine"), w2("mackerel")],
  },
  {
    family: "eggs",
    superfamily: "proteins",
    keywords: [w2("egg")],
  },
  {
    family: "soy_protein",
    superfamily: "proteins",
    keywords: [w2("soya chunk"), w2("soy chunk"), w2("soya chaap"), w2("soy protein"), w2("soy nuggets")],
  },

  // ── ready meals ─────────────────────────────────────────────
  {
    family: "ready_to_eat",
    superfamily: "ready_meals",
    keywords: [w2("ready to eat"), w2("ready-to-eat"), w2("instant meal")],
  },
  {
    family: "soup",
    superfamily: "ready_meals",
    keywords: [w2("soup"), w2("shorba")],
  },
  {
    family: "frozen_food",
    superfamily: "ready_meals",
    keywords: [w2("frozen food"), w2("frozen"), w2("paratha"), w2("poori"), w2("dosa batter"), w2("idli batter"), w2("pizza")],
  },
];

// Brand-level hints. Conservative on purpose: a brand is only trusted when it
// is unambiguous; a wrong brand map would poison classification.
const BRAND_HINTS: Array<{ brand: string; family: ProductFamily; superfamily: ProductSuperfamily }> = [
  { brand: "kurkure", family: "extruded_snack", superfamily: "snacks" },
  { brand: "aquafina", family: "water", superfamily: "beverages" },
  { brand: "amul", family: "milk", superfamily: "dairy" },
  { brand: "britannia", family: "biscuit", superfamily: "bakery" },
  { brand: "parle", family: "biscuit", superfamily: "bakery" },
  { brand: "sunfeast", family: "biscuit", superfamily: "bakery" },
  { brand: "maggi", family: "noodles", superfamily: "staples" },
  { brand: "cadbury", family: "chocolate", superfamily: "confectionery" },
  { brand: "mtr", family: "instant_mix", superfamily: "staples" },
  { brand: "sting", family: "energy_drink", superfamily: "beverages" },
  { brand: "red bull", family: "energy_drink", superfamily: "beverages" },
  { brand: "monster", family: "energy_drink", superfamily: "beverages" },
  { brand: "pepsi", family: "soft_drink", superfamily: "beverages" },
  { brand: "coca cola", family: "soft_drink", superfamily: "beverages" },
  { brand: "coke", family: "soft_drink", superfamily: "beverages" },
  { brand: "frooti", family: "juice", superfamily: "beverages" },
  { brand: "paper boat", family: "juice", superfamily: "beverages" },
  { brand: "real", family: "juice", superfamily: "beverages" },
  { brand: "dabur", family: "juice", superfamily: "beverages" },
  { brand: "bisleri", family: "water", superfamily: "beverages" },
  { brand: "kinley", family: "water", superfamily: "beverages" },
  { brand: "lays", family: "chips", superfamily: "snacks" },
  { brand: "bingo", family: "extruded_snack", superfamily: "snacks" },
  { brand: "haldiram", family: "namkeen", superfamily: "snacks" },
  { brand: "parle", family: "biscuit", superfamily: "bakery" },
  { brand: "oreo", family: "biscuit", superfamily: "bakery" },
  { brand: "nestle", family: "coffee", superfamily: "beverages" },
  { brand: "nescafe", family: "coffee", superfamily: "beverages" },
];

export function nonFoodCategory(category: ProductCategory): boolean {
  return category !== "food";
}

/**
 * Classify a product into a family + superfamily using name/brand keywords.
 * Returns `family: null` when no family evidence exists — a NULL family is
 * "unknown", never a generic "food" family.
 */
export function classifyProductFamily(
  product: Pick<ProductInfo, "name" | "brand" | "category">,
): FamilyClassification {
  // Non-food product categories map to a single non-food bucket.
  if (nonFoodCategory(product.category)) {
    return { family: null, superfamily: "nonfood", matchedTerms: [] };
  }

  const name = (product.name ?? "").toLowerCase();
  const brand = (product.brand ?? "").toLowerCase();
  const haystack = `${name} ${brand}`;

  // 1) Brand hints (unambiguous brand names) fire first.
  for (const hint of BRAND_HINTS) {
    if (brand.includes(hint.brand) || name.includes(hint.brand)) {
      return { family: hint.family, superfamily: hint.superfamily, matchedTerms: [hint.brand] };
    }
  }

  // 2) Keyword families — highest weighted keyword score wins; the longest
  //    matched keyword breaks ties (specificity wins).
  let best: { def: FamilyDef; score: number; longest: number; terms: string[] } | null = null;
  for (const def of FAMILY_DEFS) {
    const terms: string[] = [];
    let score = 0;
    let longest = 0;
    for (const { kw, w } of def.keywords) {
      if (haystack.includes(kw)) {
        score += w;
        longest = Math.max(longest, kw.length);
        terms.push(kw);
      }
    }
    if (score === 0) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && longest > best.longest)
    ) {
      best = { def, score, longest, terms };
    }
  }

  if (best) {
    return {
      family: best.def.family,
      superfamily: best.def.superfamily,
      matchedTerms: best.terms,
    };
  }

  return { family: null, superfamily: null, matchedTerms: [] };
}

export type FamilyCompatibility =
  | { kind: "same"; affinity: number; label: string }
  | { kind: "related"; affinity: number; label: string }
  | { kind: "unknown"; affinity: number; label: string }
  | { kind: "incompatible" }
  | { kind: "nonfood" };

/**
 * Compatibility between the source product and a candidate.
 *
 * `incompatible` is a HARD GATE — the candidate must be dropped before any
 * nutrition/health ranking. `same`/`related` map to a similarity affinity that
 * replaces the old blanket "same category: food" +40. `unknown` (either side
 * lacks family evidence) is never treated as "compatible" — it yields only a
 * tiny affinity and must rely on real name/ingredient overlap to be ranked.
 */
export function familyCompatibility(
  source: FamilyClassification,
  candidate: FamilyClassification,
): FamilyCompatibility {
  // Non-food products are only alternatives to the same non-food category.
  if (source.superfamily === "nonfood" || candidate.superfamily === "nonfood") {
    if (source.superfamily === candidate.superfamily) {
      return { kind: "related", affinity: 40, label: "same category" };
    }
    return { kind: "nonfood" };
  }

  if (source.family && candidate.family) {
    if (source.family === candidate.family) {
      return { kind: "same", affinity: 40, label: candidate.family };
    }
    if (
      source.superfamily &&
      candidate.superfamily &&
      source.superfamily === candidate.superfamily
    ) {
      return { kind: "related", affinity: 26, label: candidate.superfamily };
    }
    return { kind: "incompatible" };
  }

  // Either side is unknown — no proof of compatibility, no real affinity.
  return { kind: "unknown", affinity: 10, label: "unknown" };
}

/** Human-readable label for a classified family (for reasons/UI). */
export function familyLabel(cls: FamilyClassification): string {
  if (!cls.family) return "unknown";
  return cls.family.replace(/_/g, " ");
}

// ── Use-Case Compatibility ────────────────────────────────────────

export type UseCaseCompatibility = {
  level: "strong" | "moderate" | "weak" | "none";
  score: number; // 0-1
  reason: string;
};

/**
 * Evaluate whether a candidate product is a realistic use-case replacement
 * for the source product, beyond basic family compatibility.
 *
 * This operates AFTER the family gate has confirmed basic compatibility.
 * It answers: "Would a normal user realistically consider this as a substitute?"
 *
 * Examples:
 *   coffee → coffee = strong (same use case)
 *   coffee → tea = moderate (similar hot beverage)
 *   coffee → water = weak (different use case)
 *   milk → plant milk = strong (direct substitute)
 *   chips → popcorn = moderate (similar snack context)
 *   chips → biscuit = weak (different snack type)
 */
export function useCaseCompatibility(
  source: FamilyClassification,
  candidate: FamilyClassification,
): UseCaseCompatibility {
  // Same family = strong use-case match
  if (source.family && candidate.family && source.family === candidate.family) {
    return { level: "strong", score: 1.0, reason: `Same product type: ${source.family}` };
  }

  // Define use-case groups: products within a group are realistic substitutes
  const useCaseGroups: ProductFamily[][] = [
    // Hot beverages
    ["coffee", "tea"],
    // Cold functional beverages
    ["energy_drink", "health_drink"],
    // Water alternatives
    ["water", "coconut_water"],
    // Juice-like beverages
    ["juice", "soft_drink"],
    // Dairy milks (including plant-based)
    ["milk", "curd", "buttermilk", "lassi", "milk_drink"],
    // Frozen dairy
    ["ice_cream", "frozen_dessert"],
    // Snack types
    ["extruded_snack", "chips", "namkeen", "popcorn", "trail_mix"],
    // Sweet snacks
    ["chocolate", "candy", "chewing_gum", "wafer_sweet", "mithai"],
    // Bakery
    ["biscuit", "cookie", "cracker", "rusk", "bread", "cake", "pastry"],
    // Staples
    ["rice", "flour", "pulses", "cereal", "oats", "pasta", "noodles"],
    // Condiments
    ["sauce", "jam_spread", "pickle", "chutney"],
    // Oils
    ["edible_oil", "ghee", "butter"],
    // Frozen meals
    ["frozen_food", "ready_to_eat", "soup"],
  ];

  if (source.family && candidate.family) {
    for (const group of useCaseGroups) {
      const sourceInGroup = group.includes(source.family);
      const candidateInGroup = group.includes(candidate.family);
      if (sourceInGroup && candidateInGroup) {
        return { level: "moderate", score: 0.7, reason: `Similar use case within ${group[0].replace(/_/g, " ")} category` };
      }
    }
  }

  // Same superfamily but different use-case group = weak
  if (source.superfamily && candidate.superfamily && source.superfamily === candidate.superfamily) {
    return { level: "weak", score: 0.3, reason: `Same category (${source.superfamily}) but different product type` };
  }

  return { level: "none", score: 0, reason: "Different product categories" };
}

// ── Unknown Family Handling ───────────────────────────────────────

/**
 * Calculate an adjusted affinity for candidates with unknown families.
 * Unknown products can still rank when there is strong ingredient/text
 * overlap, but they require higher similarity evidence.
 */
export function unknownFamilyAdjustedAffinity(
  baseAffinity: number,
  ingredientOverlap: number, // 0-1 Jaccard similarity
  nameOverlap: number, // 0-1 name token overlap
): number {
  // Unknown family gets a penalty, but strong overlap can compensate
  const overlapSignal = ingredientOverlap * 0.6 + nameOverlap * 0.4;
  if (overlapSignal > 0.5) {
    // Strong overlap: moderate affinity despite unknown family
    return Math.max(baseAffinity, 18);
  }
  if (overlapSignal > 0.3) {
    // Moderate overlap: slightly higher than base
    return Math.max(baseAffinity, 14);
  }
  // Weak overlap: keep base affinity (low)
  return baseAffinity;
}
