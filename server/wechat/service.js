"use strict";

const { createId } = require("../data/json-collection-repository");
const { logError } = require("../logging");
const { createHttpError } = require("../security");
const { getAuthService } = require("../auth/service");
const { getMembershipService } = require("../membership/service");
const { encryptSecret, decryptSecret } = require("./crypto");
const { toHttpError } = require("./errors");
const { createWechatAccountProvider } = require("./provider");
const { createWechatRepository } = require("./repository");
const { createWechatAccessTokenService } = require("./token-service");
const { parseCreateAccount, parseUpdateAccount } = require("./validation");

const serviceCache = new WeakMap();

function maskAppId(appId) {
  const value = String(appId || "");
  if (value.length <= 8) return `${value.slice(0, 2)}****`;
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function safeAccount(account) {
  return {
    id: account.id,
    userId: account.userId,
    displayName: account.displayName,
    maskedAppId: maskAppId(account.appId),
    authorizationType: account.authorizationType,
    officialAccountType: account.officialAccountType || null,
    verificationType: account.verificationType || null,
    avatarUrl: account.avatarUrl || null,
    originalId: account.originalId || null,
    principalName: account.principalName || null,
    status: account.status,
    permissions: account.permissions || {},
    isDefault: account.isDefault === true,
    lastVerifiedAt: account.lastVerifiedAt || null,
    lastErrorCode: account.lastErrorCode || null,
    lastErrorMessage: account.lastErrorMessage || null,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function createWechatService(config) {
  const repository = createWechatRepository(config);
  const provider = createWechatAccountProvider(config, "direct");
  const tokenService = createWechatAccessTokenService(config, repository);
  const membership = getMembershipService(config);
  const auth = getAuthService(config);

  function ensureEnabled() {
    if (!config.wechat.enabled) {
      throw createHttpError(503, "WECHAT_BINDING_DISABLED", "微信公众号绑定功能尚未启用");
    }
    if (!config.wechat.credentialKey) {
      throw createHttpError(503, "WECHAT_CONFIGURATION_ERROR", "微信公众号绑定功能配置不完整");
    }
  }

  function secretPurpose(accountId) {
    return `wechat-app-secret:${accountId}`;
  }

  async function audit(authContext, action, accountId, metadata = {}, outcome = "success") {
    const requestContext = auth.contextFromRequest(authContext.req);
    try {
      await auth.audit.record({
        actorUserId: authContext.user.id,
        targetUserId: authContext.user.id,
        action,
        outcome,
        ipHash: requestContext.ipHash,
        userAgent: requestContext.userAgent,
        metadata: { accountId: accountId || null, ...metadata },
      });
    } catch (error) {
      logError("wechat-audit", error);
    }
  }

  async function accountLimit(user, currentCount) {
    const bindAccess = await membership.requireFeature(user, "wechat.account.bind");
    let multipleAccess = null;
    if (currentCount >= 1) {
      multipleAccess = await membership.requireFeature(user, "wechat.account.multiple");
    }
    const limits = [config.wechat.accountsHardMax, bindAccess.quotaLimit, multipleAccess?.quotaLimit]
      .filter((value) => Number.isInteger(value));
    return Math.min(...limits);
  }

  async function listAccounts(user) {
    ensureEnabled();
    const rows = await repository.listOwnedAccounts(user.id);
    return rows
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || new Date(left.createdAt) - new Date(right.createdAt))
      .map(safeAccount);
  }

  async function createAccount(body, authContext) {
    ensureEnabled();
    const input = parseCreateAccount(body);
    const existing = await repository.listOwnedAccounts(authContext.user.id);
    const limit = await accountLimit(authContext.user, existing.length);
    if (existing.length >= limit) throw createHttpError(429, "QUOTA_EXCEEDED", "当前套餐的公众号数量已达上限");
    let tokenResult;
    try {
      tokenResult = await provider.verifyCredentials(input);
    } catch (error) {
      const safeError = toHttpError(error);
      await audit(authContext, "wechat.account_bind", null, { errorCode: safeError.code }, "failed");
      throw safeError;
    }

    const accountId = createId("wxacct");
    const now = new Date().toISOString();
    const encryptedAppSecret = encryptSecret(
      input.appSecret,
      config.wechat.credentialKey,
      config.wechat.credentialKeyVersion,
      secretPurpose(accountId),
    );
    const account = await repository.accounts.transaction((rows) => {
      const owned = rows.filter((row) => row.userId === authContext.user.id);
      if (owned.some((row) => row.appId === input.appId)) {
        throw createHttpError(409, "WECHAT_ACCOUNT_EXISTS", "该公众号已绑定到当前账号");
      }
      if (owned.length >= limit) throw createHttpError(429, "QUOTA_EXCEEDED", "当前套餐的公众号数量已达上限");
      const isDefault = input.isDefault || owned.length === 0;
      if (isDefault) {
        for (const row of owned) row.isDefault = false;
      }
      const row = {
        id: accountId,
        userId: authContext.user.id,
        displayName: input.displayName,
        appId: input.appId,
        encryptedAppSecret,
        authorizationType: "direct",
        officialAccountType: null,
        verificationType: null,
        avatarUrl: null,
        originalId: null,
        principalName: null,
        status: "active",
        permissions: { tokenApi: true, draftApi: "unknown" },
        isDefault,
        lastVerifiedAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      return structuredClone(row);
    });
    try {
      await tokenService.storeToken(account, tokenResult);
    } catch (error) {
      await repository.removeOwnedAccount(account.userId, account.id);
      throw error;
    }
    await audit(authContext, "wechat.account_bound", account.id, {
      authorizationType: account.authorizationType,
      appIdSuffix: account.appId.slice(-4),
    });
    return safeAccount(account);
  }

  async function ownedAccount(userId, accountId) {
    const account = await repository.findOwnedAccount(userId, accountId);
    if (!account) throw createHttpError(404, "WECHAT_ACCOUNT_NOT_FOUND", "公众号不存在或无权访问");
    return account;
  }

  async function verifyAccount(accountId, authContext) {
    ensureEnabled();
    const account = await ownedAccount(authContext.user.id, accountId);
    try {
      const appSecret = decryptSecret(
        account.encryptedAppSecret,
        config.wechat.credentialKey,
        secretPurpose(account.id),
      );
      const tokenResult = await provider.verifyCredentials({ appId: account.appId, appSecret });
      await tokenService.storeToken(account, tokenResult);
      const updated = await repository.updateOwnedAccount(account.userId, account.id, {
        status: "active",
        permissions: { ...account.permissions, tokenApi: true },
        lastVerifiedAt: new Date().toISOString(),
        lastErrorCode: null,
        lastErrorMessage: null,
      });
      await audit(authContext, "wechat.account_verified", account.id);
      return safeAccount(updated);
    } catch (error) {
      const safeError = toHttpError(error);
      await repository.updateOwnedAccount(account.userId, account.id, {
        status: "error",
        lastErrorCode: safeError.code,
        lastErrorMessage: safeError.publicMessage || safeError.message,
      });
      await audit(authContext, "wechat.account_verified", account.id, { errorCode: safeError.code }, "failed");
      throw safeError;
    }
  }

  async function updateAccount(accountId, body, authContext) {
    ensureEnabled();
    const input = parseUpdateAccount(body);
    const account = await ownedAccount(authContext.user.id, accountId);
    const patch = {};
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.isDefault === true) patch.isDefault = true;

    let tokenResult = null;
    if (input.appId || input.appSecret) {
      if (input.appId && !input.appSecret) {
        throw createHttpError(422, "APP_SECRET_REQUIRED", "更换 AppID 时必须同时填写 AppSecret");
      }
      const nextAppId = input.appId || account.appId;
      const nextSecret = input.appSecret;
      const duplicate = await repository.accounts.findOne(
        (row) => row.userId === account.userId && row.id !== account.id && row.appId === nextAppId,
      );
      if (duplicate) throw createHttpError(409, "WECHAT_ACCOUNT_EXISTS", "该公众号已绑定到当前账号");
      try {
        tokenResult = await provider.verifyCredentials({ appId: nextAppId, appSecret: nextSecret });
      } catch (error) {
        const safeError = toHttpError(error);
        await audit(authContext, "wechat.account_credentials_updated", account.id, { errorCode: safeError.code }, "failed");
        throw safeError;
      }
      patch.appId = nextAppId;
      patch.encryptedAppSecret = encryptSecret(
        nextSecret,
        config.wechat.credentialKey,
        config.wechat.credentialKeyVersion,
        secretPurpose(account.id),
      );
      patch.status = "active";
      patch.lastVerifiedAt = new Date().toISOString();
      patch.lastErrorCode = null;
      patch.lastErrorMessage = null;
    }

    let updated = await repository.updateOwnedAccount(account.userId, account.id, patch);
    if (input.isDefault === true) updated = await repository.setDefaultAccount(account.userId, account.id);
    if (tokenResult) {
      await repository.removeAccessToken(account.id, account.userId);
      await tokenService.storeToken(updated, tokenResult);
    }
    await audit(authContext, tokenResult ? "wechat.account_credentials_updated" : "wechat.account_updated", account.id, {
      defaultChanged: input.isDefault === true,
      credentialsChanged: Boolean(tokenResult),
    });
    return safeAccount(updated);
  }

  async function deleteAccount(accountId, authContext) {
    ensureEnabled();
    const removed = await repository.removeOwnedAccount(authContext.user.id, accountId);
    if (!removed) throw createHttpError(404, "WECHAT_ACCOUNT_NOT_FOUND", "公众号不存在或无权访问");
    await repository.removeAccessToken(accountId, authContext.user.id);
    await audit(authContext, "wechat.account_unbound", accountId, { historyRetained: true });
  }

  async function getOwnedAccountWithToken(userId, accountId) {
    ensureEnabled();
    const account = await ownedAccount(userId, accountId);
    if (account.status !== "active") throw createHttpError(409, "WECHAT_ACCOUNT_UNAVAILABLE", "公众号当前状态不可用");
    return { account, accessToken: await tokenService.getAccessToken(account) };
  }

  async function listAccountsForAdmin() {
    ensureEnabled();
    return (await repository.accounts.list()).map(safeAccount);
  }

  return {
    createAccount,
    deleteAccount,
    getOwnedAccountWithToken,
    listAccounts,
    listAccountsForAdmin,
    repository,
    safeAccount,
    tokenService,
    updateAccount,
    verifyAccount,
  };
}

function getWechatService(config) {
  if (!serviceCache.has(config)) serviceCache.set(config, createWechatService(config));
  return serviceCache.get(config);
}

module.exports = {
  createWechatService,
  getWechatService,
  maskAppId,
  safeAccount,
};
