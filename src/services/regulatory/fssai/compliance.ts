/**
 * FSSAI Regulatory Compliance builder (HTTP-backed).
 *
 * Produces a normalized `RegulatoryCompliance` block for the FoodGuard
 * product-analysis result. All regulatory facts come from the standalone
 * FoodGuard FSSAI Regulatory API (via `src/lib/fssai-client`); nothing here
 * embeds the 2,243 rules in TypeScript.
 *
 * Guarantees:
 *   * The FoodGuard health score is never adjusted by these results.
 *   * When the FSSAI service is unreachable, `serviceAvailable` is false,
 *     `overallStatus` is `REVIEW_REQUIRED` (never a false PASS), and the
 *     analysis continues without throwing.
 *   * No quantities are invented — if the caller has no measured amount for a
 *     substance, the FSSAI service is asked without an amount so it returns
 *     the applicable limit (LIMIT_LOOKUP) rather than a fabricated verdict.
 */

import {
  checkAdditive,
  checkContaminant,
  checkProduct,
  type FssaiComplianceCheck,
  type FssaiProductCompliance,
} from "@/lib/fssai-client";
import type {
  FssaiRegulatoryStatus,
  RegulatoryCheckResult,
  RegulatoryCompliance,
  RegulatoryEvidence,
  RegulatoryViolation,
} from "@/types/domain";

export interface RegulatoryComplianceInput {
  productName?: string;
  foodCategory?: string;
  /** Ingredients identified in the scan (passed to the service as-is). */
  ingredients?: string[];
  /** Additives with optional measured amounts (never invented). */
  additives?: Array<{ name: string; amount?: number; unit?: string; insNumber?: string }>;
  /** Contaminant measurements when available (never invented). */
  contaminants?: Array<{ name: string; amount?: number; unit?: string; insNumber?: string }>;
}

/**
 * Map a raw FSSAI service status onto the normalized regulatory status.
 * The service's own non-PASS statuses are preserved; only the values that
 * mean "no numeric verdict" are collapsed onto the canonic NO_APPLICABLE_*
 * / REVIEW_REQUIRED labels the UI understands.
 */
function normalizeStatus(raw: string | undefined | null): FssaiRegulatoryStatus {
  switch (raw) {
    case "PASS":
      return "PASS";
    case "EXCEEDS_LIMIT":
      return "EXCEEDS_LIMIT";
    case "BELOW_MINIMUM":
      return "BELOW_MINIMUM";
    case "NO_APPLICABLE_RULE":
      return "NO_APPLICABLE_RULE";
    case "CATEGORY_REQUIRED":
      return "CATEGORY_REQUIRED";
    case "LIMIT_LOOKUP":
      return "LIMIT_LOOKUP";
    case "INACTIVE_RULE":
      return "INACTIVE_RULE";
    case "NON_NUMERIC_LIMIT":
      return "NON_NUMERIC_LIMIT";
    case "UNIT_MISMATCH":
      return "UNIT_MISMATCH";
    // Anything the service marks as needing a human (LOW confidence, missing
    // data, ambiguous category) becomes REVIEW_REQUIRED.
    case "REVIEW_REQUIRED":
    default:
      return "REVIEW_REQUIRED";
  }
}

function toEvidence(list: FssaiComplianceCheck["evidence"] | undefined): RegulatoryEvidence[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => ({
      ruleId: e.ruleId ?? "",
      regulation: e.regulation ?? null,
      sourceDocument: e.sourceDocument ?? null,
      sourceUrl: e.sourceUrl ?? null,
      section: e.section ?? null,
      table: e.table ?? null,
      page: e.page ?? null,
      sourceText: e.sourceText ?? null,
      confidence: e.confidence ?? null,
    }))
    .filter((e) => e.ruleId);
}

function evidenceUrlPresent(evidence: RegulatoryEvidence[]): boolean {
  return evidence.some((e) => !!e.sourceUrl);
}

function additiveToCheckResult(
  additiveName: string,
  res: FssaiComplianceCheck,
  preMatch: Array<{ name: string; amount?: number; unit?: string }>,
): RegulatoryCheckResult {
  const pre = preMatch.find((a) => a.name.toLowerCase() === additiveName.toLowerCase());
  const status = normalizeStatus(res.status);
  const evidence = toEvidence(res.evidence);
  return {
    name: res.substance || additiveName,
    type: "additive",
    status,
    detectedAmount: pre?.amount ?? res.detectedValue,
    detectedUnit: res.detectedUnit ?? pre?.unit ?? null,
    allowedAmount: res.allowedLimit,
    allowedUnit: res.unit ?? null,
    ruleId: res.ruleId ?? null,
    regulation: res.regulation ?? null,
    foodCategory: res.foodCategory ?? null,
    message: res.message,
    evidenceAvailable: evidenceUrlPresent(evidence) || evidence.length > 0,
  };
}

