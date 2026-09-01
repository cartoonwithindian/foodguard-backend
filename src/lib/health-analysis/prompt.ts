/**
 * Health Analysis LLM Prompt
 *
 * The LLM receives VERIFIED FINDINGS (from the deterministic engine)
 * and explains them in user-friendly language.
 *
 * The LLM MUST NOT:
 * - Calculate new health findings
 * - Invent ingredients
 * - Invent nutrition values
 * - Infer package size
 * - Introduce unsupported medical claims
 * - Convert uncertainty into certainty
 * - Claim causation unless explicitly provided by evidence
 */

import type { HealthAnalysisResult, HealthFinding } from "./types";

function formatFinding(f: HealthFinding): string {
  const parts = [
    `Category: ${f.category}`,
    `Title: ${f.title}`,
    `Severity: ${f.severity}`,
  ];
  if (f.value != null) {
    parts.push(`Value: ${f.value} ${f.unit} (${f.basis})`);
  }
  if (f.explanation) {
    parts.push(`Explanation: ${f.explanation}`);
  }
  if (f.recommendation) {
    parts.push(`Recommendation: ${f.recommendation}`);
  }
  parts.push(`Evidence: ${f.evidence.join(", ")}`);
  parts.push(`Confidence: ${f.confidence}`);
  parts.push(`Claim type: ${f.claim_type}`);
  return parts.join("\n  ");
}

export function buildHealthAnalysisPrompt(
  result: HealthAnalysisResult,
  productName: string,
): string {
  const findingsBlock = result.findings.length > 0
    ? result.findings.map((f, i) => `Finding ${i + 1}:\n  ${formatFinding(f)}`).join("\n\n")
    : "No structured findings available.";

  return [
    "You are FoodGuard's health analysis explainer.",
    "You receive VERIFIED FINDINGS from the deterministic health engine.",
    "Your job is to explain these findings in clear, user-friendly language.",
    "",
    "CRITICAL RULES:",
    "- Use ONLY the supplied verified findings.",
    "- Do NOT calculate new health findings.",
    "- Do NOT invent ingredients.",
    "- Do NOT invent nutrition values.",
    "- Do NOT infer package size.",
    "- Do NOT introduce unsupported medical claims.",
    "- Do NOT convert uncertainty into certainty.",
    "- Do NOT claim causation unless causation is explicitly provided by the evidence.",
    "- Do NOT mention ingredients not present in the verified findings.",
    "- Present facts as facts, inferences as inferences, recommendations as recommendations.",
    "",
    "LANGUAGE GUIDELINES:",
    "- Use simple, accessible language.",
    "- Use probabilistic language: 'may contribute', 'is associated with', 'can increase'.",
    "- Avoid definitive language: 'will cause', 'guarantees', 'causes disease'.",
    "- When evidence is insufficient, say so explicitly.",
    "",
    "PRODUCT:",
    `Name: ${productName}`,
    "",
    "VERIFIED FINDINGS:",
    findingsBlock,
    "",
    "SUMMARY:",
    result.summary,
    "",
    "OVERALL GUIDANCE:",
    result.overall_guidance,
    "",
    "MISSING DATA:",
    result.missing_data.length > 0 ? result.missing_data.join(", ") : "None",
    "",
    'Return JSON matching:',
    '{"summary": string, "positivePoints": string[], "concerns": string[], "nutritionExplanation": string, "recommendation": string, "confidence": number}',
  ].join("\n");
}

export function buildAnalysisExplanationFromFindings(
  result: HealthAnalysisResult,
  productName: string,
): {
  summary: string;
  positivePoints: string[];
  concerns: string[];
  nutritionExplanation: string;
  recommendation: string;
  confidence: number;
} {
  const positivePoints: string[] = [];
  const concerns: string[] = [];

  for (const f of result.findings) {
    if (f.category === "protein" || f.category === "fibre") {
      positivePoints.push(f.explanation);
    } else if (f.severity === "high") {
      concerns.push(f.explanation);
    } else if (f.severity === "moderate" && f.claim_type === "inference") {
      concerns.push(f.explanation);
    }
  }

  const nutritionParts: string[] = [];
  for (const f of result.findings) {
    if (f.claim_type === "fact" && f.value != null) {
      nutritionParts.push(`${f.title}: ${f.value} ${f.unit} (${f.basis})`);
    }
  }

  return {
    summary: result.summary,
    positivePoints,
    concerns,
    nutritionExplanation: nutritionParts.join(". "),
    recommendation: result.overall_guidance,
    confidence: result.confidence,
  };
}
