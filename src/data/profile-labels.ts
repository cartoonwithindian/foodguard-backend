export type ProfileLabels = {
  header: {
    title: string;
    subtitle: string;
    editProfile: string;
  };
  personalInfo: {
    title: string;
    fullName: string;
    email: string;
    age: string;
    height: string;
    weight: string;
    heightUnit: string;
    weightUnit: string;
    saveButton: string;
    saved: string;
  };
  goals: {
    title: string;
    subtitle: string;
    saveButton: string;
    saved: string;
  };
  productPreferences: {
    title: string;
    subtitle: string;
    avoidLabel: string;
    preferLabel: string;
    addButton: string;
    addPlaceholder: string;
    emptyAvoid: string;
    emptyPrefer: string;
    saved: string;
  };
  analysisPreferences: {
    title: string;
    subtitle: string;
    description: string;
    saved: string;
  };
  language: {
    title: string;
    subtitle: string;
    currentLabel: string;
    changed: string;
  };
  privacy: {
    title: string;
    subtitle: string;
    scanHistory: string;
    keepHistory: string;
    clearHistory: string;
    clearConfirm: string;
    clearConfirmDescription: string;
    personalData: string;
    downloadData: string;
    deleteAccount: string;
    dataUsage: string;
    dataUsageDescription: string;
    saved: string;
  };
  security: {
    title: string;
    subtitle: string;
    changePassword: string;
    lastChanged: string;
    activeSessions: string;
    sessionsCount: string;
    logoutAll: string;
    twoFactor: string;
    twoFactorEnabled: string;
    twoFactorDisabled: string;
    linkedAccounts: string;
  };
  accountActions: {
    title: string;
    logout: string;
    deleteAccount: string;
    deleteConfirmTitle: string;
    deleteConfirmDescription: string;
    deleteConfirmButton: string;
    cancelButton: string;
  };
  nav: {
    home: string;
    scan: string;
    search: string;
    history: string;
    profile: string;
  };
};

const en: ProfileLabels = {
  header: {
    title: "Profile",
    subtitle: "Manage your account and personalize your product analysis experience.",
    editProfile: "Edit Profile",
  },
  personalInfo: {
    title: "Personal Information",
    fullName: "Full Name",
    email: "Email Address",
    age: "Age",
    height: "Height",
    weight: "Weight",
    heightUnit: "cm",
    weightUnit: "kg",
    saveButton: "Save Changes",
    saved: "Changes saved",
  },
  goals: {
    title: "My Goals",
    subtitle: "Select your primary goal to personalize your analysis experience.",
    saveButton: "Save Goal",
    saved: "Goal saved",
  },
  productPreferences: {
    title: "Product Preferences",
    subtitle: "Define ingredients or characteristics you want to avoid or prefer in products.",
    avoidLabel: "Avoid",
    preferLabel: "Prefer",
    addButton: "Add Preference",
    addPlaceholder: "Enter ingredient or characteristic...",
    emptyAvoid: "No avoid preferences set",
    emptyPrefer: "No prefer preferences set",
    saved: "Preferences saved",
  },
  analysisPreferences: {
    title: "Analysis Preferences",
    subtitle: "Choose what information to prioritize during product analysis.",
    description: "These settings affect how results are presented. They do not change the underlying assessment.",
    saved: "Preferences saved",
  },
  language: {
    title: "Language",
    subtitle: "Select your preferred language for the application interface.",
    currentLabel: "Current Language",
    changed: "Language updated",
  },
  privacy: {
    title: "Privacy & Data",
    subtitle: "Control how your data is stored and used within the application.",
    scanHistory: "Scan History",
    keepHistory: "Keep scan history",
    clearHistory: "Clear scan history",
    clearConfirm: "Clear Scan History?",
    clearConfirmDescription: "This will permanently remove all your saved scan history. This action cannot be undone.",
    personalData: "Personal Data",
    downloadData: "Download My Data",
    deleteAccount: "Delete My Account",
    dataUsage: "Data Usage",
    dataUsageDescription: "Your profile and saved analysis history are used to provide personalized features within the application. We do not share your personal data with third parties.",
    saved: "Settings saved",
  },
  security: {
    title: "Security",
    subtitle: "Manage your password and account security settings.",
    changePassword: "Change Password",
    lastChanged: "Last changed",
    activeSessions: "Active Sessions",
    sessionsCount: "{count} device(s) currently signed in",
    logoutAll: "Log Out of All Devices",
    twoFactor: "Two-Factor Authentication",
    twoFactorEnabled: "Enabled",
    twoFactorDisabled: "Not enabled",
    linkedAccounts: "Linked Accounts",
  },
  accountActions: {
    title: "Account",
    logout: "Log Out",
    deleteAccount: "Delete Account",
    deleteConfirmTitle: "Delete Account?",
    deleteConfirmDescription: "This action will permanently remove your account and associated data. This cannot be undone.",
    deleteConfirmButton: "Delete Account",
    cancelButton: "Cancel",
  },
  nav: {
    home: "Home",
    scan: "Scan",
    search: "Search",
    history: "History",
    profile: "Profile",
  },
};

