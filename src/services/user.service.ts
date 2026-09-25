import { AppError, ErrorCodes } from "@/lib/errors";
import { hashPassword, verifyPassword, signToken, type SessionUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { randomUUID } from "node:crypto";
import type { UserPreferencesInput } from "@/types/domain";

const GUEST_EMAIL_PREFIX = "guest";
const GUEST_EMAIL_DOMAIN = "foodguard.app";
/** The single shared address used before guest identities were split. */
const LEGACY_GUEST_EMAIL = "guest@foodgaurd.app";

/** Mints a unique address for a brand-new guest session. */
export function guestEmail(): string {
  // 16 hex chars (64 bits) — collision-free in practice under the guest rate
  // limit, and short enough to render sensibly in the profile screen.
  const suffix = randomUUID().replace(/-/g, "").slice(0, 16);
  return `${GUEST_EMAIL_PREFIX}-${suffix}@${GUEST_EMAIL_DOMAIN}`;
}

/**
 * True for any account minted by {@link guestEmail}. Guests are one row per
 * session, so identity checks must match the pattern rather than one literal
 * address (the old shared `guest@foodgaurd.app` row leaked history between
 * visitors).
 */
export function isGuestEmail(email: string): boolean {
  const value = email.trim().toLowerCase();
  if (value === LEGACY_GUEST_EMAIL) return true;
  return (
    value.startsWith(`${GUEST_EMAIL_PREFIX}-`) && value.endsWith(`@${GUEST_EMAIL_DOMAIN}`)
  );
}

export async function signup(input: { email: string; name: string; password: string; language?: "EN" | "HI" }) {
  const store = getStore();
  const existing = await store.getUserByEmail(input.email);
  if (existing) {
    throw new AppError(ErrorCodes.AUTH_EMAIL_EXISTS, "An account with this email already exists", 409);
  }
  const user = await store.createUser({
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash: await hashPassword(input.password),
    language: input.language ?? "EN",
  });
  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
  };
  return { token: await signToken(session), user: session };
}

export async function login(input: { email: string; password: string }) {
  const store = getStore();
  const user = await store.getUserByEmail(input.email.toLowerCase());

  // Unknown accounts and passwordless accounts (guests) fail identically, so
  // this never reveals which addresses exist. Login deliberately does NOT
  // auto-create: registering a victim's address first would let an attacker
  // squat on it and block the real owner's signup forever.
  if (!user || !user.passwordHash) {
    throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, "Invalid email or password", 401);
  }
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, "Invalid email or password", 401);
  }

  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
  };
  return { token: await signToken(session), user: session };
}

export async function getMe(session: SessionUser) {
  const store = getStore();
  const user = await store.getUserById(session.id);
  // Guest sessions may not have a persisted record yet (e.g. the store is
  // per-worker in dev). Fall back to a synthetic profile instead of 401.
  if (!user) {
    if (isGuestEmail(session.email)) {
      return {
        id: session.id,
        email: session.email,
        name: session.name,
        role: session.role,
        language: session.language,
        memberSince: new Date().toISOString(),
        preferences: null,
      };
    }
    throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
  }
  const preferences = await store.getUserPreferences(user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
    memberSince: user.createdAt,
    preferences: preferences
      ? {
          vegetarian: preferences.vegetarian,
          vegan: preferences.vegan,
          allergies: preferences.allergies,
          dietaryRestrictions: preferences.dietaryRestrictions,
          avoidIngredients: preferences.avoidIngredients,
          preferredIngredients: preferences.preferredIngredients,
          healthGoals: preferences.healthGoals,
          sensitivityPreferences: preferences.sensitivityPreferences,
        }
      : null,
  };
}

export async function updateProfile(session: SessionUser, fields: { name?: string; language?: "EN" | "HI" }) {
  const store = getStore();
  const user = await store.updateUser(session.id, fields);
  if (!user) {
    if (isGuestEmail(session.email)) {
      return {
        id: session.id,
        email: session.email,
        name: fields.name ?? session.name,
        role: session.role,
        language: fields.language ?? session.language,
        createdAt: new Date().toISOString(),
      };
    }
    throw new AppError(ErrorCodes.UNAUTHORIZED, "User not found", 401);
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
    createdAt: user.createdAt,
  };
}

export async function updatePreferences(session: SessionUser, prefs: UserPreferencesInput) {
  const store = getStore();
  const record = await store.upsertUserPreferences(session.id, prefs);
  return {
    userId: record.userId,
    vegetarian: record.vegetarian,
    vegan: record.vegan,
    allergies: record.allergies,
    dietaryRestrictions: record.dietaryRestrictions,
    avoidIngredients: record.avoidIngredients,
    preferredIngredients: record.preferredIngredients,
    healthGoals: record.healthGoals,
    sensitivityPreferences: record.sensitivityPreferences,
  };
}
