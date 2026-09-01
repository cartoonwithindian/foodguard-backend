export type ScannerLabels = {
  header: {
    title: string;
    subtitle: string;
    historyButton: string;
    backButton: string;
  };
  tabs: {
    barcode: string;
    ingredients: string;
  };
  identify: {
    subtitle: string;
    scanBarcode: string;
    scanBarcodeDesc: string;
    searchName: string;
    searchNameDesc: string;
    addManually: string;
    addManuallyDesc: string;
    backButton: string;
    nameSearch: {
      title: string;
      placeholder: string;
      searchButton: string;
      searching: string;
    };
    manual: {
      title: string;
      takePhoto: string;
      uploadImage: string;
      processing: string;
      cancel: string;
      barcodeTitle: string;
      barcodePlaceholder: string;
      barcodeButton: string;
    };
    candidates: {
      title: string;
      pick: string;
      searchAgain: string;
    };
  };
  barcode: {
    viewport: {
      alignBarcode: string;
      scanningForProduct: string;
      simulateScan: string;
    };
    manual: {
      title: string;
      inputPlaceholder: string;
      searchButton: string;
      searching: string;
    };
    notFound: {
      title: string;
      description: string;
      scanIngredient: string;
      enterManually: string;
      tryAnother: string;
    };
    productFound: {
      title: string;
      analyzeButton: string;
      scanAgain: string;
    };
  };
  ingredient: {
    camera: {
      title: string;
      description: string;
      takePhoto: string;
      uploadImage: string;
    };
    paste: {
      title: string;
      inputPlaceholder: string;
      analyzeButton: string;
      analyzing: string;
      clearButton: string;
      charCount: string;
    };
  };
  category: {
    title: string;
    description: string;
    food: string;
    cosmetics: string;
    personalCare: string;
    household: string;
    healthcare: string;
    other: string;
  };
  loading: {
    identifying: string;
    analyzing: string;
  };
  error: {
    title: string;
    description: string;
    tryAgain: string;
    enterManually: string;
  };
  permission: {
    title: string;
    description: string;
    allowCamera: string;
    uploadInstead: string;
  };
  tips: {
    title: string;
    items: string[];
  };
  result: {
    safetyScore: string;
    safe: string;
    moderate: string;
    high: string;
    ingredients: string;
    warnings: string;
    noWarnings: string;
    scanAgain: string;
    saveToHistory: string;
    saved: string;
    backToScanner: string;
    category: string;
    brand: string;
    barcode: string;
  };
};

