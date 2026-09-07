"use strict";

const fs = require("fs");
const path = require("path");
const { sanitizeStoredHtml, stripHtml, isHtmlEffectivelyEmpty } = require("./sanitizer");
const {
  createStorageId,
  fileExists,
  isSafeId,
  listJsonFiles,
  readJsonFile,
  safeJsonFile,
  withJsonFileLock,
  writeJsonAtomic,
} = require("./storage");
const { createHttpError } = require("./security");

function byteLength(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function countWords(html) {
  return stripHtml(html).replace(/\s+/g, "").length;
}

function createDraftTitle(html) {
  const text = stripHtml(html).replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 28);
  return `未命名草稿 ${new Date().toLocaleString("zh-CN")}`;
}

function normalizeDraft(input, config, existing = null, options = {}) {
  const now = new Date().toISOString();
  const rawHtml = String(input?.html || "");
  if (byteLength(rawHtml) > config.maxDraftHtmlBytes) {
    throw createHttpError(413, "DRAFT_HTML_TOO_LARGE", "草稿 HTML 超出大小限制");
  }
  const html = sanitizeStoredHtml(rawHtml);
  if (isHtmlEffectivelyEmpty(html)) {
    throw createHttpError(400, "EMPTY_DRAFT", "正文为空");
  }

  const id = String(input?.id || existing?.id || createStorageId("draft")).replace(/[^\w-]/g, "");
  if (!isSafeId(id)) {
    throw createHttpError(400, "INVALID_DRAFT_ID", "草稿 ID 不正确");
  }

  const createdAt = existing?.createdAt || input?.createdAt || input?.savedAt || now;
  const updatedAt = options.keepUpdatedAt ? input?.updatedAt || input?.savedAt || now : now;
  const title = String(input?.title || existing?.title || createDraftTitle(html)).trim().slice(0, 80);
  const merged = {
    ...(existing && typeof existing === "object" ? existing : {}),
    ...(input && typeof input === "object" ? input : {}),
    id,
    title: title || "未命名草稿",
    html,
    createdAt,
    updatedAt,
    savedAt: updatedAt,
    wordCount: countWords(html),
    bytes: byteLength(html),
    schemaVersion: 1,
  };
  return merged;
}

function needsMigration(draft) {
  return (
    !draft ||
    draft.schemaVersion !== 1 ||
    !draft.createdAt ||
    !draft.updatedAt ||
    typeof draft.wordCount !== "number" ||
    typeof draft.bytes !== "number"
  );
}

function summarizeDraft(draft) {
  return {
    id: draft.id,
    title: draft.title || "未命名草稿",
    createdAt: draft.createdAt || draft.savedAt || "",
    updatedAt: draft.updatedAt || draft.savedAt || "",
    savedAt: draft.savedAt || draft.updatedAt || "",
    wordCount: Number(draft.wordCount || 0),
    bytes: Number(draft.bytes || 0),
  };
}

async function countDrafts(config) {
  return (await listJsonFiles(config.draftsDir)).length;
}

function withDraftCollectionLock(config, callback) {
  return withJsonFileLock(path.join(config.draftsDir, ".drafts.lock"), callback);
}

async function readDraftByIdUnlocked(config, id, migrate = true) {
  const filePath = safeJsonFile(config.draftsDir, id);
  if (!filePath) throw createHttpError(400, "INVALID_DRAFT_ID", "草稿 ID 不正确");
  if (!(await fileExists(filePath))) throw createHttpError(404, "DRAFT_NOT_FOUND", "草稿不存在");
  const raw = await readJsonFile(filePath, null);
  let draft;
  try {
    draft = normalizeDraft(raw, config, raw, { keepUpdatedAt: true });
  } catch (error) {
    if (error.statusCode) throw error;
    throw createHttpError(500, "DRAFT_READ_FAILED", "草稿读取失败");
  }
  if (migrate && needsMigration(raw)) {
    draft.migratedAt = draft.migratedAt || new Date().toISOString();
    await writeJsonAtomic(filePath, draft);
  }
  return draft;
}

async function readDraftById(config, id, migrate = true) {
  if (!migrate) return readDraftByIdUnlocked(config, id, false);
  return withDraftCollectionLock(config, () => readDraftByIdUnlocked(config, id, true));
}

async function listDrafts(config, query = {}) {
  const page = Math.max(Number.parseInt(query.page || "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize || "20", 10) || 20, 1), 100);
  const drafts = await withDraftCollectionLock(config, async () => {
    const files = await listJsonFiles(config.draftsDir);
    const rows = [];
    for (const file of files) {
      const id = path.basename(file, ".json");
      try {
        rows.push(summarizeDraft(await readDraftByIdUnlocked(config, id)));
      } catch (error) {
        console.error(`[drafts] skipped ${file}: ${error.code || "ERR"}`);
      }
    }
    return rows;
  });
  drafts.sort((a, b) => new Date(b.updatedAt || b.savedAt) - new Date(a.updatedAt || a.savedAt));
  const start = (page - 1) * pageSize;
  return {
    items: drafts.slice(start, start + pageSize),
    page,
    pageSize,
    total: drafts.length,
  };
}

async function createDraft(config, body) {
  return withDraftCollectionLock(config, async () => {
    if ((await countDrafts(config)) >= config.maxDrafts) {
      throw createHttpError(409, "DRAFT_LIMIT_EXCEEDED", "服务器草稿数量已达上限");
    }
    const draft = normalizeDraft(body, config, null);
    const filePath = safeJsonFile(config.draftsDir, draft.id);
    if (!filePath) throw createHttpError(400, "INVALID_DRAFT_ID", "草稿 ID 不正确");
    if (await fileExists(filePath)) {
      throw createHttpError(409, "DRAFT_EXISTS", "草稿 ID 已存在");
    }
    await writeJsonAtomic(filePath, draft);
    return summarizeDraft(draft);
  });
}

async function updateDraft(config, id, body) {
  return withDraftCollectionLock(config, async () => {
    const filePath = safeJsonFile(config.draftsDir, id);
    if (!filePath) throw createHttpError(400, "INVALID_DRAFT_ID", "草稿 ID 不正确");
    const existing = (await fileExists(filePath)) ? await readDraftByIdUnlocked(config, id) : null;
    if (!existing && (await countDrafts(config)) >= config.maxDrafts) {
      throw createHttpError(409, "DRAFT_LIMIT_EXCEEDED", "服务器草稿数量已达上限");
    }
    const draft = normalizeDraft({ ...body, id }, config, existing);
    await writeJsonAtomic(filePath, draft);
    return summarizeDraft(draft);
  });
}

async function deleteDraft(config, id) {
  await withDraftCollectionLock(config, async () => {
    const filePath = safeJsonFile(config.draftsDir, id);
    if (!filePath) throw createHttpError(400, "INVALID_DRAFT_ID", "草稿 ID 不正确");
    try {
      await fs.promises.copyFile(filePath, `${filePath}.bak`);
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw createHttpError(500, "DRAFT_DELETE_FAILED", "草稿删除失败");
    }
  });
}

module.exports = {
  createDraft,
  listDrafts,
  normalizeDraft,
  readDraftById,
  summarizeDraft,
  updateDraft,
  deleteDraft,
};
