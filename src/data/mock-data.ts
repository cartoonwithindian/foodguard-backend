export type ProductCategory =
  | "food"
  | "cosmetics"
  | "personal_care"
  | "household"
  | "other";

export type ConcernLevel = "high" | "moderate" | "low";

export type ScannedProduct = {
  id: string;
  name: string;
  category: ProductCategory;
  concern: ConcernLevel;
  scannedAt: string;
  barcode?: string;
};

export type DashboardUser = {
  name: string;
  goal: string;
  diet: string;
};

export type UserPreference = {
  goal: string;
  focuses: string[];
};

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  food: "Food & Beverage",
  cosmetics: "Cosmetics & Skincare",
  personal_care: "Personal Care",
  household: "Household Products",
  other: "Other",
};

export const CONCERN_COLORS: Record<
  ConcernLevel,
  { bg: string; text: string; dot: string }
> = {
  high: { bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
  moderate: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  low: { bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-400", dot: "bg-green-600" },
};

export const MOCK_USER: DashboardUser = {
  name: "Anurag",
  goal: "Weight Management",
  diet: "Vegetarian",
};

export const MOCK_PREFERENCES: UserPreference = {
  goal: "Weight Loss",
  focuses: ["Lower Sugar", "Lower Sodium"],
};

export const MOCK_RECENT_SCANS: ScannedProduct[] = [
  {
    id: "1",
    name: "GlowCare Face Wash",
    category: "cosmetics",
    concern: "moderate",
    scannedAt: "today",
  },
  {
    id: "2",
    name: "OatPlus Protein Bar",
    category: "food",
    concern: "low",
    scannedAt: "today",
  },
  {
    id: "3",
    name: "FreshGlow Shampoo",
    category: "personal_care",
    concern: "high",
    scannedAt: "yesterday",
  },
  {
    id: "4",
    name: "NatureBest Orange Juice",
    category: "food",
    concern: "low",
    scannedAt: "yesterday",
  },
  {
    id: "5",
    name: "CleanHome Floor Cleaner",
    category: "household",
    concern: "moderate",
    scannedAt: "2 days ago",
  },
];

export const MOCK_CONCERN_SUMMARY = {
  high: 4,
  moderate: 7,
  low: 15,
};
