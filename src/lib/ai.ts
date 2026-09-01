import { z } from "zod";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { AppError, ErrorCodes } from "@/lib/errors";

/**
 * AI abstraction. The LLM only *explains* backend findings - it never decides
 * regulatory status, ingredient identity or nutrition values. Every response
 * is validated with Zod and grounded in the structured facts provided.
 */

export const AIExplanationSchema = z.object({
  explanation: z.string().min(1).max(2000),
  caveats: z.array(z.string()).max(10).default([]),
  language: z.enum(["en", "hi"]).default("en"),
});

export type AIExplanation = z.infer<typeof AIExplanationSchema>;

// ── Structured Analysis Explanation ─────────────────────────

export const AIAnalysisExplanationSchema = z.object({
  summary: z.string().min(1).max(3000),
  positivePoints: z.array(z.string()).max(10).default([]),
  concerns: z.array(z.string()).max(10).default([]),
  ingredientExplanations: z.array(z.object({
    name: z.string(),
    explanation: z.string(),
    category: z.enum(["fact", "regulatory_status", "health_evidence", "potential_concern", "uncertainty"]),
  })).max(20).default([]),
  nutritionExplanation: z.string().max(1000).default(""),
  recommendation: z.string().max(1000).default(""),
  confidence: z.number().min(0).max(1),
  caveats: z.array(z.string()).max(10).default([]),
  language: z.enum(["en", "hi"]).default("en"),
});

export type AIAnalysisExplanation = z.infer<typeof AIAnalysisExplanationSchema>;

export type AnalysisExplanationInput = {
  product: {
    name: string;
    brand?: string | null;
    category: string;
  };
  ingredients: Array<{
    name: string;
    function: string;
    assessment: string;
    severity: string;
    evidence: Array<{ organization: string; summary: string; url?: string }>;
  }>;
  nutrition: {
    calories?: number;
    sugar?: number;
    sodium?: number;
    saturatedFat?: number;
    protein?: number;
    fiber?: number;
    servingSize?: string;
  } | null;
  regulatory: Array<{
    type: string;
    status: string;
    details: string;
  }>;
  chemicalInfo: Array<{
    name: string;
    properties: string;
  }>;
  webEvidence: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceType: string;
    authority: string;
  }>;
  safetyAlerts: string[];
  healthContext: string[];
  userPreferences: {
    vegetarian?: boolean;
    vegan?: boolean;
    allergies?: string[];
    healthGoals?: string[];
  } | null;
};

export interface AIProvider {
  explainIngredient(params: ExplainIngredientParams): Promise<AIExplanation>;
  explainAnalysis?(params: AnalysisExplanationInput): Promise<AIAnalysisExplanation>;
}

export type ExplainIngredientParams = {
  name: string;
  function: string;
  assessment: string;
  evidence: Array<{ organization: string; summary: string; url?: string }>;
  userLanguage: string;
};

function buildPrompt(params: ExplainIngredientParams): string {
  const evidenceBlock = params.evidence.length
    ? params.evidence.map((e) => `- [${e.organization}] ${e.summary}`).join("\n")
    : "No structured evidence is available for this ingredient. Say so explicitly.";

  const languageNote =
    params.userLanguage === "hi"
      ? "Respond in simple Hindi (Hinglish allowed). Keep chemical names in English."
      : "Respond in simple English.";

  return [
    "You are an evidence-grounded food information assistant.",
    "Use ONLY the supplied ingredient facts and evidence below.",
    "Do not invent regulatory claims, health warnings or medical advice.",
    "Do not label anything as absolutely safe or unsafe, healthy or unhealthy.",
    "If evidence is insufficient, explicitly say so.",
    "Explain the result in simple language suitable for a layperson.",
    languageNote,
    "",
    `Ingredient: ${params.name}`,
    `Function: ${params.function}`,
    `Assessment: ${params.assessment}`,
    "Evidence:",
    evidenceBlock,
    "",
    'Return JSON matching: {"explanation": string, "caveats": string[], "language": "en"|"hi"}',
  ].join("\n");
}

