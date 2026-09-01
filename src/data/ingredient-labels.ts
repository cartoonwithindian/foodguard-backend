export type IngredientLabels = {
  header: {
    title: string;
    backToAnalysis: string;
  };
  overview: {
    categoryLabel: string;
  };
  whatIsIt: {
    title: string;
    learnMore: string;
  };
  whyUsed: {
    title: string;
  };
  assessment: {
    title: string;
    description: string;
    factorsTitle: string;
    low: string;
    lowDescription: string;
    moderate: string;
    moderateDescription: string;
    high: string;
    highDescription: string;
    insufficient: string;
    insufficientDescription: string;
  };
  evidence: {
    title: string;
    sourceType: string;
    finding: string;
    viewSource: string;
  };
  regulatory: {
    title: string;
    statusLabel: string;
    authorityLabel: string;
    statusPermitted: string;
    statusRestricted: string;
    statusBanned: string;
    statusUnderReview: string;
    statusUnknown: string;
    noInfo: string;
    noInfoDescription: string;
  };
  productContext: {
    title: string;
    productName: string;
    position: string;
    functionLabel: string;
    notes: string;
  };
  dataQuality: {
    title: string;
    high: string;
    highDescription: string;
    medium: string;
    mediumDescription: string;
    low: string;
    lowDescription: string;
  };
  related: {
    title: string;
    function: string;
    assessment: string;
  };
  actions: {
    backToAnalysis: string;
    searchProducts: string;
  };
};

const en: IngredientLabels = {
  header: {
    title: "Ingredient Details",
    backToAnalysis: "Back to Product Analysis",
  },
  overview: {
    categoryLabel: "Category",
  },
  whatIsIt: {
    title: "What is this ingredient?",
    learnMore: "Learn More",
  },
  whyUsed: {
    title: "Why is it used?",
  },
  assessment: {
    title: "Why did we flag this ingredient?",
    description: "This ingredient was assessed based on the available evidence and its use in the analyzed product.",
    factorsTitle: "Factors considered",
    low: "Low Concern",
    lowDescription: "Available evidence indicates this ingredient has a well-established safety profile with minimal concerns at typical usage levels.",
    moderate: "Moderate Attention",
    moderateDescription: "Available evidence suggests this ingredient may deserve attention due to certain documented characteristics or ongoing scientific review.",
    high: "High Attention",
    highDescription: "Available evidence indicates this ingredient has documented concerns that warrant attention, particularly for certain populations or usage patterns.",
    insufficient: "Insufficient Evidence",
    insufficientDescription: "There is not enough available data to provide a comprehensive assessment. The ingredient may be safe, but evidence is limited.",
  },
  evidence: {
    title: "Evidence",
    sourceType: "Source Type",
    finding: "Relevant Finding",
    viewSource: "View Source",
  },
  regulatory: {
    title: "Regulatory Information",
    statusLabel: "Status",
    authorityLabel: "Authority",
    statusPermitted: "Permitted",
    statusRestricted: "Restricted",
    statusBanned: "Banned",
    statusUnderReview: "Under Review",
    statusUnknown: "Unknown",
    noInfo: "Insufficient Information",
    noInfoDescription: "Reliable regulatory information for this ingredient is not currently available in our database.",
  },
  productContext: {
    title: "In This Product",
    productName: "Product",
    position: "Ingredient Position",
    functionLabel: "Function",
    notes: "Additional Notes",
  },
  dataQuality: {
    title: "Data Quality",
    high: "High",
    highDescription: "Assessment based on extensive peer-reviewed research and regulatory reviews.",
    medium: "Medium",
    mediumDescription: "Assessment based on available evidence, though some data gaps may exist.",
    low: "Low",
    lowDescription: "Assessment based on limited data. The assessment may be less certain.",
  },
  related: {
    title: "Related Ingredients",
    function: "Function",
    assessment: "Assessment",
  },
  actions: {
    backToAnalysis: "Back to Product Analysis",
    searchProducts: "Search Products",
  },
};

const hi: IngredientLabels = {
  header: {
    title: "सामग्री विवरण",
    backToAnalysis: "उत्पाद विश्लेषण पर वापस जाएं",
  },
  overview: {
    categoryLabel: "श्रेणी",
  },
  whatIsIt: {
    title: "यह सामग्री क्या है?",
    learnMore: "और जानें",
  },
  whyUsed: {
    title: "इसका उपयोग क्यों किया जाता है?",
  },
  assessment: {
    title: "हमने इस सामग्री को क्यों चिन्हित किया?",
    description: "यह सामग्री उपलब्ध प्रमाण और विश्लेषित उत्पाद में इसके उपयोग के आधार पर मूल्यांकित की गई थी।",
    factorsTitle: "विचार किए गए कारक",
    low: "कम चिंता",
    lowDescription: "उपलब्ध प्रमाण इंगित करता है कि इस सामग्री की एक स्थापित सुरक्षा प्रोफ़ाइल है।",
    moderate: "मध्यम ध्यान",
    moderateDescription: "उपलब्ध प्रमाण सुझाव देता है कि इस सामग्री पर ध्यान देने की आवश्यकता हो सकती है।",
    high: "उच्च ध्यान",
    highDescription: "उपलब्ध प्रमाण इंगित करता है कि इस सामग्री में चिन्हित चिंताएं हैं।",
    insufficient: "अपर्याप्त प्रमाण",
    insufficientDescription: "व्यापक मूल्यांकन प्रदान करने के लिए पर्याप्त डेटा उपलब्ध नहीं है।",
  },
  evidence: {
    title: "प्रमाण",
    sourceType: "स्रोत प्रकार",
    finding: "प्रासंगिक निष्कर्ष",
    viewSource: "स्रोत देखें",
  },
  regulatory: {
    title: "नियामक जानकारी",
    statusLabel: "स्थिति",
    authorityLabel: "प्राधिकरण",
    statusPermitted: "अनुमत",
    statusRestricted: "प्रतिबंधित",
    statusBanned: "प्रतिबंधित",
    statusUnderReview: "समीक्षा के अधीन",
    statusUnknown: "अज्ञात",
    noInfo: "अपर्याप्त जानकारी",
    noInfoDescription: "इस सामग्री के लिए विश्वसनीय नियामक जानकारी वर्तमान में उपलब्ध नहीं है।",
  },
  productContext: {
    title: "इस उत्पाद में",
    productName: "उत्पाद",
    position: "सामग्री स्थिति",
    functionLabel: "कार्य",
    notes: "अतिरिक्त नोट",
  },
  dataQuality: {
    title: "डेटा गुणवत्ता",
    high: "उच्च",
    highDescription: "व्यापक शोध-समीक्षित शोध और नियामक समीक्षाओं पर आधारित मूल्यांकन।",
    medium: "मध्यम",
    mediumDescription: "उपलब्ध प्रमाण पर आधारित मूल्यांकन, हालांकि कुछ डेटा अंतर हो सकते हैं।",
    low: "कम",
    lowDescription: "सीमित डेटा पर आधारित मूल्यांकन। मूल्यांकन कम निश्चित हो सकता है।",
  },
  related: {
    title: "संबंधित सामग्री",
    function: "कार्य",
    assessment: "मूल्यांकन",
  },
  actions: {
    backToAnalysis: "उत्पाद विश्लेषण पर वापस जाएं",
    searchProducts: "उत्पाद खोजें",
  },
};

const labelsMap: Record<string, IngredientLabels> = { en, hi };

export function getIngredientLabels(lang: string): IngredientLabels {
  return labelsMap[lang] ?? en;
}
