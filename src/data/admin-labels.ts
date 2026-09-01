export type AdminLabels = {
  sidebar: {
    dashboard: string;
    users: string;
    products: string;
    ingredients: string;
    evidence: string;
    analysisLogs: string;
    dataQuality: string;
    systemSettings: string;
    auditLogs: string;
    adminProfile: string;
    logout: string;
  };
  header: {
    title: string;
    search: string;
    notifications: string;
    role: string;
  };
  overview: {
    title: string;
    totalUsers: string;
    totalProducts: string;
    totalIngredients: string;
    totalAnalyses: string;
  };
  analysisActivity: {
    title: string;
    product: string;
    user: string;
    assessment: string;
    date: string;
    status: string;
    completed: string;
    processing: string;
    failed: string;
    insufficientData: string;
  };
  concernDistribution: {
    title: string;
    low: string;
    moderate: string;
    high: string;
    insufficient: string;
    disclaimer: string;
  };
  userManagement: {
    title: string;
    search: string;
    columns: {
      user: string;
      email: string;
      registrationDate: string;
      totalScans: string;
      lastActivity: string;
      status: string;
      actions: string;
    };
    active: string;
    suspended: string;
    inactive: string;
    view: string;
    suspend: string;
    delete: string;
    deleteConfirm: string;
    deleteMessage: string;
    cancel: string;
  };
  productManagement: {
    title: string;
    search: string;
    addProduct: string;
    editProduct: string;
    viewProduct: string;
    archiveProduct: string;
    columns: {
      product: string;
      category: string;
      barcode: string;
      dataStatus: string;
      lastUpdated: string;
      analysisStatus: string;
      actions: string;
    };
    complete: string;
    incomplete: string;
    needsReview: string;
    archiveConfirm: string;
    archiveMessage: string;
    cancel: string;
  };
  ingredientManagement: {
    title: string;
    search: string;
    addIngredient: string;
    editIngredient: string;
    viewIngredient: string;
    addEvidence: string;
    review: string;
    columns: {
      ingredient: string;
      code: string;
      function: string;
      category: string;
      assessmentStatus: string;
      evidenceAvailability: string;
      lastUpdated: string;
      actions: string;
    };
    evidenceAvailable: string;
    noEvidence: string;
    editWarning: string;
  };
  evidenceManagement: {
    title: string;
    search: string;
    view: string;
    verify: string;
    update: string;
    archive: string;
    columns: {
      source: string;
      type: string;
      relatedTo: string;
      status: string;
      lastVerified: string;
      evidence: string;
      actions: string;
    };
    verified: string;
    pending: string;
    outdated: string;
    unsupportedWarning: string;
  };
  dataQuality: {
    title: string;
    columns: {
      target: string;
      issueType: string;
      severity: string;
      dateDetected: string;
      status: string;
      action: string;
    };
    open: string;
    underReview: string;
    resolved: string;
    review: string;
  };
  analysisLogs: {
    title: string;
    viewDetails: string;
    columns: {
      id: string;
      product: string;
      createdTime: string;
      processing: string;
      ingredientProcessing: string;
      evidenceRetrieval: string;
      assessment: string;
      aiExplanation: string;
      errorStatus: string;
      actions: string;
    };
    pipeline: {
      title: string;
      productLookup: string;
      ingredientNormalization: string;
      nutritionProcessing: string;
      evidenceRetrieval: string;
      assessment: string;
      aiExplanation: string;
      success: string;
      pending: string;
      failed: string;
      skipped: string;
    };
  };
  errorMonitoring: {
    title: string;
    lastUpdated: string;
    operational: string;
    degraded: string;
    unavailable: string;
  };
  auditLog: {
    title: string;
    search: string;
    columns: {
      action: string;
      admin: string;
      target: string;
      timestamp: string;
    };
    filters: {
      user: string;
      action: string;
      date: string;
      resource: string;
    };
    updated: string;
    verified: string;
    archived: string;
    suspended: string;
    created: string;
    deleted: string;
  };
  systemSettings: {
    title: string;
    assessmentConfig: string;
    productData: string;
    evidence: string;
    ai: string;
    localization: string;
    reviewChanges: string;
    applyChanges: string;
    cancel: string;
  };
  confirmation: {
    confirm: string;
    cancel: string;
  };
};

