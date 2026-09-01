export type SearchLabels = {
  header: {
    title: string;
    subtitle: string;
    backButton: string;
  };
  search: {
    placeholder: string;
    clearButton: string;
    searchButton: string;
  };
  inputType: {
    productLabel: string;
    ingredientLabel: string;
    ingredientListLabel: string;
    detectedAs: string;
  };
  suggestions: {
    title: string;
    items: string[];
  };
  categories: {
    all: string;
    food: string;
    cosmetics: string;
    personalCare: string;
    household: string;
    healthcare: string;
  };
  filters: {
    button: string;
    title: string;
    category: string;
    ingredientPreferences: string;
    concernLevel: string;
    nutritionPreferences: string;
    applyButton: string;
    clearAll: string;
    all: string;
    low: string;
    moderate: string;
    high: string;
  };
  criteria: {
    title: string;
    subtitle: string;
    findButton: string;
    avoidPlaceholder: string;
    preferPlaceholder: string;
    customPlaceholder: string;
  };
  results: {
    title: string;
    count: string;
    matchLabel: string;
    whyMatch: string;
    whyMatchDetail: string;
    matchedIngredients: string;
    missingIngredients: string;
    viewAnalysis: string;
    compare: string;
    compared: string;
    sortBy: string;
    sortMatch: string;
    sortConcernLow: string;
    sortConcernHigh: string;
    sortRelevance: string;
    sortNewest: string;
    sortNameAsc: string;
    sortNameDesc: string;
    sortRating: string;
    sortBrand: string;
    fromCache: string;
    loadMore: string;
    offlineBanner: string;
  };
  alternatives: {
    title: string;
    description: string;
    disclaimer: string;
    whyShown: string;
  };
  comparison: {
    title: string;
    subtitle: string;
    backButton: string;
    selectPrompt: string;
    compareButton: string;
    clearButton: string;
    nutrition: string;
    ingredients: string;
    assessment: string;
    evidence: string;
    positivePoints: string;
    attentionPoints: string;
    ingredientDifferences: string;
    servingSize: string;
    calories: string;
    sugar: string;
    sodium: string;
    saturatedFat: string;
    protein: string;
    fibre: string;
    sharedIngredients: string;
    uniqueToProduct: string;
  };
  recent: {
    title: string;
    clearButton: string;
  };
  popular: {
    title: string;
  };
  empty: {
    title: string;
    description: string;
    clearFilters: string;
    searchAgain: string;
    tryName: string;
    scan: string;
  };
  initial: {
    title: string;
    categoryTitle: string;
    popularTitle: string;
  };
  loading: {
    message: string;
  };
  transparency: {
    title: string;
    description: string;
  };
  ingredientSearch: {
    title: string;
    description: string;
    contextMessage: string;
  };
};

