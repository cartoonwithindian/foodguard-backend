import { AppError, ErrorCodes } from "@/lib/errors";
import { hashPassword, verifyPassword, signToken, type SessionUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import type { UserPreferencesInput } from "@/types/domain";

export const GUEST_EMAIL = "guest@foodgaurd.app";

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
  let user = await store.getUserByEmail(input.email.toLowerCase());

  if (!user) {
    // Auto-create unknown users on first login (demo convenience).
    const name = input.email.split("@")[0] || input.email;
    user = await store.createUser({
      email: input.email.toLowerCase(),
      name,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      language: "EN",
    });
  } else if (user.passwordHash) {
    // Verify password for existing users with a stored hash.
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, "Invalid email or password", 401);
    }
  }
  // If user exists but has no passwordHash (e.g. guest account), allow login.

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
    if (session.email === GUEST_EMAIL) {
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
    if (session.email === GUEST_EMAIL) {
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
