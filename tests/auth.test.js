"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { loadConfig } = require("../server");
const { normalizeEmail } = require("../server/auth/identity");
const { hashPassword, verifyPassword } = require("../server/auth/password");
const { validatePassword } = require("../server/auth/validation");
const { createAuthRepository } = require("../server/auth/repository");
const { generateOpaqueToken, hashOpaqueToken } = require("../server/auth/tokens");
const { getMembershipService } = require("../server/membership/service");
const { readJsonFile } = require("../server/storage");
const { redactLogText } = require("../server/logging");
const { createTestApp, tokenFromMessage } = require("./app-helper");

const rootDir = path.resolve(__dirname, "..");

const credentials = {
  email: "Member@Example.com",
  password: "SecurePass123!",
  confirmPassword: "SecurePass123!",
  termsAccepted: true,
};

test("email normalization, password hashing and opaque token hashing are deterministic where required", async () => {
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
  const encoded = await hashPassword("SecurePass123!", { N: 1024, r: 8, p: 1, keyLength: 32 });
  assert.notEqual(encoded, "SecurePass123!");
  assert.equal(await verifyPassword("SecurePass123!", encoded), true);
  assert.equal(await verifyPassword("wrong-password", encoded), false);
  const token = generateOpaqueToken();
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(hashOpaqueToken(token, "pepper"), hashOpaqueToken(token, "pepper"));
  assert.notEqual(hashOpaqueToken(token, "pepper"), token);
});

test("passwords require at least eight characters with both letters and numbers", () => {
  const config = { passwordMinLength: 8, passwordMaxLength: 128 };
  assert.equal(validatePassword("abc12345", config), "abc12345");
  assert.equal(validatePassword("Abc123!@", config), "Abc123!@");
  assert.throws(() => validatePassword("abc1234", config), /8-128/);
  assert.throws(() => validatePassword("abcdefgh", config), /字母和数字/);
  assert.throws(() => validatePassword("12345678", config), /字母和数字/);
  assert.throws(() => validatePassword("abcdefg!", config), /字母和数字/);
  assert.throws(() => validatePassword("1234567!", config), /字母和数字/);
});

test("register, unverified login, one-time email verification and CSRF-protected logout", async () => {
  const app = await createTestApp();
  const jar = {};
  try {
    const registered = await app.post("/api/auth/register", credentials);
    assert.equal(registered.response.status, 202);
    assert.ok(!JSON.stringify(registered.payload).includes(credentials.password));
    assert.equal(app.provider.messages.length, 1);

    const users = await readJsonFile(app.config.authFiles.users, []);
    assert.equal(users.length, 1);
    assert.equal(users[0].normalizedEmail, "member@example.com");
    assert.match(users[0].passwordHash, /^scrypt\$/);
    assert.ok(!JSON.stringify(users).includes(credentials.password));

    const rawToken = tokenFromMessage(app.provider.messages[0], "verify-email");
    const storedTokens = await readJsonFile(app.config.authFiles.emailVerificationTokens, []);
    assert.equal(storedTokens.length, 1);
    assert.ok(!JSON.stringify(storedTokens).includes(rawToken));

    const login = await app.post("/api/auth/login", { email: credentials.email, password: credentials.password }, jar);
    assert.equal(login.response.status, 200);
    const loginCookies = login.response.headers.getSetCookie();
    assert.ok(loginCookies.some((value) => value.includes("HttpOnly")));
    assert.ok(loginCookies.every((value) => value.includes("SameSite=Lax")));
    assert.ok(loginCookies.every((value) => !value.includes("Max-Age=")));
    assert.equal(login.payload.emailVerificationRequired, true);
    assert.ok(jar[app.config.sessionCookieName]);
    assert.ok(jar[app.config.csrfCookieName]);

    const denied = await app.json("/api/features/wechat.draft.create/check", {}, jar);
    assert.equal(denied.payload.allowed, false);
    assert.equal(denied.payload.code, "EMAIL_NOT_VERIFIED");

    const verified = await app.post("/api/auth/verify-email", { token: rawToken });
    assert.equal(verified.response.status, 200);
    assert.ok(verified.payload.user.emailVerifiedAt);
    const repeated = await app.post("/api/auth/verify-email", { token: rawToken });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.payload.alreadyVerified, true);

    const freeDenied = await app.json("/api/features/wechat.draft.create/check", {}, jar);
    assert.equal(freeDenied.payload.code, "MEMBERSHIP_REQUIRED");

    const missingCsrf = await app.json(
      "/api/auth/logout",
      {
        method: "POST",
        headers: { Origin: app.origin, "Content-Type": "application/json", "X-Editor-Request": "1" },
        body: "{}",
      },
      jar,
    );
    assert.equal(missingCsrf.response.status, 403);
    const logout = await app.post("/api/auth/logout", {}, jar);
    assert.equal(logout.response.status, 204);
    assert.equal(jar[app.config.sessionCookieName], undefined);
  } finally {
    await app.close();
  }
});

