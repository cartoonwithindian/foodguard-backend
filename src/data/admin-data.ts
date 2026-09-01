import type { AssessmentLevel } from "./analysis-data";

export type { AssessmentLevel };

export type AdminRole = "super_admin" | "data_admin" | "content_reviewer" | "support_admin";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  avatar?: string;
};

export type PlatformStats = {
  totalUsers: number;
  totalProducts: number;
  totalIngredients: number;
  totalAnalyses: number;
};

export type ProcessingStatus = "completed" | "processing" | "failed" | "insufficient_data";

export type AnalysisActivityEntry = {
  id: string;
  productName: string;
  userAnonymized: string;
  assessment: AssessmentLevel;
  date: string;
  status: ProcessingStatus;
};

export type AssessmentDistribution = {
  low: number;
  moderate: number;
  high: number;
  insufficient: number;
};

export type UserStatus = "active" | "suspended" | "inactive";

export type AdminUserEntry = {
  id: string;
  name: string;
  email: string;
  registrationDate: string;
  totalScans: number;
  lastActivity: string;
  status: UserStatus;
};

export type ProductDataStatus = "complete" | "incomplete" | "needs_review";

export type ProductEntry = {
  id: string;
  name: string;
  category: string;
  barcode: string;
  dataStatus: ProductDataStatus;
  lastUpdated: string;
  analysisStatus: ProcessingStatus;
};

export type IngredientEntry = {
  id: string;
  name: string;
  code: string;
  function: string;
  category: string;
  assessmentStatus: AssessmentLevel;
  evidenceAvailable: boolean;
  lastUpdated: string;
};

export type SourceType = "government" | "regulatory" | "scientific" | "product_information" | "food_database";

export type EvidenceEntry = {
  id: string;
  sourceName: string;
  sourceType: SourceType;
  relatedTo: string;
  relatedType: "ingredient" | "product";
  status: "verified" | "pending" | "outdated";
  lastVerified: string;
  evidenceAvailable: boolean;
};

export type DataQualitySeverity = "high" | "medium" | "low";

export type DataQualityIssue = {
  id: string;
  target: string;
  targetType: "product" | "ingredient";
  issueType: string;
  severity: DataQualitySeverity;
  dateDetected: string;
  status: "open" | "under_review" | "resolved";
};

export type LogProcessingStatus = "success" | "pending" | "failed" | "skipped";

export type AnalysisLogEntry = {
  id: string;
  productName: string;
  createdTime: string;
  processing: LogProcessingStatus;
  ingredientProcessing: LogProcessingStatus;
  evidenceRetrieval: LogProcessingStatus;
  assessment: LogProcessingStatus;
  aiExplanation: LogProcessingStatus;
  errorStatus: LogProcessingStatus;
  errorMessage?: string;
};

export type ServiceStatus = "operational" | "degraded" | "unavailable";

export type SystemHealthEntry = {
  service: string;
  status: ServiceStatus;
  lastUpdated: string;
};

export type AuditAction = "updated" | "verified" | "archived" | "suspended" | "created" | "deleted";

export type AuditLogEntry = {
  id: string;
  action: AuditAction;
  admin: string;
  target: string;
  targetType: string;
  timestamp: string;
  details?: string;
};

export type AssessmentConfigKey =
  | "high_threshold"
  | "moderate_threshold"
  | "evidence_minimum"
  | "ai_confidence_threshold";

export type SystemSetting = {
  key: string;
  label: string;
  value: string | number | boolean;
  type: "text" | "number" | "boolean" | "select";
  options?: string[];
  category: string;
  sensitive?: boolean;
};

export const MOCK_ADMIN: AdminUser = {
  id: "admin-001",
  name: "Admin",
  email: "admin@foodsafety.app",
  role: "super_admin",
};

export const MOCK_PLATFORM_STATS: PlatformStats = {
  totalUsers: 1247,
  totalProducts: 342,
  totalIngredients: 1856,
  totalAnalyses: 8934,
};

export const MOCK_ASSESSMENT_DISTRIBUTION: AssessmentDistribution = {
  low: 4120,
  moderate: 2890,
  high: 1340,
  insufficient: 584,
};

