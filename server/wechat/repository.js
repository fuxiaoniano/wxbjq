"use strict";

const { createJsonCollectionRepository } = require("../data/json-collection-repository");

function createWechatRepository(config) {
  const accounts = createJsonCollectionRepository(config.wechatFiles.accounts, { idPrefix: "wxacct" });
  const authorizations = createJsonCollectionRepository(config.wechatFiles.authorizations, { idPrefix: "wxauth" });
  const accessTokens = createJsonCollectionRepository(config.wechatFiles.accessTokens, { idPrefix: "wxtoken" });
  const draftOperations = createJsonCollectionRepository(config.wechatFiles.draftOperations, { idPrefix: "wxop" });
  const draftRecords = createJsonCollectionRepository(config.wechatFiles.draftRecords, { idPrefix: "wxdr" });
  const imageCache = createJsonCollectionRepository(config.wechatFiles.imageCache, { idPrefix: "wximg" });

  async function listOwnedAccounts(userId) {
    return accounts.list((row) => row.userId === userId);
  }

  async function findOwnedAccount(userId, accountId) {
    return accounts.findOne((row) => row.id === accountId && row.userId === userId);
  }

  async function updateOwnedAccount(userId, accountId, patch) {
    return accounts.transaction(async (rows) => {
      const index = rows.findIndex((row) => row.id === accountId && row.userId === userId);
      if (index < 0) return null;
      const nextPatch = typeof patch === "function" ? await patch(structuredClone(rows[index]), rows) : patch;
      rows[index] = {
        ...rows[index],
        ...structuredClone(nextPatch),
        id: rows[index].id,
        userId: rows[index].userId,
        updatedAt: new Date().toISOString(),
      };
      return structuredClone(rows[index]);
    });
  }

  async function removeOwnedAccount(userId, accountId) {
    return accounts.transaction((rows) => {
      const index = rows.findIndex((row) => row.id === accountId && row.userId === userId);
      if (index < 0) return null;
      const removed = rows.splice(index, 1)[0];
      if (removed.isDefault) {
        const replacement = rows.find((row) => row.userId === userId && row.status !== "unbound");
        if (replacement) {
          replacement.isDefault = true;
          replacement.updatedAt = new Date().toISOString();
        }
      }
      return structuredClone(removed);
    });
  }

  async function setDefaultAccount(userId, accountId) {
    return accounts.transaction((rows) => {
      const target = rows.find((row) => row.id === accountId && row.userId === userId);
      if (!target) return null;
      const now = new Date().toISOString();
      for (const row of rows) {
        if (row.userId === userId && row.isDefault !== (row.id === accountId)) {
          row.isDefault = row.id === accountId;
          row.updatedAt = now;
        }
      }
      return structuredClone(target);
    });
  }

  async function removeAccessToken(accountId, userId) {
    return accessTokens.transaction((rows) => {
      const index = rows.findIndex((row) => row.accountId === accountId && row.userId === userId);
      if (index < 0) return null;
      return structuredClone(rows.splice(index, 1)[0]);
    });
  }

  return {
    accessTokens,
    accounts,
    authorizations,
    draftOperations,
    draftRecords,
    findOwnedAccount,
    imageCache,
    listOwnedAccounts,
    removeAccessToken,
    removeOwnedAccount,
    setDefaultAccount,
    updateOwnedAccount,
  };
}

module.exports = {
  createWechatRepository,
};