function buildAnalysisPrompt(params: AnalysisExplanationInput): string {
  const ingredientBlock = params.ingredients.length > 0
    ? params.ingredients.map((ing) => {
        const evidenceText = ing.evidence.length > 0
          ? ing.evidence.map(e => `[${e.organization}] ${e.summary}`).join("; ")
          : "No evidence available";
        return `- ${ing.name}: ${ing.function}, Assessment: ${ing.assessment}, Severity: ${ing.severity}, Evidence: ${evidenceText}`;
      }).join("\n")
    : "No ingredients analyzed.";

  const nutritionBlock = params.nutrition
    ? `Calories: ${params.nutrition.calories ?? "N/A"}, Sugar: ${params.nutrition.sugar ?? "N/A"}g, Sodium: ${params.nutrition.sodium ?? "N/A"}mg, Saturated Fat: ${params.nutrition.saturatedFat ?? "N/A"}g, Protein: ${params.nutrition.protein ?? "N/A"}g, Fiber: ${params.nutrition.fiber ?? "N/A"}g`
    : "No nutrition data available.";

  const regulatoryBlock = params.regulatory.length > 0
    ? params.regulatory.map(r => `- ${r.type}: ${r.status} - ${r.details}`).join("\n")
    : "No regulatory information available.";

  const webEvidenceBlock = params.webEvidence.length > 0
    ? params.webEvidence.map(e => `- [${e.sourceType}/${e.authority}] ${e.title}: ${e.snippet}`).join("\n")
    : "No web research evidence available.";

  const safetyAlertsBlock = params.safetyAlerts.length > 0
    ? params.safetyAlerts.join("\n")
    : "No safety alerts.";

  const preferencesBlock = params.userPreferences
    ? `Vegetarian: ${params.userPreferences.vegetarian ?? false}, Vegan: ${params.userPreferences.vegan ?? false}, Allergies: ${params.userPreferences.allergies?.join(", ") ?? "None"}, Health Goals: ${params.userPreferences.healthGoals?.join(", ") ?? "None"}`
    : "No user preferences.";

  return [
    "You are an evidence-grounded food safety analysis assistant.",
    "Use ONLY the structured evidence provided below.",
    "CRITICAL RULES:",
    "- NEVER invent nutrition values - use only provided data",
    "- NEVER invent FSSAI rules or regulatory status",
    "- NEVER invent scientific studies or evidence",
    "- NEVER claim an ingredient is toxic without evidence",
    "- NEVER claim a product causes disease without evidence",
    "- NEVER treat regulatory approval as proof of healthiness",
    "- NEVER treat chemical identity as toxicity",
    "- NEVER treat adverse-event reports as proof of causation",
    "- Clearly separate: FACT, REGULATORY STATUS, HEALTH EVIDENCE, POTENTIAL CONCERN, UNCERTAINTY",
    "- If evidence is insufficient, explicitly say so",
    "- Base confidence on evidence quality, not assumptions",
    "",
    "Product Information:",
    `Name: ${params.product.name}`,
    `Brand: ${params.product.brand ?? "Unknown"}`,
    `Category: ${params.product.category}`,
    "",
    "Ingredients Analyzed:",
    ingredientBlock,
    "",
    "Nutrition Data:",
    nutritionBlock,
    "",
    "Regulatory Information:",
    regulatoryBlock,
    "",
    "Web Research Evidence:",
    webEvidenceBlock,
    "",
    "Safety Alerts:",
    safetyAlertsBlock,
    "",
    "User Preferences:",
    preferencesBlock,
    "",
    'Return JSON matching:',
    '{"summary": string, "positivePoints": string[], "concerns": string[], "ingredientExplanations": [{"name": string, "explanation": string, "category": "fact"|"regulatory_status"|"health_evidence"|"potential_concern"|"uncertainty"}], "nutritionExplanation": string, "recommendation": string, "confidence": number, "caveats": string[], "language": "en"|"hi"}',
  ].join("\n");
}

class MockAIProvider implements AIProvider {
  async explainIngredient(params: ExplainIngredientParams): Promise<AIExplanation> {
    const explanation = this.template(params);
    return { explanation, caveats: [], language: params.userLanguage === "hi" ? "hi" : "en" };
  }

  async explainAnalysis(params: AnalysisExplanationInput): Promise<AIAnalysisExplanation> {
    return this.buildAnalysisExplanation(params);
  }

