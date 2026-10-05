import { describe, expect, it } from "vitest";
import {
  assertProductionConfig,
  findProductionConfigProblems,
} from "@/lib/server/production-config";

/**
 * Guards against silently fake production deployments.
 *
 * With `AI_PROVIDER=mock` the chat endpoint answers HTTP 200 with the canned
 * string "Sorry, FoodGuard AI is temporarily unavailable.", and with
 * `PRODUCT_DATA_PROVIDER=mock` every barcode scan fails with
 * `EXTERNAL_PROVIDER_ERROR`. Both only surface at request time, long after the
 * deploy has been called a success.
 */

const REAL = {
  NODE_ENV: "production",
  AI_PROVIDER: "groq",
  AI_API_KEY: "sk-test",
  OCR_PROVIDER: "tesseract",
  PRODUCT_DATA_PROVIDER: "openfoodfacts",
  AUTH_SECRET: "a-real-secret",
} as NodeJS.ProcessEnv;

const variables = (env: NodeJS.ProcessEnv) =>
  findProductionConfigProblems(env).map((p) => p.variable);

describe("production configuration guard", () => {
  it("passes a fully real production configuration", () => {
    expect(findProductionConfigProblems(REAL)).toEqual([]);
    expect(() => assertProductionConfig(REAL)).not.toThrow();
  });

  it("rejects each mock provider individually", () => {
    for (const variable of ["AI_PROVIDER", "OCR_PROVIDER", "PRODUCT_DATA_PROVIDER"]) {
      const problems = findProductionConfigProblems({ ...REAL, [variable]: "mock" });
      expect(problems.map((p) => p.variable), `${variable}=mock must be rejected`).toContain(
        variable,
      );
    }
  });

  it("rejects an empty provider as well as an explicit mock", () => {
    expect(variables({ ...REAL, AI_PROVIDER: "" })).toContain("AI_PROVIDER");
    expect(variables({ ...REAL, AI_PROVIDER: "   " })).toContain("AI_PROVIDER");
  });

  it("rejects a missing AUTH_SECRET, which would rotate on every boot", () => {
    expect(variables({ ...REAL, AUTH_SECRET: "" })).toContain("AUTH_SECRET");
  });

  it("matches mock case-insensitively and ignores surrounding whitespace", () => {
    expect(variables({ ...REAL, AI_PROVIDER: " MOCK " })).toContain("AI_PROVIDER");
  });

  it("allows mock providers outside production", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      const env: NodeJS.ProcessEnv = {
        ...REAL,
        AI_PROVIDER: "mock",
        OCR_PROVIDER: "mock",
        PRODUCT_DATA_PROVIDER: "mock",
        AUTH_SECRET: "",
      };
      if (nodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = nodeEnv;
      expect(findProductionConfigProblems(env), `NODE_ENV=${nodeEnv}`).toEqual([]);
    }
  });

  it("reports every problem at once rather than one per restart", () => {
    const problems = variables({
      NODE_ENV: "production",
      AI_PROVIDER: "mock",
      OCR_PROVIDER: "mock",
      PRODUCT_DATA_PROVIDER: "mock",
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        "AI_PROVIDER",
        "OCR_PROVIDER",
        "PRODUCT_DATA_PROVIDER",
        "AUTH_SECRET",
      ]),
    );
  });

  it("throws with an actionable message naming the variables", () => {
    let message = "";
    try {
      assertProductionConfig({ ...REAL, AI_PROVIDER: "mock", AUTH_SECRET: "" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("Refusing to start");
    expect(message).toContain("AI_PROVIDER");
    expect(message).toContain("AUTH_SECRET");
    expect(message).toMatch(/not allowed in production/);
  });

  it("does not treat curated/bundled data providers as mocks", () => {
    // EVIDENCE_PROVIDER=curated is a real curated dataset, not a mock, and is
    // deliberately absent from render.yaml's mock list.
    expect(findProductionConfigProblems({ ...REAL, EVIDENCE_PROVIDER: "curated" })).toEqual([]);
  });
});