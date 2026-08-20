"use strict";

const fs = require("fs");
const path = require("path");
const { createDraft, normalizeDraft, summarizeDraft } = require("./drafts");
const { normalizeTemplate } = require("./templates");
const { getSettings, normalizeSettings, updateSettings } = require("./settings");
const {
  createFullBackup,
  createStorageId,
  listJsonFiles,
  readJsonFile,
  safeJsonFile,
  writeJsonAtomic,
} = require("./storage");
const { createHttpError } = require("./security");

async function exportBackup(config) {
  const drafts = [];
  for (const file of await listJsonFiles(config.draftsDir)) {
    try {
      drafts.push(await readJsonFile(path.join(config.draftsDir, file), null));
    } catch (error) {
      console.error(`[backup] skipped draft ${file}`);
    }
  }
  const templates = await readJsonFile(config.systemTemplatesFile, []);
  const settings = await getSettings(config);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    drafts,
    templates: Array.isArray(templates) ? templates : [],
    settings,
  };
}

function validateBackupPayload(payload) {
  const backup = payload?.backup || payload;
  if (!backup || typeof backup !== "object") {
    throw createHttpError(400, "INVALID_BACKUP", "备份文件格式不正确");
  }
  if (backup.version !== 1) {
    throw createHttpError(400, "UNSUPPORTED_BACKUP_VERSION", "备份版本不受支持");
  }
  if (!Array.isArray(backup.drafts) || !Array.isArray(backup.templates)) {
    throw createHttpError(400, "INVALID_BACKUP", "备份文件字段不完整");
  }
  return backup;
}

async function listDraftIds(config) {
  return (await listJsonFiles(config.draftsDir)).map((file) => path.basename(file, ".json"));
}

function createUniqueId(preferredId, usedIds, prefix) {
  const normalized = String(preferredId || "").replace(/[^\w-]/g, "");
  if (normalized && !usedIds.has(normalized)) {
    usedIds.add(normalized);
    return { id: normalized, changed: false };
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = createStorageId(prefix);
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return { id, changed: true };
    }
  }

  throw createHttpError(409, "IMPORT_ID_CONFLICT", "导入数据 ID 冲突过多");
}

function uniquifyImportedItems(items, usedIds, prefix) {
  let renamed = 0;
  const next = items.map((item) => {
    const unique = createUniqueId(item.id, usedIds, prefix);
    if (!unique.changed) return item;
    renamed += 1;
    return { ...item, id: unique.id };
  });
  return { items: next, renamed };
}

async function importBackup(config, payload) {
  const backup = validateBackupPayload(payload);
  const mode = payload?.mode === "overwrite" ? "overwrite" : "merge";
  const normalizedDrafts = backup.drafts.map((draft) => normalizeDraft(draft, config, draft, { keepUpdatedAt: true }));
  const normalizedTemplates = backup.templates.map((template) => normalizeTemplate(template, config, template));
  const settings = normalizeSettings(backup.settings || {});
  const existingDraftIds = mode === "merge" ? await listDraftIds(config) : [];
  const existingTemplates = mode === "merge" ? await readJsonFile(config.systemTemplatesFile, []) : [];
  const existingTemplateList = Array.isArray(existingTemplates) ? existingTemplates : [];

  if (normalizedDrafts.length > config.maxDrafts) {
    throw createHttpError(409, "DRAFT_LIMIT_EXCEEDED", "导入草稿数量超过限制");
  }
  if (normalizedTemplates.length > config.maxTemplates) {
    throw createHttpError(409, "TEMPLATE_LIMIT_EXCEEDED", "导入模板数量超过限制");
  }
  if (mode === "merge" && existingDraftIds.length + normalizedDrafts.length > config.maxDrafts) {
    throw createHttpError(409, "DRAFT_LIMIT_EXCEEDED", "合并后的草稿数量超过限制");
  }
  if (mode === "merge" && existingTemplateList.length + normalizedTemplates.length > config.maxTemplates) {
    throw createHttpError(409, "TEMPLATE_LIMIT_EXCEEDED", "合并后的模板数量超过限制");
  }

  const draftIds = new Set(existingDraftIds);
  const templateIds = new Set(existingTemplateList.map((item) => item?.id).filter(Boolean));
  const uniqueDrafts = uniquifyImportedItems(normalizedDrafts, draftIds, "draft");
  const uniqueTemplates = uniquifyImportedItems(normalizedTemplates, templateIds, "template");

  await createFullBackup(config, `before-import-${mode}`);

  let importedDrafts = 0;
  let importedTemplates = 0;

  if (mode === "overwrite") {
    for (const file of await listJsonFiles(config.draftsDir)) {
      const id = path.basename(file, ".json");
      const filePath = safeJsonFile(config.draftsDir, id);
      if (filePath) {
        await fs.promises.unlink(filePath);
      }
    }
  }

  for (const draft of uniqueDrafts.items) {
    const filePath = safeJsonFile(config.draftsDir, draft.id);
    if (!filePath) continue;
    await writeJsonAtomic(filePath, draft);
    importedDrafts += 1;
  }

  if (mode === "overwrite") {
    await writeJsonAtomic(config.systemTemplatesFile, uniqueTemplates.items);
    importedTemplates = uniqueTemplates.items.length;
  } else {
    const merged = [...existingTemplateList, ...uniqueTemplates.items];
    await writeJsonAtomic(config.systemTemplatesFile, merged);
    importedTemplates = uniqueTemplates.items.length;
  }

  await updateSettings(config, settings);

  return {
    mode,
    importedDrafts,
    importedTemplates,
    renamedDrafts: uniqueDrafts.renamed,
    renamedTemplates: uniqueTemplates.renamed,
    settingsImported: true,
    draftSummaries: uniqueDrafts.items.map(summarizeDraft),
  };
}

module.exports = {
  exportBackup,
  importBackup,
  validateBackupPayload,
};