const en: AdminLabels = {
  sidebar: {
    dashboard: "Dashboard",
    users: "Users",
    products: "Products",
    ingredients: "Ingredients",
    evidence: "Evidence & Sources",
    analysisLogs: "Analysis Logs",
    dataQuality: "Data Quality",
    systemSettings: "System Settings",
    auditLogs: "Audit Logs",
    adminProfile: "Admin Profile",
    logout: "Logout",
  },
  header: {
    title: "Admin Dashboard",
    search: "Search",
    notifications: "Notifications",
    role: "Administrator",
  },
  overview: {
    title: "Platform Overview",
    totalUsers: "Total Users",
    totalProducts: "Products",
    totalIngredients: "Ingredients",
    totalAnalyses: "Analyses",
  },
  analysisActivity: {
    title: "Product Analysis Activity",
    product: "Product",
    user: "User",
    assessment: "Assessment",
    date: "Date",
    status: "Status",
    completed: "Completed",
    processing: "Processing",
    failed: "Failed",
    insufficientData: "Insufficient Data",
  },
  concernDistribution: {
    title: "Assessment Distribution",
    low: "Low Concern",
    moderate: "Moderate Attention",
    high: "High Attention",
    insufficient: "Insufficient Evidence",
    disclaimer: "This distribution represents the application's own assessment outcomes and should not be interpreted as medical or safety proof.",
  },
  userManagement: {
    title: "Users",
    search: "Search users...",
    columns: {
      user: "User",
      email: "Email",
      registrationDate: "Registration Date",
      totalScans: "Total Scans",
      lastActivity: "Last Activity",
      status: "Status",
      actions: "Actions",
    },
    active: "Active",
    suspended: "Suspended",
    inactive: "Inactive",
    view: "View",
    suspend: "Suspend",
    delete: "Delete",
    deleteConfirm: "Delete User?",
    deleteMessage: "This action cannot be undone. The user account and all associated data will be permanently removed.",
    cancel: "Cancel",
  },
  productManagement: {
    title: "Products",
    search: "Search products...",
    addProduct: "Add Product",
    editProduct: "Edit Product",
    viewProduct: "View Product",
    archiveProduct: "Archive Product",
    columns: {
      product: "Product",
      category: "Category",
      barcode: "Barcode",
      dataStatus: "Data Status",
      lastUpdated: "Last Updated",
      analysisStatus: "Analysis Status",
      actions: "Actions",
    },
    complete: "Complete",
    incomplete: "Incomplete",
    needsReview: "Needs Review",
    archiveConfirm: "Archive Product?",
    archiveMessage: "This product will no longer appear in normal product searches.",
    cancel: "Cancel",
  },
  ingredientManagement: {
    title: "Ingredient Database",
    search: "Search ingredients...",
    addIngredient: "Add Ingredient",
    editIngredient: "Edit Ingredient",
    viewIngredient: "View Ingredient",
    addEvidence: "Add Evidence",
    review: "Review",
    columns: {
      ingredient: "Ingredient",
      code: "Code",
      function: "Function",
      category: "Category",
      assessmentStatus: "Assessment",
      evidenceAvailability: "Evidence",
      lastUpdated: "Last Updated",
      actions: "Actions",
    },
    evidenceAvailable: "Available",
    noEvidence: "No Evidence",
    editWarning: "Changing ingredient information can affect future product analyses.",
  },
  evidenceManagement: {
    title: "Evidence Management",
    search: "Search sources...",
    view: "View",
    verify: "Verify",
    update: "Update",
    archive: "Archive",
    columns: {
      source: "Source",
      type: "Type",
      relatedTo: "Related To",
      status: "Status",
      lastVerified: "Last Verified",
      evidence: "Evidence",
      actions: "Actions",
    },
    verified: "Verified",
    pending: "Pending",
    outdated: "Outdated",
    unsupportedWarning: "Administrators cannot create unsupported evidence.",
  },
  dataQuality: {
    title: "Data Quality",
    columns: {
      target: "Product / Ingredient",
      issueType: "Issue Type",
      severity: "Severity",
      dateDetected: "Date Detected",
      status: "Status",
      action: "Action",
    },
    open: "Open",
    underReview: "Under Review",
    resolved: "Resolved",
    review: "Review",
  },
  analysisLogs: {
    title: "Analysis Logs",
    viewDetails: "View Details",
    columns: {
      id: "ID",
      product: "Product",
      createdTime: "Created",
      processing: "Processing",
      ingredientProcessing: "Ingredients",
      evidenceRetrieval: "Evidence",
      assessment: "Assessment",
      aiExplanation: "AI",
      errorStatus: "Errors",
      actions: "Actions",
    },
    pipeline: {
      title: "Processing Pipeline",
      productLookup: "Product Lookup",
      ingredientNormalization: "Ingredient Normalization",
      nutritionProcessing: "Nutrition Processing",
      evidenceRetrieval: "Evidence Retrieval",
      assessment: "Assessment",
      aiExplanation: "AI Explanation",
      success: "Success",
      pending: "Pending",
      failed: "Failed",
      skipped: "Skipped",
    },
  },
  errorMonitoring: {
    title: "System Health",
    lastUpdated: "Last Updated",
    operational: "Operational",
    degraded: "Degraded",
    unavailable: "Unavailable",
  },
  auditLog: {
    title: "Audit Logs",
    search: "Search logs...",
    columns: {
      action: "Action",
      admin: "Admin",
      target: "Target",
      timestamp: "Timestamp",
    },
    filters: {
      user: "User",
      action: "Action",
      date: "Date",
      resource: "Resource",
    },
    updated: "Updated",
    verified: "Verified",
    archived: "Archived",
    suspended: "Suspended",
    created: "Created",
    deleted: "Deleted",
  },
  systemSettings: {
    title: "System Settings",
    assessmentConfig: "Assessment Configuration",
    productData: "Product Data",
    evidence: "Evidence",
    ai: "AI",
    localization: "Localization",
    reviewChanges: "Review Changes",
    applyChanges: "Apply Changes",
    cancel: "Cancel",
  },
  confirmation: {
    confirm: "Confirm",
    cancel: "Cancel",
  },
};

