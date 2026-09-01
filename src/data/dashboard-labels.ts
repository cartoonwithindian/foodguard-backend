export type DashboardLabels = {
  greeting: {
    welcomeBack: string;
    subtitle: string;
  };
  scan: {
    title: string;
    subtitle: string;
    scanButton: string;
  };
  search: {
    title: string;
    subtitle: string;
    placeholder: string;
  };
  summary: {
    title: string;
    high: string;
    highCount: string;
    moderate: string;
    moderateCount: string;
    low: string;
    lowCount: string;
    viewButton: string;
  };
  recentScans: {
    title: string;
    viewAll: string;
    noScansTitle: string;
    noScansDescription: string;
    noScansButton: string;
    scannedLabel: string;
  };
  personalized: {
    title: string;
    goalLabel: string;
    focusLabel: string;
    editButton: string;
  };
  quickActions: {
    scan: string;
    search: string;
    history: string;
    preferences: string;
  };
  empty: {
    title: string;
    subtitle: string;
    scanButton: string;
    searchButton: string;
  };
  howItWorks: {
    title: string;
    steps: { number: string; label: string; description: string }[];
  };
  trust: {
    message: string;
  };
  nav: {
    home: string;
    search: string;
    history: string;
    profile: string;
  };
};

const en: DashboardLabels = {
  greeting: {
    welcomeBack: "Welcome back, {name}",
    subtitle: "Understand what\u2019s inside your products before you decide.",
  },
  scan: {
    title: "Scan Product",
    subtitle: "Scan a barcode or ingredient label to analyze a product.",
    scanButton: "Scan Product",
  },
  search: {
    title: "Search Products",
    subtitle: "Search using product name, barcode, or ingredient.",
    placeholder: "Search products or ingredients\u2026",
  },
  summary: {
    title: "Your Product Overview",
    high: "High Concern",
    highCount: "{count} products",
    moderate: "Moderate Concern",
    moderateCount: "{count} products",
    low: "Low Concern",
    lowCount: "{count} products",
    viewButton: "View History",
  },
  recentScans: {
    title: "Recently Scanned",
    viewAll: "View All History \u2192",
    noScansTitle: "No scans yet",
    noScansDescription: "Scan your first product to start building your history.",
    noScansButton: "Scan Product",
    scannedLabel: "Scanned {time}",
  },
  personalized: {
    title: "Your Preferences",
    goalLabel: "Goal",
    focusLabel: "Focus",
    editButton: "Edit Preferences",
  },
  quickActions: {
    scan: "Scan Product",
    search: "Search Product",
    history: "View History",
    preferences: "My Preferences",
  },
  empty: {
    title: "Start Your First Product Analysis",
    subtitle: "Scan a product to understand its ingredients and nutrition information.",
    scanButton: "Scan Product",
    searchButton: "Search Product",
  },
  howItWorks: {
    title: "How It Works",
    steps: [
      { number: "01", label: "Scan", description: "Scan a barcode or ingredient label." },
      { number: "02", label: "Analyze", description: "Ingredients and nutrition information are processed." },
      { number: "03", label: "Understand", description: "Receive an explanation of important findings." },
      { number: "04", label: "Compare", description: "Search and compare products using your criteria." },
    ],
  },
  trust: {
    message: "Product assessments are informational and are not medical diagnoses.",
  },
  nav: {
    home: "Home",
    search: "Search",
    history: "History",
    profile: "Profile",
  },
};

