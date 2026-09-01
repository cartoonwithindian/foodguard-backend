export type AuthLabels = {
  login: {
    title: string;
    subtitle: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    forgotPassword: string;
    signInButton: string;
    signingIn: string;
    orDivider: string;
    continueWithGoogle: string;
    noAccount: string;
    createAccountLink: string;
    forgotPasswordNote: string;
    googleNote: string;
  };
  signup: {
    title: string;
    subtitle: string;
    fullNameLabel: string;
    fullNamePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    confirmPasswordLabel: string;
    confirmPasswordPlaceholder: string;
    createAccountButton: string;
    creatingAccount: string;
    termsPrefix: string;
    termsLink: string;
    andLink: string;
    privacyLink: string;
    orDivider: string;
    continueWithGoogle: string;
    hasAccount: string;
    signInLink: string;
    googleNote: string;
  };
  validation: {
    emailRequired: string;
    emailInvalid: string;
    passwordRequired: string;
    passwordMinLength: string;
    passwordMismatch: string;
    nameRequired: string;
    confirmPasswordRequired: string;
  };
  passwordStrength: {
    weak: string;
    medium: string;
    strong: string;
  };
  sidePanel: {
    heading: string;
    description: string;
  };
  guest: {
    heading: string;
    note: string;
    button: string;
    loading: string;
    error: string;
    orDivider: string;
  };
};

