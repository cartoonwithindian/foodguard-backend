import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { config } from "@/lib/config";
import { resolveAuthSecret } from "@/lib/server/auth-secret";
import { AppError, ErrorCodes } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getStore } from "@/lib/store";

export type UserRole = "USER" | "ADMIN";
export type UserLanguage = "EN" | "HI";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  language: UserLanguage;
};

const encoder = new TextEncoder();

// Resolve once so a missing AUTH_SECRET doesn't mint a fresh random secret on
// every signed token / verification (secrets are global, not per-call).
const AUTH_SECRET = resolveAuthSecret();

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ role: user.role, email: user.email, name: user.name, language: user.language })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(config.auth.expiresIn)
    .sign(encoder.encode(AUTH_SECRET));
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    // Pin the algorithm: a token must be the exact HS256 shape we mint. This
    // is defense-in-depth (jose already refuses `alg:none` for symmetric
    // keys), but it keeps the check explicit if key handling ever changes.
    const { payload } = await jwtVerify(token, encoder.encode(AUTH_SECRET), {
      algorithms: ["HS256"],
    });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: (payload.role as UserRole) ?? "USER",
      language: (payload.language as UserLanguage) ?? "EN",
    };
  } catch {
    return null;
  }
}

const AUTH_HEADER_RE = /^Bearer\s+(.+)$/i;

/** Extracts and verifies the Bearer token from a request. Returns null when absent/invalid. */
export async function getSession(request: Request): Promise<SessionUser | null> {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = AUTH_HEADER_RE.exec(header);
  if (!match) return null;
  return verifyToken(match[1]);
}

export async function requireAuth(request: Request): Promise<SessionUser> {
  const session = await getSession(request);
  if (!session) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);
  }
  return session;
}

export async function requireAdmin(request: Request): Promise<SessionUser> {
  const session = await requireAuth(request);
  // Re-read the role from the database instead of trusting the JWT claim.
  // Tokens live for 7 days, so a demoted or deleted admin would otherwise keep
  // full admin API access until the token expired. Admin traffic is low, so
  // the extra lookup is cheap.
  const stored = await getStore().getUserById(session.id);
  if (!stored) {
    logger.warn("forbidden_admin_access", { userId: session.id, reason: "unknown_user" });
    throw new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);
  }
  if (stored.role !== "ADMIN") {
    logger.warn("forbidden_admin_access", { userId: session.id, reason: "not_admin" });
    throw new AppError(ErrorCodes.FORBIDDEN, "Admin access required", 403);
  }
  return { ...session, role: stored.role };
}
