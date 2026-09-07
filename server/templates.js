"use strict";

const { sanitizeStoredHtml, isHtmlEffectivelyEmpty } = require("./sanitizer");
const { createStorageId, isSafeId, readJsonFile, withJsonFileLock, writeJsonAtomic } = require("./storage");
const { createHttpError } = require("./security");

function byteLength(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function normalizeTemplate(input, config, existing = null, options = {}) {
  const rawHtml = String(input?.html || "");
  if (byteLength(rawHtml) > config.maxTemplateHtmlBytes) {
    throw createHttpError(413, "TEMPLATE_HTML_TOO_LARGE", "模板 HTML 超出大小限制");
  }
  const result = sanitizeStoredHtml(rawHtml, { returnReport: true });
  const html = result.html;
  if (isHtmlEffectivelyEmpty(html)) {
    throw createHttpError(400, "EMPTY_TEMPLATE", "清洗后模板为空");
  }

  const id = String(input?.id || existing?.id || createStorageId("template")).replace(/[^\w-]/g, "");
  if (!isSafeId(id)) throw createHttpError(400, "INVALID_TEMPLATE_ID", "模板 ID 不正确");
  const now = new Date().toISOString();
  return {
    ...(existing && typeof existing === "object" ? existing : {}),
    ...(input && typeof input === "object" ? input : {}),
    id,
    name: String(input?.name || existing?.name || "未命名模板").trim().slice(0, 80) || "未命名模板",
    category: String(input?.category || existing?.category || "自定义模板").trim().slice(0, 80) || "自定义模板",
    html,
    createdAt: existing?.createdAt || input?.createdAt || now,
    updatedAt: options.keepUpdatedAt ? input?.updatedAt || existing?.updatedAt || now : now,
    bytes: byteLength(html),
    schemaVersion: 1,
    cleanReport: result.report,
  };
}

async function readTemplatesUnlocked(config) {
  const raw = await readJsonFile(config.systemTemplatesFile, []);
  if (!Array.isArray(raw)) return [];
  const templates = [];
  let changed = false;
  for (const item of raw) {
    try {
      const template = normalizeTemplate(item, config, item, { keepUpdatedAt: true });
      templates.push(template);
      if (template.html !== item.html || item.schemaVersion !== 1) changed = true;
    } catch (error) {
      console.error(`[templates] skipped invalid template: ${error.code || "ERR"}`);
      changed = true;
    }
  }
  if (changed) await writeJsonAtomic(config.systemTemplatesFile, templates);
  return templates;
}

async function readTemplates(config) {
  return withJsonFileLock(config.systemTemplatesFile, () => readTemplatesUnlocked(config));
}

async function writeTemplates(config, templates) {
  await writeJsonAtomic(config.systemTemplatesFile, templates);
}

async function listTemplates(config) {
  return readTemplates(config);
}

async function createTemplate(config, body) {
  return withJsonFileLock(config.systemTemplatesFile, async () => {
    const templates = await readTemplatesUnlocked(config);
    if (templates.length >= config.maxTemplates) {
      throw createHttpError(409, "TEMPLATE_LIMIT_EXCEEDED", "自定义模板数量已达上限");
    }
    const template = normalizeTemplate(body, config, null);
    if (templates.some((item) => item.id === template.id)) {
      throw createHttpError(409, "TEMPLATE_EXISTS", "模板 ID 已存在");
    }
    templates.push(template);
    await writeTemplates(config, templates);
    return template;
  });
}

async function replaceTemplateCollection(config, body) {
  const source = Array.isArray(body?.templates) ? body.templates : Array.isArray(body) ? body : [];
  if (source.length > config.maxTemplates) {
    throw createHttpError(409, "TEMPLATE_LIMIT_EXCEEDED", "自定义模板数量已达上限");
  }
  const templates = source.map((item) => normalizeTemplate(item, config, item));
  const ids = new Set();
  for (const template of templates) {
    if (ids.has(template.id)) {
      throw createHttpError(409, "TEMPLATE_ID_DUPLICATED", "模板 ID 重复");
    }
    ids.add(template.id);
  }
  return withJsonFileLock(config.systemTemplatesFile, async () => {
    await writeTemplates(config, templates);
    return templates;
  });
}

async function updateTemplate(config, id, body) {
  if (!isSafeId(id)) throw createHttpError(400, "INVALID_TEMPLATE_ID", "模板 ID 不正确");
  return withJsonFileLock(config.systemTemplatesFile, async () => {
    const templates = await readTemplatesUnlocked(config);
    const index = templates.findIndex((item) => item.id === id);
    if (index < 0) throw createHttpError(404, "TEMPLATE_NOT_FOUND", "模板不存在");
    templates[index] = normalizeTemplate({ ...body, id }, config, templates[index]);
    await writeTemplates(config, templates);
    return templates[index];
  });
}

async function deleteTemplate(config, id) {
  if (!isSafeId(id)) throw createHttpError(400, "INVALID_TEMPLATE_ID", "模板 ID 不正确");
  await withJsonFileLock(config.systemTemplatesFile, async () => {
    const templates = await readTemplatesUnlocked(config);
    const next = templates.filter((item) => item.id !== id);
    if (next.length === templates.length) {
      throw createHttpError(404, "TEMPLATE_NOT_FOUND", "模板不存在");
    }
    await writeTemplates(config, next);
  });
}

module.exports = {
  createTemplate,
  deleteTemplate,
  listTemplates,
  normalizeTemplate,
  replaceTemplateCollection,
  updateTemplate,
};
