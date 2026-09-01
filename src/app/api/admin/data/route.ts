import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/store";
import type {
  AdminUser,
  PlatformStats,
  AssessmentDistribution,
  AnalysisActivityEntry,
  AdminUserEntry,
  ProductEntry,
  IngredientEntry,
  EvidenceEntry,
  DataQualityIssue,
  AnalysisLogEntry,
  SystemHealthEntry,
  AuditLogEntry,
  SystemSetting,
} from "@/data/admin-data";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAdmin(request);
    const store = getStore();

    const [users, productResults, ingredients, stats] = await Promise.all([
      store.listUsers(),
      store.searchProducts(""),
      store.listIngredients(),
      store.getAdminStats(),
    ]);

    const admin: AdminUser = {
      id: session.id,
      name: session.name,
      email: session.email,
      role: "super_admin",
    };

    const platformStats: PlatformStats = {
      totalUsers: users.length,
      totalProducts: productResults.length,
      totalIngredients: ingredients.length,
      totalAnalyses: stats.historyEntries ?? 0,
    };

    const assessmentDistribution: AssessmentDistribution = {
      low: 0,
      moderate: 0,
      high: 0,
      insufficient: 0,
    };

    const adminUsers: AdminUserEntry[] = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      registrationDate: u.createdAt,
      totalScans: 0,
      lastActivity: u.createdAt,
      status: "active" as const,
    }));

    const products: ProductEntry[] = productResults.map((r) => ({
      id: r.product.id,
      name: r.product.name,
      category: r.product.category,
      barcode: r.product.barcode,
      dataStatus: r.product.verified ? ("complete" as const) : ("incomplete" as const),
      lastUpdated: r.product.source,
      analysisStatus: "completed" as const,
    }));

    const ingredientEntries: IngredientEntry[] = ingredients.map((i) => ({
      id: i.id,
      name: i.canonicalName,
      code: i.eNumber ?? i.insCode ?? i.id,
      function: i.function,
      category: i.category,
      assessmentStatus:
        i.assessment === "potentially_concerning"
          ? ("high" as const)
          : i.assessment === "noteworthy"
            ? ("moderate" as const)
            : i.assessment === "insufficient_evidence"
              ? ("insufficient" as const)
              : ("low" as const),
      evidenceAvailable: i.evidenceLevel !== "insufficient",
      lastUpdated: "",
    }));

    const evidenceEntries: EvidenceEntry[] = [];
    const dataQualityIssues: DataQualityIssue[] = [];
    const analysisLogs: AnalysisLogEntry[] = [];
    const auditLog: AuditLogEntry[] = [];

    const analysisActivity: AnalysisActivityEntry[] = [];

    const systemHealth: SystemHealthEntry[] = [
      { service: "API Gateway", status: "operational", lastUpdated: new Date().toISOString() },
      { service: "Product Service", status: "operational", lastUpdated: new Date().toISOString() },
      { service: "Ingredient Service", status: "operational", lastUpdated: new Date().toISOString() },
      { service: "Evidence Service", status: "operational", lastUpdated: new Date().toISOString() },
      { service: "AI Service", status: "operational", lastUpdated: new Date().toISOString() },
      { service: "Database", status: "operational", lastUpdated: new Date().toISOString() },
    ];

    const systemSettings: SystemSetting[] = [
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

    return jsonSuccess(
      {
        admin,
        stats: platformStats,
        assessmentDistribution,
        analysisActivity,
        users: adminUsers,
        products,
        ingredients: ingredientEntries,
        evidenceEntries,
        dataQualityIssues,
        analysisLogs,
        systemHealth,
        auditLog,
        systemSettings,
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
