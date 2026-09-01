export type HeightUnit = "cm" | "ft";
export type WeightUnit = "kg" | "lb";
export type ActivityLevel =
  | "sedentary"
  | "lightly_active"
  | "moderately_active"
  | "very_active"
  | "";
export type Goal = "lose" | "gain" | "maintain" | "general" | "";
export type DietaryPreference =
  | "vegetarian"
  | "vegan"
  | "eggetarian"
  | "non_vegetarian"
  | "jain"
  | "no_preference"
  | "other";
export type Allergen =
  | "milk"
  | "eggs"
  | "peanuts"
  | "tree_nuts"
  | "soy"
  | "gluten"
  | "fish"
  | "shellfish"
  | "other";
export type HealthConsideration =
  | "diabetes"
  | "high_blood_pressure"
  | "high_cholesterol"
  | "sensitive_skin"
  | "none"
  | "prefer_not_to_say";

export type UserProfile = {
  name: string;
  age: string;
  gender: string;
  height: string;
  heightUnit: HeightUnit;
  weight: string;
  weightUnit: WeightUnit;
  activityLevel: ActivityLevel;
  goal: Goal;
  dietaryPreferences: DietaryPreference[];
  allergies: Allergen[];
  customAllergies: string[];
  healthConsiderations: HealthConsideration[];
};

export const INITIAL_PROFILE: UserProfile = {
  name: "",
  age: "",
  gender: "",
  height: "",
  heightUnit: "cm",
  weight: "",
  weightUnit: "kg",
  activityLevel: "",
  goal: "",
  dietaryPreferences: [],
  allergies: [],
  customAllergies: [],
  healthConsiderations: [],
};

export const TOTAL_STEPS = 6;
