export type UserProfile = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  height: number | null;
  weight: number | null;
  avatarUrl?: string;
  memberSince: string;
  accountStatus: "active" | "inactive";
};

export type UserGoal =
  | "maintain_weight"
  | "weight_loss"
  | "weight_gain"
  | "improve_nutrition"
  | "general_awareness"
  | null;

export type GoalSubPreference = {
  key: string;
  label: string;
  enabled: boolean;
};

export type ProductPreference = {
  id: string;
  type: "avoid" | "prefer";
  value: string;
};

export type AnalysisPreference = {
  key: string;
  label: string;
  enabled: boolean;
};

export type PrivacySettings = {
  keepScanHistory: boolean;
};

export type SecurityInfo = {
  lastPasswordChange: string;
  activeSessions: number;
  twoFactorEnabled: boolean;
  linkedProviders: string[];
};

export const GOAL_OPTIONS: { key: UserGoal; label: string; description: string }[] = [
  { key: "maintain_weight", label: "Maintain Weight", description: "Keep your current weight while making informed product choices" },
  { key: "weight_loss", label: "Weight Loss", description: "Focus on lower calorie and sugar options" },
  { key: "weight_gain", label: "Weight Gain", description: "Prioritize protein-rich and nutrient-dense products" },
  { key: "improve_nutrition", label: "Improve Nutrition", description: "Enhance overall nutritional intake across product categories" },
  { key: "general_awareness", label: "General Product Awareness", description: "Stay informed about ingredients in everyday products" },
];

export const GOAL_SUB_PREFERENCES: Record<string, { key: string; label: string }[]> = {
  weight_loss: [
    { key: "lower_calorie", label: "Lower calorie density" },
    { key: "lower_sugar", label: "Lower added sugar" },
    { key: "higher_fibre", label: "Higher fibre" },
    { key: "higher_protein", label: "Higher protein" },
  ],
  weight_gain: [
    { key: "higher_protein", label: "Higher protein" },
    { key: "higher_calorie", label: "Higher calorie density" },
    { key: "higher_fibre", label: "Higher fibre" },
    { key: "nutrient_dense", label: "Nutrient-dense options" },
  ],
  improve_nutrition: [
    { key: "lower_sugar", label: "Lower sugar" },
    { key: "lower_sodium", label: "Lower sodium" },
    { key: "higher_protein", label: "Higher protein" },
    { key: "higher_fibre", label: "Higher fibre" },
    { key: "more_vitamins", label: "More vitamins & minerals" },
  ],
  maintain_weight: [
    { key: "balanced_nutrition", label: "Balanced nutrition" },
    { key: "moderate_portions", label: "Moderate portion sizes" },
  ],
  general_awareness: [],
};

export const ANALYSIS_PREFERENCE_OPTIONS: AnalysisPreference[] = [
  { key: "nutrition", label: "Nutrition", enabled: true },
  { key: "ingredients", label: "Ingredients", enabled: true },
  { key: "additives", label: "Additives", enabled: true },
  { key: "evidence", label: "Evidence & Sources", enabled: true },
  { key: "comparison", label: "Product Comparison", enabled: true },
];

export const MOCK_PROFILE: UserProfile = {
  id: "usr-001",
  name: "Anurag",
  email: "anuraggod2007@gmail.com",
  age: 24,
  height: 175,
  weight: 72,
  memberSince: "2026-01-15",
  accountStatus: "active",
};

export const MOCK_GOAL: UserGoal = "improve_nutrition";

export const MOCK_GOAL_PREFS: GoalSubPreference[] = [
  { key: "lower_sugar", label: "Lower sugar", enabled: true },
  { key: "lower_sodium", label: "Lower sodium", enabled: false },
  { key: "higher_protein", label: "Higher protein", enabled: true },
  { key: "higher_fibre", label: "Higher fibre", enabled: true },
  { key: "more_vitamins", label: "More vitamins & minerals", enabled: false },
];

export const MOCK_PRODUCT_PREFS: ProductPreference[] = [
  { id: "pp-1", type: "avoid", value: "Artificial colors" },
  { id: "pp-2", type: "avoid", value: "High fructose corn syrup" },
  { id: "pp-3", type: "prefer", value: "Whole grain ingredients" },
  { id: "pp-4", type: "prefer", value: "Natural preservatives" },
];

export const MOCK_ANALYSIS_PREFS: AnalysisPreference[] = [
  { key: "nutrition", label: "Nutrition", enabled: true },
  { key: "ingredients", label: "Ingredients", enabled: true },
  { key: "additives", label: "Additives", enabled: true },
  { key: "evidence", label: "Evidence & Sources", enabled: false },
  { key: "comparison", label: "Product Comparison", enabled: true },
];

export const MOCK_PRIVACY: PrivacySettings = {
  keepScanHistory: true,
};

export const MOCK_SECURITY: SecurityInfo = {
  lastPasswordChange: "2026-06-01",
  activeSessions: 2,
  twoFactorEnabled: false,
  linkedProviders: ["Google"],
};