export const MOCK_ANALYSIS_ACTIVITY: AnalysisActivityEntry[] = [
  { id: "a-001", productName: "GlowCare Face Wash", userAnonymized: "User #4821", assessment: "moderate", date: "09 Aug 2026, 14:32", status: "completed" },
  { id: "a-002", productName: "OatPlus Protein Bar", userAnonymized: "User #3291", assessment: "low", date: "09 Aug 2026, 14:28", status: "completed" },
  { id: "a-003", productName: "FreshClean Shampoo", userAnonymized: "User #7712", assessment: "high", date: "09 Aug 2026, 14:15", status: "completed" },
  { id: "a-004", productName: "BioVita Supplement", userAnonymized: "User #1092", assessment: "low", date: "09 Aug 2026, 14:02", status: "processing" },
  { id: "a-005", productName: "Unknown Product", userAnonymized: "User #5543", assessment: "insufficient", date: "09 Aug 2026, 13:55", status: "failed" },
  { id: "a-006", productName: "NaturCare Moisturizer", userAnonymized: "User #2201", assessment: "moderate", date: "09 Aug 2026, 13:41", status: "completed" },
  { id: "a-007", productName: "QuickBite Cereal", userAnonymized: "User #8834", assessment: "low", date: "09 Aug 2026, 13:30", status: "completed" },
  { id: "a-008", productName: "PureSkin Serum", userAnonymized: "User #6612", assessment: "high", date: "09 Aug 2026, 13:18", status: "insufficient_data" },
];

export const MOCK_USERS: AdminUserEntry[] = [
  { id: "u-001", name: "Anurag G.", email: "anuraggod2007@gmail.com", registrationDate: "01 Jul 2026", totalScans: 42, lastActivity: "09 Aug 2026", status: "active" },
  { id: "u-002", name: "Priya S.", email: "priya.s@example.com", registrationDate: "12 Jul 2026", totalScans: 28, lastActivity: "08 Aug 2026", status: "active" },
  { id: "u-003", name: "Ravi K.", email: "ravi.k@example.com", registrationDate: "20 Jul 2026", totalScans: 15, lastActivity: "07 Aug 2026", status: "active" },
  { id: "u-004", name: "Meera P.", email: "meera.p@example.com", registrationDate: "05 Aug 2026", totalScans: 3, lastActivity: "06 Aug 2026", status: "inactive" },
  { id: "u-005", name: "Arjun M.", email: "arjun.m@example.com", registrationDate: "28 Jul 2026", totalScans: 67, lastActivity: "09 Aug 2026", status: "active" },
  { id: "u-006", name: "Neha D.", email: "neha.d@example.com", registrationDate: "15 Jul 2026", totalScans: 8, lastActivity: "01 Aug 2026", status: "suspended" },
];

export const MOCK_PRODUCTS: ProductEntry[] = [
  { id: "p-001", name: "GlowCare Face Wash", category: "Cosmetics", barcode: "8901234567890", dataStatus: "complete", lastUpdated: "08 Aug 2026", analysisStatus: "completed" },
  { id: "p-002", name: "OatPlus Protein Bar", category: "Food", barcode: "8901234567891", dataStatus: "complete", lastUpdated: "07 Aug 2026", analysisStatus: "completed" },
  { id: "p-003", name: "FreshClean Shampoo", category: "Personal Care", barcode: "8901234567892", dataStatus: "incomplete", lastUpdated: "05 Aug 2026", analysisStatus: "completed" },
  { id: "p-004", name: "BioVita Supplement", category: "Health", barcode: "8901234567893", dataStatus: "needs_review", lastUpdated: "09 Aug 2026", analysisStatus: "processing" },
  { id: "p-005", name: "NaturCare Moisturizer", category: "Cosmetics", barcode: "8901234567894", dataStatus: "complete", lastUpdated: "06 Aug 2026", analysisStatus: "completed" },
  { id: "p-006", name: "QuickBite Cereal", category: "Food", barcode: "8901234567895", dataStatus: "complete", lastUpdated: "04 Aug 2026", analysisStatus: "completed" },
  { id: "p-007", name: "PureSkin Serum", category: "Cosmetics", barcode: "8901234567896", dataStatus: "incomplete", lastUpdated: "09 Aug 2026", analysisStatus: "failed" },
  { id: "p-008", name: "HerbalTea Blend", category: "Food", barcode: "8901234567897", dataStatus: "needs_review", lastUpdated: "03 Aug 2026", analysisStatus: "completed" },
];

