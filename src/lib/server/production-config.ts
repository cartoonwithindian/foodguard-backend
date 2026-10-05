/**
 * Production configuration guard.
 *
 * Several providers accept the literal string `mock`, which returns plausible
 * but fake data. In production that is worse than an outage: the app boots,
 * every request succeeds, and the UI presents invented results as fact.
 *
 * Observed behaviour this prevents:
 *   - `AI_PROVIDER=mock` -> `POST /api/chat` returns HTTP 200 with the canned
 *     string "Sorry, FoodGuard AI is temporarily unavailable." and no sources.
 *   - `PRODUCT_DATA_PROVIDER=mock` -> every barcode scan fails at request time
 *     with `EXTERNAL_PROVIDER_ERROR` (only `openfoodfacts` resolves barcodes).
 *   - `OCR_PROVIDER=mock` -> rejected, but only on the first scan.
 *
 * Mock stays available in development and tests. In production the process
 * refuses to start, so the misconfiguration surfaces on deploy rather than as a
 * silently degraded feature.
 *
 * Kept out of the shared `config` module for the same reason as
 * `server/auth-secret`: this is a server-boot concern.
 */

/** Provider values that stand in for a real integration. */
const MOCK_PROVIDERS = new Set(["mock"]);

function isMock(value: string): boolean {
  return MOCK_PROVIDERS.has(value.trim().toLowerCase());
}

export interface ProductionConfigProblem {
  variable: string;
  message: string;
}

/**
 * Returns the list of production-blocking misconfigurations. An empty list means
 * the process may start.
 */
export function findProductionConfigProblems(
  env: NodeJS.ProcessEnv = process.env,
): ProductionConfigProblem[] {
  // Mocks are legitimate in development and test.
  if (env.NODE_ENV !== "production") return [];

  const problems: ProductionConfigProblem[] = [];

  const requireRealProvider = (variable: string, hint: string): void => {
    const value = (env[variable] ?? "").trim();
    if (value === "") {
      problems.push({
        variable,
        message: `${variable} is not set. ${hint}`,
      });
    } else if (isMock(value)) {
      problems.push({
        variable,
        message: `${variable}="${value}" returns fake data and is not allowed in production. ${hint}`,
      });
    }
  };

  requireRealProvider("AI_PROVIDER", "Set a real provider (e.g. groq) plus AI_API_KEY.");
  requireRealProvider("OCR_PROVIDER", "Set a real provider (e.g. tesseract, ocrspace, puter).");
  requireRealProvider(
    "PRODUCT_DATA_PROVIDER",
    "Set openfoodfacts so barcode lookups resolve.",
  );

  // An unset AUTH_SECRET silently falls back to a random per-boot secret, so
  // every deploy invalidates all sessions.
  if (!(env.AUTH_SECRET ?? "").trim()) {
    problems.push({
      variable: "AUTH_SECRET",
      message:
        "AUTH_SECRET is not set. Without it a random secret is generated on every boot and all sessions are invalidated on restart.",
    });
  }

  return problems;
}

/**
 * Throws when production is misconfigured. Call once during boot, before the
 * server starts accepting traffic.
 */
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  const problems = findProductionConfigProblems(env);
  if (problems.length === 0) return;
  const detail = problems.map((p) => `  - ${p.message}`).join("\n");
  throw new Error(
    `Refusing to start: ${problems.length} production configuration problem(s).\n${detail}\n\n` +
      "Mock providers are allowed only when NODE_ENV is not 'production'.",
  );
}