const en: SearchLabels = {
  header: {
    title: "Product Search",
    subtitle:
      "Find products and compare them based on ingredients, nutrition, and your preferences.",
    backButton: "Back",
  },
  search: {
    placeholder: "Search product, ingredient, or paste ingredient list...",
    clearButton: "Clear",
    searchButton: "Search",
  },
  inputType: {
    productLabel: "Product Name",
    ingredientLabel: "Ingredient",
    ingredientListLabel: "Ingredient List",
    detectedAs: "Detected as",
  },
  suggestions: {
    title: "Try searching for",
    items: [
      "Low sugar products",
      "Fragrance-free skincare",
      "High protein foods",
      "Products without artificial colors",
      "Sensitive skin products",
    ],
  },
  categories: {
    all: "All",
    food: "Food & Beverage",
    cosmetics: "Cosmetics & Skincare",
    personalCare: "Personal Care",
    household: "Household",
    healthcare: "Healthcare",
  },
  filters: {
    button: "Filters",
    title: "Filters",
    category: "Product Category",
    ingredientPreferences: "Ingredient Preferences",
    concernLevel: "Concern Level",
    nutritionPreferences: "Nutrition Preferences",
    applyButton: "Apply Filters",
    clearAll: "Clear All",
    all: "All",
    low: "Low Concern",
    moderate: "Moderate Concern",
    high: "High Concern",
  },
  criteria: {
    title: "What are you looking for?",
    subtitle: "Select your criteria to find products that match your needs.",
    findButton: "Find Alternatives",
    avoidPlaceholder: "Enter ingredient to avoid (e.g. MSG, Aspartame)",
    preferPlaceholder: "Enter ingredient to prefer (e.g. Aloe Vera, Ceramides)",
    customPlaceholder: "Describe your criteria...",
  },
  results: {
    title: "Results for",
    count: "{count} products found",
    matchLabel: "Ingredient Match",
    whyMatch: "Why this match?",
    whyMatchDetail: "Why is this shown?",
    matchedIngredients: "Matched ingredients",
    missingIngredients: "Missing ingredients",
    viewAnalysis: "View Analysis",
    compare: "Compare",
    compared: "Selected",
    sortBy: "Sort by",
    sortMatch: "Best Ingredient Match",
    sortConcernLow: "Lowest Concern",
    sortConcernHigh: "Highest Concern",
    sortRelevance: "Relevance",
    sortNewest: "Newest",
    sortNameAsc: "Name (A–Z)",
    sortNameDesc: "Name (Z–A)",
    sortRating: "Top rated",
    sortBrand: "Brand (A–Z)",
    fromCache: "Showing saved results — refreshing in the background.",
    loadMore: "Load more",
    offlineBanner: "You're offline — showing saved results when available.",
  },
  alternatives: {
    title: "Alternative Products",
    description:
      "These products are shown because they match the criteria you selected. They are not automatically recommended or endorsed.",
    disclaimer:
      "Results are based on ingredient and nutrition matching. We do not promote specific brands.",
    whyShown: "Why is this shown?",
  },
  comparison: {
    title: "Product Comparison",
    subtitle: "Compare selected products side by side.",
    backButton: "Back to Results",
    selectPrompt: "Select products to compare",
    compareButton: "Compare Selected",
    clearButton: "Clear Selection",
    nutrition: "Nutrition",
    ingredients: "Ingredients",
    assessment: "Assessment",
    evidence: "Evidence",
    positivePoints: "Positive Points",
    attentionPoints: "Attention Points",
    ingredientDifferences: "Ingredient Differences",
    servingSize: "Serving Size",
    calories: "Calories",
    sugar: "Sugar",
    sodium: "Sodium",
    saturatedFat: "Saturated Fat",
    protein: "Protein",
    fibre: "Fibre",
    sharedIngredients: "Shared Ingredients",
    uniqueToProduct: "Unique to this product",
  },
  recent: {
    title: "Recent Searches",
    clearButton: "Clear History",
  },
  popular: {
    title: "Popular Searches",
  },
  empty: {
    title: "No Matching Products Found",
    description:
      "Try changing your criteria or searching for a broader product category.",
    clearFilters: "Modify Criteria",
    searchAgain: "New Search",
    tryName: "Try searching by product name",
    scan: "Scan a barcode instead",
  },
  initial: {
    title: "What are you looking for?",
    categoryTitle: "Browse by Category",
    popularTitle: "Popular Searches",
  },
  loading: {
    message: "Finding matching products...",
  },
  transparency: {
    title: "How results are ranked",
    description:
      "Products are ranked based on ingredient and preference matching. We do not promote products based on paid placement.",
  },
  ingredientSearch: {
    title: "Searching by ingredients",
    description: "Finding products containing similar ingredients...",
    contextMessage: "Searching based on your copied ingredient list",
  },
};

