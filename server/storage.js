"use strict";

const fs = require("fs");
const path = require("path");

const jsonFileLocks = new Map();

async function ensureJsonFile(filePath, fallback) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) await writeJsonAtomic(filePath, fallback);
}

async function ensureDataStore(config) {
  await fs.promises.mkdir(config.draftsDir, { recursive: true });
  await fs.promises.mkdir(config.backupsDir, { recursive: true });
  await fs.promises.mkdir(path.dirname(config.settingsFile), { recursive: true });
  if (!fs.existsSync(config.systemTemplatesFile)) {
    await writeJsonAtomic(config.systemTemplatesFile, []);
  }
  if (!fs.existsSync(config.settingsFile)) {
    await writeJsonAtomic(config.settingsFile, {});
  }
  for (const filePath of Object.values(config.authFiles || {})) {
    await ensureJsonFile(filePath, []);
  }
  for (const filePath of Object.values(config.membershipFiles || {})) {
    await ensureJsonFile(filePath, []);
  }
  for (const filePath of Object.values(config.wechatFiles || {})) {
    await ensureJsonFile(filePath, []);
  }
}

function isSafeId(id) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(id || ""));
}

function safeJsonFile(rootDir, id) {
  if (!isSafeId(id)) return "";
  const filePath = path.resolve(rootDir, `${id}.json`);
  const relative = path.relative(rootDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "";
  return filePath;
}

async function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    const backupPath = `${filePath}.bak`;
    try {
      return JSON.parse(await fs.promises.readFile(backupPath, "utf8"));
    } catch (backupError) {
      console.error(`[storage] failed to read json: ${path.basename(filePath)} (${error.code || "ERR"})`);
      throw error;
    }
  }
}

async function readJsonFileOptional(filePath, fallback = null) {
  try {
    return await readJsonFile(filePath, fallback);
  } catch (error) {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  const backupPath = `${filePath}.bak`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await fs.promises.writeFile(tempPath, serialized, "utf8");
    try {
      await fs.promises.copyFile(filePath, backupPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.promises.rename(tempPath, filePath);
  } catch (error) {
    try {
      await fs.promises.unlink(tempPath);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        console.error(`[storage] failed to clean temp file: ${path.basename(tempPath)}`);
      }
    }
    throw error;
  }
}

async function withJsonFileLock(filePath, callback) {
  const previous = jsonFileLocks.get(filePath) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  jsonFileLocks.set(filePath, queued);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (jsonFileLocks.get(filePath) === queued) jsonFileLocks.delete(filePath);
  }
}

async function mutateJsonArray(filePath, mutator) {
  return withJsonFileLock(filePath, async () => {
    const current = await readJsonFile(filePath, []);
    if (!Array.isArray(current)) throw new Error(`${path.basename(filePath)} 必须保存 JSON 数组`);
    const result = await mutator(current);
    await writeJsonAtomic(filePath, current);
    return result;
  });
}

async function listJsonFiles(rootDir) {
  try {
    const files = await fs.promises.readdir(rootDir);
    return files.filter((file) => file.endsWith(".json") && !file.endsWith(".bak.json"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function createStorageId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function createFullBackup(config, reason = "manual") {
  await fs.promises.mkdir(config.backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(config.backupsDir, `backup-${reason}-${timestamp}.json`);
  const drafts = [];
  for (const file of await listJsonFiles(config.draftsDir)) {
    const value = await readJsonFileOptional(path.join(config.draftsDir, file), null);
    if (value) drafts.push(value);
  }
  const templates = await readJsonFileOptional(config.systemTemplatesFile, []);
  const settings = await readJsonFileOptional(config.settingsFile, {});
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    reason,
    drafts,
    templates: Array.isArray(templates) ? templates : [],
    settings: settings && typeof settings === "object" ? settings : {},
  };
  await writeJsonAtomic(backupPath, payload);
  return backupPath;
}

module.exports = {
  createFullBackup,
  createStorageId,
  ensureDataStore,
  ensureJsonFile,
  fileExists,
  isSafeId,
  listJsonFiles,
  readJsonFile,
  readJsonFileOptional,
  safeJsonFile,
  mutateJsonArray,
  withJsonFileLock,
  writeJsonAtomic,
};
