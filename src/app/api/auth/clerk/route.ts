import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { requireClerkSession } from "@/lib/clerk-session";
import { signToken } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/**
 * POST /api/auth/clerk
 *
 * Bridges a Clerk session into a FoodGuard session.
 *
 * The Clerk frontend SDK sends the session token (`__session` cookie on
 * same-origin requests, `Authorization: Bearer` elsewhere). We verify it
 * against Clerk's JWKS, upsert the FoodGuard user row so gamification,
 * history and preferences keep working, and mint this app's own HS256 JWT —
 * the exact token every existing endpoint already accepts.
 *
 * Clerk is the identity provider; FoodGuard's authorization and data model
 * are unchanged.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const clerk = await requireClerkSession(request);

    const store = getStore();
    const email = clerk.email.toLowerCase();

    // Match by stored clerk id first, then by email (covers accounts that
    // predate the Clerk integration), creating the row on first sign-in.
    let user = await store.getUserById(clerk.clerkUserId);
    if (!user) {
      const byEmail = await store.getUserByEmail(email);
      if (byEmail) {
        user = byEmail;
      } else {
        user = await store.createUser({
          email,
          name: clerk.name || email.split("@")[0],
          passwordHash: null,
          language: "EN",
        });
      }
    }

    const session = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      language: user.language,
    };
    const token = await signToken(session);

    return jsonSuccess({ token, user: session }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
