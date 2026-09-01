export type AppLanguage = {
  id: string;
  label: string;
  nativeLabel: string;
  flag: string;
  locale: string;
};

export const APP_LANGUAGES: AppLanguage[] = [
  {
    id: "en",
    label: "English",
    nativeLabel: "English",
    flag: "🇬🇧",
    locale: "en",
  },
  {
    id: "hi",
    label: "Hindi",
    nativeLabel: "हिन्दी",
    flag: "🇮🇳",
    locale: "hi",
  },
];

export const DEFAULT_LANGUAGE_ID = "en";
