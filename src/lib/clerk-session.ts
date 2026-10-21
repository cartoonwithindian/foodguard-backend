import { createRemoteJWKSet, jwtVerify } from "jose";
import { AppError, ErrorCodes } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Server-side verification of Clerk session tokens.
 *
 * The Clerk instance is NEVER hardcoded here. It is derived from the
 * publishable key (`pk_test_<base64-domain>` / `pk_live_<base64-domain>`),
 * which encodes the instance domain in its second part. That keeps dev,
 * staging and production pointing at their own instances automatically.
 * `CLERK_INSTANCE_URL` remains as an explicit override only.
 */

function resolveClerkIssuer(): string {
  if (process.env.CLERK_INSTANCE_URL) {
    return process.env.CLERK_INSTANCE_URL.replace(/\/$/, "");
  }

  const pk = process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const encoded = pk.split("_")[2];
  if (encoded) {
    try {
      // The key encodes the bare instance domain ("instance.clerk.accounts.dev$"),
      // terminated by Clerk's `$` delimiter — strip it and anything after.
      const decoded = Buffer.from(encoded, "base64")
        .toString("utf8")
        .trim()
        .split("$")[0]
        .trim();
      if (decoded.includes(".")) {
        return decoded.startsWith("http") ? decoded.replace(/\/$/, "") : `https://${decoded}`;
      }
    } catch {
      // fall through to error below
    }
  }

  throw new Error(
    "Clerk instance could not be resolved. Set CLERK_PUBLISHABLE_KEY (or CLERK_INSTANCE_URL) on the backend.",
  );
}

const CLERK_ISSUER = resolveClerkIssuer();

// Clerk's openid-configuration publishes the issuer WITHOUT a trailing slash,
// but some SDK versions mint tokens with the slash — accept both.
const ACCEPTED_ISSUERS = [CLERK_ISSUER, `${CLERK_ISSUER}/`];

const JWKS = createRemoteJWKSet(new URL(`${CLERK_ISSUER}/.well-known/jwks.json`));

/** How stale a Clerk token may be relative to our clock (2 min skew guard). */
const CLOCK_TOLERANCE_SECONDS = 120;

export type ClerkSession = {
  /** Clerk user id (`sub` claim). */
  clerkUserId: string;
  email: string;
  name: string;
};

const AUTH_HEADER_RE = /^Bearer\s+(.+)$/i;

function extractToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header) {
    const match = AUTH_HEADER_RE.exec(header);
    if (match) return match[1];
  }

  // Clerk's default same-origin transport is the `__session` cookie.
  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)__session=([^;]+)/.exec(cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Verifies the Clerk session token on `request`.
 * Throws 401 (AppError) when the token is missing or invalid.
 */
export async function requireClerkSession(request: Request): Promise<ClerkSession> {
  const token = extractToken(request);
  if (!token) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, "Clerk session required", 401);
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      // `issuer` accepts one string; verify both slash variants explicitly.
      issuer: ACCEPTED_ISSUERS[0],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });
    // Some Clerk versions use the slashed issuer — reject nothing silently.
    const iss = typeof payload.iss === "string" ? payload.iss : "";
    if (!ACCEPTED_ISSUERS.includes(iss)) {
      throw new Error(`unexpected issuer: ${iss}`);
    }

    const clerkUserId = payload.sub;
    if (!clerkUserId) throw new Error("missing sub claim");

    const email = typeof payload.email === "string" ? payload.email : "";
    const name =
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name
        : typeof payload.given_name === "string"
          ? payload.given_name
          : "";

    return { clerkUserId, email, name };
  } catch (error) {
    logger.warn("clerk_session_verify_failed", { error: String(error) });
    throw new AppError(ErrorCodes.UNAUTHORIZED, "Invalid Clerk session", 401);
  }
}
