export type NutritionLabels = {
  header: {
    title: string;
    subtitle: string;
    backToAnalysis: string;
  };
  product: {
    servingSize: string;
    scanDate: string;
  };
  summary: {
    title: string;
    notAvailable: string;
  };
  breakdown: {
    title: string;
    nutrient: string;
    amount: string;
    perServing: string;
  };
  serving: {
    title: string;
    servingSize: string;
    servingsPerContainer: string;
    notAvailable: string;
  };
  attention: {
    title: string;
    severityLow: string;
    severityModerate: string;
    severityHigh: string;
  };
  positive: {
    title: string;
    noPositivePoints: string;
  };
  context: {
    title: string;
  };
  comparison: {
    title: string;
    selectProduct: string;
    noProducts: string;
    difference: string;
    higher: string;
    lower: string;
    same: string;
  };
  dataQuality: {
    title: string;
    high: string;
    medium: string;
    low: string;
  };
  source: {
    title: string;
    viewDetails: string;
  };
  actions: {
    backToAnalysis: string;
    compareProducts: string;
    searchAlternatives: string;
    scanAnother: string;
  };
};

const en: NutritionLabels = {
  header: {
    title: "Nutrition Details",
    subtitle: "Understand the nutritional profile of this product.",
    backToAnalysis: "Back to Product Analysis",
  },
  product: {
    servingSize: "Serving Size",
    scanDate: "Scanned",
  },
  summary: {
    title: "Nutrition Overview",
    notAvailable: "Not available",
  },
  breakdown: {
    title: "Detailed Nutrition",
    nutrient: "Nutrient",
    amount: "Amount",
    perServing: "per serving",
  },
  serving: {
    title: "Serving Information",
    servingSize: "Serving Size",
    servingsPerContainer: "Servings Per Container",
    notAvailable: "Serving information not available",
  },
  attention: {
    title: "Attention Areas",
    severityLow: "Worth noting",
    severityModerate: "Deserves attention",
    severityHigh: "Significant",
  },
  positive: {
    title: "Positive Points",
    noPositivePoints: "No specific nutrition highlights identified from the available data.",
  },
  context: {
    title: "What Does This Mean?",
  },
  comparison: {
    title: "Compare Nutrition",
    selectProduct: "Select a product to compare",
    noProducts: "No other products available for comparison",
    difference: "Difference",
    higher: "Higher",
    lower: "Lower",
    same: "Same",
  },
  dataQuality: {
    title: "Data Quality",
    high: "High",
    medium: "Medium",
    low: "Low",
  },
  source: {
    title: "Nutrition Source",
    viewDetails: "View Details",
  },
  actions: {
    backToAnalysis: "Back to Product Analysis",
    compareProducts: "Compare Products",
    searchAlternatives: "Search Alternatives",
    scanAnother: "Scan Another Product",
  },
};

const hi: NutritionLabels = {
  header: {
    title: "पोषण विवरण",
    subtitle: "इस उत्पाद की पोषण प्रोफ़ाइल को समझें।",
    backToAnalysis: "उत्पाद विश्लेषण पर वापस जाएं",
  },
  product: {
    servingSize: "सर्विंग साइज",
    scanDate: "स्कैन किया गया",
  },
  summary: {
    title: "पोषण अवलोकन",
    notAvailable: "उपलब्ध नहीं",
  },
  breakdown: {
    title: "विस्तृत पोषण",
    nutrient: "पोषक तत्व",
    amount: "मात्रा",
    perServing: "प्रति सर्विंग",
  },
  serving: {
    title: "सर्विंग जानकारी",
    servingSize: "सर्विंग साइज",
    servingsPerContainer: "कंटेनर में सर्विंग",
    notAvailable: "सर्विंग जानकारी उपलब्ध नहीं",
  },
  attention: {
    title: "ध्यान देने योग्य क्षेत्र",
    severityLow: "ध्यान देने योग्य",
    severityModerate: "ध्यान देना चाहिए",
    severityHigh: "महत्वपूर्ण",
  },
  positive: {
    title: "सकारात्मक बिंदु",
    noPositivePoints: "उपलब्ध डेटा से पोषण संबंधी कोई विशिष्ट सकारात्मक बिंदु पहचाना नहीं गया।",
  },
  context: {
    title: "इसका क्या अर्थ है?",
  },
  comparison: {
    title: "पोषण की तुलना करें",
    selectProduct: "तुलना के लिए उत्पाद चुनें",
    noProducts: "तुलना के लिए कोई अन्य उत्पाद उपलब्ध नहीं",
    difference: "अंतर",
    higher: "अधिक",
    lower: "कम",
    same: "समान",
  },
  dataQuality: {
    title: "डेटा गुणवत्ता",
    high: "उच्च",
    medium: "मध्यम",
    low: "कम",
  },
  source: {
    title: "पोषण स्रोत",
    viewDetails: "विवरण देखें",
  },
  actions: {
    backToAnalysis: "उत्पाद विश्लेषण पर वापस जाएं",
    compareProducts: "उत्पादों की तुलना करें",
    searchAlternatives: "विकल्प खोजें",
    scanAnother: "अन्य उत्पाद स्कैन करें",
  },
};

const labelsMap: Record<string, NutritionLabels> = { en, hi };

export function getNutritionLabels(lang: string): NutritionLabels {
  return labelsMap[lang] ?? en;
}
