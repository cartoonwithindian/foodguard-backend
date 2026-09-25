import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { signToken, type SessionUser } from "@/lib/auth";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";
import { guestEmail } from "@/services/user.service";

export const runtime = "nodejs";

/**
 * POST /api/auth/guest - start a guest session without email/password.
 *
 * One tap, no typing. Each guest gets its OWN record so every store-backed
 * API (history, preferences, /api/auth/me) is scoped to that session only —
 * a single shared guest row would hand every visitor the same user id and
 * let strangers read each other's history. The token is signed for the real
 * record id; `isGuestEmail` recognises these accounts elsewhere.
 */
const GUEST_NAME = "Guest";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`guest:${clientIp(request)}`);

    const store = getStore();
    const guest = await store.createUser({
      email: guestEmail(),
      name: GUEST_NAME,
      passwordHash: null,
      language: "EN",
    });

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