  private buildAnalysisExplanation(params: AnalysisExplanationInput): AIAnalysisExplanation {
    const positivePoints: string[] = [];
    const concerns: string[] = [];
    const ingredientExplanations: AIAnalysisExplanation["ingredientExplanations"] = [];

    // Process ingredients
    for (const ing of params.ingredients) {
      let category: AIAnalysisExplanation["ingredientExplanations"][number]["category"] = "fact";
      let explanation = "";

      if (ing.assessment === "beneficial") {
        category = "health_evidence";
        explanation = `${ing.name} is ${ing.function}. Based on available evidence, it is generally regarded positively.`;
        positivePoints.push(`${ing.name} - ${ing.function}`);
      } else if (ing.assessment === "potentially_concerning") {
        category = "potential_concern";
        explanation = `${ing.name} is ${ing.function}. Some evidence suggests it may warrant attention for sensitive individuals.`;
        concerns.push(`${ing.name}: ${ing.evidence[0]?.summary ?? "May warrant attention"}`);
      } else if (ing.assessment === "insufficient_evidence") {
        category = "uncertainty";
        explanation = `${ing.name} is ${ing.function}. Limited reliable evidence is available to draw strong conclusions.`;
      } else if (ing.assessment === "allergen") {
        category = "fact";
        explanation = `${ing.name} is a declared allergen.`;
        concerns.push(`Allergen: ${ing.name}`);
      } else {
        category = "fact";
        explanation = `${ing.name} is ${ing.function}. It is ${ing.assessment.replace(/_/g, " ")}.`;
      }

      ingredientExplanations.push({ name: ing.name, explanation, category });
    }

    // Nutrition explanation
    let nutritionExplanation = "No nutrition data available.";
    if (params.nutrition) {
      const parts: string[] = [];
      if (params.nutrition.calories) parts.push(`${params.nutrition.calories} calories`);
      if (params.nutrition.sugar) parts.push(`${params.nutrition.sugar}g sugar`);
      if (params.nutrition.sodium) parts.push(`${params.nutrition.sodium}mg sodium`);
      if (params.nutrition.protein) parts.push(`${params.nutrition.protein}g protein`);
      if (parts.length > 0) {
        nutritionExplanation = `Per serving: ${parts.join(", ")}.`;
      }
    }

    // Nutrition-based concerns
    if (params.nutrition) {
      if (params.nutrition.sugar && params.nutrition.sugar >= 15) {
        concerns.push(`High sugar content (${params.nutrition.sugar}g per serving)`);
      }
      if (params.nutrition.sodium && params.nutrition.sodium >= 500) {
        concerns.push(`High sodium content (${params.nutrition.sodium}mg per serving)`);
      }
      if (params.nutrition.saturatedFat && params.nutrition.saturatedFat >= 5) {
        concerns.push(`High saturated fat content (${params.nutrition.saturatedFat}g per serving)`);
      }
    }

    // Health-goal conflicts
    const goals = params.userPreferences?.healthGoals ?? [];
    if (goals.includes("weight_loss")) {
      const highSugar = (params.nutrition?.sugar ?? 0) >= 15;
      const highCalories = (params.nutrition?.calories ?? 0) >= 200;
      if (highSugar || highCalories) {
        concerns.push(
          `May conflict with your weight loss goal (${highSugar ? "high sugar" : "high calorie"} content)`,
        );
      }
    }
    if (goals.includes("improve_nutrition") && (params.nutrition?.sodium ?? 0) >= 500) {
      concerns.push("May conflict with your nutrition improvement goal (high sodium content)");
    }
    if (goals.includes("weight_gain") && (params.nutrition?.calories ?? 0) < 100) {
      concerns.push("May conflict with your weight gain goal (low calorie content)");
    }

    // Build summary
    const summaryParts: string[] = [];
    summaryParts.push(`${params.product.name} has been analyzed for ingredient safety and nutrition.`);
    if (positivePoints.length > 0) {
      summaryParts.push(`${positivePoints.length} positive aspect(s) identified.`);
    }
    if (concerns.length > 0) {
      summaryParts.push(`${concerns.length} area(s) of concern identified.`);
    }

    // Recommendation
    let recommendation = "This assessment is informational only and does not constitute medical advice.";
    if (concerns.length > 2) {
      recommendation = "Several aspects deserve attention. Please review the detailed analysis before making a decision.";
    } else if (concerns.length === 0 && positivePoints.length > 0) {
      recommendation = "This product has a generally favourable profile based on available data.";
    }

    // Confidence based on data completeness
    let confidence = 0.5;
    if (params.ingredients.length > 0) confidence += 0.15;
    if (params.nutrition) confidence += 0.15;
    if (params.regulatory.length > 0) confidence += 0.1;
    if (params.webEvidence.length > 0) confidence += 0.1;
    confidence = Math.min(1, confidence);

    return {
      summary: summaryParts.join(" "),
      positivePoints,
      concerns,
      ingredientExplanations,
      nutritionExplanation,
      recommendation,
      confidence,
      caveats: ["This assessment is based on available data and should not replace professional advice."],
      language: "en",
    };
  }

