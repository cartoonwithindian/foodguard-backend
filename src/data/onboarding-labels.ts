export type OnboardingLabels = {
  step1: {
    title: string;
    subtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    ageLabel: string;
    agePlaceholder: string;
    genderLabel: string;
    genderPlaceholder: string;
    genderOptions: { value: string; label: string }[];
  };
  step2: {
    title: string;
    subtitle: string;
    heightLabel: string;
    weightLabel: string;
    activityLabel: string;
    activityOptions: { value: string; label: string }[];
    heightPlaceholder: string;
    weightPlaceholder: string;
  };
  step3: {
    title: string;
    subtitle: string;
    options: { value: string; label: string; description: string }[];
  };
  step4: {
    title: string;
    subtitle: string;
    skip: string;
    options: { value: string; label: string }[];
  };
  step5: {
    title: string;
    subtitle: string;
    skip: string;
    addPlaceholder: string;
    addButton: string;
    options: { value: string; label: string }[];
    note: string;
  };
  step6: {
    title: string;
    subtitle: string;
    skip: string;
    options: { value: string; label: string }[];
    disclaimer: string;
  };
  summary: {
    title: string;
    subtitle: string;
    goalLabel: string;
    dietLabel: string;
    allergiesLabel: string;
    activityLabel: string;
    healthLabel: string;
    editButton: string;
  };
  nav: {
    back: string;
    continue: string;
    skip: string;
    finish: string;
  };
  progress: string;
};