const hi: SearchLabels = {
  header: {
    title: "उत्पाद खोज",
    subtitle:
      "सामग्री, पोषण और अपनी प्राथमिकताओं के आधार पर उत्पाद खोजें और तुलना करें।",
    backButton: "वापस",
  },
  search: {
    placeholder: "उत्पाद, सामग्री खोजें, या सामग्री सूची पेस्ट करें...",
    clearButton: "साफ करें",
    searchButton: "खोजें",
  },
  inputType: {
    productLabel: "उत्पाद का नाम",
    ingredientLabel: "सामग्री",
    ingredientListLabel: "सामग्री सूची",
    detectedAs: "पहचाना गया",
  },
  suggestions: {
    title: "खोजने का प्रयास करें",
    items: [
      "कम चीनी वाले उत्पाद",
      "सुगंध-मुक्त स्किनकेयर",
      "उच्च प्रोटीन वाले खाद्य पदार्थ",
      "कृत्रिम रंगों के बिना उत्पाद",
      "संवेदनशील त्वचा उत्पाद",
    ],
  },
  categories: {
    all: "सभी",
    food: "भोजन और पेय",
    cosmetics: "सौंदर्य और त्वचा देखभाल",
    personalCare: "व्यक्तिगत देखभाल",
    household: "घरेलू",
    healthcare: "स्वास्थ्य देखभाल",
  },
  filters: {
    button: "फ़िल्टर",
    title: "फ़िल्टर",
    category: "उत्पाद श्रेणी",
    ingredientPreferences: "सामग्री प्राथमिकताएं",
    concernLevel: "चिंता स्तर",
    nutritionPreferences: "पोषण प्राथमिकताएं",
    applyButton: "फ़िल्टर लागू करें",
    clearAll: "सभी साफ करें",
    all: "सभी",
    low: "कम चिंता",
    moderate: "मध्यम चिंता",
    high: "उच्च चिंता",
  },
  criteria: {
    title: "आप क्या खोज रहे हैं?",
    subtitle: "अपनी आवश्यकताओं से मेल खाने वाले उत्पाद खोजने के लिए मानदंड चुनें।",
    findButton: "विकल्प खोजें",
    avoidPlaceholder: "बचने के लिए सामग्री दर्ज करें (जैसे MSG, Aspartame)",
    preferPlaceholder: "प्राथमिकता वाली सामग्री दर्ज करें (जैसे Aloe Vera, Ceramides)",
    customPlaceholder: "अपना मानदंड वर्णित करें...",
  },
  results: {
    title: "परिणाम",
    count: "{count} उत्पाद मिले",
    matchLabel: "सामग्री मैच",
    whyMatch: "यह मैच क्यों?",
    whyMatchDetail: "यह क्यों दिखाया गया?",
    matchedIngredients: "मैच की गई सामग्री",
    missingIngredients: "गायब सामग्री",
    viewAnalysis: "विश्लेषण देखें",
    compare: "तुलना करें",
    compared: "चयनित",
    sortBy: "क्रमबद्ध करें",
    sortMatch: "सर्वोत्तम सामग्री मैच",
    sortConcernLow: "न्यूनतम चिंता",
    sortConcernHigh: "अधिकतम चिंता",
    sortRelevance: "प्रासंगिकता",
    sortNewest: "नवीनतम",
    sortNameAsc: "नाम (A–Z)",
    sortNameDesc: "नाम (Z–A)",
    sortRating: "उच्च रेटिंग",
    sortBrand: "ब्रांड (A–Z)",
    fromCache: "सहेजे गए परिणाम दिखाए जा रहे हैं — पृष्ठभूमि में ताज़ा किया जा रहा है।",
    loadMore: "और लोड करें",
    offlineBanner: "आप ऑफ़लाइन हैं — सहेजे गए परिणाम दिखाए जा रहे हैं।",
  },
  alternatives: {
    title: "वैकल्पिक उत्पाद",
    description:
      "ये उत्पाद इसलिए दिखाए गए हैं क्योंकि वे आपके चयनित मानदंडों से मेल खाते हैं। इन्हें स्वचालित रूप से अनुशंसित या समर्थित नहीं किया जाता।",
    disclaimer:
      "परिणाम सामग्री और पोषण मिलान पर आधारित हैं। हम किसी विशिष्ट ब्रांड को बढ़ावा नहीं देते।",
    whyShown: "यह क्यों दिखाया गया?",
  },
  comparison: {
    title: "उत्पाद तुलना",
    subtitle: "चयनित उत्पादों की साथ-साथ तुलना करें।",
    backButton: "परिणामों पर वापस",
    selectPrompt: "तुलना के लिए उत्पाद चुनें",
    compareButton: "चयनित की तुलना करें",
    clearButton: "चयन साफ करें",
    nutrition: "पोषण",
    ingredients: "सामग्री",
    assessment: "मूल्यांकन",
    evidence: "प्रमाण",
    positivePoints: "सकारात्मक बिंदु",
    attentionPoints: "ध्यान देने योग्य बिंदु",
    ingredientDifferences: "सामग्री अंतर",
    servingSize: "सर्विंग साइज",
    calories: "कैलोरी",
    sugar: "चीनी",
    sodium: "सोडियम",
    saturatedFat: "संतृप्त वसा",
    protein: "प्रोटीन",
    fibre: "फाइबर",
    sharedIngredients: "साझा सामग्री",
    uniqueToProduct: "इस उत्पाद में विशिष्ट",
  },
  recent: {
    title: "हाल की खोजें",
    clearButton: "इतिहास साफ करें",
  },
  popular: {
    title: "लोकप्रिय खोजें",
  },
  empty: {
    title: "कोई मिलता-जुलता उत्पाद नहीं मिला",
    description:
      "अपने मानदंड बदलने या व्यापक उत्पाद श्रेणी खोजने का प्रयास करें।",
    clearFilters: "मानदंड संशोधित करें",
    searchAgain: "नई खोज",
    tryName: "उत्पाद नाम से खोजने का प्रयास करें",
    scan: "इसके बजाय बारकोड स्कैन करें",
  },
  initial: {
    title: "आप क्या खोज रहे हैं?",
    categoryTitle: "श्रेणी के अनुसार ब्राउज़ करें",
    popularTitle: "लोकप्रिय खोजें",
  },
  loading: {
    message: "मिलते-जुलते उत्पाद खोजे जा रहे हैं...",
  },
  transparency: {
    title: "परिणाम कैसे रैंक किए जाते हैं",
    description:
      "उत्पाद सामग्री और प्राथमिकता मिलान के आधार पर रैंक किए जाते हैं। हम भुगतान किए गए प्लेसमेंट के आधार पर उत्पादों को बढ़ावा नहीं देते।",
  },
  ingredientSearch: {
    title: "सामग्री से खोज रहे हैं",
    description: "समान सामग्री वाले उत्पाद खोजे जा रहे हैं...",
    contextMessage: "आपकी कॉपी की गई सामग्री सूची के आधार पर खोज रहे हैं",
  },
};

const labelsMap: Record<string, SearchLabels> = { en, hi };

export function getSearchLabels(lang: string): SearchLabels {
  return labelsMap[lang] ?? en;
}