  private template(params: ExplainIngredientParams): string {
    const evidenceText = params.evidence.length
      ? `This is based on evidence from ${params.evidence.map((e) => e.organization).join(", ")}.`
      : "Evidence on this ingredient is limited, so this explanation should be treated with caution.";

    const assessmentText: Record<string, string> = {
      beneficial: "generally regarded positively based on current evidence",
      neutral: "considered neutral - no specific concerns identified, but also no special benefits",
      generally_accepted: "generally considered acceptable at permitted levels",
      noteworthy: "considered worth paying attention to - not necessarily a problem, but worth checking if you are sensitive to it",
      potentially_concerning: "classified as potentially concerning based on the available evidence",
      allergen: "a declared allergen for some people",
      dietary_conflict: "may conflict with certain dietary preferences",
      insufficient_evidence: "there is not enough reliable evidence to draw a strong conclusion",
    };

    const lang =
      params.userLanguage === "hi"
        ? `${params.name} को ${assessmentText[params.assessment] ?? "वर्गीकृत"} किया गया है। ${evidenceText} यह जानकारी केवल सूचना के लिए है और चिकित्सीय सलाह नहीं है।`
        : `${params.name} is ${assessmentText[params.assessment] ?? "classified as such"}. ${evidenceText} This assessment is informational only and is not medical advice.`;

    return lang;
  }
}

class OpenAICompatibleProvider implements AIProvider {
  private async callLLM(messages: Array<{ role: string; content: string }>, temperature = 0.2): Promise<string> {
    if (!config.ai.apiKey) {
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "AI_API_KEY is not configured");
    }
    
    const requestBody: Record<string, unknown> = {
      model: config.ai.model,
      temperature,
      messages,
    };
    
    // Only include response_format if the provider supports it
    if (config.ai.supportsJsonMode) {
      requestBody.response_format = { type: "json_object" };
    }
    
    const response = await fetch(`${config.ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      logger.error("ai_provider_http_error", { status: response.status, errorText: errorText.slice(0, 200) });
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "AI provider request failed");
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "AI provider returned no content");
    }
    return content;
  }

  private extractJSON(content: string): unknown {
    // Try to extract JSON from the response, handling cases where
    // the model wraps it in markdown code blocks
    let text = content.trim();
    
    // Remove markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      text = jsonMatch[1].trim();
    }
    
    // Try to find JSON object in the text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      text = objectMatch[0];
    }
    
    return JSON.parse(text);
  }

  async explainIngredient(params: ExplainIngredientParams): Promise<AIExplanation> {
    const content = await this.callLLM([{ role: "user", content: buildPrompt(params) }], 0.2);
    
    let parsed: unknown;
    try {
      parsed = this.extractJSON(content);
    } catch {
      logger.warn("ai_response_parse_failed", { content: content.slice(0, 200) });
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "AI provider returned invalid JSON");
    }
    
    const result = AIExplanationSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn("ai_response_validation_failed", { issues: result.error.issues });
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "AI provider returned invalid JSON");
    }
    return result.data;
  }

  async explainAnalysis(params: AnalysisExplanationInput): Promise<AIAnalysisExplanation> {
    const prompt = buildAnalysisPrompt(params);
    const content = await this.callLLM([{ role: "user", content: prompt }], 0.2);
    
    let parsed: unknown;
    try {
      parsed = this.extractJSON(content);
    } catch {
      logger.warn("ai_analysis_parse_failed", { content: content.slice(0, 200) });
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "AI provider returned invalid JSON for analysis");
    }
    
    const result = AIAnalysisExplanationSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn("ai_analysis_validation_failed", { issues: result.error.issues });
      throw new AppError(ErrorCodes.AI_PROVIDER_ERROR, "AI provider returned invalid JSON for analysis");
    }
    return result.data;
  }
}

let instance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!instance) {
    // Use real provider when API key is configured (supports openai, gemini, etc.)
    const useRealProvider = config.ai.apiKey && config.ai.provider !== "mock";
    instance = useRealProvider ? new OpenAICompatibleProvider() : new MockAIProvider();
  }
  return instance;
}