const en: ScannerLabels = {
  header: {
    title: "Scan a Product",
    subtitle:
      "Scan a barcode or capture the ingredient label to understand what's inside.",
    historyButton: "History",
    backButton: "Back",
  },
  tabs: {
    barcode: "Barcode",
    ingredients: "Ingredients",
  },
  identify: {
    subtitle: "How would you like to identify your product?",
    scanBarcode: "Scan Barcode",
    scanBarcodeDesc: "Point your camera at the product's barcode",
    searchName: "Search by Product Name",
    searchNameDesc: "Find a product by typing its name or brand",
    addManually: "Add Manually",
    addManuallyDesc: "Take a photo of the label or enter the barcode",
    backButton: "Back",
    nameSearch: {
      title: "Search for a product",
      placeholder: "Enter product name or brand...",
      searchButton: "Search",
      searching: "Searching...",
    },
    manual: {
      title: "Add product manually",
      takePhoto: "Take Product Photo",
      uploadImage: "Upload Image",
      processing: "Reading label...",
      cancel: "Cancel",
      barcodeTitle: "Enter Barcode Manually",
      barcodePlaceholder: "Enter barcode number",
      barcodeButton: "Find Product",
    },
    candidates: {
      title: "Did you mean one of these?",
      pick: "Select",
      searchAgain: "Search Again",
    },
  },
  barcode: {
    viewport: {
      alignBarcode: "Align the barcode within the frame",
      scanningForProduct: "Scanning for product...",
      simulateScan: "Simulate Scan",
    },
    manual: {
      title: "Enter barcode manually",
      inputPlaceholder: "Enter barcode number",
      searchButton: "Search Product",
      searching: "Searching...",
    },
    notFound: {
      title: "Product Not Found",
      description:
        "We couldn't find this product in our database.",
      scanIngredient: "Scan Ingredient Label",
      enterManually: "Enter Ingredients Manually",
      tryAnother: "Try Another Barcode",
    },
    productFound: {
      title: "Product Found",
      analyzeButton: "Analyze Product",
      scanAgain: "Scan Again",
    },
  },
  ingredient: {
    camera: {
      title: "Scan Ingredient Label",
      description:
        "Take a clear photo of the ingredient list. We'll extract the ingredients for analysis.",
      takePhoto: "Take Photo",
      uploadImage: "Upload Image",
    },
    paste: {
      title: "Paste Ingredients",
      inputPlaceholder: "Paste the ingredient list here...",
      analyzeButton: "Analyze Ingredients",
      analyzing: "Analyzing...",
      clearButton: "Clear",
      charCount: "characters",
    },
  },
  category: {
    title: "What type of product is this?",
    description: "Select the category that best describes this product.",
    food: "Food & Beverage",
    cosmetics: "Cosmetics & Skincare",
    personalCare: "Personal Care",
    household: "Household",
    healthcare: "Healthcare",
    other: "Other",
  },
  loading: {
    identifying: "Identifying product...",
    analyzing: "Analyzing ingredients...",
  },
  error: {
    title: "We couldn't scan that",
    description:
      "Make sure the barcode is clearly visible and try again.",
    tryAgain: "Try Again",
    enterManually: "Enter Manually",
  },
  permission: {
    title: "Camera Access Required",
    description:
      "Allow camera access to scan products and ingredient labels.",
    allowCamera: "Allow Camera",
    uploadInstead: "Upload an Image Instead",
  },
  tips: {
    title: "Scan Tips",
    items: [
      "Keep the barcode clearly visible.",
      "Avoid glare on the barcode.",
      "Make sure the ingredient text is readable.",
      "Hold your camera steady.",
      "Use good lighting.",
    ],
  },
  result: {
    safetyScore: "Safety Score",
    safe: "Safe",
    moderate: "Moderate Concern",
    high: "High Concern",
    ingredients: "Ingredients Analyzed",
    warnings: "Warnings",
    noWarnings: "No warnings found for this product.",
    scanAgain: "Scan Another Product",
    saveToHistory: "Save to History",
    saved: "Saved!",
    backToScanner: "Back to Scanner",
    category: "Category",
    brand: "Brand",
    barcode: "Barcode",
  },
};

