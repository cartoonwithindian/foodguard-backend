/**
 * Server-only JWT auth secret resolution.
 *
 * Kept out of the shared `config` module so the browser bundle never pulls in
 * `node:crypto` (webpack cannot resolve the `node:` scheme for client chunks).
 *
 * A random per-process fallback is only acceptable during local development.
 * In production it meant every deploy/restart silently invalidated every
 * issued token, and two replicas behind a load balancer each minted secrets
 * the other rejected — a bug that looks like "random logouts" and is near
 * impossible to debug from the client side. Production therefore refuses to
 * boot without a usable secret rather than continuing in that state.
 */
import { randomBytes } from "node:crypto";

const MIN_SECRET_LENGTH = 32;

export function resolveAuthSecret(): string {
  const explicit = process.env.AUTH_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (explicit && explicit.length >= MIN_SECRET_LENGTH) return explicit;

  if (explicit) {
    const message = `AUTH_SECRET is set but is only ${explicit.length} characters long; it must be at least ${MIN_SECRET_LENGTH}.`;
    if (isProduction) throw new Error(`${message} Generate one with: openssl rand -hex 32`);
    console.warn(`[foodguard-backend] ${message} Falling back to a generated secret for this process.`);
    return randomBytes(32).toString("hex");
  }

  if (isProduction) {
    throw new Error(
      "AUTH_SECRET must be set in production or the server cannot start. Generate one with: openssl rand -hex 32",
    );
  }

  console.warn(
    "[foodguard-backend] AUTH_SECRET is not set — using a random per-process secret. " +
      "Tokens will not survive a restart and replicas will reject each other's tokens. " +
      "Set AUTH_SECRET for any shared deployment.",
  );
  return randomBytes(32).toString("hex");
}