export const MOCK_INGREDIENTS: IngredientEntry[] = [
  { id: "sodium-lauryl-sulfate", name: "Sodium Lauryl Sulfate", code: "SLS", function: "Surfactant", category: "Cleansing", assessmentStatus: "high", evidenceAvailable: true, lastUpdated: "01 Aug 2026" },
  { id: "methylparaben", name: "Methylparaben", code: "E218", function: "Preservative", category: "Preservation", assessmentStatus: "moderate", evidenceAvailable: true, lastUpdated: "28 Jul 2026" },
  { id: "glycerin", name: "Glycerin", code: "E422", function: "Humectant", category: "Moisturizing", assessmentStatus: "low", evidenceAvailable: true, lastUpdated: "15 Jul 2026" },
  { id: "fragrance-parfum", name: "Fragrance (Parfum)", code: "PAR", function: "Scent", category: "Sensory", assessmentStatus: "moderate", evidenceAvailable: true, lastUpdated: "20 Jul 2026" },
  { id: "triclosan", name: "Triclosan", code: "TCS", function: "Antimicrobial", category: "Antibacterial", assessmentStatus: "high", evidenceAvailable: true, lastUpdated: "10 Jul 2026" },
  { id: "oats", name: "Oats", code: "OAT", function: "Base Ingredient", category: "Whole Grain", assessmentStatus: "low", evidenceAvailable: true, lastUpdated: "05 Jul 2026" },
  { id: "soy-lecithin", name: "Soy Lecithin", code: "E322", function: "Emulsifier", category: "Emulsification", assessmentStatus: "low", evidenceAvailable: true, lastUpdated: "01 Jul 2026" },
  { id: "unknown-additive-x", name: "Unknown Additive X", code: "UAX", function: "Unknown", category: "Unknown", assessmentStatus: "insufficient", evidenceAvailable: false, lastUpdated: "09 Aug 2026" },
];

export const MOCK_EVIDENCE_ENTRIES: EvidenceEntry[] = [
  { id: "ev-s-001", sourceName: "EWG Skin Deep Database", sourceType: "food_database", relatedTo: "Sodium Lauryl Sulfate", relatedType: "ingredient", status: "verified", lastVerified: "05 Aug 2026", evidenceAvailable: true },
  { id: "ev-s-002", sourceName: "EU SCCS", sourceType: "regulatory", relatedTo: "Methylparaben", relatedType: "ingredient", status: "verified", lastVerified: "01 Aug 2026", evidenceAvailable: true },
  { id: "ev-s-003", sourceName: "Contact Dermatitis Journal", sourceType: "scientific", relatedTo: "Fragrance (Parfum)", relatedType: "ingredient", status: "verified", lastVerified: "28 Jul 2026", evidenceAvailable: true },
  { id: "ev-s-004", sourceName: "USDA FoodData Central", sourceType: "food_database", relatedTo: "OatPlus Protein Bar", relatedType: "product", status: "verified", lastVerified: "07 Aug 2026", evidenceAvailable: true },
  { id: "ev-s-005", sourceName: "WHO Guidelines", sourceType: "government", relatedTo: "OatPlus Protein Bar", relatedType: "product", status: "verified", lastVerified: "07 Aug 2026", evidenceAvailable: true },
  { id: "ev-s-006", sourceName: "Product Label", sourceType: "product_information", relatedTo: "GlowCare Face Wash", relatedType: "product", status: "verified", lastVerified: "08 Aug 2026", evidenceAvailable: true },
  { id: "ev-s-007", sourceName: "FDA GRAS Notices", sourceType: "government", relatedTo: "Soy Lecithin", relatedType: "ingredient", status: "pending", lastVerified: "15 Jul 2026", evidenceAvailable: true },
  { id: "ev-s-008", sourceName: "Unknown Journal", sourceType: "scientific", relatedTo: "Triclosan", relatedType: "ingredient", status: "outdated", lastVerified: "01 Jun 2026", evidenceAvailable: false },
];

export const MOCK_DATA_QUALITY_ISSUES: DataQualityIssue[] = [
  { id: "dq-001", target: "FreshClean Shampoo", targetType: "product", issueType: "Missing ingredient information", severity: "high", dateDetected: "05 Aug 2026", status: "open" },
  { id: "dq-002", target: "PureSkin Serum", targetType: "product", issueType: "Incomplete nutrition information", severity: "medium", dateDetected: "09 Aug 2026", status: "under_review" },
  { id: "dq-003", target: "Unknown Additive X", targetType: "ingredient", issueType: "Unmatched ingredient", severity: "high", dateDetected: "09 Aug 2026", status: "open" },
  { id: "dq-004", target: "HerbalTea Blend", targetType: "product", issueType: "Missing evidence", severity: "medium", dateDetected: "03 Aug 2026", status: "open" },
  { id: "dq-005", target: "BioVita Supplement", targetType: "product", issueType: "Low product identification confidence", severity: "low", dateDetected: "09 Aug 2026", status: "under_review" },
  { id: "dq-006", target: "Triclosan", targetType: "ingredient", issueType: "Missing evidence", severity: "high", dateDetected: "01 Aug 2026", status: "resolved" },
];

