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

export function resolveAuthSecret(): string {
  return process.env.AUTH_SECRET || randomBytes(32).toString("hex");
}
