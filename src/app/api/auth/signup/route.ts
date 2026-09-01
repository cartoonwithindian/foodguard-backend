import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/http";
import { signupSchema } from "@/schemas";
import { signup } from "@/services/user.service";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** POST /api/auth/signup - create an account and return a JWT. */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    await enforceRateLimit(`auth:${clientIp(request)}`);
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) return jsonError(parsed.error, requestId);

    const result = await signup({
      email: parsed.data.email,
      name: parsed.data.name,
      password: parsed.data.password,
      language: (parsed.data.language?.toUpperCase() as "EN" | "HI") ?? "EN",
    });
    return jsonSuccess(result, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