export const ONBOARDING_LABELS: Record<string, OnboardingLabels> = {
  en: {
    step1: {
      title: "Let's personalize your experience",
      subtitle:
        "A few details will help us make product insights more relevant to you.",
      nameLabel: "Full Name",
      namePlaceholder: "Enter your name",
      ageLabel: "Age",
      agePlaceholder: "e.g. 25",
      genderLabel: "Gender (optional)",
      genderPlaceholder: "Select gender",
      genderOptions: [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" },
        { value: "non_binary", label: "Non-binary" },
        { value: "prefer_not_to_say", label: "Prefer not to say" },
      ],
    },
    step2: {
      title: "Tell us a little about yourself",
      subtitle: "",
      heightLabel: "Height",
      weightLabel: "Weight",
      activityLabel: "Activity Level (optional)",
      heightPlaceholder: "e.g. 170",
      weightPlaceholder: "e.g. 65",
      activityOptions: [
        { value: "sedentary", label: "Sedentary" },
        { value: "lightly_active", label: "Lightly Active" },
        { value: "moderately_active", label: "Moderately Active" },
        { value: "very_active", label: "Very Active" },
      ],
    },
    step3: {
      title: "What is your main goal?",
      subtitle: "",
      options: [
        {
          value: "lose",
          label: "Lose Weight",
          description:
            "Make choices that support your weight-management goal.",
        },
        {
          value: "gain",
          label: "Gain Weight",
          description: "Find products that fit your nutritional goals.",
        },
        {
          value: "maintain",
          label: "Maintain Weight",
          description: "Maintain your current routine and choices.",
        },
        {
          value: "general",
          label: "General Healthy Choices",
          description:
            "Understand ingredients and make more informed decisions.",
        },
      ],
    },
    step4: {
      title: "Any dietary preferences?",
      subtitle: "",
      skip: "Skip for now",
      options: [
        { value: "vegetarian", label: "Vegetarian" },
        { value: "vegan", label: "Vegan" },
        { value: "eggetarian", label: "Eggetarian" },
        { value: "non_vegetarian", label: "Non-Vegetarian" },
        { value: "jain", label: "Jain" },
        { value: "no_preference", label: "No Preference" },
        { value: "other", label: "Other" },
      ],
    },
    step5: {
      title: "Any ingredients you want to avoid?",
      subtitle: "",
      skip: "Skip for now",
      addPlaceholder: "Add an ingredient",
      addButton: "Add",
      options: [
        { value: "milk", label: "Milk / Dairy" },
        { value: "eggs", label: "Eggs" },
        { value: "peanuts", label: "Peanuts" },
        { value: "tree_nuts", label: "Tree Nuts" },
        { value: "soy", label: "Soy" },
        { value: "gluten", label: "Gluten" },
        { value: "fish", label: "Fish" },
        { value: "shellfish", label: "Shellfish" },
        { value: "other", label: "Other" },
      ],
      note: "You can change these preferences anytime from Profile.",
    },
    step6: {
      title: "Anything you'd like us to consider?",
      subtitle: "",
      skip: "Skip this step",
      options: [
        { value: "diabetes", label: "Diabetes / blood-sugar considerations" },
        { value: "high_blood_pressure", label: "High blood pressure" },
        { value: "high_cholesterol", label: "High cholesterol" },
        { value: "sensitive_skin", label: "Sensitive skin" },
        { value: "none", label: "None" },
        {
          value: "prefer_not_to_say",
          label: "Prefer not to say",
        },
      ],
      disclaimer:
        "This information is used only to personalize product insights. It is not a medical diagnosis or substitute for professional medical advice.",
    },
    summary: {
      title: "Your Preferences",
      subtitle: "Review your selections before continuing.",
      goalLabel: "Goal",
      dietLabel: "Diet",
      allergiesLabel: "Allergies",
      activityLabel: "Activity",
      healthLabel: "Health",
      editButton: "Edit",
    },
    nav: {
      back: "Back",
      continue: "Continue",
      skip: "Skip",
      finish: "Continue to App",
    },
    progress: "Step {current} of {total}",
  },
  hi: {
    step1: {
      title: "अपने अनुभव को व्यक्तिगत बनाएं",
      subtitle:
        "कुछ विवरण हमें उत्पाद अंतर्दृष्टि को आपके लिए अधिक प्रासंगिक बनाने में मदद करेंगे।",
      nameLabel: "पूरा नाम",
      namePlaceholder: "अपना नाम दर्ज करें",
      ageLabel: "आयु",
      agePlaceholder: "जैसे 25",
      genderLabel: "लिंग (वैकल्पिक)",
      genderPlaceholder: "लिंग चुनें",
      genderOptions: [
        { value: "male", label: "पुरुष" },
        { value: "female", label: "महिला" },
        { value: "non_binary", label: "गैर-बाइनरी" },
        { value: "prefer_not_to_say", label: "बताना नहीं चाहते" },
      ],
    },
    step2: {
      title: "अपने बारे में थोड़ा बताएं",
      subtitle: "",
      heightLabel: "ऊँचाई",
      weightLabel: "वज़न",
      activityLabel: "गतिविधि स्तर (वैकल्पिक)",
      heightPlaceholder: "जैसे 170",
      weightPlaceholder: "जैसे 65",
      activityOptions: [
        { value: "sedentary", label: "गतिहीन" },
        { value: "lightly_active", label: "हल्की गतिविधि" },
        { value: "moderately_active", label: "मध्यम गतिविधि" },
        { value: "very_active", label: "अधिक गतिविधि" },
      ],
    },
    step3: {
      title: "आपका मुख्य लक्ष्य क्या है?",
      subtitle: "",
      options: [
        {
          value: "lose",
          label: "वज़न कम करना",
          description: "वज़न प्रबंधन लक्ष्य का समर्थन करने वाले विकल्प बनाएं।",
        },
        {
          value: "gain",
          label: "वज़न बढ़ाना",
          description: "पोषण लक्ष्यों के अनुकूल उत्पाद खोजें।",
        },
        {
          value: "maintain",
          label: "वज़न बनाए रखना",
          description: "अपनी वर्तमान दिनचर्या और विकल्पों को बनाए रखें।",
        },
        {
          value: "general",
          label: "सामान्य स्वस्थ विकल्प",
          description: "सामग्री को समझें और सूचित निर्णय लें।",
        },
      ],
    },
    step4: {
      title: "कोई आहार प्राथमिकता?",
      subtitle: "",
      skip: "अभी छोड़ें",
      options: [
        { value: "vegetarian", label: "शाकाहारी" },
        { value: "vegan", label: "वीगन" },
        { value: "eggetarian", label: "अंडेटेरियन" },
        { value: "non_vegetarian", label: "मांसाहारी" },
        { value: "jain", label: "जैन" },
        { value: "no_preference", label: "कोई प्राथमिकता नहीं" },
        { value: "other", label: "अन्य" },
      ],
    },
    step5: {
      title: "कौन सी सामग्री से बचना चाहते हैं?",
      subtitle: "",
      skip: "अभी छोड़ें",
      addPlaceholder: "सामग्री जोड़ें",
      addButton: "जोड़ें",
      options: [
        { value: "milk", label: "दूध / डेयरी" },
        { value: "eggs", label: "अंडे" },
        { value: "peanuts", label: "मूंगफली" },
        { value: "tree_nuts", label: "पेड़ के नट" },
        { value: "soy", label: "सोयाबीन" },
        { value: "gluten", label: "ग्लूटेन" },
        { value: "fish", label: "मछली" },
        { value: "shellfish", label: "शेलफिश" },
        { value: "other", label: "अन्य" },
      ],
      note: "आप इन प्राथमिकताओं को कभी भी प्रोफ़ाइल से बदल सकते हैं।",
    },
    step6: {
      title: "कुछ ऐसा जो हमें ध्यान में रखना चाहिए?",
      subtitle: "",
      skip: "यह चरण छोड़ें",
      options: [
        { value: "diabetes", label: "मधुमेह / रक्त शर्करा संबंधी" },
        { value: "high_blood_pressure", label: "उच्च रक्तचाप" },
        { value: "high_cholesterol", label: "उच्च कोलेस्ट्रॉल" },
        { value: "sensitive_skin", label: "संवेदनशील त्वचा" },
        { value: "none", label: "कोई नहीं" },
        {
          value: "prefer_not_to_say",
          label: "बताना नहीं चाहते",
        },
      ],
      disclaimer:
        "यह जानकारी केवल उत्पाद अंतर्दृष्टि को व्यक्तिगत बनाने के लिए उपयोग की जाती है। यह चिकित्सा निदान या पेशेवर चिकित्सा सलाह का विकल्प नहीं है।",
    },
    summary: {
      title: "आपकी प्राथमिकताएं",
      subtitle: "जारी रखने से पहले अपने चयन की समीक्षा करें।",
      goalLabel: "लक्ष्य",
      dietLabel: "आहार",
      allergiesLabel: "एलर्जी",
      activityLabel: "गतिविधि",
      healthLabel: "स्वास्थ्य",
      editButton: "संपादित करें",
    },
    nav: {
      back: "वापस",
      continue: "जारी रखें",
      skip: "छोड़ें",
      finish: "ऐप में जारी रखें",
    },
    progress: "चरण {current} / {total}",
  },
};

export function getOnboardingLabels(languageId: string): OnboardingLabels {
  return ONBOARDING_LABELS[languageId] ?? ONBOARDING_LABELS.en;
}