export const AUTH_LABELS: Record<string, AuthLabels> = {
  en: {
    login: {
      title: "Welcome Back",
      subtitle: "Sign in to continue analyzing the products you use.",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      passwordLabel: "Password",
      passwordPlaceholder: "Enter your password",
      forgotPassword: "Forgot password?",
      signInButton: "Sign In",
      signingIn: "Signing in...",
      orDivider: "OR",
      continueWithGoogle: "Continue with Google",
      noAccount: "Don't have an account?",
      createAccountLink: "Create account",
      forgotPasswordNote: "Password reset isn't set up in this build. Use \"Continue as Guest\" or create an account.",
      googleNote: "Google sign-in isn't configured in this build. Use \"Continue as Guest\" instead.",
    },
    signup: {
      title: "Create Your Account",
      subtitle:
        "Create an account to save your scans, preferences, and product history.",
      fullNameLabel: "Full Name",
      fullNamePlaceholder: "John Doe",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      passwordLabel: "Password",
      passwordPlaceholder: "Create a password",
      confirmPasswordLabel: "Confirm Password",
      confirmPasswordPlaceholder: "Confirm your password",
      createAccountButton: "Create Account",
      creatingAccount: "Creating account...",
      termsPrefix: "By creating an account, you agree to our ",
      termsLink: "Terms of Service",
      andLink: " and ",
      privacyLink: "Privacy Policy",
      orDivider: "OR",
      continueWithGoogle: "Continue with Google",
      hasAccount: "Already have an account?",
      signInLink: "Sign in",
      googleNote: "Google sign-in isn't configured in this build. Use \"Continue as Guest\" instead.",
    },
    validation: {
      emailRequired: "Please enter your email address.",
      emailInvalid: "Please enter a valid email address.",
      passwordRequired: "Please enter a password.",
      passwordMinLength: "Password must contain at least 8 characters.",
      passwordMismatch: "Passwords do not match.",
      nameRequired: "Please enter your full name.",
      confirmPasswordRequired: "Please confirm your password.",
    },
    passwordStrength: {
      weak: "Weak",
      medium: "Medium",
      strong: "Strong",
    },
    sidePanel: {
      heading: "Understand what you're buying.",
      description:
        "Scan products. Understand ingredients. Make informed choices.",
    },
    guest: {
      heading: "No account yet?",
      note: "Skip the form and explore FoodGaurd instantly as a guest — no email or password needed.",
      button: "Continue as Guest",
      loading: "Signing in as guest...",
      error: "Could not start a guest session. Please try again.",
      orDivider: "OR",
    },
  },
  hi: {
    login: {
      title: "वापसी पर स्वागत है",
      subtitle:
        "उत्पादों का विश्लेषण जारी रखने के लिए साइन इन करें।",
      emailLabel: "ईमेल",
      emailPlaceholder: "you@example.com",
      passwordLabel: "पासवर्ड",
      passwordPlaceholder: "अपना पासवर्ड दर्ज करें",
      forgotPassword: "पासवर्ड भूल गए?",
      signInButton: "साइन इन करें",
      signingIn: "साइन इन हो रहा है...",
      orDivider: "या",
      continueWithGoogle: "Google से जारी रखें",
      noAccount: "खाता नहीं है?",
      createAccountLink: "खाता बनाएं",
      forgotPasswordNote: "इस बिल्ड में पासवर्ड रीसेट उपलब्ध नहीं है। \"गेस्ट के रूप में जारी रखें\" का उपयोग करें या खाता बनाएं।",
      googleNote: "इस बिल्ड में Google साइन-इन कॉन्फ़िगर नहीं है। इसके बजाय \"गेस्ट के रूप में जारी रखें\" का उपयोग करें।",
    },
    signup: {
      title: "अपना खाता बनाएं",
      subtitle:
        "अपने स्कैन, प्राथमिकताएं और उत्पाद इतिहास सहेजने के लिए खाता बनाएं।",
      fullNameLabel: "पूरा नाम",
      fullNamePlaceholder: "जॉन डो",
      emailLabel: "ईमेल",
      emailPlaceholder: "you@example.com",
      passwordLabel: "पासवर्ड",
      passwordPlaceholder: "पासवर्ड बनाएं",
      confirmPasswordLabel: "पासवर्ड की पुष्टि करें",
      confirmPasswordPlaceholder: "अपना पासवर्ड पुष्टि करें",
      createAccountButton: "खाता बनाएं",
      creatingAccount: "खाता बन रहा है...",
      termsPrefix: "खाता बनाकर, आप हमारी ",
      termsLink: "सेवा की शर्तें",
      andLink: " और ",
      privacyLink: "गोपनीयता नीति",
      orDivider: "या",
      continueWithGoogle: "Google से जारी रखें",
      hasAccount: "पहले से खाता है?",
      signInLink: "साइन इन करें",
      googleNote: "इस बिल्ड में Google साइन-इन कॉन्फ़िगर नहीं है। इसके बजाय \"गेस्ट के रूप में जारी रखें\" का उपयोग करें।",
    },
    validation: {
      emailRequired: "कृपया अपना ईमेल पता दर्ज करें।",
      emailInvalid: "कृपया एक मान्य ईमेल पता दर्ज करें।",
      passwordRequired: "कृपया पासवर्ड दर्ज करें।",
      passwordMinLength: "पासवर्ड में कम से कम 8 अक्षर होने चाहिए।",
      passwordMismatch: "पासवर्ड मेल नहीं खाते।",
      nameRequired: "कृपया अपना पूरा नाम दर्ज करें।",
      confirmPasswordRequired: "कृपया अपना पासवर्ड पुष्टि करें।",
    },
    passwordStrength: {
      weak: "कमज़ोर",
      medium: "मध्यम",
      strong: "मजबूत",
    },
    sidePanel: {
      heading: "समझें आप क्या खरीद रहे हैं।",
      description:
        "उत्पादों को स्कैन करें। सामग्री को समझें। सूचित चुनाव करें।",
    },
    guest: {
      heading: "अभी खाता नहीं है?",
      note: "फ़ॉर्म छोड़ें और बिना ईमेल या पासवर्ड के गेस्ट के रूप में FoodGaurd एक्सप्लोर करें।",
      button: "गेस्ट के रूप में जारी रखें",
      loading: "गेस्ट के रूप में साइन इन हो रहा है...",
      error: "गेस्ट सत्र शुरू नहीं हो सका। कृपया पुनः प्रयास करें।",
      orDivider: "या",
    },
  },
};

export function getAuthLabels(languageId: string): AuthLabels {
  return AUTH_LABELS[languageId] ?? AUTH_LABELS.en;
}
