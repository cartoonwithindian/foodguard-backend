import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { loginSchema } from "@/schemas";
import { login } from "@/services/user.service";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** POST /api/auth/login - authenticate and receive a JWT. */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`auth:${clientIp(request)}`);
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);

    const result = await login(parsed.data);
    return jsonSuccess(result, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