const hi: DashboardLabels = {
  greeting: {
    welcomeBack: "\u0935\u093E\u092A\u0938, {name}",
    subtitle: "\u092B\u0948\u0938\u0932\u093E \u0915\u0930\u0928\u0947 \u0938\u0947 \u092A\u0939\u0932\u0947 \u0905\u092A\u0928\u0947 \u0909\u0924\u094D\u092A\u093E\u0926\u094B\u0902 \u0915\u0947 \u0905\u0902\u0926\u0930 \u0915\u094D\u092F\u093E \u0939\u0948 \u0938\u092E\u091D\u0947\u0902\u0964",
  },
  scan: {
    title: "\u0909\u0924\u094D\u092A\u093E\u0926 \u0938\u094D\u0915\u0948\u0928 \u0915\u0930\u0947\u0902",
    subtitle: "\u0909\u0924\u094D\u092A\u093E\u0926 \u0915\u093E \u0935\u093F\u0936\u094D\u0932\u0947\u0937\u0923 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u092C\u093E\u0930\u0915\u094B\u0921 \u092F\u093E \u0938\u093E\u092E\u0917\u094D\u0930\u0940 \u0932\u0947\u092C\u0932 \u0938\u094D\u0915\u0948\u0928 \u0915\u0930\u0947\u0902\u0964",
    scanButton: "\u0909\u0924\u094D\u092A\u093E\u0926 \u0938\u094D\u0915\u0948\u0928 \u0915\u0930\u0947\u0902",
  },
  search: {
    title: "\u0909\u0924\u094D\u092A\u093E\u0926 \u0916\u094B\u091C\u0947\u0902",
    subtitle: "\u0909\u0924\u094D\u092A\u093E\u0926 \u0928\u093E\u092E, \u092C\u093E\u0930\u0915\u094B\u0921, \u092F\u093E \u0938\u093E\u092E\u0917\u094D\u0930\u0940 \u0938\u0947 \u0916\u094B\u091C\u0947\u0902\u0964",
    placeholder: "\u0909\u0924\u094D\u092A\u093E\u0926 \u092F\u093E \u0938\u093E\u092E\u0917\u094D\u0930\u0940 \u0916\u094B\u091C\u0947\u0902\u2026",
  },
  summary: {
    title: "\u0906\u092A\u0915\u0947 \u0909\u0924\u094D\u092A\u093E\u0926 \u0935\u093F\u0935\u0930\u0923",
    high: "\u0909\u091A\u094D\u091A \u091A\u093F\u0902\u0924\u093E",
    highCount: "{count} \u0909\u0924\u094D\u092A\u093E\u0926",
    moderate: "\u092E\u0927\u094D\u092F\u092E \u091A\u093F\u0902\u0924\u093E",
    moderateCount: "{count} \u0909\u0924\u094D\u092A\u093E\u0926",
    low: "\u0915\u092E \u091A\u093F\u0902\u0924\u093E",
    lowCount: "{count} \u0909\u0924\u094D\u092A\u093E\u0926",
    viewButton: "\u0907\u0924\u093F\u0939\u093E\u0938 \u0926\u0947\u0916\u0947\u0902",
  },
  recentScans: {
    title: "\u0939\u093E\u0932 \u0915\u0947 \u0938\u094D\u0915\u0948\u0928",
    viewAll: "\u0938\u0902\u092A\u0942\u0930\u094D\u0923 \u0907\u0924\u093F\u0939\u093E\u0938 \u0926\u0947\u0916\u0947\u0902 \u2192",
    noScansTitle: "\u0905\u092D\u0940 \u0924\u0915 \u0915\u094B\u0908 \u0938\u094D\u0915\u0948\u0928 \u0928\u0939\u0940\u0902",
    noScansDescription: "\u0905\u092A\u0928\u093E \u0907\u0924\u093F\u0939\u093E\u0938 \u092C\u0928\u093E\u0928\u093E \u0936\u0941\u0930\u0942 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0905\u092A\u0928\u093E \u092A\u0939\u0932\u093E \u0909\u0924\u094D\u092A\u093E\u0926 \u0938\u094D\u0915\u0948\u0928 \u0915\u0930\u0947\u0902\u0964",
    noScansButton: "\u0909\u0924\u094D\u092A\u093E\u0926 \u0938\u094D\u0915\u0948\u0928 \u0915\u0930\u0947\u0902",
    scannedLabel: "\u0938\u094D\u0915\u0948\u0928 {time} \u0915\u094B",
  },
  personalized: {
    title: "\u0906\u092A\u0915\u0940 \u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E\u090F\u0902",
    goalLabel: "\u0932\u0915\u094D\u0937\u094D\u092F",
    focusLabel: "\u092B\u094B\u0915\u0938",
    editButton: "\u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E \u0938\u0902\u092A\u093E\u0926\u093F\u0924 \u0915\u0930\u0947\u0902",
  },
  quickActions: {
    scan: "\u0909\u0924\u094D\u092A\u093E\u0926 \u0938\u094D\u0915\u0948\u0928",
    search: "\u0909\u0924\u094D\u092A\u093E\u0926 \u0916\u094B\u091C\u0947\u0902",
    history: "\u0907\u0924\u093F\u0939\u093E\u0938 \u0926\u0947\u0916\u0947\u0902",
    preferences: "\u092E\u0947\u0930\u0947 \u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E\u090F\u0902",
  },
  empty: {
    title: "\u0905\u092A\u0928\u0947 \u092A\u0939\u0932\u093E \u0909\u0924\u094D\u092A\u093E\u0926 \u0935\u093F\u0936\u094D\u0932\u0947\u0937\u0923 \u0936\u0941\u0930\u0942 \u0915\u0930\u0947\u0902",
    subtitle: "\u0938\u093E\u092E\u0917\u094D\u0930\u0940 \u0914\u0930 \u092A\u094B\u0937\u0923 \u0915\u0940 \u091C\u093E\u0928\u0915\u093E\u0930\u0940 \u0938\u092E\u091D\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0909\u0924\u094D\u092A\u093E\u0926 \u0938\u094D\u0915\u0948\u0928 \u0915\u0930\u0947\u0902\u0964",
    scanButton: "\u0909\u0924\u094D\u092A\u093E\u0926 \u0938\u094D\u0915\u0948\u0928 \u0915\u0930\u0947\u0902",
    searchButton: "\u0909\u0924\u094D\u092A\u093E\u0926 \u0916\u094B\u091C\u0947\u0902",
  },
  howItWorks: {
    title: "\u092F\u0939 \u0915\u0948\u0938\u0947 \u0915\u093E\u092E \u0915\u0930\u0924\u093E \u0939\u0948",
    steps: [
      { number: "01", label: "\u0938\u094D\u0915\u0948\u0928", description: "\u092C\u093E\u0930\u0915\u094B\u0921 \u092F\u093E \u0938\u093E\u092E\u0917\u094D\u0930\u0940 \u0932\u0947\u092C\u0932 \u0938\u094D\u0915\u0948\u0928 \u0915\u0930\u0947\u0902\u0964" },
      { number: "02", label: "\u0935\u093F\u0936\u094D\u0932\u0947\u0937\u0923", description: "\u0938\u093E\u092E\u0917\u094D\u0930\u0940 \u0914\u0930 \u092A\u094B\u0937\u0923 \u0915\u0940 \u091C\u093E\u0928\u0915\u093E\u0930\u0940 \u0938\u0902\u0938\u093E\u0927\u093F\u0924 \u0939\u094B\u0924\u0940 \u0939\u0948\u0964" },
      { number: "03", label: "\u0938\u092E\u091D\u0947\u0902", description: "\u092E\u0939\u0924\u094D\u0935\u092A\u0942\u0930\u094D\u0923 \u0928\u093F\u0937\u094D\u0915\u0930\u094D\u0937\u0923\u094B\u0902 \u0915\u0940 \u0935\u094D\u092F\u093E\u0916\u094D\u092F\u093E \u092A\u094D\u0930\u093E\u092A\u094D\u0924 \u0915\u0930\u0947\u0902\u0964" },
      { number: "04", label: "\u0924\u0941\u0932\u0928\u093E\u0907\u0924", description: "\u0905\u092A\u0928\u0947 \u092E\u093E\u092A\u0926\u093E\u0928\u094B\u0902 \u0938\u0947 \u0909\u0924\u094D\u092A\u093E\u0926 \u0916\u094B\u091C\u0947\u0902 \u0914\u0930 \u0924\u0941\u0932\u0928\u093E\u0907\u0924 \u0915\u0930\u0947\u0902\u0964" },
    ],
  },
  trust: {
    message: "\u0909\u0924\u094D\u092A\u093E\u0926 \u092E\u0942\u0932\u094D\u092F\u093E\u0902\u0915\u0930\u0923 \u0938\u0942\u091A\u0928\u093E\u0924\u094D\u092E\u0915 \u0939\u0948\u0902 \u0914\u0930 \u091A\u093F\u0915\u093F\u0924\u094D\u0938\u093E \u0928\u0939\u0940\u0902 \u0939\u0948\u0902\u0964",
  },
  nav: {
    home: "\u0939\u094B\u092E",
    search: "\u0916\u094B\u091C\u0947\u0902",
    history: "\u0907\u0924\u093F\u0939\u093E\u0938",
    profile: "\u092A\u094D\u0930\u094B\u092B\u093C\u093E\u0907\u0932",
  },
};

const labelsMap: Record<string, DashboardLabels> = { en, hi };

export function getDashboardLabels(languageId: string): DashboardLabels {
  return labelsMap[languageId] ?? en;
}
