export type AnalysisLabels = {
  header: {
    title: string;
    backButton: string;
    scanDate: string;
  };
  assessment: {
    low: string;
    lowDescription: string;
    moderate: string;
    moderateDescription: string;
    high: string;
    highDescription: string;
    insufficient: string;
    insufficientDescription: string;
  };
  positive: {
    title: string;
  };
  attention: {
    title: string;
  };
  ingredients: {
    title: string;
    function: string;
    assessment: string;
    explanation: string;
    evidence: string;
    source: string;
    viewDetails: string;
  };
  nutrition: {
    title: string;
    calories: string;
    sugar: string;
    sodium: string;
    saturatedFat: string;
    totalFat: string;
    salt: string;
    protein: string;
    fibre: string;
    servingSize: string;
  };
  evidence: {
    title: string;
    sourceType: string;
    summary: string;
    viewSource: string;
  };
  alternatives: {
    title: string;
    description: string;
    copyButton: string;
    copied: string;
    pasteNote: string;
  };
  regulatory: {
    title: string;
    overallStatus: string;
    additives: string;
    labelling: string;
    claims: string;
    contaminants: string;
    packaging: string;
    viewSource: string;
    regulation: string;
    section: string;
    table: string;
    document: string;
    permitted: string;
    conditions: string;
    maximumLevel: string;
    unit: string;
    noData: string;
    referenceLimit: string;
    needsReview: string;
  };
  disclaimer: string;
  actions: {
    saveHistory: string;
    scanAnother: string;
    searchProducts: string;
    reportIssue: string;
  };
  loading: {
    title: string;
    description: string;
    stages: string[];
  };
  error: {
    title: string;
    description: string;
    tryAgain: string;
    viewIngredients: string;
  };
};

const en: AnalysisLabels = {
  header: {
    title: "Product Analysis",
    backButton: "Back",
    scanDate: "Scanned",
  },
  assessment: {
    low: "Low Concern",
    lowDescription:
      "No major concerns were identified. This product has a relatively clean ingredient profile with recognizable ingredients.",
    moderate: "Moderate Attention",
    moderateDescription:
      "Some aspects of this product deserve closer attention based on its ingredient and nutrition profile.",
    high: "High Attention",
    highDescription:
      "Some verified ingredient or nutrition findings deserve closer review. This informational score is not medical advice.",
    insufficient: "Insufficient Evidence",
    insufficientDescription:
      "There is not enough available data to provide a comprehensive assessment. Consider researching individual ingredients.",
  },
  positive: {
    title: "Positive Points",
  },
  attention: {
    title: "Attention Points",
  },
  ingredients: {
    title: "Ingredient Analysis",
    function: "Function",
    assessment: "Assessment",
    explanation: "Explanation",
    evidence: "Evidence",
    source: "Source",
    viewDetails: "View Details",
  },
  nutrition: {
    title: "Nutrition Analysis",
    calories: "Calories",
    sugar: "Sugar",
    sodium: "Sodium",
    saturatedFat: "Saturated Fat",
    totalFat: "Total Fat",
    salt: "Salt",
    protein: "Protein",
    fibre: "Fibre",
    servingSize: "Serving Size",
  },
  evidence: {
    title: "Evidence & Sources",
    sourceType: "Source Type",
    summary: "Summary",
    viewSource: "View Source",
  },
  alternatives: {
    title: "Alternative Ingredient Suggestions",
    description:
      "Look for these characteristics when comparing products. We do not promote specific brands.",
    copyButton: "Copy Ingredients",
    copied: "Copied",
    pasteNote:
      "You can paste this ingredient list into our search bar to find alternative products.",
  },
  regulatory: {
    title: "\ud83c\uddee\ud83c\uddf3 FSSAI / India Regulatory Check",
    overallStatus: "Overall Status",
    additives: "Additives & Preservatives",
    labelling: "Labelling",
    claims: "Claims",
    contaminants: "Contaminants",
    packaging: "Packaging",
    viewSource: "View FSSAI source",
    regulation: "Regulation",
    section: "Section",
    table: "Table",
    document: "Document",
    permitted: "Permitted",
    conditions: "Conditions",
    maximumLevel: "Maximum permitted level",
    unit: "Unit",
    noData: "No regulatory reference data available for this scan.",
    referenceLimit: "FSSAI reference limit available. No laboratory measurement from this scan.",
    needsReview: "This item requires human review.",
  },
  disclaimer:
    "Important: This analysis is for informational purposes only and is not medical advice. Individual responses to ingredients may vary.",
  actions: {
    saveHistory: "Save to History",
    scanAnother: "Scan Another Product",
    searchProducts: "Search Products",
    reportIssue: "Get Help Reporting",
  },
  loading: {
    title: "Analyzing Product",
    description: "Reviewing ingredients and product information...",
    stages: [
      "Reading ingredients",
      "Checking ingredient information",
      "Personalizing insights",
      "Preparing analysis",
    ],
  },
  error: {
    title: "Analysis Unavailable",
    description:
      "We couldn't complete the analysis right now. Please try again or review the ingredient list manually.",
    tryAgain: "Try Again",
    viewIngredients: "View Ingredients",
  },
};

