"use strict";

const { createJsonCollectionRepository } = require("../data/json-collection-repository");

const SENSITIVE_KEY = /password|secret|token|cookie|authorization|credential/i;

function sanitizeMetadata(value, depth = 0) {
  if (depth > 3) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (["string", "number", "boolean"].includes(typeof value)) {
    return typeof value === "string" ? value.slice(0, 500) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
  if (typeof value === "object") {
    const clean = {};
    for (const [key, item] of Object.entries(value).slice(0, 30)) {
      clean[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeMetadata(item, depth + 1);
    }
    return clean;
  }
  return String(value).slice(0, 100);
}

function createAuditService(config) {
  const repository = createJsonCollectionRepository(config.authFiles.auditLogs, { idPrefix: "aud" });

  async function record(entry) {
    const created = await repository.insert({
      actorUserId: entry.actorUserId || null,
      targetUserId: entry.targetUserId || null,
      action: String(entry.action || "unknown").slice(0, 100),
      outcome: entry.outcome || "success",
      ipHash: entry.ipHash || null,
      userAgent: String(entry.userAgent || "").slice(0, 240),
      metadata: sanitizeMetadata(entry.metadata || {}),
    });
    await repository.transaction((rows) => {
      if (rows.length <= 50_000) return;
      rows.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
      rows.splice(0, rows.length - 50_000);
    });
    return created;
  }

  async function list(options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
    const rows = await repository.list((row) => {
      if (options.action && row.action !== options.action) return false;
      if (options.userId && row.actorUserId !== options.userId && row.targetUserId !== options.userId) return false;
      return true;
    });
    return rows.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, limit);
  }

  return { list, record };
}

module.exports = {
  createAuditService,
  sanitizeMetadata,
};