const hi: ScannerLabels = {
  header: {
    title: "उत्पाद स्कैन करें",
    subtitle:
      "अंदर क्या है समझने के लिए बारकोड स्कैन करें या सामग्री लेबल कैप्चर करें।",
    historyButton: "इतिहास",
    backButton: "वापस",
  },
  tabs: {
    barcode: "बारकोड",
    ingredients: "सामग्री",
  },
  identify: {
    subtitle: "आप अपने उत्पाद की पहचान कैसे करना चाहते हैं?",
    scanBarcode: "बारकोड स्कैन करें",
    scanBarcodeDesc: "कैमरे को उत्पाद के बारकोड पर केंद्रित करें",
    searchName: "उत्पाद नाम से खोजें",
    searchNameDesc: "नाम या ब्रांड टाइप करके उत्पाद ढूंढें",
    addManually: "मैन्युअल जोड़ें",
    addManuallyDesc: "लेबल की फोटो लें या बारकोड दर्ज करें",
    backButton: "वापस",
    nameSearch: {
      title: "उत्पाद खोजें",
      placeholder: "उत्पाद का नाम या ब्रांड दर्ज करें...",
      searchButton: "खोजें",
      searching: "खोज रहे हैं...",
    },
    manual: {
      title: "उत्पाद मैन्युअल जोड़ें",
      takePhoto: "उत्पाद की फोटो लें",
      uploadImage: "छवि अपलोड करें",
      processing: "लेबल पढ़ रहे हैं...",
      cancel: "रद्द करें",
      barcodeTitle: "बारकोड मैन्युअल दर्ज करें",
      barcodePlaceholder: "बारकोड नंबर दर्ज करें",
      barcodeButton: "उत्पाद खोजें",
    },
    candidates: {
      title: "क्या आपका मतलब इनमें से एक है?",
      pick: "चुनें",
      searchAgain: "फिर से खोजें",
    },
  },
  barcode: {
    viewport: {
      alignBarcode: "बारकोड को फ्रेम के भीतर संरेखित करें",
      scanningForProduct: "उत्पाद खोज रहे हैं...",
      simulateScan: "स्कैन अनुकरण करें",
    },
    manual: {
      title: "बारकोड मैन्युअल रूप से दर्ज करें",
      inputPlaceholder: "बारकोड नंबर दर्ज करें",
      searchButton: "उत्पाद खोजें",
      searching: "खोज रहे हैं...",
    },
    notFound: {
      title: "उत्पाद नहीं मिला",
      description:
        "हमें इस उत्पाद का हमारे डेटाबेस में नहीं मिला।",
      scanIngredient: "सामग्री लेबल स्कैन करें",
      enterManually: "सामग्री मैन्युअल दर्ज करें",
      tryAnother: "अन्य बारकोड आज़माएं",
    },
    productFound: {
      title: "उत्पाद मिला",
      analyzeButton: "उत्पाद का विश्लेषण करें",
      scanAgain: "फिर से स्कैन करें",
    },
  },
  ingredient: {
    camera: {
      title: "सामग्री लेबल स्कैन करें",
      description:
        "सामग्री सूची की स्पष्ट फ़ोटो लें। हम विश्लेषण के लिए सामग्री निकालेंगे।",
      takePhoto: "फ़ोटो लें",
      uploadImage: "छवि अपलोड करें",
    },
    paste: {
      title: "सामग्री पेस्ट करें",
      inputPlaceholder: "सामग्री सूची यहां पेस्ट करें...",
      analyzeButton: "सामग्री का विश्लेषण करें",
      analyzing: "विश्लेषण हो रहा है...",
      clearButton: "साफ करें",
      charCount: "अक्षर",
    },
  },
  category: {
    title: "यह किस प्रकार का उत्पाद है?",
    description: "इस उत्पाद का वर्णन करने वाली श्रेणी चुनें।",
    food: "भोजन और पेय",
    cosmetics: "सौंदर्य और त्वचा देखभाल",
    personalCare: "व्यक्तिगत देखभाल",
    household: "घरेलू",
    healthcare: "स्वास्थ्य देखभाल",
    other: "अन्य",
  },
  loading: {
    identifying: "उत्पाद पहचान रहे हैं...",
    analyzing: "सामग्री का विश्लेषण हो रहा है...",
  },
  error: {
    title: "हम स्कैन नहीं कर सके",
    description:
      "सुनिश्चित करें कि बारकोड स्पष्ट रूप से दिखाई दे रहा है और फिर से प्रयास करें।",
    tryAgain: "फिर से प्रयास करें",
    enterManually: "मैन्युअल दर्ज करें",
  },
  permission: {
    title: "कैमरा एक्सेस आवश्यक",
    description:
      "उत्पादों और सामग्री लेबल को स्कैन करने के लिए कैमरा एक्सेस की अनुमति दें।",
    allowCamera: "कैमरा की अनुमति दें",
    uploadInstead: "इसके बजाय छवि अपलोड करें",
  },
  tips: {
    title: "स्कैन सुझाव",
    items: [
      "बारकोड को स्पष्ट रूप से दिखाई देने दें।",
      "बारकोड पर चमक से बचें।",
      "सुनिश्चित करें कि सामग्री टेक्स्ट पढ़ने योग्य है।",
      "अपना कैमरा स्थिर रखें।",
      "अच्छी रोशनी का उपयोग करें।",
    ],
  },
  result: {
    safetyScore: "सुरक्षा स्कोर",
    safe: "सुरक्षित",
    moderate: "मध्यम चिंता",
    high: "उच्च चिंता",
    ingredients: "सामग्री का विश्लेषण किया गया",
    warnings: "चेतावनियाँ",
    noWarnings: "इस उत्पाद के लिए कोई चेतावनी नहीं मिली।",
    scanAgain: "अन्य उत्पाद स्कैन करें",
    saveToHistory: "इतिहास में सहेजें",
    saved: "सहेजा गया!",
    backToScanner: "स्कैनर पर वापस जाएं",
    category: "श्रेणी",
    brand: "ब्रांड",
    barcode: "बारकोड",
  },
};

const labelsMap: Record<string, ScannerLabels> = { en, hi };

export function getScannerLabels(lang: string): ScannerLabels {
  return labelsMap[lang] ?? en;
}
