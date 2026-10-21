import { describe, expect, it } from "vitest";
import { signup, login, isGuestEmail } from "@/services/user.service";
import { signToken, requireAdmin, type SessionUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`;
}

describe("login security", () => {
  it("does not create an account for an unknown email", async () => {
    const email = uniqueEmail("unknown-login");
    await expect(login({ email, password: "StrongPass1" })).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      status: 401,
    });
    expect(await getStore().getUserByEmail(email)).toBeNull();
  });

  it("rejects a wrong password for an existing account", async () => {
    const email = uniqueEmail("wrong-password");
    await signup({ email, name: "Wrong Pass", password: "StrongPass1" });
    await expect(login({ email, password: "WrongPass1" })).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      status: 401,
    });
  });

  it("does not allow passwordless login for guest (null hash) accounts", async () => {
    const store = getStore();
    const email = uniqueEmail("guest-login");
    await store.createUser({ email, name: "Guest", passwordHash: null });
    expect(isGuestEmail(email)).toBe(false);
    await expect(login({ email, password: "anything" })).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      status: 401,
    });
  });

  it("accepts a valid password", async () => {
    const email = uniqueEmail("valid-login");
    await signup({ email, name: "Valid User", password: "StrongPass1" });
    const result = await login({ email, password: "StrongPass1" });
    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe(email);
  });
});

describe("signup security", () => {
  it("rejects duplicate emails with a 409", async () => {
    const email = uniqueEmail("duplicate");
    await signup({ email, name: "First", password: "StrongPass1" });
    await expect(signup({ email, name: "Second", password: "StrongPass1" })).rejects.toMatchObject({
      code: "AUTH_EMAIL_EXISTS",
      status: 409,
    });
  });

  it("normalizes email case for storage and login", async () => {
    const mixed = `MixedCase-${Date.now()}@Test.INVALID`;
    const created = await signup({ email: mixed, name: "Mixed Case", password: "StrongPass1" });
    expect(created.user.email).toBe(mixed.toLowerCase());
    expect(await getStore().getUserByEmail(mixed.toLowerCase())).not.toBeNull();

    const loggedIn = await login({ email: mixed.toLowerCase(), password: "StrongPass1" });
    expect(loggedIn.user.email).toBe(mixed.toLowerCase());

    await expect(signup({ email: mixed.toLowerCase(), name: "Duplicate", password: "StrongPass1" })).rejects.toMatchObject({
      code: "AUTH_EMAIL_EXISTS",
      status: 409,
    });
  });

  it("handles concurrent duplicate signups without a 500", async () => {
    const email = uniqueEmail("concurrent");
    const results = await Promise.allSettled([
      signup({ email, name: "First", password: "StrongPass1" }),
      signup({ email, name: "Second", password: "StrongPass1" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "AUTH_EMAIL_EXISTS", status: 409 });
  });

  it("reserves the guest email namespace", async () => {
    await expect(
      signup({
        email: "guest-0123456789abcdef@foodguard.app",
        name: "Not A Guest",
        password: "StrongPass1",
      }),
    ).rejects.toMatchObject({ code: "AUTH_EMAIL_EXISTS", status: 409 });
  });
});

describe("admin authorization", () => {
  function bearer(token: string): Request {
    return new Request("http://localhost/api/admin/users", {
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it("rejects an ADMIN token whose database role is USER", async () => {
    const store = getStore();
    const user = await store.createUser({
      email: uniqueEmail("demoted"),
      name: "Demoted Admin",
      passwordHash: null,
      role: "USER",
    });
    const forgedClaim: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: "ADMIN", // stale/forged claim in the token
      language: "EN",
    };
    const token = await signToken(forgedClaim);
    await expect(requireAdmin(bearer(token))).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("rejects an ADMIN token for a user that no longer exists", async () => {
    const token = await signToken({
      id: "usr-does-not-exist",
      email: "gone@test.invalid",
      name: "Gone",
      role: "ADMIN",
      language: "EN",
    });
    await expect(requireAdmin(bearer(token))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("accepts a real admin", async () => {
    const store = getStore();
    const user = await store.createUser({
      email: uniqueEmail("admin"),
      name: "Real Admin",
      passwordHash: null,
      role: "ADMIN",
    });
    const token = await signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: "ADMIN",
      language: "EN",
    });
    const session = await requireAdmin(bearer(token));
    expect(session.id).toBe(user.id);
    expect(session.role).toBe("ADMIN");
  });
});
