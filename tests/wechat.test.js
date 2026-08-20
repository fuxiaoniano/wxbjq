"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { getMembershipService } = require("../server/membership/service");
const { readJsonFile } = require("../server/storage");
const { decryptSecret, encryptSecret } = require("../server/wechat/crypto");
const { WechatApiError } = require("../server/wechat/errors");
const { getWechatService } = require("../server/wechat/service");
const { createTestApp, tokenFromMessage } = require("./app-helper");

const encryptionKey = crypto.createHash("sha256").update("wechat-test-key").digest();
const encryptionKeyBase64 = encryptionKey.toString("base64");

function testWechatAppId(suffix) {
  return ["w", "x", suffix].join("");
}

function testWechatAppSecret(label) {
  return `test-${label}-secret`.padEnd(32, "a");
}

function createMockWechatClient() {
  const calls = [];
  return {
    calls,
    async getStableAccessToken({ appId, appSecret, forceRefresh }) {
      calls.push({ appId, appSecret, forceRefresh });
      if (appSecret.startsWith("invalid")) throw new WechatApiError(40125, "invalid appsecret");
      return { accessToken: `token-${appId}-${calls.length}`, expiresIn: 7200 };
    },
  };
}

async function registerVerifiedUser(app, email, password) {
  await app.post("/api/auth/register", { email, password, confirmPassword: password, termsAccepted: true });
  const message = app.provider.messages.findLast((item) => item.type === "email_verification" && item.to === email);
  await app.post("/api/auth/verify-email", { token: tokenFromMessage(message, "verify-email") });
  const jar = {};
  const login = await app.post("/api/auth/login", { email, password }, jar);
  return { jar, user: login.payload.user };
}

async function grantMembership(app, userId, planId) {
  const membership = getMembershipService(app.config);
  await membership.repository.ensureSeeded();
  await membership.repository.memberships.insert({
    userId,
    planId,
    status: "active",
    source: "test",
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
  });
}