const hi: ProfileLabels = {
  header: {
    title: "\u092A\u094D\u0930\u094B\u092B\u093C\u093E\u0907\u0932",
    subtitle: "\u0905\u092A\u0928\u0947 \u0916\u093E\u0924\u0947 \u0915\u093E \u092A\u094D\u0930\u092C\u0902\u0927\u0928 \u0915\u0930\u0947\u0902 \u0914\u0930 \u0905\u092A\u0928\u0947 \u0909\u0924\u094D\u092A\u093E\u0926 \u0935\u093F\u0936\u094D\u0932\u0947\u0937\u0923 \u0905\u0928\u0941\u092D\u0935 \u0915\u094B \u0935\u094D\u092F\u0915\u094D\u0924\u093F\u0917\u094D\u0924 \u092C\u0928\u093E\u090F\u0902\u0964",
    editProfile: "\u092A\u094D\u0930\u094B\u092B\u093C\u093E\u0907\u0932 \u0938\u0902\u092A\u093E\u0926\u093F\u0924 \u0915\u0930\u0947\u0902",
  },
  personalInfo: {
    title: "\u0935\u094D\u092F\u0915\u094D\u0924\u093F\u0917\u0924 \u091C\u093E\u0928\u0915\u093E\u0930\u0940",
    fullName: "\u092A\u0942\u0930\u093E \u0928\u093E\u092E",
    email: "\u0908\u092E\u0947\u0932 \u092A\u0924\u093E",
    age: "\u0906\u092F\u0941",
    height: "\u090A\u0902\u091A\u093E\u0908",
    weight: "\u0935\u091C\u0928",
    heightUnit: "\u0938\u0947\u092E\u0940",
    weightUnit: "\u0915\u093F\u0917\u094D\u0930\u093E",
    saveButton: "\u092A\u0930\u093F\u0935\u0930\u094D\u0924\u0928 \u0938\u0939\u0947\u091C\u0947\u0902",
    saved: "\u092A\u0930\u093F\u0935\u0930\u094D\u0924\u0928 \u0938\u0939\u0947\u091C\u0947 \u0917\u090F",
  },
  goals: {
    title: "\u092E\u0947\u0930\u0947 \u0932\u0915\u094D\u0937\u094D\u092F",
    subtitle: "\u0905\u092A\u0928\u093E \u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0915 \u0932\u0915\u094D\u0937\u094D\u092F \u091A\u0941\u0928\u0947\u0902\u0964",
    saveButton: "\u0932\u0915\u094D\u0937\u094D\u092F \u0938\u0939\u0947\u091C\u0947\u0902",
    saved: "\u0932\u0915\u094D\u0937\u094D\u092F \u0938\u0939\u0947\u091C\u093E \u0917\u092F\u093E",
  },
  productPreferences: {
    title: "\u0909\u0924\u094D\u092A\u093E\u0926 \u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0915\u0924\u093E\u090F\u0902",
    subtitle: "\u0905\u091C\u0940 \u0938\u093E\u092E\u0917\u094D\u0930\u093F\u092F\u093E\u0902 \u092A\u0930\u093F\u092D\u093E\u0937\u093F\u0924 \u0915\u0930\u0947\u0902 \u091C\u093F\u0928\u094D\u0939\u0947\u0902 \u0906\u092A \u092C\u091A\u0928\u093E \u092F\u093E \u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E \u0926\u0947\u0928\u093E \u091A\u093E\u0939\u0924\u0947 \u0939\u0948\u0902\u0964",
    avoidLabel: "\u092C\u091A\u0947\u0902",
    preferLabel: "\u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E",
    addButton: "\u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E \u091C\u094B\u0921\u093C\u0947\u0902",
    addPlaceholder: "\u0938\u093E\u092E\u0917\u094D\u0930\u0940 \u092F\u093E \u0935\u093F\u0936\u0947\u0937\u0924\u093E \u0926\u0930\u094D\u091C \u0915\u0930\u0947\u0902...",
    emptyAvoid: "\u0915\u094B\u0908 \u092C\u091A\u0928\u0947 \u0935\u093E\u0932\u0940 \u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E \u0928\u0939\u0940\u0902",
    emptyPrefer: "\u0915\u094B\u0908 \u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E \u0935\u093E\u0932\u0940 \u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E \u0928\u0939\u0940\u0902",
    saved: "\u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E\u090F\u0902 \u0938\u0939\u0947\u0938\u0940 \u0917\u090F\u0902",
  },
  analysisPreferences: {
    title: "\u0935\u093F\u0936\u094D\u0932\u0947\u0937\u0923 \u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0915\u0924\u093E\u090F\u0902",
    subtitle: "\u0909\u0924\u094D\u092A\u093E\u0926 \u0935\u093F\u0936\u094D\u0932\u0947\u0937\u0923 \u0915\u0947 \u0926\u094C\u0930\u093E\u0928 \u0915\u093F\u0938 \u091C\u093E\u0928\u0915\u093E\u0930\u0940 \u0915\u094B \u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E \u0926\u0947\u0902\u0964",
    description: "\u092F\u0947 \u0938\u0947\u091F\u093F\u0902\u0917\u094D\u0938 \u092A\u0930\u093F\u0923\u093E\u092E \u092A\u094D\u0930\u0938\u094D\u0924\u0941\u0924 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0924\u0930\u0940\u0915\u0947 \u0915\u094B \u092A\u094D\u0930\u092D\u093E\u0935\u093F\u0924 \u0915\u0930\u0924\u0940 \u0939\u0948\u0902\u0964",
    saved: "\u092A\u094D\u0930\u093E\u0925\u092E\u093F\u0924\u093E\u090F\u0902 \u0938\u0939\u0947\u0938\u0940 \u0917\u090F\u0902",
  },
  language: {
    title: "\u092D\u093E\u0937\u093E",
    subtitle: "\u090F\u092A\u094D\u0932\u093F\u0915\u0947\u0936\u0928 \u0907\u0902\u091F\u0930\u092B\u093C\u0947\u0938 \u0915\u0947 \u0932\u093F\u090F \u0905\u092A\u0928\u0940 \u092A\u0938\u0902\u0926\u0940\u0926\u093E \u092D\u093E\u0937\u093E \u091A\u0941\u0928\u0947\u0902\u0964",
    currentLabel: "\u0935\u0930\u094D\u0924\u092E\u093E\u0928 \u092D\u093E\u0937\u093E",
    changed: "\u092D\u093E\u0937\u093E \u0905\u092A\u0921\u0947\u091F \u0915\u0940 \u0917\u0908",
  },
  privacy: {
    title: "\u0917\u094B\u092A\u0928\u093F\u092F\u0924\u093E \u0914\u0930 \u0921\u0947\u091F\u093E",
    subtitle: "\u0928\u093F\u092F\u0902\u091F\u094D\u0930\u093F\u0924 \u0915\u0930\u0947\u0902 \u0915\u093F \u0906\u092A\u0915\u093E \u0921\u0947\u091F\u093E \u0915\u0948\u0938\u0947 \u0938\u0902\u0917\u094D\u0930\u0939\u093F\u0924 \u0914\u0930 \u0909\u092A\u092F\u094B\u0917 \u0915\u093F\u092F\u093E \u091C\u093E\u0924\u093E \u0939\u0948\u0964",
    scanHistory: "\u0938\u094D\u0915\u0948\u0928 \u0907\u0924\u093F\u0939\u093E\u0938",
    keepHistory: "\u0938\u094D\u0915\u0948\u0928 \u0907\u0924\u093F\u0939\u093E\u0938 \u0930\u0916\u0947\u0902",
    clearHistory: "\u0938\u094D\u0915\u0948\u0928 \u0907\u0924\u093F\u0939\u093E\u0938 \u0938\u093E\u092B\u093C \u0915\u0930\u0947\u0902",
    clearConfirm: "\u0938\u094D\u0915\u0948\u0928 \u0907\u0924\u093F\u0939\u093E\u0938 \u0938\u093E\u092B\u093C \u0915\u0930\u0947\u0902?",
    clearConfirmDescription: "\u092F\u0939 \u0906\u092A\u0915\u0947 \u0938\u092D\u0940 \u0938\u094D\u0915\u0948\u0928 \u0907\u0924\u093F\u0939\u093E\u0938 \u0915\u094B \u0938\u094D\u0925\u093E\u092F \u0939\u091F\u093E \u0926\u0947\u0917\u093E\u0964 \u092F\u0939 \u0915\u094D\u0930\u093F\u092F\u093E \u0905\u092A\u0930\u093F\u0935\u0930\u094D\u0924\u0928\u0940\u092F \u0928\u0939\u0940\u0902 \u0939\u0948\u0964",
    personalData: "\u0935\u094D\u092F\u0915\u094D\u0924\u093F\u0917 \u0921\u0947\u091F\u093E",
    downloadData: "\u092E\u0947\u0930\u093E \u0921\u0947\u091F\u093E \u0921\u093E\u0909\u0928\u0932\u094B\u0921 \u0915\u0930\u0947\u0902",
    deleteAccount: "\u092E\u0947\u0930\u093E \u0916\u093E\u0924\u093E \u0939\u091F\u093E\u090F\u0902",
    dataUsage: "\u0921\u0947\u091F\u093E \u0909\u092A\u092F\u094B\u0917",
    dataUsageDescription: "\u0906\u092A\u0915\u0940 \u092A\u094D\u0930\u094B\u092B\u093C\u093E\u0907\u0932 \u0914\u0930 \u0938\u0939\u0947\u091C\u093E \u0935\u093F\u0936\u094D\u0932\u0947\u0937\u0923 \u0907\u0924\u093F\u0939\u093E\u0938 \u0905\u0928\u0941\u0924\u0924\u092E \u0935\u0948\u0936\u093F\u0937\u094D\u091F\u093F\u0915 \u0938\u0941\u0935\u093F\u0927\u093E\u0913\u0902 \u0915\u094B \u092A\u094D\u0930\u0926\u093E\u0928 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0909\u092A\u092F\u094B\u0917 \u0915\u093F\u092F\u093E \u091C\u093E\u0924\u093E \u0939\u0948\u0964",
    saved: "\u0938\u0947\u091F\u093F\u0902\u0917\u094D\u0938 \u0938\u0939\u0947\u0938\u0940 \u0917\u090F\u0902",
  },
  security: {
    title: "\u0938\u0941\u0930\u0915\u094D\u0937\u093E",
    subtitle: "\u0905\u092A\u0928\u0947 \u092A\u093E\u0938\u0935\u0930\u094D\u0921 \u0914\u0930 \u0916\u093E\u0924\u0947 \u0915\u0940 \u0938\u0941\u0930\u0915\u094D\u0937\u093E \u0938\u0947\u091F\u093F\u0902\u0917 \u0915\u093E \u092A\u094D\u0930\u092C\u0902\u0927\u0928 \u0915\u0930\u0947\u0902\u0964",
    changePassword: "\u092A\u093E\u0938\u0935\u0930\u094D\u0921 \u092C\u0926\u0932\u0947\u0902",
    lastChanged: "\u0905\u0902\u0924\u093F\u092E \u092C\u0926\u0932\u093E",
    activeSessions: "\u0938\u0915\u094D\u0930\u093F\u092F \u0938\u0947\u0936\u0928",
    sessionsCount: "{count} \u0921\u093F\u0935\u093E\u0907\u0938(\u0947\u0902) \u0935\u0930\u094D\u0924\u092E\u093E\u0928 \u0938\u093E\u0907\u0928 \u0907\u0928",
    logoutAll: "\u0938\u092D\u0940 \u0921\u093F\u0935\u093E\u0907\u0938\u0947\u0938 \u0938\u0947 \u0932\u0949\u0917 \u0906\u0909\u091F \u0915\u0930\u0947\u0902",
    twoFactor: "\u0926\u094D\u0935\u093F-0915\u094D\u0937\u0924\u094D\u0930 \u092A\u094D\u0930\u092E\u093E\u0923\u0940\u0915\u0930\u0923",
    twoFactorEnabled: "\u0938\u0915\u094D\u0930\u093F\u092F \u0915\u093F\u092F\u093E \u0917\u092F\u093E",
    twoFactorDisabled: "\u0938\u0915\u094D\u0930\u093F\u092F \u0928\u0939\u0940\u0902",
    linkedAccounts: "\u0932\u093F\u0902\u0915\u094D\u0921 \u0916\u093E\u0924\u0947",
  },
  accountActions: {
    title: "\u0916\u093E\u0924\u093E",
    logout: "\u0932\u0949\u0917 \u0906\u0909\u091F",
    deleteAccount: "\u0916\u093E\u0924\u093E \u0939\u091F\u093E\u090F\u0902",
    deleteConfirmTitle: "\u0916\u093E\u0924\u093E \u0939\u091F\u093E\u090F\u0902?",
    deleteConfirmDescription: "\u092F\u0939 \u0915\u094D\u0930\u093F\u092F\u093E \u0906\u092A\u0915\u0947 \u0916\u093E\u0924\u0947 \u0914\u0930 \u0938\u0902\u092C\u0902\u0927\u093F\u0924 \u0921\u0947\u091F\u093E \u0915\u094B \u0938\u094D\u0925\u093E\u092F \u0939\u091F\u093E \u0926\u0947\u0917\u093E\u0964 \u092F\u0939 \u0905\u092A\u0930\u093F\u0935\u0930\u094D\u0924\u0928\u0940\u092F \u0928\u0939\u0940\u0902 \u0939\u0948\u0964",
    deleteConfirmButton: "\u0916\u093E\u0924\u093E \u0939\u091F\u093E\u090F\u0902",
    cancelButton: "\u0930\u0926\u094D\u0926 \u0915\u0930\u0947\u0902",
  },
  nav: {
    home: "\u0939\u094B\u092E",
    scan: "\u0938\u094D\u0915\u0948\u0928",
    search: "\u0916\u094B\u091C\u0947\u0902",
    history: "\u0907\u0924\u093F\u0939\u093E\u0938",
    profile: "\u092A\u094D\u0930\u094B\u092B\u093C\u093E\u0907\u0932",
  },
};

const labelsMap: Record<string, ProfileLabels> = { en, hi };

export function getProfileLabels(lang: string): ProfileLabels {
  return labelsMap[lang] ?? en;
}
