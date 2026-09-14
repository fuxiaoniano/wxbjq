"use strict";

const path = require("node:path");
const { readJsonFileOptional, withJsonFileLock, writeJsonAtomic } = require("../storage");

function visitsFile(config) {
  return path.join(config.dataDir, "video-downloader-visits.json");
}

function normalizeCount(value) {
  const count = Number.parseInt(String(value ?? "0"), 10);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

async function getVisitCount(config) {
  const state = await readJsonFileOptional(visitsFile(config), {});
  return normalizeCount(state?.count);
}

async function recordVisit(config) {
  const filePath = visitsFile(config);
  return withJsonFileLock(filePath, async () => {
    const state = await readJsonFileOptional(filePath, {});
    const count = normalizeCount(state?.count) + 1;
    await writeJsonAtomic(filePath, { count, updatedAt: new Date().toISOString() });
    return count;
  });
}

module.exports = { getVisitCount, recordVisit, visitsFile };
