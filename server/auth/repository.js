"use strict";

const { createId, createJsonCollectionRepository } = require("../data/json-collection-repository");

function createAuthRepository(config) {
  const users = createJsonCollectionRepository(config.authFiles.users, { idPrefix: "usr" });
  const emailTokens = createJsonCollectionRepository(config.authFiles.emailVerificationTokens, {
    idPrefix: "evt",
  });
  const resetTokens = createJsonCollectionRepository(config.authFiles.passwordResetTokens, {
    idPrefix: "prt",
  });
  const sessions = createJsonCollectionRepository(config.authFiles.sessions, { idPrefix: "ses" });

  async function createUser(record) {
    return users.transaction((rows) => {
      if (rows.some((row) => row.normalizedEmail === record.normalizedEmail)) return null;
      const now = new Date().toISOString();
      const user = {
        ...record,
        id: createId("usr"),
        createdAt: now,
        updatedAt: now,
      };
      rows.push(user);
      return structuredClone(user);
    });
  }

  async function findUserByEmail(normalizedEmail) {
    return users.findOne((row) => row.normalizedEmail === normalizedEmail);
  }

  async function replaceEmailVerificationToken(record) {
    return emailTokens.transaction((rows) => {
      const now = new Date().toISOString();
      removeOldTokens(rows);
      for (const row of rows) {
        if (row.userId === record.userId && !row.usedAt && !row.invalidatedAt) {
          row.invalidatedAt = now;
          row.updatedAt = now;
        }
      }
      const token = {
        ...record,
        id: createId("evt"),
        createdAt: now,
        updatedAt: now,
      };
      rows.push(token);
      return structuredClone(token);
    });
  }

  async function replacePasswordResetToken(record) {
    return resetTokens.transaction((rows) => {
      const now = new Date().toISOString();
      removeOldTokens(rows);
      for (const row of rows) {
        if (row.userId === record.userId && !row.usedAt && !row.invalidatedAt) {
          row.invalidatedAt = now;
          row.updatedAt = now;
        }
      }
      const token = {
        ...record,
        id: createId("prt"),
        createdAt: now,
        updatedAt: now,
      };
      rows.push(token);
      return structuredClone(token);
    });
  }

  async function consumeToken(collection, tokenHash) {
    return collection.transaction((rows) => {
      const row = rows.find((item) => item.tokenHash === tokenHash);
      if (!row) return { state: "invalid", record: null };
      if (row.usedAt) return { state: "used", record: structuredClone(row) };
      if (row.invalidatedAt) return { state: "invalid", record: structuredClone(row) };
      if (new Date(row.expiresAt).getTime() <= Date.now()) {
        return { state: "expired", record: structuredClone(row) };
      }
      row.usedAt = new Date().toISOString();
      row.updatedAt = row.usedAt;
      return { state: "valid", record: structuredClone(row) };
    });
  }

  async function consumeEmailVerificationToken(tokenHash) {
    return consumeToken(emailTokens, tokenHash);
  }

  async function consumePasswordResetToken(tokenHash) {
    return consumeToken(resetTokens, tokenHash);
  }

  async function createSession(record) {
    return sessions.transaction((rows) => {
      const now = Date.now();
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (new Date(rows[index].expiresAt).getTime() <= now || rows[index].revokedAt) rows.splice(index, 1);
      }
      const userSessions = rows
        .filter((row) => row.userId === record.userId)
        .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
      while (userSessions.length >= 10) {
        const oldest = userSessions.shift();
        const index = rows.findIndex((row) => row.id === oldest.id);
        if (index >= 0) rows.splice(index, 1);
      }
      const timestamp = new Date().toISOString();
      const session = {
        ...record,
        id: createId("ses"),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      rows.push(session);
      return structuredClone(session);
    });
  }

  async function findSessionByTokenHash(tokenHash) {
    return sessions.findOne((row) => row.tokenHash === tokenHash);
  }

  async function revokeSession(id, userId, reason = "user_revoked") {
    return sessions.transaction((rows) => {
      const row = rows.find((item) => item.id === id && item.userId === userId);
      if (!row || row.revokedAt) return null;
      row.revokedAt = new Date().toISOString();
      row.revokeReason = reason;
      row.updatedAt = row.revokedAt;
      return structuredClone(row);
    });
  }

  async function revokeAllUserSessions(userId, options = {}) {
    return sessions.transaction((rows) => {
      const now = new Date().toISOString();
      let count = 0;
      for (const row of rows) {
        if (row.userId !== userId || row.revokedAt || row.id === options.exceptSessionId) continue;
        row.revokedAt = now;
        row.revokeReason = options.reason || "security_event";
        row.updatedAt = now;
        count += 1;
      }
      return count;
    });
  }

  async function listUserSessions(userId) {
    const now = Date.now();
    return sessions.list(
      (row) => row.userId === userId && !row.revokedAt && new Date(row.expiresAt).getTime() > now,
    );
  }

  return {
    consumeEmailVerificationToken,
    consumePasswordResetToken,
    createSession,
    createUser,
    emailTokens,
    findSessionByTokenHash,
    findUserByEmail,
    listUserSessions,
    replaceEmailVerificationToken,
    replacePasswordResetToken,
    resetTokens,
    revokeAllUserSessions,
    revokeSession,
    sessions,
    users,
  };
}

function removeOldTokens(rows) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (new Date(row.expiresAt).getTime() < cutoff && (row.usedAt || row.invalidatedAt)) rows.splice(index, 1);
  }
}

module.exports = {
  createAuthRepository,
};