test("wechat credentials use authenticated encryption and reject tampering", () => {
  const credential = testWechatAppSecret("credential");
  const envelope = encryptSecret(credential, encryptionKey, "test-v1", "credential-test");
  assert.equal(decryptSecret(envelope, encryptionKey, "credential-test"), credential);
  assert.equal(envelope.algorithm, "aes-256-gcm");
  assert.equal(envelope.keyVersion, "test-v1");
  const tampered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -2)}AA` };
  assert.throws(
    () => decryptSecret(tampered, encryptionKey, "credential-test"),
    (error) => error.code === "WECHAT_CREDENTIAL_DECRYPT_FAILED",
  );
});

test("members can bind multiple accounts while tenant isolation and token secrecy are enforced", async () => {
  const app = await createTestApp({
    ADMIN_EMAILS: "owner@example.com",
    WECHAT_ENABLED: "true",
    WECHAT_CREDENTIAL_KEY: encryptionKeyBase64,
    WECHAT_CREDENTIAL_KEY_VERSION: "test-v1",
  });
  const client = createMockWechatClient();
  app.config.wechatClientInstance = client;
  try {
    const firstUser = await registerVerifiedUser(app, "first@example.com", "FirstSecure123!");
    const secondUser = await registerVerifiedUser(app, "second@example.com", "SecondSecure123!");
    const owner = await registerVerifiedUser(app, "owner@example.com", "OwnerSecure123!");
    const freeDenied = await app.json("/api/wechat/accounts", {}, firstUser.jar);
    assert.equal(freeDenied.response.status, 403);
    assert.equal(freeDenied.payload.error.code, "MEMBERSHIP_REQUIRED");
    await grantMembership(app, firstUser.user.id, "plan_business");
    await grantMembership(app, secondUser.user.id, "plan_pro");

    const firstSecret = testWechatAppSecret("first");
    const createdFirst = await app.post(
      "/api/wechat/accounts",
      { displayName: "第一公众号", appId: testWechatAppId("1234567890abcdef"), appSecret: firstSecret, isDefault: true },
      firstUser.jar,
    );
    assert.equal(createdFirst.response.status, 201);
    assert.equal(createdFirst.payload.isDefault, true);
    assert.equal(createdFirst.payload.maskedAppId, "wx12****cdef");
    const serializedFirst = JSON.stringify(createdFirst.payload);
    assert.ok(!serializedFirst.includes(firstSecret));
    assert.ok(!serializedFirst.includes("token-"));
    assert.ok(!Object.hasOwn(createdFirst.payload, "appId"));
    assert.ok(!Object.hasOwn(createdFirst.payload, "encryptedAppSecret"));

    const createdSecond = await app.post(
      "/api/wechat/accounts",
      { displayName: "第二公众号", appId: testWechatAppId("abcdef1234567890"), appSecret: testWechatAppSecret("second") },
      firstUser.jar,
    );
    assert.equal(createdSecond.response.status, 201);
    const otherAccount = await app.post(
      "/api/wechat/accounts",
      { displayName: "其他用户公众号", appId: testWechatAppId("9988776655443322"), appSecret: testWechatAppSecret("other") },
      secondUser.jar,
    );
    assert.equal(otherAccount.response.status, 201);
    const proMultipleDenied = await app.post(
      "/api/wechat/accounts",
      { displayName: "超额公众号", appId: testWechatAppId("1122334455667788"), appSecret: testWechatAppSecret("extra") },
      secondUser.jar,
    );
    assert.equal(proMultipleDenied.response.status, 403);
    assert.equal(proMultipleDenied.payload.error.code, "MEMBERSHIP_REQUIRED");

    const crossTenantVerify = await app.post(`/api/wechat/accounts/${createdFirst.payload.id}/verify`, {}, secondUser.jar);
    assert.equal(crossTenantVerify.response.status, 404);
    const crossTenantDelete = await app.post(
      `/api/wechat/accounts/${createdFirst.payload.id}`,
      {},
      secondUser.jar,
      { method: "DELETE" },
    );
    assert.equal(crossTenantDelete.response.status, 404);

    const makeDefault = await app.post(
      `/api/wechat/accounts/${createdSecond.payload.id}`,
      { isDefault: true },
      firstUser.jar,
      { method: "PATCH" },
    );
    assert.equal(makeDefault.response.status, 200);
    assert.equal(makeDefault.payload.isDefault, true);
    const firstList = await app.json("/api/wechat/accounts", {}, firstUser.jar);
    assert.equal(firstList.payload.items.length, 2);
    assert.equal(firstList.payload.items.filter((item) => item.isDefault).length, 1);

    const invalidUpdate = await app.post(
      `/api/wechat/accounts/${createdFirst.payload.id}`,
      { appSecret: "invalid0000000000000000000000000" },
      firstUser.jar,
      { method: "PATCH" },
    );
    assert.equal(invalidUpdate.response.status, 422);
    assert.equal(invalidUpdate.payload.error.code, "WECHAT_INVALID_APP_SECRET");
    assert.ok(!JSON.stringify(invalidUpdate.payload).includes("invalid000"));

    const service = getWechatService(app.config);
    const rawAccount = await service.repository.findOwnedAccount(firstUser.user.id, createdFirst.payload.id);
    await service.repository.removeAccessToken(rawAccount.id, rawAccount.userId);
    const callsBeforeRefresh = client.calls.length;
    const tokens = await Promise.all(Array.from({ length: 12 }, () => service.tokenService.getAccessToken(rawAccount)));
    assert.equal(new Set(tokens).size, 1);
    assert.equal(client.calls.length - callsBeforeRefresh, 1);

    let operationCalls = 0;
    const refreshCallsBeforeRetry = client.calls.length;
    const retryResult = await service.tokenService.withAccessToken(rawAccount, async (token) => {
      operationCalls += 1;
      if (operationCalls === 1) throw new WechatApiError(40014, "invalid access token");
      return token;
    });
    assert.equal(operationCalls, 2);
    assert.equal(client.calls.length - refreshCallsBeforeRetry, 1);
    assert.equal(client.calls.at(-1).forceRefresh, true);
    assert.match(retryResult, /^token-/);

    const tokenRows = await readJsonFile(app.config.wechatFiles.accessTokens, []);
    assert.ok(tokenRows.length >= 1);
    assert.ok(!JSON.stringify(tokenRows).includes(tokens[0]));
    const accountRows = await readJsonFile(app.config.wechatFiles.accounts, []);
    assert.ok(!JSON.stringify(accountRows).includes(firstSecret));

    const adminList = await app.json("/api/admin/wechat-accounts", {}, owner.jar);
    assert.equal(adminList.response.status, 200);
    assert.equal(adminList.payload.items.length, 3);
    assert.ok(adminList.payload.items.every((item) => !Object.hasOwn(item, "encryptedAppSecret")));

    const removed = await app.post(
      `/api/wechat/accounts/${createdSecond.payload.id}`,
      {},
      firstUser.jar,
      { method: "DELETE" },
    );
    assert.equal(removed.response.status, 204);
    const afterDelete = await app.json("/api/wechat/accounts", {}, firstUser.jar);
    assert.equal(afterDelete.payload.items.length, 1);
    assert.equal(afterDelete.payload.items[0].isDefault, true);
  } finally {
    await app.close();
  }
});