function contaminantToCheckResult(
  substanceName: string,
  res: FssaiComplianceCheck,
  preMatch: Array<{ name: string; amount?: number; unit?: string }>,
): RegulatoryCheckResult {
  const pre = preMatch.find((c) => c.name.toLowerCase() === substanceName.toLowerCase());
  const status = normalizeStatus(res.status);
  const evidence = toEvidence(res.evidence);
  return {
    name: res.substance || substanceName,
    type: "contaminant",
    status,
    detectedAmount: pre?.amount ?? res.detectedValue,
    detectedUnit: res.detectedUnit ?? pre?.unit ?? null,
    allowedAmount: res.allowedLimit,
    allowedUnit: res.unit ?? null,
    ruleId: res.ruleId ?? null,
    regulation: res.regulation ?? null,
    foodCategory: res.foodCategory ?? null,
    message: res.message,
    evidenceAvailable: evidenceUrlPresent(evidence) || evidence.length > 0,
  };
}

function violationsFrom(
  items: Array<RegulatoryCheckResult & { detail?: string }>,
): RegulatoryViolation[] {
  return items
    .filter((i) => i.status === "EXCEEDS_LIMIT" || i.status === "BELOW_MINIMUM" || i.status === "REVIEW_REQUIRED")
    .map((i) => ({
      name: i.name,
      type: i.type,
      ruleId: i.ruleId,
      regulation: i.regulation,
      detail:
        i.detail ||
        i.message ||
        (i.status === "EXCEEDS_LIMIT"
          ? `${i.name} exceeds the permitted limit`
          : i.status === "BELOW_MINIMUM"
            ? `${i.name} is below the required minimum`
            : `${i.name} requires manual review`),
    }));
}

function overallFromStatuses(statuses: FssaiRegulatoryStatus[]): FssaiRegulatoryStatus {
  const priority: FssaiRegulatoryStatus[] = [
    "EXCEEDS_LIMIT",
    "BELOW_MINIMUM",
    "UNIT_MISMATCH",
    "REVIEW_REQUIRED",
    "CATEGORY_REQUIRED",
    "NON_NUMERIC_LIMIT",
    "INACTIVE_RULE",
    "NO_APPLICABLE_RULE",
    "LIMIT_LOOKUP",
    "PASS",
  ];
  for (const p of priority) {
    if (statuses.includes(p)) return p;
  }
  return "NO_APPLICABLE_LIMIT";
}

/**
 * Build the normalized `RegulatoryCompliance` block for a product using the
 * FSSAI API's multi-entity `/check/product` endpoint. Falls back to per-
 * additive/contaminant checks if the product check returns nothing usable.
 */
