"use strict";

const crypto = require("node:crypto");
const { createId } = require("../data/json-collection-repository");
const { createHttpError, HttpError } = require("../security");
const { getAuthService } = require("../auth/service");
const { getMembershipService } = require("../membership/service");
const { convertWechatContent } = require("./content-converter");
const { createWechatClient } = require("./client");
const { WechatApiError, toHttpError } = require("./errors");
const { createWechatImageService } = require("./image-service");
const { createWechatRepository } = require("./repository");
const { getWechatService } = require("./service");
const { parseDraftInput } = require("./draft-validation");

const serviceCache = new WeakMap();

function stableHash(input) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function safeOperation(row) {
  return {
    id: row.id,
    accountId: row.accountId,
    status: row.status,
    title: row.title,
    mediaId: row.mediaId || null,
    errorCode: row.errorCode || null,
    errorMessage: row.errorMessage || null,
    report: row.report || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt || null,
  };
}

function createWechatDraftService(config) {
  const repository = createWechatRepository(config);
  const client = createWechatClient(config);
  const wechat = getWechatService(config);
  const membership = getMembershipService(config);
  const auth = getAuthService(config);
  const images = createWechatImageService(config, repository, client, wechat.tokenService);

  async function audit(authContext, action, operationId, accountId, metadata = {}, outcome = "success") {
    const context = auth.contextFromRequest(authContext.req);
    await auth.audit.record({
      actorUserId: authContext.user.id,
      targetUserId: authContext.user.id,
      action,
      outcome,
      ipHash: context.ipHash,
      userAgent: context.userAgent,
      metadata: { operationId, accountId, ...metadata },
    });
  }

  async function ownedActiveAccount(userId, accountId) {
    const account = await repository.findOwnedAccount(userId, accountId);
    if (!account) throw createHttpError(404, "WECHAT_ACCOUNT_NOT_FOUND", "公众号不存在或无权访问");
    if (account.status !== "active") throw createHttpError(409, "WECHAT_ACCOUNT_UNAVAILABLE", "公众号当前状态不可用");
    return account;
  }

  async function preview(body, authContext) {
    await membership.requireFeature(authContext.user, "wechat.draft.create");
    const input = parseDraftInput(body, config);
    await ownedActiveAccount(authContext.user.id, input.accountId);
    const converted = await convertWechatContent(input.content, {
      maxBytes: config.wechat.draftHtmlMaxBytes,
      maxCharacters: config.wechat.draftTextMaxCharacters,
    });
    return {
      title: input.title,
      content: converted.content,
      report: converted.report,
      checks: {
        title: true,
        content: true,
        cover: Boolean(input.coverMediaId || input.coverImage),
        images: converted.report.images,
      },
    };
  }

  async function beginOperation(userId, input, idempotencyKey) {
    const requestHash = stableHash(input);
    return repository.draftOperations.transaction((rows) => {
      const existing = rows.find((row) => row.userId === userId && row.idempotencyKey === idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw createHttpError(409, "IDEMPOTENCY_CONFLICT", "同一提交标识不能用于不同文章");
        }
        return { operation: structuredClone(existing), reused: true };
      }
      const now = new Date().toISOString();
      const operation = {
        id: createId("wxop"),
        userId,
        accountId: input.accountId,
        idempotencyKey,
        requestHash,
        articleVersion: input.articleVersion,
        title: input.title,
        status: "processing",
        createdAt: now,
        updatedAt: now,
      };
      rows.push(operation);
      return { operation: structuredClone(operation), reused: false };
    });
  }

  async function updateOperation(operationId, userId, patch) {
    return repository.draftOperations.transaction((rows) => {
      const row = rows.find((item) => item.id === operationId && item.userId === userId);
      if (!row) return null;
      Object.assign(row, patch, { updatedAt: new Date().toISOString() });
      return structuredClone(row);
    });
  }

  async function createDraft(body, idempotencyKey, authContext) {
    const input = parseDraftInput(body, config);
    const requestHash = stableHash(input);
    const existing = await repository.draftOperations.findOne(
      (row) => row.userId === authContext.user.id && row.idempotencyKey === idempotencyKey,
    );
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw createHttpError(409, "IDEMPOTENCY_CONFLICT", "同一提交标识不能用于不同文章");
      }
      return { operation: safeOperation(existing), reused: true };
    }
    await membership.requireFeature(authContext.user, "wechat.draft.create");
    const started = await beginOperation(authContext.user.id, input, idempotencyKey);
    if (started.reused) return { operation: safeOperation(started.operation), reused: true };
    const operation = started.operation;
    let quotaConsumed = false;
    try {
      const account = await ownedActiveAccount(authContext.user.id, input.accountId);
      const converted = await convertWechatContent(input.content, {
        maxBytes: config.wechat.draftHtmlMaxBytes,
        maxCharacters: config.wechat.draftTextMaxCharacters,
        uploadImage: (source) => images.uploadContentImage(account, source),
      });
      const coverMediaId = input.coverMediaId || await images.uploadCover(account, input.coverImage);
      const article = {
        article_type: "news",
        title: input.title,
        author: input.author,
        digest: input.digest,
        content: converted.content,
        content_source_url: input.contentSourceUrl,
        thumb_media_id: coverMediaId,
        need_open_comment: input.needOpenComment,
        only_fans_can_comment: input.onlyFansCanComment,
      };
      await membership.consumeFeatureUsage(authContext.user, "wechat.draft.create", 1);
      quotaConsumed = true;
      const result = await wechat.tokenService.withAccessToken(account, (accessToken) => client.createDraft(accessToken, article));
      const completedAt = new Date().toISOString();
      const updated = await updateOperation(operation.id, authContext.user.id, {
        status: "succeeded",
        mediaId: result.mediaId,
        report: converted.report,
        completedAt,
      });
      await repository.draftRecords.insert({
        userId: authContext.user.id,
        accountId: account.id,
        operationId: operation.id,
        title: input.title,
        mediaId: result.mediaId,
        articleVersion: input.articleVersion,
        status: "succeeded",
      });
      await repository.updateOwnedAccount(account.userId, account.id, {
        permissions: { ...account.permissions, draftApi: true },
      });
      await audit(authContext, "wechat.draft_created", operation.id, account.id, { mediaIdSuffix: result.mediaId.slice(-8) });
      return { operation: safeOperation(updated), reused: false };
    } catch (error) {
      if (quotaConsumed) await membership.refundFeatureUsage(authContext.user, "wechat.draft.create", 1).catch(() => {});
      const safeError = error instanceof HttpError ? error : toHttpError(error);
      const completedAt = new Date().toISOString();
      const failed = await updateOperation(operation.id, authContext.user.id, {
        status: "failed",
        errorCode: safeError.code || "WECHAT_DRAFT_CREATE_FAILED",
        errorMessage: safeError.publicMessage || safeError.message || "保存到微信草稿箱失败",
        completedAt,
      });
      await repository.draftRecords.insert({
        userId: authContext.user.id,
        accountId: input.accountId,
        operationId: operation.id,
        title: input.title,
        status: "failed",
        errorCode: failed.errorCode,
      });
      if (error instanceof WechatApiError && error.code === "WECHAT_DRAFT_PERMISSION_DENIED") {
        const account = await repository.findOwnedAccount(authContext.user.id, input.accountId);
        if (account) await repository.updateOwnedAccount(account.userId, account.id, { permissions: { ...account.permissions, draftApi: false } });
      }
      await audit(authContext, "wechat.draft_create_failed", operation.id, input.accountId, { errorCode: failed.errorCode }, "failed");
      throw safeError;
    }
  }

  async function getOperation(userId, operationId) {
    const row = await repository.draftOperations.findOne((item) => item.id === operationId && item.userId === userId);
    if (!row) throw createHttpError(404, "WECHAT_DRAFT_OPERATION_NOT_FOUND", "草稿操作记录不存在");
    return safeOperation(row);
  }

  async function listRecords(userId, limit = 50) {
    const rows = await repository.draftRecords.list((item) => item.userId === userId);
    return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200));
  }

  return { createDraft, getOperation, listRecords, preview, repository };
}

function getWechatDraftService(config) {
  if (!serviceCache.has(config)) serviceCache.set(config, createWechatDraftService(config));
  return serviceCache.get(config);
}

module.exports = { createWechatDraftService, getWechatDraftService, safeOperation, stableHash };