const hi: AnalysisLabels = {
  header: {
    title: "उत्पाद विश्लेषण",
    backButton: "वापस",
    scanDate: "स्कैन किया गया",
  },
  assessment: {
    low: "कम चिंता",
    lowDescription:
      "कोई प्रमुख चिंता नहीं मिली। इस उत्पाद में पहचाने जाने योग्य सामग्रियां हैं।",
    moderate: "मध्यम ध्यान",
    moderateDescription:
      "इस उत्पाद के कुछ पहलू इसकी सामग्री और पोषण प्रोफ़ाइल के आधार पर करीबी ध्यान देने योग्य हैं।",
    high: "उच्च ध्यान",
    highDescription:
      "कुछ प्रमाणित सामग्री या पोषण निष्कर्षों की समीक्षा की जा सकती है। यह सूचनात्मक स्कोर चिकित्सा सलाह नहीं है।",
    insufficient: "अपर्याप्त प्रमाण",
    insufficientDescription:
      "व्यापक मूल्यांकन प्रदान करने के लिए पर्याप्त डेटा उपलब्ध नहीं है।",
  },
  positive: {
    title: "सकारात्मक बिंदु",
  },
  attention: {
    title: "ध्यान देने योग्य बिंदु",
  },
  ingredients: {
    title: "सामग्री विश्लेषण",
    function: "कार्य",
    assessment: "मूल्यांकन",
    explanation: "व्याख्या",
    evidence: "प्रमाण",
    source: "स्रोत",
    viewDetails: "विवरण देखें",
  },
  nutrition: {
    title: "पोषण विश्लेषण",
    calories: "कैलोरी",
    sugar: "चीनी",
    sodium: "सोडियम",
    saturatedFat: "संतृप्त वसा",
    totalFat: "कुल वसा",
    salt: "नमक",
    protein: "प्रोटीन",
    fibre: "फाइबर",
    servingSize: "सर्विंग साइज",
  },
  evidence: {
    title: "प्रमाण और स्रोत",
    sourceType: "स्रोत प्रकार",
    summary: "सारांश",
    viewSource: "स्रोत देखें",
  },
  alternatives: {
    title: "वैकल्पिक सामग्री सुझाव",
    description:
      "उत्पादों की तुलना करते समय इन विशेषताओं को देखें। हम किसी विशिष्ट ब्रांड को बढ़ावा नहीं देते।",
    copyButton: "सामग्री कॉपी करें",
    copied: "कॉपी किया गया",
    pasteNote:
      "वैकल्पिक उत्पाद खोजने के लिए आप इस सामग्री सूची को हमारे सर्च बार में पेस्ट कर सकते हैं।",
  },
  regulatory: {
    title: "\ud83c\uddee\ud83c\uddf3 FSSAI / \u092d\u093e\u0930\u0924\u0940\u092f \u0935\u0948\u091c\u093e\u0928",
    overallStatus: "\u0938\u092e\u0917\u094d\u0930 \u0938\u094d\u0925\u093f\u0924\u093f",
    additives: "\u0907\u0928\u094d\u0927\u094b\u092c\u0915 \u0914\u0930 \u092a\u0930\u093f\u0930\u0915\u094d\u0937\u0915",
    labelling: "\u0932\u0947\u092c\u0932\u093f\u0902\u0917",
    claims: "\u0926\u093e\u0935\u093e\u090f\u0901",
    contaminants: "\u092a\u094d\u0930\u0926\u0942\u0937\u093f\u0924 \u092a\u0926\u093e\u0930\u0925",
    packaging: "\u092a\u0948\u0915\u0947\u091c\u093f\u0902\u0917",
    viewSource: "FSSAI \u0938\u094d\u0930\u094b\u0924 \u0926\u0947\u0916\u0947\u0902",
    regulation: "\u0928\u093f\u092f\u092e",
    section: "\u0905\u0927\u094d\u092f\u093e\u092f",
    table: "\u0935\u094d\u0930\u094b\u0915\u094d\u0937\u092e\u092a",
    document: "\u0926\u0938\u094d\u0924\u093e\u0935\u0947\u091c",
    permitted: "\u0905\u0928\u0941\u092e\u0924",
    conditions: "\u0936\u0930\u094d\u0924\u0947\u090f\u0901",
    maximumLevel: "\u0905\u0927\u093f\u0915\u0924\u092e \u092c\u092e\u0928 \u0938\u094d\u0925\u093f\u0924",
    unit: "\u0907\u0915\u093e\u0908",
    noData: "\u0907\u0938 \u0938\u094d\u0915\u0948\u0928 \u0915\u0947 \u0932\u093f\u090f \u092a\u093e\u0930\u092e\u093e\u0928\u0915 \u0938\u0902\u0926\u0930\u094d\u092d \u0921\u0947\u091f\u093e \u0909\u092a\u0932\u092c\u094d\u0927 \u0928\u0939\u0940\u0902 \u0939\u0948\u0964",
    referenceLimit: "FSSAI \u0938\u0902\u0926\u0930\u094d\u092d \u0938\u0940\u092e\u093e \u0909\u092a\u0932\u092c\u094d\u0927\u0964 \u0907\u0938 \u0938\u094d\u0915\u0948\u0928 \u0938\u0947 \u0915\u094b\u0908 \u092a\u0930\u0940\u0915\u094d\u0937\u093f\u0924 \u092e\u093e\u092a\u0928 \u0928\u0939\u0940\u0902 \u0939\u0948\u0964",
    needsReview: "\u0907\u0938 \u092e\u0947\u0902 \u092e\u0928\u0941\u0937\u094d\u092f \u0938\u092e\u0940\u0915\u094d\u0937\u093e \u0906\u0935\u0936\u094d\u092f\u0915 \u0939\u0948\u0964",
  },
  disclaimer:
    "महत्वपूर्ण: यह विश्लेषण केवल सूचना उद्देश्यों के लिए है और चिकित्सा सलाह नहीं है। सामग्रियों के प्रति व्यक्तिगत प्रतिक्रियाएं भिन्न हो सकती हैं।",
  actions: {
    saveHistory: "इतिहास में सहेजें",
    scanAnother: "अन्य उत्पाद स्कैन करें",
    searchProducts: "उत्पाद खोजें",
    reportIssue: "शिकायत में सहायता लें",
  },
  loading: {
    title: "उत्पाद का विश्लेषण हो रहा है",
    description: "सामग्री और उत्पाद जानकारी की समीक्षा हो रही है...",
    stages: [
      "सामग्री पढ़ी जा रही है",
      "सामग्री जानकारी जाँची जा रही है",
      "अंतर्दृष्टि व्यक्तिगत की जा रही है",
      "विश्लेषण तैयार किया जा रहा है",
    ],
  },
  error: {
    title: "विश्लेषण उपलब्ध नहीं है",
    description:
      "हम अभी विश्लेषण पूरा नहीं कर सके। कृपया पुनः प्रयास करें या सामग्री सूची मैन्युअल रूप से देखें।",
    tryAgain: "पुनः प्रयास करें",
    viewIngredients: "सामग्री देखें",
  },
};

const labelsMap: Record<string, AnalysisLabels> = { en, hi };

export function getAnalysisLabels(lang: string): AnalysisLabels {
  return labelsMap[lang] ?? en;
}
