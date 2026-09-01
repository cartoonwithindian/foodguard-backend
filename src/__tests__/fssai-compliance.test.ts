import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRegulatoryCompliance } from "@/services/regulatory/fssai/compliance";
import { resetFssaiAvailability } from "@/lib/fssai-client";

function okResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errResponse(status: number, body?: unknown): Response {
  return new Response(JSON.stringify(body ?? { error: { message: "boom", code: "INTERNAL" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type FetchCall = { url: string; init: RequestInit };

function captureCalls(fetchMock: ReturnType<typeof vi.fn>): FetchCall[] {
  return fetchMock.mock.calls.map((c) => ({
    url: String(c[0]),
    init: (c[1] ?? {}) as RequestInit,
  }));
}

/**
 * Stub the FSSAI API. `handler` routes by request path; the FSSAI service
 * serializes snake_case (the client normalizes to camelCase), so mocks return
 * snake_case fields to prove the full path.
 */
function stubFssai(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string, init: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetFssaiAvailability();
});

const BASE = "http://127.0.0.1:8000";

describe("buildRegulatoryCompliance — PASS", () => {
  it("reports PASS with the applicable limit for a permitted additive (benzoate 400/750)", async () => {
    const fetchMock = stubFssai((url, init) => {
      if (url === `${BASE}/api/v1/check/product`) {
        return okResponse({
          product_name: "Cola",
          food_category: "Carbonated Water",
          overall_status: "PASS",
          checks: [
            {
              type: "ADDITIVE_LIMIT",
              substance: "Sodium Benzoate",
              food_category: "Carbonated Water",
              detected: 400,
              allowed: 750,
              unit: "mg/kg",
              status: "PASS",
              rule_id: "IND-FSSAI-FPSFA-A04-0883",
              message: "Within permitted limit",
            },
          ],
          summary: { PASS: 1 },
          evidence: [
            {
              rule_id: "IND-FSSAI-FPSFA-A04-0883",
              regulation: "Food Safety and Standards (Food Products Standards and Food Additives) Regulations, 2011",
              source_document: "FPS&FA 2011",
              source_url: "https://www.fssai.gov.in/regulations",
            },
          ],
        });
      }
      return errResponse(404);
    });

    const result = await buildRegulatoryCompliance({
      productName: "Cola",
      foodCategory: "Carbonated Water",
      ingredients: ["Carbonated Water", "Colour", "Sodium Benzoate"],
      additives: [{ name: "Sodium Benzoate", amount: 400, unit: "mg/kg" }],
    });

    expect(result.source).toBe("fssai-api");
    expect(result.serviceAvailable).toBe(true);
    expect(result.overallStatus).toBe("PASS");
    expect(result.additives).toHaveLength(1);
    expect(result.additives[0].status).toBe("PASS");
    expect(result.additives[0].name).toBe("Sodium Benzoate");
    expect(result.additives[0].detectedAmount).toBe(400);
    expect(result.additives[0].allowedAmount).toBe(750);
    expect(result.additives[0].allowedUnit).toBe("mg/kg");
    expect(result.additives[0].ruleId).toBe("IND-FSSAI-FPSFA-A04-0883");
    expect(result.additives[0].evidenceAvailable).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.evidence[0]?.sourceUrl).toContain("fssai.gov.in");
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("buildRegulatoryCompliance — EXCEEDS_LIMIT", () => {
  it("reports a violation for a contaminant above the limit (Lead 6/5)", async () => {
    const fetchMock = stubFssai((url) => {
      if (url === `${BASE}/api/v1/check/product`) {
        return okResponse({
          product_name: "Agar",
          food_category: "Agar",
          overall_status: "EXCEEDS_LIMIT",
          checks: [
            {
              type: "CONTAMINANT",
              substance: "Lead",
              food_category: "Agar",
              detected: 6,
              allowed: 5,
              unit: "mg/kg",
              status: "EXCEEDS_LIMIT",
              rule_id: "IND-FSSAI-CTR-15-0168",
              message: "Exceeds allowable limit",
            },
          ],
          summary: { EXCEEDS_LIMIT: 1 },
          evidence: [
            {
              rule_id: "IND-FSSAI-CTR-15-0168",
              regulation: "Food Safety and Standards (Contaminants, Toxins and Residues) Regulations, 2011",
              source_document: "CTR 2011",
            },
          ],
        });
      }
      return errResponse(404);
    });

    const result = await buildRegulatoryCompliance({
      productName: "Agar",
      foodCategory: "Agar",
      ingredients: ["Agar"],
      contaminants: [{ name: "Lead", amount: 6, unit: "mg/kg" }],
    });

    expect(result.serviceAvailable).toBe(true);
    expect(result.overallStatus).toBe("EXCEEDS_LIMIT");
    expect(result.contaminants).toHaveLength(1);
    expect(result.contaminants[0].status).toBe("EXCEEDS_LIMIT");
    expect(result.contaminants[0].detectedAmount).toBe(6);
    expect(result.contaminants[0].allowedAmount).toBe(5);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].name).toBe("Lead");
    expect(result.violations[0].type).toBe("contaminant");
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("buildRegulatoryCompliance — NO_APPLICABLE_LIMIT", () => {
  it("reports NO_APPLICABLE_LIMIT when the service found no applicable checks", async () => {
    const fetchMock = stubFssai((url) => {
      if (url === `${BASE}/api/v1/check/product`) {
        return okResponse({
          product_name: "Generic Water",
          food_category: "Carbonated Water",
          overall_status: "NO_APPLICABLE_RULE",
          checks: [],
          summary: {},
        });
      }
      return errResponse(404);
    });

    const result = await buildRegulatoryCompliance({
      productName: "Generic Water",
      foodCategory: "Carbonated Water",
      ingredients: ["Water", "Carbon Dioxide"],
      additives: [],
      contaminants: [],
    });

    expect(result.serviceAvailable).toBe(true);
    expect(result.overallStatus).toBe("NO_APPLICABLE_LIMIT");
    expect(result.additives).toHaveLength(0);
    expect(result.contaminants).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });
});

describe("buildRegulatoryCompliance — REVIEW_REQUIRED", () => {
  it("reports REVIEW_REQUIRED when the service flags an ambiguous check", async () => {
    const fetchMock = stubFssai((url) => {
      if (url === `${BASE}/api/v1/check/product`) {
        return okResponse({
          product_name: "Mystery Drink",
          food_category: "Other Food",
          overall_status: "REVIEW_REQUIRED",
          checks: [
            {
              type: "ADDITIVE_LIMIT",
              substance: "Unknown Additive",
              food_category: "Other Food",
              detected: null,
              allowed: null,
              unit: "mg/kg",
              status: "REVIEW_REQUIRED",
              message: "No matching food category; manual review required",
            },
          ],
          evidence: [],
        });
      }
      return errResponse(404);
    });

    const result = await buildRegulatoryCompliance({
      productName: "Mystery Drink",
      foodCategory: "Other Food",
      additives: [{ name: "Unknown Additive" }],
    });

    expect(result.serviceAvailable).toBe(true);
    expect(result.overallStatus).toBe("REVIEW_REQUIRED");
    expect(result.additives[0].status).toBe("REVIEW_REQUIRED");
    expect(result.additives[0].detectedAmount).toBeNull();
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].name).toBe("Unknown Additive");
  });
});

describe("buildRegulatoryCompliance — service down", () => {
  it("reports REVIEW_REQUIRED / SERVICE_UNAVAILABLE and never crashes or passes", async () => {
    const fetchMock = stubFssai(() => {
      throw new TypeError("fetch failed");
    });

    const result = await buildRegulatoryCompliance({
      productName: "Cola",
      foodCategory: "Carbonated Water",
      ingredients: ["Water"],
      additives: [{ name: "Sodium Benzoate" }],
      contaminants: [{ name: "Lead" }],
    });

    expect(result.serviceAvailable).toBe(false);
    expect(result.overallStatus).toBe("REVIEW_REQUIRED");
    expect(result.message).toContain("unavailable");
    expect(result.additives).toHaveLength(1);
    expect(result.additives[0].status).toBe("REVIEW_REQUIRED");
    expect(result.additives[0].allowedAmount).toBeNull();
    expect(result.contaminants).toHaveLength(1);
    expect(result.contaminants[0].status).toBe("REVIEW_REQUIRED");
    expect(result.violations).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("routes an HTTP 5xx from the aggregate endpoint through service-unavailable semantics", async () => {
    stubFssai((url) =>
      url === `${BASE}/api/v1/check/product` ? errResponse(503) : errResponse(404),
    );

    const result = await buildRegulatoryCompliance({
      productName: "Cola",
      foodCategory: "Carbonated Water",
      additives: [{ name: "Sodium Benzoate" }],
    });

    expect(result.serviceAvailable).toBe(false);
    expect(result.overallStatus).toBe("REVIEW_REQUIRED");
  });
});

describe("buildRegulatoryCompliance — fallback per-item", () => {
  it("runs per-additive checks when the aggregate product check returns no checks", async () => {
    const calls: FetchCall[] = [];
    const fetchMock = stubFssai((url, init) => {
      calls.push({ url, init });
      if (url === `${BASE}/api/v1/check/product`) {
        return okResponse({
          product_name: "Juice",
          food_category: "Fruit Juice",
          overall_status: "NO_APPLICABLE_RULE",
          checks: [],
        });
      }
      if (url === `${BASE}/api/v1/check/additive`) {
        return okResponse({
          status: "PASS",
          message: "Within permitted limit",
          substance: "Sodium Benzoate",
          food_category: "Fruit Juice",
          detected_value: 400,
          detected_unit: "mg/kg",
          allowed_limit: 750,
          unit: "mg/kg",
          rule_id: "IND-FSSAI-FPSFA-A04-0883",
          evidence: [{ rule_id: "IND-FSSAI-FPSFA-A04-0883", source_document: "FPS&FA 2011" }],
        });
      }
      return errResponse(404);
    });

    const result = await buildRegulatoryCompliance({
      productName: "Juice",
      foodCategory: "Fruit Juice",
      additives: [{ name: "Sodium Benzoate", amount: 400, unit: "mg/kg" }],
    });

    expect(result.serviceAvailable).toBe(true);
    expect(result.overallStatus).toBe("PASS");
    expect(result.additives).toHaveLength(1);
    expect(result.additives[0].status).toBe("PASS");
    expect(result.additives[0].allowedAmount).toBe(750);
    expect(result.additives[0].detectedAmount).toBe(400);
    expect(calls.some((c) => c.url.endsWith("/api/v1/check/additive"))).toBe(true);

    const additiveBody = calls.find((c) => c.url.endsWith("/api/v1/check/additive"))?.init?.body;
    expect(typeof additiveBody).toBe("string");
    expect(JSON.parse(String(additiveBody))).toMatchObject({
      additive: "Sodium Benzoate",
      food_category: "Fruit Juice",
      amount: 400,
      unit: "mg/kg",
    });
  });
});