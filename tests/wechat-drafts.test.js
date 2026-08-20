"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { convertWechatContent } = require("../server/wechat/content-converter");
const { downloadImage, isPrivateAddress, validateImage } = require("../server/wechat/image-service");
const { WechatApiError } = require("../server/wechat/errors");
const { getMembershipService } = require("../server/membership/service");
const { createTestApp, tokenFromMessage } = require("./app-helper");

const key = crypto.createHash("sha256").update("draft-test-key").digest("base64");
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function mockWechatClient() {
  const calls = [];
  return {
    calls,
    async getStableAccessToken({ appId }) { return { accessToken: `token-${appId}`, expiresIn: 7200 }; },
    async uploadArticleImage(token, image) {
      calls.push({ type: "content-image", token, size: image.buffer.length });
      return { url: "https://mmbiz.qpic.cn/test/content.png" };
    },
    async uploadPermanentImage(token, image) {
      calls.push({ type: "cover", token, size: image.buffer.length });
      return { mediaId: "cover_media_123456" };
    },
    async createDraft(token, article) {
      calls.push({ type: "draft", token, article });
      if (article.title === "接口失败") throw new WechatApiError(48001, "api unauthorized");
      return { mediaId: `draft_media_${calls.length}` };
    },
  };
}

async function verifiedUser(app, email) {
  const password = "Password8";
  await app.post("/api/auth/register", { email, password, confirmPassword: password, termsAccepted: true });
  const message = app.provider.messages.findLast((item) => item.type === "email_verification" && item.to === email);
  await app.post("/api/auth/verify-email", { token: tokenFromMessage(message, "verify-email") });
  const jar = {};
  const login = await app.post("/api/auth/login", { email, password }, jar);
  return { jar, user: login.payload.user };
}

async function grant(app, userId, planId = "plan_business") {
  const membership = getMembershipService(app.config);
  await membership.repository.ensureSeeded();
  await membership.repository.memberships.insert({
    userId,
    planId,
    status: "active",
    source: "test",
    startsAt: new Date(Date.now() - 1000).toISOString(),
    endsAt: new Date(Date.now() + 86400_000).toISOString(),
  });
}

async function bind(app, user, suffix) {
  return app.post("/api/wechat/accounts", {
    displayName: `公众号${suffix}`,
    appId: `wx${suffix.padStart(16, "0")}`,
    appSecret: `${suffix}`.padEnd(32, "a"),
  }, user.jar);
}

function draftBody(accountId, title = "测试文章") {
  return {
    accountId,
    title,
    author: "作者",
    digest: "摘要",
    content: `<p onclick="steal()">正文<script>alert(1)</script><img src="${png}" onerror="steal()"></p>`,
    coverImage: png,
    needOpenComment: true,
  };
}

test("HTML conversion removes executable markup and preserves safe formatting", async () => {
  const result = await convertWechatContent('<p style="color:red;position:fixed" onclick="x()">安全<script>x()</script><custom><script>nested()</script>保留文字</custom><a href="javascript:x()">链接</a></p>');
  assert.match(result.content, /color:red/);
  assert.doesNotMatch(result.content, /script|onclick|javascript|position/i);
  assert.equal(result.report.removedElements, 3);
  assert.ok(result.report.removedAttributes >= 2);
});

test("image fetch protection rejects private and metadata destinations", async () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("169.254.169.254"), true);
  assert.equal(isPrivateAddress("192.168.1.2"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  await assert.rejects(
    downloadImage("http://127.0.0.1/private.png", { wechat: { imageRedirectLimit: 0, imageDownloadTimeoutMs: 1000 } }, 1024),
    (error) => error.code === "IMAGE_URL_BLOCKED",
  );
  const oversizedPixels = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(oversizedPixels);
  oversizedPixels.writeUInt32BE(100000, 16);
  oversizedPixels.writeUInt32BE(100000, 20);
  assert.throws(() => validateImage(oversizedPixels, 1024, { maxPixels: 40_000_000 }), (error) => error.code === "IMAGE_DIMENSIONS_INVALID");
});

