export type HistoryLabels = {
  header: {
    title: string;
    subtitle: string;
    backButton: string;
  };
  summary: {
    title: string;
    high: string;
    moderate: string;
    low: string;
  };
  tabs: {
    all: string;
    high: string;
    moderate: string;
    low: string;
  };
  search: {
    placeholder: string;
  };
  filters: {
    button: string;
    assessment: string;
    category: string;
    dateRange: string;
    apply: string;
    clear: string;
    all: string;
  };
  recentScans: {
    title: string;
  };
  productCard: {
    viewAnalysis: string;
    scanned: string;
  };
  empty: {
    title: string;
    description: string;
    scanButton: string;
  };
  emptyFiltered: {
    title: string;
    description: string;
  };
  detail: {
    backButton: string;
    title: string;
  };
  delete: {
    menuLabel: string;
    viewAnalysis: string;
    deleteAction: string;
    confirmTitle: string;
    confirmDescription: string;
    cancel: string;
    remove: string;
  };
  nav: {
    home: string;
    scan: string;
    search: string;
    history: string;
    profile: string;
  };
};

const en: HistoryLabels = {
  header: {
    title: "Product History",
    subtitle: "Review your previous product scans and analysis.",
    backButton: "Back",
  },
  summary: {
    title: "Your Scan Summary",
    high: "High Concern",
    moderate: "Moderate Concern",
    low: "Low Concern",
  },
  tabs: {
    all: "All",
    high: "High Concern",
    moderate: "Moderate",
    low: "Low Concern",
  },
  search: {
    placeholder: "Search scanned products...",
  },
  filters: {
    button: "Filters",
    assessment: "Assessment",
    category: "Category",
    dateRange: "Date",
    apply: "Apply Filters",
    clear: "Clear All",
    all: "All",
  },
  recentScans: {
    title: "Recently Scanned",
  },
  productCard: {
    viewAnalysis: "View Analysis",
    scanned: "Scanned",
  },
  empty: {
    title: "Your Scan History Is Empty",
    description: "Scan your first product to start building your product history.",
    scanButton: "Scan Product",
  },
  emptyFiltered: {
    title: "No Products Found",
    description: "No products match the selected filters. Try adjusting your criteria.",
  },
  detail: {
    backButton: "Back to History",
    title: "Saved Analysis",
  },
  delete: {
    menuLabel: "More options",
    viewAnalysis: "View Analysis",
    deleteAction: "Delete from History",
    confirmTitle: "Remove from History?",
    confirmDescription: "This saved analysis will be removed from your history.",
    cancel: "Cancel",
    remove: "Remove",
  },
  nav: {
    home: "Home",
    scan: "Scan",
    search: "Search",
    history: "History",
    profile: "Profile",
  },
};

const hi: HistoryLabels = {
  header: {
    title: "उत्पाद इतिहास",
    subtitle: "अपने पिछले उत्पाद स्कैन और विश्लेषण की समीक्षा करें।",
    backButton: "वापस",
  },
  summary: {
    title: "आपका स्कैन सारांश",
    high: "उच्च चिंता",
    moderate: "मध्यम चिंता",
    low: "कम चिंता",
  },
  tabs: {
    all: "सभी",
    high: "उच्च चिंता",
    moderate: "मध्यम",
    low: "कम चिंता",
  },
  search: {
    placeholder: "स्कैन किए गए उत्पाद खोजें...",
  },
  filters: {
    button: "फ़िल्टर",
    assessment: "मूल्यांकन",
    category: "श्रेणी",
    dateRange: "तारीख",
    apply: "फ़िल्टर लागू करें",
    clear: "सभी साफ़ करें",
    all: "सभी",
  },
  recentScans: {
    title: "हाल ही में स्कैन किए गए",
  },
  productCard: {
    viewAnalysis: "विश्लेषण देखें",
    scanned: "स्कैन किया गया",
  },
  empty: {
    title: "आपका स्कैन इतिहास खाली है",
    description: "अपना उत्पाद इतिहास बनाना शुरू करने के लिए अपना पहला उत्पाद स्कैन करें।",
    scanButton: "उत्पाद स्कैन करें",
  },
  emptyFiltered: {
    title: "कोई उत्पाद नहीं मिला",
    description: "चयनित फ़िल्टर से कोई उत्पाद मेल नहीं खाता। अपने मानदंड समायोजित करने का प्रयास करें।",
  },
  detail: {
    backButton: "इतिहास पर वापस",
    title: "सहेजा गया विश्लेषण",
  },
  delete: {
    menuLabel: "और विकल्प",
    viewAnalysis: "विश्लेषण देखें",
    deleteAction: "इतिहास से हटाएं",
    confirmTitle: "इतिहास से हटाएं?",
    confirmDescription: "यह सहेजा गया विश्लेषण आपके इतिहास से हटा दिया जाएगा।",
    cancel: "रद्द करें",
    remove: "हटाएं",
  },
  nav: {
    home: "होम",
    scan: "स्कैन",
    search: "खोजें",
    history: "इतिहास",
    profile: "प्रोफ़ाइल",
  },
};

const labelsMap: Record<string, HistoryLabels> = { en, hi };

export function getHistoryLabels(lang: string): HistoryLabels {
  return labelsMap[lang] ?? en;
}