export const MOCK_ANALYSIS_LOGS: AnalysisLogEntry[] = [
  { id: "log-001", productName: "GlowCare Face Wash", createdTime: "09 Aug 2026, 14:32", processing: "success", ingredientProcessing: "success", evidenceRetrieval: "success", assessment: "success", aiExplanation: "success", errorStatus: "success" },
  { id: "log-002", productName: "OatPlus Protein Bar", createdTime: "09 Aug 2026, 14:28", processing: "success", ingredientProcessing: "success", evidenceRetrieval: "success", assessment: "success", aiExplanation: "success", errorStatus: "success" },
  { id: "log-003", productName: "FreshClean Shampoo", createdTime: "09 Aug 2026, 14:15", processing: "success", ingredientProcessing: "success", evidenceRetrieval: "success", assessment: "success", aiExplanation: "success", errorStatus: "success" },
  { id: "log-004", productName: "BioVita Supplement", createdTime: "09 Aug 2026, 14:02", processing: "success", ingredientProcessing: "pending", evidenceRetrieval: "pending", assessment: "pending", aiExplanation: "pending", errorStatus: "pending" },
  { id: "log-005", productName: "Unknown Product", createdTime: "09 Aug 2026, 13:55", processing: "success", ingredientProcessing: "failed", evidenceRetrieval: "skipped", assessment: "skipped", aiExplanation: "skipped", errorStatus: "failed", errorMessage: "Product barcode not found in database" },
  { id: "log-006", productName: "NaturCare Moisturizer", createdTime: "09 Aug 2026, 13:41", processing: "success", ingredientProcessing: "success", evidenceRetrieval: "success", assessment: "success", aiExplanation: "success", errorStatus: "success" },
];

export const MOCK_SYSTEM_HEALTH: SystemHealthEntry[] = [
  { service: "API Gateway", status: "operational", lastUpdated: "09 Aug 2026, 14:35" },
  { service: "Product Service", status: "operational", lastUpdated: "09 Aug 2026, 14:35" },
  { service: "Ingredient Service", status: "operational", lastUpdated: "09 Aug 2026, 14:35" },
  { service: "Evidence Service", status: "degraded", lastUpdated: "09 Aug 2026, 14:30" },
  { service: "AI Service", status: "operational", lastUpdated: "09 Aug 2026, 14:35" },
  { service: "Database", status: "operational", lastUpdated: "09 Aug 2026, 14:35" },
];

export const MOCK_AUDIT_LOG: AuditLogEntry[] = [
  { id: "al-001", action: "verified", admin: "admin@foodsafety.app", target: "EWG Skin Deep Database", targetType: "evidence_source", timestamp: "09 Aug 2026, 14:10" },
  { id: "al-002", action: "updated", admin: "admin@foodsafety.app", target: "Sodium Lauryl Sulfate", targetType: "ingredient", timestamp: "09 Aug 2026, 13:55", details: "Updated assessment evidence" },
  { id: "al-003", action: "archived", admin: "reviewer@foodsafety.app", target: "Old Product X", targetType: "product", timestamp: "08 Aug 2026, 16:22" },
  { id: "al-004", action: "suspended", admin: "admin@foodsafety.app", target: "neha.d@example.com", targetType: "user", timestamp: "08 Aug 2026, 11:05", details: "Inactive account" },
  { id: "al-005", action: "created", admin: "data_admin@foodsafety.app", target: "Soy Lecithin", targetType: "ingredient", timestamp: "07 Aug 2026, 09:30" },
  { id: "al-006", action: "verified", admin: "reviewer@foodsafety.app", target: "WHO Guidelines", targetType: "evidence_source", timestamp: "07 Aug 2026, 14:15" },
];

export const MOCK_SYSTEM_SETTINGS: SystemSetting[] = [
  { key: "high_threshold", label: "High Concern Threshold", value: 70, type: "number", category: "assessment" },
  { key: "moderate_threshold", label: "Moderate Attention Threshold", value: 40, type: "number", category: "assessment" },
  { key: "evidence_minimum", label: "Minimum Evidence Sources", value: 2, type: "number", category: "assessment" },
  { key: "ai_confidence_threshold", label: "AI Confidence Threshold", value: 0.75, type: "number", category: "assessment" },
  { key: "auto_analysis", label: "Auto-analyze on Scan", value: true, type: "boolean", category: "product" },
  { key: "require_barcode", label: "Require Barcode", value: false, type: "boolean", category: "product" },
  { key: "evidence_cache_ttl", label: "Evidence Cache TTL (hours)", value: 24, type: "number", category: "evidence" },
  { key: "auto_verify_sources", label: "Auto-verify Sources", value: false, type: "boolean", category: "evidence" },
  { key: "ai_model_version", label: "AI Model Version", value: "v2.1", type: "text", category: "ai", sensitive: true },
  { key: "ai_temperature", label: "AI Temperature", value: 0.3, type: "number", category: "ai" },
  { key: "supported_languages", label: "Supported Languages", value: "en,hi", type: "text", category: "localization" },
  { key: "default_language", label: "Default Language", value: "en", type: "select", options: ["en", "hi"], category: "localization" },
];