test("draft creation is tenant-safe, idempotent, quota-aware, and sanitizes WeChat payloads", async () => {
  const app = await createTestApp({ WECHAT_ENABLED: "true", WECHAT_CREDENTIAL_KEY: key });
  const client = mockWechatClient();
  app.config.wechatClientInstance = client;
  try {
    const first = await verifiedUser(app, "draft-first@example.com");
    const second = await verifiedUser(app, "draft-second@example.com");
    await grant(app, first.user.id);
    await grant(app, second.user.id);
    const firstAccount = await bind(app, first, "1");
    const secondAccount = await bind(app, second, "2");
    assert.equal(firstAccount.response.status, 201);
    assert.equal(secondAccount.response.status, 201);

    const crossTenant = await app.post(
      "/api/wechat/drafts/preview",
      draftBody(firstAccount.payload.id),
      second.jar,
    );
    assert.equal(crossTenant.response.status, 404);

    const preview = await app.post("/api/wechat/drafts/preview", draftBody(firstAccount.payload.id), first.jar);
    assert.equal(preview.response.status, 200);
    assert.doesNotMatch(preview.payload.content, /script|onclick|onerror/i);
    assert.equal(preview.payload.report.images, 1);

    const headers = { "Idempotency-Key": "draft-test-key-00000001" };
    const created = await app.post("/api/wechat/drafts", draftBody(firstAccount.payload.id), first.jar, { headers });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.operation.status, "succeeded");
    const draftCalls = client.calls.filter((item) => item.type === "draft");
    assert.equal(draftCalls.length, 1);
    assert.doesNotMatch(draftCalls[0].article.content, /script|onclick|data:image/i);
    assert.match(draftCalls[0].article.content, /mmbiz\.qpic\.cn/);

    const repeated = await app.post("/api/wechat/drafts", draftBody(firstAccount.payload.id), first.jar, { headers });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.payload.reused, true);
    assert.equal(client.calls.filter((item) => item.type === "draft").length, 1);

    const conflict = await app.post("/api/wechat/drafts", draftBody(firstAccount.payload.id, "不同文章"), first.jar, { headers });
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.payload.error.code, "IDEMPOTENCY_CONFLICT");

    const failed = await app.post(
      "/api/wechat/drafts",
      draftBody(firstAccount.payload.id, "接口失败"),
      first.jar,
      { headers: { "Idempotency-Key": "draft-test-key-00000002" } },
    );
    assert.equal(failed.response.status, 403);
    assert.equal(failed.payload.error.code, "WECHAT_DRAFT_PERMISSION_DENIED");
    assert.doesNotMatch(JSON.stringify(failed.payload), /api unauthorized|token-/);

    const records = await app.json("/api/wechat/draft-records", {}, first.jar);
    assert.equal(records.response.status, 200);
    assert.equal(records.payload.items.length, 2);
  } finally {
    await app.close();
  }
});

test("monthly draft quota blocks additional submissions", async () => {
  const app = await createTestApp({ WECHAT_ENABLED: "true", WECHAT_CREDENTIAL_KEY: key });
  const client = mockWechatClient();
  app.config.wechatClientInstance = client;
  try {
    const user = await verifiedUser(app, "draft-quota@example.com");
    await grant(app, user.user.id, "plan_pro");
    const membership = getMembershipService(app.config);
    await membership.repository.planFeatures.transaction((rows) => {
      const feature = rows.find((row) => row.planId === "plan_pro" && row.featureKey === "wechat.draft.create");
      feature.quotaLimit = 1;
    });
    const account = await bind(app, user, "3");
    const first = await app.post("/api/wechat/drafts", draftBody(account.payload.id), user.jar, {
      headers: { "Idempotency-Key": "quota-test-key-00000001" },
    });
    assert.equal(first.response.status, 201);
    const repeated = await app.post("/api/wechat/drafts", draftBody(account.payload.id), user.jar, {
      headers: { "Idempotency-Key": "quota-test-key-00000001" },
    });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.payload.reused, true);
    const second = await app.post("/api/wechat/drafts", draftBody(account.payload.id, "第二篇"), user.jar, {
      headers: { "Idempotency-Key": "quota-test-key-00000002" },
    });
    assert.equal(second.response.status, 429);
    assert.equal(second.payload.error.code, "QUOTA_EXCEEDED");
  } finally {
    await app.close();
  }
});
