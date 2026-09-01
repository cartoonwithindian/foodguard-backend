import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { signToken, type SessionUser } from "@/lib/auth";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/**
 * POST /api/auth/guest - start a guest session without email/password.
 *
 * One tap, no typing. The guest user is created once (and reused) in the
 * store so every store-backed API (history, preferences, /api/auth/me)
 * works for the session. The token is signed for the real record id.
 */
const GUEST_EMAIL = "guest@foodgaurd.app";
const GUEST_NAME = "Guest";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`guest:${clientIp(request)}`);

    const store = getStore();
    let guest = await store.getUserByEmail(GUEST_EMAIL);
    if (!guest) {
      guest = await store.createUser({
        email: GUEST_EMAIL,
        name: GUEST_NAME,
        passwordHash: null,
        language: "EN",
      });
    }

    const session: SessionUser = {
      id: guest.id,
      email: guest.email,
      name: guest.name,
      role: guest.role,
      language: guest.language,
    };

    const token = await signToken(session);
    return jsonSuccess({ token, user: session }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}