test("production startup rejects unsafe account and SMTP configuration", () => {
  assert.throws(
    () =>
      loadConfig({
        rootDir,
        env: {
          HOST: "127.0.0.1",
          PORT: "8090",
          NODE_ENV: "production",
          APP_PUBLIC_URL: "http://editor.example.com/",
          SESSION_SECRET: "short",
          AUTH_ENABLED: "true",
          SERVER_STORAGE_ENABLED: "true",
          EMAIL_PROVIDER: "console",
        },
      }),
    /SESSION_SECRET|HTTPS|smtp/,
  );
  const safe = loadConfig({
    rootDir,
    env: {
      HOST: "127.0.0.1",
      PORT: "8090",
      NODE_ENV: "production",
      APP_PUBLIC_URL: "https://editor.example.com/",
      SESSION_SECRET: "a-production-session-secret-that-is-long-enough",
      AUTH_ENABLED: "true",
      SERVER_STORAGE_ENABLED: "true",
      COOKIE_SECURE: "true",
      EMAIL_PROVIDER: "smtp",
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "mailer@example.com",
      SMTP_PASS: "authorization-code",
      EMAIL_FROM_ADDRESS: "mailer@example.com",
    },
  });
  assert.equal(safe.cookieSecure, true);
  assert.equal(safe.email.provider, "smtp");
  assert.throws(
    () =>
      loadConfig({
        rootDir,
        env: {
          HOST: "127.0.0.1",
          PORT: "8090",
          NODE_ENV: "production",
          APP_PUBLIC_URL: "https://editor.example.com/",
          SESSION_SECRET: "a-production-session-secret-that-is-long-enough",
          AUTH_ENABLED: "true",
          SERVER_STORAGE_ENABLED: "true",
          COOKIE_SECURE: "true",
          EMAIL_PROVIDER: "smtp",
          SMTP_HOST: "smtp.example.com",
          SMTP_USER: "mailer@example.com",
          SMTP_PASS: "authorization-code",
          EMAIL_FROM_ADDRESS: "mailer@example.com",
          WECHAT_ENABLED: "true",
        },
      }),
    /WECHAT_CREDENTIAL_KEY/,
  );
  assert.equal(
    redactLogText("password=secret Authorization: Bearer abc.def token=xyz"),
    "password=[redacted] Authorization: [redacted] token=[redacted]",
  );
});

test("password reset is generic, one-time, and revokes existing sessions", async () => {
  const app = await createTestApp();
  const jar = {};
  try {
    await app.post("/api/auth/register", credentials);
    const verifyToken = tokenFromMessage(app.provider.messages[0], "verify-email");
    await app.post("/api/auth/verify-email", { token: verifyToken });
    await app.post("/api/auth/login", { email: credentials.email, password: credentials.password }, jar);

    const forgotUnknown = await app.post("/api/auth/forgot-password", { email: "unknown@example.com" });
    const forgotKnown = await app.post("/api/auth/forgot-password", { email: credentials.email });
    assert.equal(forgotUnknown.response.status, 202);
    assert.equal(forgotKnown.response.status, 202);
    assert.equal(forgotUnknown.payload.message, forgotKnown.payload.message);
    const resetMessage = app.provider.messages.findLast((message) => message.type === "password_reset");
    const resetToken = tokenFromMessage(resetMessage, "reset-password");

    const reset = await app.post("/api/auth/reset-password", {
      token: resetToken,
      password: "NewSecurePass456!",
      confirmPassword: "NewSecurePass456!",
    });
    assert.equal(reset.response.status, 200);
    assert.equal((await app.json("/api/auth/me", {}, jar)).payload.user, null);
    assert.equal((await app.post("/api/auth/login", { email: credentials.email, password: credentials.password })).response.status, 401);
    assert.equal((await app.post("/api/auth/login", { email: credentials.email, password: "NewSecurePass456!" })).response.status, 200);
    assert.equal((await app.post("/api/auth/reset-password", {
      token: resetToken,
      password: "AnotherSecure789!",
      confirmPassword: "AnotherSecure789!",
    })).response.status, 400);
  } finally {
    await app.close();
  }
});