export async function buildRegulatoryCompliance(
  input: RegulatoryComplianceInput,
): Promise<RegulatoryCompliance> {
  const checkedAt = new Date().toISOString();
  const additives = input.additives ?? [];
  const contaminants = input.contaminants ?? [];

  // 1. Try the aggregated product check (returns checks grouped by substance).
  const productRes = await checkProduct({
    productName: input.productName,
    foodCategory: input.foodCategory,
    ingredients: input.ingredients,
    additives,
    contaminants,
  });

  // If the FSSAI service itself could not be reached, report REVIEW_REQUIRED
  // / SERVICE_UNAVAILABLE immediately — never a fabricated NO_APPLICABLE_LIMIT.
  if (!productRes.ok && productRes.serviceUnavailable) {
    return regulatoryComplianceUnavailable(input);
  }

  if (productRes.ok && productRes.data.checks.length > 0) {
    const data: FssaiProductCompliance = productRes.data;
    const checks = data.checks;

    const additiveChecks: RegulatoryCheckResult[] = checks
      .filter((c) => c.type === "ADDITIVE_LIMIT" || c.type === "ADDITIVE_NOT_PERMITTED")
      .map((c) => ({
        name: c.substance ?? c.message?.split(" ")[0] ?? "Additive",
        type: "additive" as const,
        status: normalizeStatus(c.status),
        detectedAmount: c.detected,
        detectedUnit: c.unit ?? null,
        allowedAmount: c.allowed,
        allowedUnit: c.unit ?? null,
        ruleId: c.ruleId ?? null,
        regulation: null,
        foodCategory: c.foodCategory ?? input.foodCategory ?? null,
        message: c.message,
        evidenceAvailable: !!c.ruleId,
      }));

    const contaminantChecks: RegulatoryCheckResult[] = checks
      .filter((c) => c.type === "CONTAMINANT")
      .map((c) => ({
        name: c.substance ?? "Contaminant",
        type: "contaminant" as const,
        status: normalizeStatus(c.status),
        detectedAmount: c.detected,
        detectedUnit: c.unit ?? null,
        allowedAmount: c.allowed,
        allowedUnit: c.unit ?? null,
        ruleId: c.ruleId ?? null,
        regulation: null,
        foodCategory: c.foodCategory ?? input.foodCategory ?? null,
        message: c.message,
        evidenceAvailable: !!c.ruleId,
      }));

    const evidence = toEvidence(
      (data.evidence ?? []) as unknown as FssaiComplianceCheck["evidence"],
    );

    const allResults: Array<RegulatoryCheckResult & { detail?: string }> = [
      ...additiveChecks,
      ...contaminantChecks,
    ];
    const statuses = allResults.map((r) => r.status);

    return {
      source: "fssai-api",
      overallStatus: overallFromStatuses(statuses),
      serviceAvailable: true,
      additives: additiveChecks,
      contaminants: contaminantChecks,
      violations: violationsFrom(allResults),
      evidence,
      message: data.overallStatus ? undefined : "No compliance checks were applicable.",
      checkedAt,
    };
  }

  // 2. Fallback: run individual checks (still against the FSSAI API).
  const addResults: RegulatoryCheckResult[] = [];
  const contResults: RegulatoryCheckResult[] = [];
  const addEvidence: RegulatoryEvidence[] = [];
  const contEvidence: RegulatoryEvidence[] = [];

  for (const a of additives) {
    const res = await checkAdditive({
      additive: a.insNumber || a.name,
      foodCategory: input.foodCategory,
      amount: a.amount,
      unit: a.unit,
    });
    if (res.ok) {
      addResults.push(additiveToCheckResult(a.name, res.data, additives));
      addEvidence.push(...toEvidence(res.data.evidence));
    }
    // A failed single check (service down) is handled below by aggregation.
  }

  for (const c of contaminants) {
    const res = await checkContaminant({
      substance: c.name,
      foodCategory: input.foodCategory,
      amount: c.amount,
      unit: c.unit,
    });
    if (res.ok) {
      contResults.push(contaminantToCheckResult(c.name, res.data, contaminants));
      contEvidence.push(...toEvidence(res.data.evidence));
    }
  }

  const allResults: Array<RegulatoryCheckResult & { detail?: string }> = [
    ...addResults,
    ...contResults,
  ];
  const statuses = allResults.map((r) => r.status);

  const hasResults = allResults.length > 0;
  const serviceUnavailable = !hasResults && (additives.length > 0 || contaminants.length > 0);

  // No checks ran and none were requested — nothing applies for this product.
  // Distinct from an unreachable service, which is handled by the caller.
  if (!hasResults && !serviceUnavailable) {
    return {
      source: "fssai-api",
      overallStatus: "NO_APPLICABLE_LIMIT",
      serviceAvailable: true,
      additives: [],
      contaminants: [],
      violations: [],
      evidence: [],
      message: "No FSSAI compliance checks were applicable for this product.",
      checkedAt,
    };
  }

  // Every requested check failed against the service (network/timeout, non-2xx).
  // Report REVIEW_REQUIRED rather than a false PASS or NO_APPLICABLE_LIMIT.
  if (!hasResults) {
    return regulatoryComplianceUnavailable(input);
  }

  return {
    source: "fssai-api",
    overallStatus: overallFromStatuses(statuses),
    serviceAvailable: true,
    additives: addResults,
    contaminants: contResults,
    violations: violationsFrom(allResults),
    evidence: [...addEvidence, ...contEvidence],
    checkedAt,
  };
}

/**
 * Build the `RegulatoryCompliance` block when the FSSAI service is known to
 * be unavailable. The analysis continues; the UI shows REVIEW_REQUIRED /
 * service unavailable rather than a false PASS.
 */
export function regulatoryComplianceUnavailable(input: RegulatoryComplianceInput): RegulatoryCompliance {
  const checkedAt = new Date().toISOString();
  return {
    source: "fssai-api",
    overallStatus: "REVIEW_REQUIRED",
    serviceAvailable: false,
    additives: (input.additives ?? []).map((a) => ({
      name: a.name,
      type: "additive" as const,
      status: "REVIEW_REQUIRED" as FssaiRegulatoryStatus,
      detectedAmount: a.amount ?? null,
      detectedUnit: a.unit ?? null,
      allowedAmount: null,
      allowedUnit: null,
      ruleId: null,
      regulation: null,
      foodCategory: null,
      message: "FSSAI regulatory service is unavailable; compliance could not be verified.",
      evidenceAvailable: false,
    })),
    contaminants: (input.contaminants ?? []).map((c) => ({
      name: c.name,
      type: "contaminant" as const,
      status: "REVIEW_REQUIRED" as FssaiRegulatoryStatus,
      detectedAmount: c.amount ?? null,
      detectedUnit: c.unit ?? null,
      allowedAmount: null,
      allowedUnit: null,
      ruleId: null,
      regulation: null,
      foodCategory: null,
      message: "FSSAI regulatory service is unavailable; compliance could not be verified.",
      evidenceAvailable: false,
    })),
    violations: [],
    evidence: [],
    message: "FSSAI regulatory service is unavailable. Regulatory status could not be determined and should not be treated as a pass.",
    checkedAt,
  };
}
