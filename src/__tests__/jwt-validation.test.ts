import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";

// Must be set before the auth module resolves its secret. Vitest isolates
// module registries per test file, so this does not affect other suites.
const SECRET = "jwt-validation-test-secret-0123456789abcdef";
process.env.AUTH_SECRET = SECRET;

const encoder = new TextEncoder();
const baseClaims = {
  role: "USER",
  email: "user@test.invalid",
  name: "User",
  language: "EN",
};

let auth: typeof import("@/lib/auth");

beforeAll(async () => {
  auth = await import("@/lib/auth");
});

async function makeToken(
  options: { expiresIn?: string; secret?: string } = {},
): Promise<string> {
  return new SignJWT(baseClaims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("usr-test")
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "1h")
    .sign(encoder.encode(options.secret ?? SECRET));
}

function bearer(token: string): Request {
  return new Request("http://localhost/api/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("JWT validation", () => {
  it("accepts a correctly signed, unexpired HS256 token", async () => {
    const session = await auth.verifyToken(await makeToken());
    expect(session).toMatchObject({ id: "usr-test", email: "user@test.invalid", role: "USER" });
  });

  it("rejects an expired token", async () => {
    const token = await makeToken({ expiresIn: "-1s" });
    expect(await auth.verifyToken(token)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await makeToken({ secret: "attacker-secret-0123456789abcdef" });
    expect(await auth.verifyToken(token)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await makeToken();
    const tampered = `${token.slice(0, -2)}${token.endsWith("A") ? "B" : "A"}x`;
    expect(await auth.verifyToken(tampered)).toBeNull();
  });

  it("rejects an unsigned alg:none token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "usr-test", ...baseClaims, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    expect(await auth.verifyToken(`${header}.${payload}.`)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    for (const token of ["", "not-a-jwt", "a.b", "a.b.c.d"]) {
      expect(await auth.verifyToken(token)).toBeNull();
    }
  });

  it("requireAuth rejects missing, malformed and invalid Authorization headers", async () => {
    for (const request of [
      new Request("http://localhost/api/auth/me"),
      new Request("http://localhost/api/auth/me", { headers: { authorization: "Token abc" } }),
      new Request("http://localhost/api/auth/me", { headers: { authorization: "Bearer garbage" } }),
      bearer(await makeToken({ expiresIn: "-5s" })),
    ]) {
      await expect(auth.requireAuth(request)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        status: 401,
      });
    }
  });

  it("accepts a lowercase bearer scheme", async () => {
    const token = await makeToken();
    const request = new Request("http://localhost/api/auth/me", {
      headers: { authorization: `bearer ${token}` },
    });
    const session = await auth.requireAuth(request);
    expect(session.id).toBe("usr-test");
  });
});