test("expired tokens are rejected and resending invalidates the previous verification link", async () => {
  const app = await createTestApp();
  try {
    await app.post("/api/auth/register", credentials);
    const repository = createAuthRepository(app.config);
    const firstMessage = app.provider.messages.find((message) => message.type === "email_verification");
    const firstToken = tokenFromMessage(firstMessage, "verify-email");
    const storedVerification = (await repository.emailTokens.list())[0];
    await repository.emailTokens.updateById(storedVerification.id, {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const expiredVerification = await app.post("/api/auth/verify-email", { token: firstToken });
    assert.equal(expiredVerification.response.status, 410);
    assert.equal(expiredVerification.payload.error.code, "TOKEN_EXPIRED");

    await app.post("/api/auth/resend-verification", { email: credentials.email });
    const secondToken = tokenFromMessage(app.provider.messages.findLast((message) => message.type === "email_verification"), "verify-email");
    await app.post("/api/auth/resend-verification", { email: credentials.email });
    const thirdToken = tokenFromMessage(app.provider.messages.findLast((message) => message.type === "email_verification"), "verify-email");
    assert.equal((await app.post("/api/auth/verify-email", { token: secondToken })).response.status, 400);
    assert.equal((await app.post("/api/auth/verify-email", { token: thirdToken })).response.status, 200);

    await app.post("/api/auth/forgot-password", { email: credentials.email });
    const resetToken = tokenFromMessage(app.provider.messages.findLast((message) => message.type === "password_reset"), "reset-password");
    const storedReset = (await repository.resetTokens.list()).find((row) => !row.invalidatedAt);
    await repository.resetTokens.updateById(storedReset.id, {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const expiredReset = await app.post("/api/auth/reset-password", {
      token: resetToken,
      password: "NewSecurePass456!",
      confirmPassword: "NewSecurePass456!",
    });
    assert.equal(expiredReset.response.status, 410);
    assert.equal(expiredReset.payload.error.code, "TOKEN_EXPIRED");
  } finally {
    await app.close();
  }
});

test("change password rotates the current session and revokes other sessions", async () => {
  const app = await createTestApp();
  const firstJar = {};
  const secondJar = {};
  try {
    await app.post("/api/auth/register", credentials);
    await app.post("/api/auth/verify-email", {
      token: tokenFromMessage(app.provider.messages[0], "verify-email"),
    });
    await app.post("/api/auth/login", { email: credentials.email, password: credentials.password }, firstJar);
    await app.post("/api/auth/login", { email: credentials.email, password: credentials.password }, secondJar);
    const oldFirstToken = firstJar[app.config.sessionCookieName];

    const changed = await app.post("/api/auth/change-password", {
      currentPassword: credentials.password,
      newPassword: "ChangedPass987!",
      confirmPassword: "ChangedPass987!",
    }, firstJar);
    assert.equal(changed.response.status, 200);
    assert.notEqual(firstJar[app.config.sessionCookieName], oldFirstToken);
    assert.equal((await app.json("/api/auth/me", {}, secondJar)).payload.user, null);
    assert.ok((await app.json("/api/auth/me", {}, firstJar)).payload.user);
  } finally {
    await app.close();
  }
});

test("admin can manage plans, memberships, features, entitlements and quotas", async () => {
  const app = await createTestApp({ ADMIN_EMAILS: "admin@example.com" });
  const memberJar = {};
  const adminJar = {};
  try {
    await app.post("/api/auth/register", credentials);
    await app.post("/api/auth/register", {
      email: "admin@example.com",
      password: "AdminSecure123!",
      confirmPassword: "AdminSecure123!",
      termsAccepted: true,
    });
    for (const message of app.provider.messages.filter((item) => item.type === "email_verification")) {
      await app.post("/api/auth/verify-email", { token: tokenFromMessage(message, "verify-email") });
    }
    await app.post("/api/auth/login", { email: credentials.email, password: credentials.password }, memberJar);
    const adminLogin = await app.post(
      "/api/auth/login",
      { email: "admin@example.com", password: "AdminSecure123!" },
      adminJar,
    );
    assert.equal(adminLogin.payload.user.isAdmin, true);
    assert.equal(adminLogin.payload.user.isSuperAdmin, true);

    assert.equal((await app.json("/api/admin/users", {}, memberJar)).response.status, 403);
    const usersResult = await app.json("/api/admin/users", {}, adminJar);
    assert.equal(usersResult.response.status, 200);
    assert.equal(usersResult.payload.items.length, 2);
    const member = usersResult.payload.items.find((item) => item.email === "member@example.com");
    const owner = usersResult.payload.items.find((item) => item.email === "admin@example.com");
    assert.equal(owner.isSuperAdmin, true);
    const ownerLockout = await app.post(
      `/api/admin/users/${owner.id}`,
      { status: "frozen" },
      adminJar,
      { method: "PATCH" },
    );
    assert.equal(ownerLockout.response.status, 409);
    assert.equal(ownerLockout.payload.error.code, "SUPER_ADMIN_PROTECTED");

    const granted = await app.post(
      "/api/admin/memberships",
      {
        userId: member.id,
        planId: "plan_pro",
        status: "active",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      adminJar,
    );
    assert.equal(granted.response.status, 201);
    const memberAccess = await app.json("/api/features/wechat.draft.create/check", {}, memberJar);
    assert.equal(memberAccess.payload.allowed, true);
    assert.equal(memberAccess.payload.quotaLimit, 100);
    const memberContext = await app.json("/api/membership/me", {}, memberJar);
    assert.equal(memberContext.payload.membership.plan.slug, "pro");

    const createdFeature = await app.post(
      "/api/admin/features",
      {
        key: "editor.premium.test",
        name: "测试高级功能",
        description: "用于权限测试",
        defaultAccess: "plan",
        active: true,
      },
      adminJar,
    );
    assert.equal(createdFeature.response.status, 201);
    const configured = await app.post(
      "/api/admin/plans/plan_pro/features/editor.premium.test",
      { enabled: true, quotaLimit: 2, quotaPeriod: "monthly" },
      adminJar,
      { method: "PUT" },
    );
    assert.equal(configured.response.status, 200);

    const authRows = await readJsonFile(app.config.authFiles.users, []);
    const memberRecord = authRows.find((row) => row.id === member.id);
    const membershipService = getMembershipService(app.config);
    await membershipService.consumeFeatureUsage(memberRecord, "editor.premium.test");
    const secondUse = await membershipService.consumeFeatureUsage(memberRecord, "editor.premium.test");
    assert.equal(secondUse.remaining, 0);
    await assert.rejects(
      () => membershipService.consumeFeatureUsage(memberRecord, "editor.premium.test"),
      (error) => error.code === "QUOTA_EXCEEDED",
    );

    const deniedEntitlement = await app.post(
      "/api/admin/entitlements",
      { userId: member.id, featureKey: "wechat.draft.create", allowed: false },
      adminJar,
    );
    assert.equal(deniedEntitlement.response.status, 201);
    assert.equal((await app.json("/api/features/wechat.draft.create/check", {}, memberJar)).payload.code, "ENTITLEMENT_DENIED");
    assert.equal(
      (await app.post(`/api/admin/entitlements/${deniedEntitlement.payload.id}`, {}, adminJar, { method: "DELETE" })).response.status,
      204,
    );

    const expired = await app.post(
      `/api/admin/memberships/${granted.payload.id}`,
      { endsAt: new Date(Date.now() - 1000).toISOString() },
      adminJar,
      { method: "PATCH" },
    );
    assert.equal(expired.response.status, 200);
    assert.equal((await app.json("/api/features/wechat.draft.create/check", {}, memberJar)).payload.code, "MEMBERSHIP_REQUIRED");
    const expiredContext = await app.json("/api/membership/me", {}, memberJar);
    assert.equal(expiredContext.payload.membership.status, "expired");
    assert.equal(expiredContext.payload.membership.plan.slug, "pro");

    const frozen = await app.post(
      `/api/admin/users/${member.id}`,
      { status: "frozen" },
      adminJar,
      { method: "PATCH" },
    );
    assert.equal(frozen.response.status, 200);
    assert.equal((await app.json("/api/auth/me", {}, memberJar)).payload.user, null);
    const logs = await app.json("/api/admin/audit-logs?limit=200", {}, adminJar);
    assert.ok(logs.payload.items.some((item) => item.action === "admin.membership_created"));
    assert.ok(!JSON.stringify(logs.payload).includes("AdminSecure123!"));
  } finally {
    await app.close();
  }
});

module.exports = {
  createTestApp,
  tokenFromMessage,
};