const hi: AdminLabels = {
  sidebar: {
    dashboard: "डैशबोर्ड",
    users: "उपयोगकर्ता",
    products: "उत्पाद",
    ingredients: "सामग्री",
    evidence: "प्रमाण और स्रोत",
    analysisLogs: "विश्लेषण लॉग",
    dataQuality: "डेटा गुणवत्ता",
    systemSettings: "सिस्टम सेटिंग्स",
    auditLogs: "ऑडिट लॉग",
    adminProfile: "एडमिन प्रोफ़ाइल",
    logout: "लॉगआउट",
  },
  header: {
    title: "एडमिन डैशबोर्ड",
    search: "खोजें",
    notifications: "सूचनाएँ",
    role: "प्रशासक",
  },
  overview: {
    title: "प्लेटफ़ॉर्म अवलोकन",
    totalUsers: "कुल उपयोगकर्ता",
    totalProducts: "उत्पाद",
    totalIngredients: "सामग्री",
    totalAnalyses: "विश्लेषण",
  },
  analysisActivity: {
    title: "उत्पाद विश्लेषण गतिविधि",
    product: "उत्पाद",
    user: "उपयोगकर्ता",
    assessment: "मूल्यांकन",
    date: "तिथि",
    status: "स्थिति",
    completed: "पूर्ण",
    processing: "प्रसंस्करण",
    failed: "विफल",
    insufficientData: "अपर्याप्त डेटा",
  },
  concernDistribution: {
    title: "मूल्यांकन वितरण",
    low: "कम चिंता",
    moderate: "मध्यम ध्यान",
    high: "उच्च ध्यान",
    insufficient: "अपर्याप्त प्रमाण",
    disclaimer: "यह वितरण एप्लिकेशन के अपने मूल्यांकन परिणामों का प्रतिनिधित्व करता है और इसे चिकित्सा या सुरक्षा प्रमाण के रूप में नहीं माना जाना चाहिए।",
  },
  userManagement: {
    title: "उपयोगकर्ता",
    search: "उपयोगकर्ता खोजें...",
    columns: {
      user: "उपयोगकर्ता",
      email: "ईमेल",
      registrationDate: "पंजीकरण तिथि",
      totalScans: "कुल स्कैन",
      lastActivity: "अंतिम गतिविधि",
      status: "स्थिति",
      actions: "क्रियाएँ",
    },
    active: "सक्रिय",
    suspended: "निलंबित",
    inactive: "निष्क्रिय",
    view: "देखें",
    suspend: "निलंबित करें",
    delete: "हटाएं",
    deleteConfirm: "उपयोगकर्ता हटाएं?",
    deleteMessage: "यह क्रिया पूर्ववत नहीं की जा सकती। उपयोगकर्ता खाता और सभी संबंधित डेटा स्थायी रूप से हटा दिए जाएंगे।",
    cancel: "रद्द करें",
  },
  productManagement: {
    title: "उत्पाद",
    search: "उत्पाद खोजें...",
    addProduct: "उत्पाद जोड़ें",
    editProduct: "उत्पाद संपादित करें",
    viewProduct: "उत्पाद देखें",
    archiveProduct: "उत्पाद संग्रहित करें",
    columns: {
      product: "उत्पाद",
      category: "श्रेणी",
      barcode: "बारकोड",
      dataStatus: "डेटा स्थिति",
      lastUpdated: "अंतिम अपडेट",
      analysisStatus: "विश्लेषण स्थिति",
      actions: "क्रियाएँ",
    },
    complete: "पूर्ण",
    incomplete: "अपूर्ण",
    needsReview: "समीक्षा आवश्यक",
    archiveConfirm: "उत्पाद संग्रहित करें?",
    archiveMessage: "यह उत्पाद सामान्य उत्पाद खोजों में नहीं दिखाई देगा।",
    cancel: "रद्द करें",
  },
  ingredientManagement: {
    title: "सामग्री डेटाबेस",
    search: "सामग्री खोजें...",
    addIngredient: "सामग्री जोड़ें",
    editIngredient: "सामग्री संपादित करें",
    viewIngredient: "सामग्री देखें",
    addEvidence: "प्रमाण जोड़ें",
    review: "समीक्षा",
    columns: {
      ingredient: "सामग्री",
      code: "कोड",
      function: "कार्य",
      category: "श्रेणी",
      assessmentStatus: "मूल्यांकन",
      evidenceAvailability: "प्रमाण",
      lastUpdated: "अंतिम अपडेट",
      actions: "क्रियाएँ",
    },
    evidenceAvailable: "उपलब्ध",
    noEvidence: "कोई प्रमाण नहीं",
    editWarning: "सामग्री जानकारी बदलने से भविष्य के उत्पाद विश्लेषण प्रभावित हो सकते हैं।",
  },
  evidenceManagement: {
    title: "प्रमाण प्रबंधन",
    search: "स्रोत खोजें...",
    view: "देखें",
    verify: "सत्यापित करें",
    update: "अपडेट करें",
    archive: "संग्रहित करें",
    columns: {
      source: "स्रोत",
      type: "प्रकार",
      relatedTo: "संबंधित",
      status: "स्थिति",
      lastVerified: "अंतिम सत्यापन",
      evidence: "प्रमाण",
      actions: "क्रियाएँ",
    },
    verified: "सत्यापित",
    pending: "लंबित",
    outdated: "पुराना",
    unsupportedWarning: "प्रशासक असमर्थित प्रमाण नहीं बना सकते।",
  },
  dataQuality: {
    title: "डेटा गुणवत्ता",
    columns: {
      target: "उत्पाद / सामग्री",
      issueType: "समस्या प्रकार",
      severity: "गंभीरता",
      dateDetected: "पता लगाया गया",
      status: "स्थिति",
      action: "क्रिया",
    },
    open: "खुला",
    underReview: "समीक्षाधीन",
    resolved: "हल",
    review: "समीक्षा",
  },
  analysisLogs: {
    title: "विश्लेषण लॉग",
    viewDetails: "विवरण देखें",
    columns: {
      id: "आईडी",
      product: "उत्पाद",
      createdTime: "बनाया गया",
      processing: "प्रसंस्करण",
      ingredientProcessing: "सामग्री",
      evidenceRetrieval: "प्रमाण",
      assessment: "मूल्यांकन",
      aiExplanation: "AI",
      errorStatus: "त्रुटियाँ",
      actions: "क्रियाएँ",
    },
    pipeline: {
      title: "प्रसंस्करण पाइपलाइन",
      productLookup: "उत्पाद खोज",
      ingredientNormalization: "सामग्री सामान्यीकरण",
      nutritionProcessing: "पोषण प्रसंस्करण",
      evidenceRetrieval: "प्रमाण पुनर्प्राप्ति",
      assessment: "मूल्यांकन",
      aiExplanation: "AI व्याख्या",
      success: "सफल",
      pending: "लंबित",
      failed: "विफल",
      skipped: "छोड़ा गया",
    },
  },
  errorMonitoring: {
    title: "सिस्टम स्वास्थ्य",
    lastUpdated: "अंतिम अपडेट",
    operational: "संचालन में",
    degraded: "कमज़ोर",
    unavailable: "अनुपलब्ध",
  },
  auditLog: {
    title: "ऑडिट लॉग",
    search: "लॉग खोजें...",
    columns: {
      action: "क्रिया",
      admin: "एडमिन",
      target: "लक्ष्य",
      timestamp: "समय",
    },
    filters: {
      user: "उपयोगकर्ता",
      action: "क्रिया",
      date: "तिथि",
      resource: "संसाधन",
    },
    updated: "अपडेट किया",
    verified: "सत्यापित किया",
    archived: "संग्रहित किया",
    suspended: "निलंबित किया",
    created: "बनाया",
    deleted: "हटाया",
  },
  systemSettings: {
    title: "सिस्टम सेटिंग्स",
    assessmentConfig: "मूल्यांकन कॉन्फ़िगरेशन",
    productData: "उत्पाद डेटा",
    evidence: "प्रमाण",
    ai: "AI",
    localization: "स्थानीयकरण",
    reviewChanges: "परिवर्तन समीक्षा",
    applyChanges: "परिवर्तन लागू करें",
    cancel: "रद्द करें",
  },
  confirmation: {
    confirm: "पुष्टि करें",
    cancel: "रद्द करें",
  },
};

const labelsMap: Record<string, AdminLabels> = { en, hi };

export function getAdminLabels(lang: string): AdminLabels {
  return labelsMap[lang] ?? en;
}
