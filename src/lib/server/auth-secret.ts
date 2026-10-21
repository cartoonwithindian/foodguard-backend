/**
 * Server-only JWT auth secret resolution.
 *
 * Kept out of the shared `config` module so the browser bundle never pulls in
 * `node:crypto` (webpack cannot resolve the `node:` scheme for client chunks).
 * Use `AUTH_SECRET` when set; otherwise fall back to a fresh random 32-byte
 * secret (tokens then cannot be forged, but sessions do not survive a
 * restart). Always set AUTH_SECRET in any real deployment.
 */
import { randomBytes } from "node:crypto";

const MIN_SECRET_LENGTH = 32;

export function resolveAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;

  if (process.env.NODE_ENV === "production") {
    // A per-process random secret silently invalidates every session on each
    // restart/deploy and makes replicas reject each other's tokens. A short
    // secret is brute-forceable. Refuse to start instead of failing open.
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `AUTH_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters in production. ` +
          "Generate one with `openssl rand -hex 32`.",
      );
    }
    return secret;
  }

  if (secret) {
    if (secret.length < MIN_SECRET_LENGTH) {
      console.warn(
        `[foodguard-backend] AUTH_SECRET is shorter than ${MIN_SECRET_LENGTH} characters; use a stronger value before deploying.`,
      );
    }
    return secret;
  }

  console.warn(
    "[foodguard-backend] AUTH_SECRET is not set — using an ephemeral random secret. " +
      "Sessions will not survive a restart and will not work across instances. " +
      "Set AUTH_SECRET in any real deployment.",
  );
  return randomBytes(32).toString("hex");
}
