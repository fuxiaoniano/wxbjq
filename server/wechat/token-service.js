"use strict";

const { createWechatClient } = require("./client");
const { decryptSecret, encryptSecret } = require("./crypto");
const { isInvalidAccessTokenError } = require("./errors");

function createWechatAccessTokenService(config, repository) {
  const client = createWechatClient(config);
  const refreshes = new Map();

  function tokenPurpose(accountId) {
    return `wechat-access-token:${accountId}`;
  }

  function secretPurpose(accountId) {
    return `wechat-app-secret:${accountId}`;
  }

  async function readCached(account) {
    const row = await repository.accessTokens.findOne(
      (item) => item.accountId === account.id && item.userId === account.userId,
    );
    if (!row || new Date(row.refreshAfter).getTime() <= Date.now()) return null;
    return decryptSecret(row.encryptedAccessToken, config.wechat.credentialKey, tokenPurpose(account.id));
  }

  async function storeToken(account, tokenResult) {
    const now = Date.now();
    const expiresAt = new Date(now + tokenResult.expiresIn * 1000).toISOString();
    const refreshAfter = new Date(
      Math.max(now, now + tokenResult.expiresIn * 1000 - config.wechat.tokenRefreshSkewMs),
    ).toISOString();
    const encryptedAccessToken = encryptSecret(
      tokenResult.accessToken,
      config.wechat.credentialKey,
      config.wechat.credentialKeyVersion,
      tokenPurpose(account.id),
    );
    return repository.accessTokens.transaction((rows) => {
      const timestamp = new Date().toISOString();
      let row = rows.find((item) => item.accountId === account.id && item.userId === account.userId);
      if (!row) {
        row = {
          id: `wxtoken_${account.id}`,
          accountId: account.id,
          userId: account.userId,
          createdAt: timestamp,
        };
        rows.push(row);
      }
      Object.assign(row, {
        encryptedAccessToken,
        expiresAt,
        refreshAfter,
        refreshedAt: timestamp,
        updatedAt: timestamp,
      });
      return structuredClone(row);
    });
  }

  async function refresh(account, forceRefresh) {
    const appSecret = decryptSecret(
      account.encryptedAppSecret,
      config.wechat.credentialKey,
      secretPurpose(account.id),
    );
    const tokenResult = await client.getStableAccessToken({
      appId: account.appId,
      appSecret,
      forceRefresh: forceRefresh === true,
    });
    await storeToken(account, tokenResult);
    return tokenResult.accessToken;
  }

  async function getAccessToken(account, options = {}) {
    if (!options.forceRefresh) {
      const cached = await readCached(account);
      if (cached) return cached;
    }
    const existing = refreshes.get(account.id);
    if (existing) return existing;
    const promise = (async () => {
      if (!options.forceRefresh) {
        const cached = await readCached(account);
        if (cached) return cached;
      }
      return refresh(account, options.forceRefresh === true);
    })();
    refreshes.set(account.id, promise);
    try {
      return await promise;
    } finally {
      if (refreshes.get(account.id) === promise) refreshes.delete(account.id);
    }
  }

  async function withAccessToken(account, operation) {
    const token = await getAccessToken(account);
    try {
      return await operation(token);
    } catch (error) {
      if (!isInvalidAccessTokenError(error)) throw error;
      await repository.removeAccessToken(account.id, account.userId);
      const refreshed = await getAccessToken(account, { forceRefresh: true });
      return operation(refreshed);
    }
  }

  return { getAccessToken, readCached, storeToken, withAccessToken };
}

module.exports = {
  createWechatAccessTokenService,
};
