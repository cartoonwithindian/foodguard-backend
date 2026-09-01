import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { evidenceDetail } from "@/services/product.service";

export const runtime = "nodejs";

/**
 * GET /api/evidence/:barcode
 * Evidence for a product: per-ingredient references + overall status.
 * Frontend EvidencePageData-compatible.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const { barcode } = await params;
    const { product, evidence, perIngredient, evidenceStatus } = await evidenceDetail(barcode);

    const ingredientEvidence = perIngredient.map((entry) => ({
      id: entry.ingredientId,
      name: entry.name,
      function: "see evidence",
      assessment: entry.evidence.length >= 2 ? "low" : entry.evidence.length === 1 ? "moderate" : "insufficient",
      evidence: entry.evidence[0]?.summary ?? "No structured evidence found",
      source: entry.evidence[0]?.organization ?? "Not available",
    }));

    const sources = evidence.map((e, index) => ({
      id: e.id,
      sourceName: e.organization,
      sourceType: mapSourceCategory(e.sourceType),
      authority: mapAuthority(e.evidenceLevel),
      summary: e.summary,
      relevantInformation: e.summary,
      usedFor: [perIngredient[index % Math.max(1, perIngredient.length)]?.name ?? "product"],
      url: e.url,
      lastUpdated: e.publicationDate,
    }));

    return jsonSuccess(
      {
        id: product.id,
        productName: product.name,
        brand: product.brand ?? "",
        category: product.category,
        barcode: product.barcode,
        scanDate: new Date().toISOString(),
        assessment: "moderate",
        assessmentDescription: "Assessment based on evidence available in the knowledge base.",
        assessmentFactors: [
          {
            category: "ingredients",
            title: "Ingredient evidence",
            description: `${perIngredient.length} ingredients matched with evidence in the knowledge base.`,
          },
          {
            category: "data_quality",
            title: "Data provenance",
            description: `Product data source: ${product.source}. ${product.isDemo ? "This is demo data, not verified retail data." : ""}`,
          },
        ],
        sources,
        ingredientEvidence,
        nutritionEvidence: [],
        evidenceStatus,
        evidenceStatusExplanation:
          evidenceStatus === "insufficient"
            ? "Evidence is insufficient for a strong assessment. Treat all conclusions as informational."
            : evidenceStatus === "limited"
              ? "Limited evidence available - conclusions are drawn with caution."
              : "Sufficient evidence available from authoritative sources.",
        dataQuality: product.productDataConfidence >= 0.8 ? "high" : product.productDataConfidence >= 0.6 ? "medium" : "low",
        dataQualityExplanation: `Product data confidence ${Math.round(product.productDataConfidence * 100)}%.`,
        aiExplanation: "Explanations are generated from the structured evidence above, never from model memory.",
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}

function mapSourceCategory(sourceType: string): string {
  switch (sourceType) {
    case "government":
    case "regulator":
      return "regulatory";
    case "scientific_paper":
      return "scientific";
    case "international_standard":
      return "government";
    case "academic_database":
      return "food_database";
    default:
      return "product_information";
  }
}

function mapAuthority(level: string): "primary" | "scientific" | "supporting" {
  if (level === "high") return "primary";
  if (level === "medium") return "scientific";
  return "supporting";
}
