import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { AppError, ErrorCodes } from "@/lib/errors";
import { getStore } from "@/lib/store";
import { getEvidenceForIngredient } from "@/lib/evidence";
import { getAIProvider } from "@/lib/ai";
import { config } from "@/lib/config";
import { assessmentToSeverity } from "@/lib/scoring";
import { detectAllergens } from "@/lib/allergens";

export const runtime = "nodejs";

/**
 * GET /api/ingredients/:id
 * Full ingredient detail (frontend IngredientDetail-compatible).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const { id } = await params;
    const store = getStore();
    const record = await store.getIngredientById(id);
    if (!record) {
      throw new AppError(ErrorCodes.INGREDIENT_NOT_FOUND, "Ingredient could not be found", 404);
    }

    const evidence = await getEvidenceForIngredient(record.id);
    const url = new URL(request.url);
    const language = url.searchParams.get("language") ?? "en";

    let aiExplanation = "";
    if (config.ai.provider !== "mock") {
      try {
        const ai = await getAIProvider().explainIngredient({
          name: record.canonicalName,
          function: record.function,
          assessment: record.assessment,
          evidence: evidence.map((e) => ({ organization: e.organization, summary: e.summary, url: e.url })),
          userLanguage: language,
        });
        aiExplanation = ai.explanation;
      } catch {
        // keep empty; frontend falls back to description
      }
    }

    const data = {
      id: record.id,
      name: record.canonicalName,
      insCode: record.insCode,
      eNumber: record.eNumber,
      hindiName: record.hindiName,
      category: record.category,
      assessment: assessmentToSeverity(record.assessment),
      description: record.description,
      whyUsed: record.function,
      functionLabel: record.function,
      flagExplanation: aiExplanation || undefined,
      factorsConsidered: [
        `Regulatory status: ${record.regulatoryStatus}`,
        `Evidence level: ${record.evidenceLevel}`,
        `Classified as: ${record.assessment}`,
      ],
      evidence: evidence.map((e) => ({
        sourceName: e.organization,
        sourceType: e.sourceType,
        finding: e.summary,
        url: e.url,
      })),
      regulatory: {
        status: record.regulatoryStatus,
        authority: "FSSAI / EFSA / FDA / WHO (regional)",
        details: record.regulatoryNotes ?? "No specific notes",
      },
      dataQuality: {
        level: record.evidenceLevel === "high" ? "high" : record.evidenceLevel === "medium" ? "medium" : "low",
        explanation: `Evidence quality for ${record.canonicalName} is ${record.evidenceLevel}.`,
      },
      relatedIngredients: [],
      allergens: detectAllergens(record.canonicalName),
      dietaryStatus: record.dietaryStatus,
    };

    return jsonSuccess(data, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
