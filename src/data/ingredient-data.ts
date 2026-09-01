import type { AssessmentLevel } from "./analysis-data";

export type IngredientCategory =
  | "Flavour Enhancer"
  | "Preservative"
  | "Surfactant"
  | "Humectant"
  | "Color Additive"
  | "Sweetener"
  | "Stabilizer"
  | "Emulsifier"
  | "Thickener"
  | "Acidity Regulator"
  | "Solvent"
  | "UV Filter"
  | "Antimicrobial Agent"
  | "pH Adjuster"
  | "Scent / Sensory Enhancer"
  | "Skin Protectant"
  | "Amino Acid"
  | "Fortification"
  | "Stimulant"
  | "Whole Grain / Base Ingredient"
  | "Base Ingredient"
  | "Nutrient / Preservative"
  | "Cleansing Agent";

export type RegulatoryStatus = "permitted" | "restricted" | "banned" | "under_review" | "unknown";

export type RegulatoryInfo = {
  status: RegulatoryStatus;
  authority: string;
  details: string;
};

export type ProductContextInfo = {
  productName: string;
  productBrand: string;
  position: string;
  functionInProduct: string;
  additionalNotes: string;
};

export type DataQualityInfo = {
  level: "high" | "medium" | "low";
  explanation: string;
};

export type RelatedIngredient = {
  id: string;
  name: string;
  function: string;
  assessment: AssessmentLevel;
};

export type IngredientEvidenceSource = {
  sourceName: string;
  sourceType: string;
  finding: string;
  url?: string;
};

export type IngredientDetail = {
  id: string;
  name: string;
  insCode?: string;
  category: IngredientCategory;
  assessment: AssessmentLevel;
  description: string;
  learnMoreUrl?: string;
  whyUsed: string;
  functionLabel: string;
  flagExplanation: string;
  factorsConsidered: string[];
  evidence: IngredientEvidenceSource[];
  regulatory: RegulatoryInfo;
  productContext: ProductContextInfo;
  dataQuality: DataQualityInfo;
  relatedIngredients: RelatedIngredient[];
};

const MOCK_INGREDIENTS: Record<string, IngredientDetail> = {
  "sodium-lauryl-sulfate": {
    id: "sodium-lauryl-sulfate",
    name: "Sodium Lauryl Sulfate",
    insCode: "INS 686",
    category: "Surfactant",
    assessment: "high",
    description:
      "Sodium lauryl sulfate (SLS) is a strong surfactant commonly used as a cleansing and foaming agent in personal care and household products. It effectively removes oils and creates a rich lather, which is why it is widely used in shampoos, body washes, and cleaning products.",
    whyUsed:
      "SLS functions as a surfactant and cleansing agent. It lowers the surface tension of water, allowing it to mix with oils and dirt so they can be rinsed away. It also produces the foaming sensation that many consumers associate with effective cleaning.",
    functionLabel: "Surfactant / Cleansing Agent",
    flagExplanation:
      "This ingredient was flagged for attention based on available evidence indicating potential for skin irritation. SLS is known to strip natural oils from the skin and may compromise the skin barrier, particularly with repeated use or on sensitive skin.",
    factorsConsidered: [
      "Available clinical evidence on skin irritation",
      "Ingredient function as a strong surfactant",
      "Product context — applied directly to skin",
      "Regulatory status in major markets",
      "Data quality from peer-reviewed sources",
    ],
    evidence: [
      {
        sourceName: "Journal of the American Academy of Dermatology",
        sourceType: "Peer-Reviewed Research",
        finding:
          "SLS is documented as a common cause of contact irritant dermatitis. Clinical patch tests show irritation potential proportional to concentration and exposure duration.",
        url: "https://doi.org/10.1016/j.jaad.2012.02.031",
      },
      {
        sourceName: "Contact Dermatitis Journal",
        sourceType: "Peer-Reviewed Research",
        finding:
          "Multiple studies confirm SLS as one of the most frequent causes of irritant contact dermatitis in cosmetic product testing.",
      },
      {
        sourceName: "CIR Expert Panel",
        sourceType: "Industry Safety Review",
        finding:
          "The Cosmetic Ingredient Review panel has assessed SLS and concluded it is safe as a cosmetic ingredient at concentrations up to 50%, though irritation may occur at higher concentrations.",
      },
    ],
    regulatory: {
      status: "permitted",
      authority: "FDA / EU Cosmetics Regulation",
      details:
        "SLS is permitted for use in cosmetic and personal care products in the US and EU. The EU Cosmetics Regulation (EC 1223/2009) allows its use without concentration limits in rinse-off products. The FDA classifies it as a safe cosmetic ingredient.",
    },
    productContext: {
      productName: "GlowCare Face Wash",
      productBrand: "GlowCare",
      position: "2nd ingredient (high concentration)",
      functionInProduct: "Primary surfactant responsible for cleansing and foaming action",
      additionalNotes:
        "As a rinse-off product, exposure time is brief. However, facial skin is more sensitive than body skin, and SLS may cause dryness or tightness with regular use.",
    },
    dataQuality: {
      level: "high",
      explanation:
        "Assessment based on extensive peer-reviewed clinical research, regulatory reviews, and ingredient safety databases. High confidence in the irritation potential findings.",
    },
    relatedIngredients: [
      {
        id: "sodium-laureth-sulfate",
        name: "Sodium Laureth Sulfate (SLES)",
        function: "Surfactant",
        assessment: "moderate",
      },
      {
        id: "cocamidopropyl-betaine",
        name: "Cocamidopropyl Betaine",
        function: "Surfactant",
        assessment: "low",
      },
      {
        id: "coco-glucoside",
        name: "Coco-Glucoside",
        function: "Surfactant",
        assessment: "low",
      },
    ],
  },
  methylparaben: {
    id: "methylparaben",
    name: "Methylparaben",
    insCode: "INS 219",
    category: "Preservative",
    assessment: "moderate",
    description:
      "Methylparaben is a synthetic preservative belonging to the paraben family. It is effective at preventing the growth of bacteria, mold, and yeast in cosmetic and personal care products, extending shelf life and ensuring product safety.",
    whyUsed:
      "Methylparaben functions as a preservative that inhibits microbial growth in products. It is one of the most commonly used preservatives in cosmetics due to its effectiveness, low cost, and long safety record at typical usage levels.",
    functionLabel: "Preservative",
    flagExplanation:
      "This ingredient was flagged for moderate attention based on ongoing scientific review of the paraben family. While current evidence suggests low risk at typical cosmetic concentrations, some studies have detected parabens in human tissue, and regulatory bodies are continuing to evaluate potential endocrine interaction.",
    factorsConsidered: [
      "Available evidence on endocrine interaction",
      "Ingredient function as a preservative",
      "Product context — rinse-off vs leave-on",
      "Regulatory status and ongoing reviews",
      "Data quality from regulatory agencies",
    ],
    evidence: [
      {
        sourceName: "EU Scientific Committee on Consumer Safety (SCCS)",
        sourceType: "Regulatory Body",
        finding:
          "SCCS has reviewed parabens and concluded that methylparaben is safe at concentrations up to 0.4% (single ester) in cosmetic products. The committee notes that parabens can be detected in human tissue but at levels considered safe.",
      },
      {
        sourceName: "FDA Safety Assessment of Parabens",
        sourceType: "Government Regulatory Review",
        finding:
          "FDA continues to monitor paraben safety. Current evidence does not support a link between parabens and health effects at typical cosmetic levels, but review is ongoing.",
      },
      {
        sourceName: "Journal of Applied Toxicology",
        sourceType: "Peer-Reviewed Research",
        finding:
          "Studies have detected parabens in human breast tissue samples. The clinical significance of these findings at cosmetic exposure levels remains under investigation.",
      },
    ],
    regulatory: {
      status: "restricted",
      authority: "EU Cosmetics Regulation / FDA",
      details:
        "In the EU, methylparaben is permitted at a maximum concentration of 0.4% (individual ester) or 0.8% (total paraben mixture) under Regulation (EC) 1223/2009. The FDA permits its use without specific concentration limits but continues safety review.",
    },
    productContext: {
      productName: "GlowCare Face Wash",
      productBrand: "GlowCare",
      position: "6th ingredient (low concentration)",
      functionInProduct: "Preservative to prevent microbial contamination",
      additionalNotes:
        "As a rinse-off product, skin exposure is brief. The concentration is likely within established safe limits. Individuals with paraben sensitivity should note its presence.",
    },
    dataQuality: {
      level: "high",
      explanation:
        "Assessment based on regulatory reviews from EU SCCS and FDA, peer-reviewed toxicology research, and comprehensive ingredient safety databases.",
    },
    relatedIngredients: [
      {
        id: "ethylparaben",
        name: "Ethylparaben",
        function: "Preservative",
        assessment: "moderate",
      },
      {
        id: "propylparaben",
        name: "Propylparaben",
        function: "Preservative",
        assessment: "moderate",
      },
      {
        id: "phenoxyethanol",
        name: "Phenoxyethanol",
        function: "Preservative",
        assessment: "low",
      },
    ],
  },
  glycerin: {
    id: "glycerin",
    name: "Glycerin",
    insCode: "INS 422",
    category: "Humectant",
    assessment: "low",
    description:
      "Glycerin (also called glycerol) is a natural humectant that attracts and retains moisture. It is one of the most widely used and well-tolerated ingredients in skincare, food, and pharmaceutical products.",
    whyUsed:
      "Glycerin functions as a humectant and moisturizer. It draws water from the environment and deeper skin layers to the surface, helping maintain hydration and improve skin texture. In food products, it serves as a humectant and sweetener.",
    functionLabel: "Humectant / Moisturizer",
    flagExplanation:
      "This ingredient received a low concern assessment. Glycerin has a long history of safe use, is naturally present in the human body, and is consistently rated as safe by dermatological and food safety research across multiple regulatory bodies.",
    factorsConsidered: [
      "Extensive safety data across decades of use",
      "Natural occurrence in the human body",
      "Consistent safety ratings from regulatory bodies",
      "Wide acceptance in food and cosmetic applications",
      "High data quality from multiple independent sources",
    ],
    evidence: [
      {
        sourceName: "International Journal of Cosmetic Science",
        sourceType: "Peer-Reviewed Research",
        finding:
          "Glycerin is effective at improving skin hydration and barrier function. Studies show it is well-tolerated across skin types with negligible irritation potential.",
      },
      {
        sourceName: "EWG Skin Deep Database",
        sourceType: "Ingredient Safety Database",
        finding:
          "Glycerin receives the lowest hazard score (1) in the EWG database, indicating minimal concern based on available data.",
      },
      {
        sourceName: "FDA GRAS Notices",
        sourceType: "Government Safety Database",
        finding:
          "Glycerin is Generally Recognized As Safe (GRAS) for use in food products.",
      },
    ],
    regulatory: {
      status: "permitted",
      authority: "FDA / EU Cosmetics Regulation / JECFA",
      details:
        "Glycerin is permitted without restriction in cosmetic and food products in all major markets. Classified as GRAS by the FDA. Approved as a food additive by JECFA (Joint FAO/WHO Expert Committee on Food Additives).",
    },
    productContext: {
      productName: "GlowCare Face Wash",
      productBrand: "GlowCare",
      position: "3rd ingredient (moderate concentration)",
      functionInProduct: "Humectant that helps maintain skin hydration during cleansing",
      additionalNotes:
        "Helps counteract the drying effects of surfactants like SLS. Its presence provides a moisturizing balance to the formulation.",
    },
    dataQuality: {
      level: "high",
      explanation:
        "Assessment based on extensive safety data from regulatory agencies, peer-reviewed dermatological research, and long-term commercial use across food, cosmetic, and pharmaceutical applications.",
    },
    relatedIngredients: [
      {
        id: "propylene-glycol",
        name: "Propylene Glycol",
        function: "Humectant",
        assessment: "low",
      },
      {
        id: "sodium-pca",
        name: "Sodium PCA",
        function: "Humectant",
        assessment: "low",
      },
      {
        id: "hyaluronic-acid",
        name: "Hyaluronic Acid",
        function: "Humectant",
        assessment: "low",
      },
    ],
  },
  "fragrance-parfum": {
    id: "fragrance-parfum",
    name: "Fragrance (Parfum)",
    insCode: undefined,
    category: "Scent / Sensory Enhancer",
    assessment: "moderate",
    description:
      "Fragrance (listed as Parfum on ingredient labels) is a proprietary blend of aromatic compounds that provides scent to products. Under current regulations, the specific chemical components of a fragrance blend do not need to be individually disclosed.",
    whyUsed:
      "Fragrance is used to enhance the sensory experience of a product by providing a pleasant scent. In personal care products, it can mask the natural odor of other ingredients and contribute to the overall product experience.",
    functionLabel: "Scent / Sensory Enhancer",
    flagExplanation:
      "This ingredient was flagged for moderate attention because the individual chemicals within a fragrance blend are not publicly disclosed. Some fragrance components have been identified as potential allergens in clinical patch-test studies. The proprietary nature of fragrance formulations limits complete transparency.",
    factorsConsidered: [
      "Proprietary formulation limits ingredient transparency",
      "Potential allergen components identified in research",
      "Regulatory framework allows fragrance confidentiality",
      "Product context — rinse-off application",
      "Data quality limited by proprietary nature",
    ],
    evidence: [
      {
        sourceName: "International Fragrance Association (IFRA)",
        sourceType: "Industry Standards Body",
        finding:
          "IFRA sets voluntary standards for fragrance safety. Member companies agree to restrict or ban certain fragrance materials based on safety assessments.",
      },
      {
        sourceName: "Contact Dermatitis Journal",
        sourceType: "Peer-Reviewed Research",
        finding:
          "Fragrance is one of the most common causes of allergic contact dermatitis. Studies identify limonene, linalool, and geraniol among frequently implicated fragrance chemicals.",
      },
      {
        sourceName: "EU Cosmetics Regulation",
        sourceType: "Regulatory Framework",
        finding:
          "EU requires declaration of 26 specific fragrance allergens when present above certain thresholds. Fragrance allergens must be listed on the label.",
      },
    ],
    regulatory: {
      status: "restricted",
      authority: "EU Cosmetics Regulation / IFRA",
      details:
        "In the EU, 26 individual fragrance allergens must be declared when present above threshold limits. IFRA standards restrict or ban certain fragrance materials. In the US, fragrance formulations are protected as trade secrets under the Fair Packaging and Labeling Act.",
    },
    productContext: {
      productName: "GlowCare Face Wash",
      productBrand: "GlowCare",
      position: "5th ingredient",
      functionInProduct: "Provides the product's scent",
      additionalNotes:
        "As a rinse-off product, exposure time is brief. However, facial skin is particularly susceptible to fragrance-related irritation. Individuals with fragrance sensitivity should exercise caution.",
    },
    dataQuality: {
      level: "medium",
      explanation:
        "Assessment is limited by the proprietary nature of fragrance formulations. While general safety data on fragrance allergens is available, the specific composition of this product's fragrance blend is unknown.",
    },
    relatedIngredients: [
      {
        id: "linalool",
        name: "Linalool",
        function: "Fragrance Component",
        assessment: "moderate",
      },
      {
        id: "limonene",
        name: "Limonene",
        function: "Fragrance Component",
        assessment: "moderate",
      },
      {
        id: "fragrance-free",
        name: "Fragrance-Free Alternatives",
        function: "Product Formulation",
        assessment: "low",
      },
    ],
  },
  maltodextrin: {
    id: "maltodextrin",
    name: "Maltodextrin",
    insCode: "INS 1400",
    category: "Thickener",
    assessment: "moderate",
    description:
      "Maltodextrin is a polysaccharide produced from starch (usually corn, rice, potato, or wheat) through partial hydrolysis. It is used as a food additive to improve texture, shelf life, and flavor in processed foods.",
    whyUsed:
      "Maltodextrin functions as a thickener, filler, and preservative in processed foods. It helps improve texture, extend shelf life, and is used as a carrier for flavorings and colorings.",
    functionLabel: "Thickener / Filler",
    flagExplanation:
      "This ingredient was flagged for moderate attention because maltodextrin has a high glycemic index (130-185), which can cause rapid blood sugar spikes. It is also typically derived from genetically modified corn in the US.",
    factorsConsidered: [
      "High glycemic index compared to table sugar",
      "Typically derived from GMO corn",
      "Rapid absorption can spike blood sugar",
      "Minimal nutritional value",
      "Widely used in processed foods",
    ],
    evidence: [
      {
        sourceName: "Journal of Nutrition",
        sourceType: "Peer-Reviewed Research",
        finding:
          "Maltodextrin has a glycemic index of 130-185, higher than table sugar (65). It can cause rapid increases in blood glucose levels.",
      },
      {
        sourceName: "FDA GRAS Notice",
        sourceType: "Government Safety Database",
        finding:
          "Maltodextrin is Generally Recognized As Safe (GRAS) for use in food products. However, individuals with diabetes should monitor intake due to glycemic impact.",
      },
    ],
    regulatory: {
      status: "permitted",
      authority: "FDA / FSSAI / EU",
      details:
      "Maltodextrin is permitted for use in food products in all major markets. It is classified as GRAS by the FDA and permitted under FSSAI regulations in India.",
    },
    productContext: {
      productName: "Processed Food Product",
      productBrand: "Various",
      position: "Varies by product",
      functionInProduct: "Thickener and filler to improve texture and shelf life",
      additionalNotes:
        "Individuals with diabetes or blood sugar concerns should be aware of its high glycemic index. Check product labels for maltodextrin content.",
    },
    dataQuality: {
      level: "high",
      explanation:
        "Assessment based on glycemic index studies, FDA GRAS designation, and widespread commercial use data.",
    },
    relatedIngredients: [
      {
        id: "corn-starch",
        name: "Corn Starch",
        function: "Thickener",
        assessment: "low",
      },
      {
        id: "tapioca-starch",
        name: "Tapioca Starch",
        function: "Thickener",
        assessment: "low",
      },
    ],
  },
  triclosan: {
    id: "triclosan",
    name: "Triclosan",
    insCode: undefined,
    category: "Antimicrobial Agent",
    assessment: "high",
    description:
      "Triclosan is a synthetic antimicrobial agent that was widely used in consumer soaps and personal care products. It was banned in consumer antiseptic wash products by the FDA in 2016 due to insufficient safety and efficacy data.",
    whyUsed:
      "Triclosan was used as an antimicrobial agent to reduce or prevent bacterial contamination in consumer products. It is still permitted in some household cleaning products and certain other applications.",
    functionLabel: "Antimicrobial Agent",
    flagExplanation:
      "This ingredient was flagged for high attention. The FDA banned triclosan in consumer antiseptic wash products in 2016. Evidence indicates potential endocrine disruption and contribution to antibiotic resistance. It persists in the environment and has been detected in waterways and human tissue.",
    factorsConsidered: [
      "FDA ban in consumer antiseptic wash products",
      "Potential endocrine disruption documented in studies",
      "Contribution to antibiotic resistance",
      "Environmental persistence and bioaccumulation",
      "Regulatory actions across multiple jurisdictions",
    ],
    evidence: [
      {
        sourceName: "FDA Final Rule on Antiseptic Wash Products (2016)",
        sourceType: "Government Regulation",
        finding:
          "FDA banned triclosan in consumer antiseptic wash products, stating that manufacturers have not demonstrated that triclosan is both safe and effective for long-term daily use.",
      },
      {
        sourceName: "EPA Registration Review",
        sourceType: "Environmental Regulatory Body",
        finding:
          "EPA continues to review triclosan for registered pesticide products. Environmental fate studies show persistence in soil and water with potential bioaccumulation.",
      },
      {
        sourceName: "Environmental Health Perspectives",
        sourceType: "Peer-Reviewed Research",
        finding:
          "Studies associate triclosan exposure with endocrine disruption, including interference with thyroid hormone metabolism. Detection in human breast milk raises concerns about developmental exposure.",
      },
    ],
    regulatory: {
      status: "banned",
      authority: "FDA / EPA",
      details:
        "Banned in consumer antiseptic wash products by FDA (2016 Final Rule). Still permitted in some household cleaning products and industrial applications. EU has restricted use in various product categories. Minnesota banned triclosan in consumer products (2017).",
    },
    productContext: {
      productName: "CleanHome Floor Cleaner",
      productBrand: "CleanHome",
      position: "3rd ingredient",
      functionInProduct: "Antimicrobial cleaning agent",
      additionalNotes:
        "While triclosan is banned in consumer hand soaps, it remains permitted in some household cleaning applications. However, regular cleaning without antimicrobial agents is generally sufficient for household needs.",
    },
    dataQuality: {
      level: "high",
      explanation:
        "Assessment based on FDA regulatory action, EPA environmental reviews, and extensive peer-reviewed research on endocrine disruption and antibiotic resistance.",
    },
    relatedIngredients: [
      {
        id: "benzalkonium-chloride",
        name: "Benzalkonium Chloride",
        function: "Antimicrobial Agent",
        assessment: "moderate",
      },
      {
        id: "ethanol",
        name: "Ethanol",
        function: "Antimicrobial Agent",
        assessment: "low",
      },
    ],
  },
};

export function lookupIngredient(id: string): IngredientDetail | null {
  return MOCK_INGREDIENTS[id.trim()] ?? null;
}

export function getIngredientsByAssessment(
  assessment: AssessmentLevel,
): RelatedIngredient[] {
  return Object.values(MOCK_INGREDIENTS)
    .filter((ing) => ing.assessment === assessment)
    .map((ing) => ({
      id: ing.id,
      name: ing.name,
      function: ing.functionLabel,
      assessment: ing.assessment,
    }));
}
