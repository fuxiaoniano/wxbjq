"use strict";

const path = require("node:path");
const { readJsonFileOptional, withJsonFileLock, writeJsonAtomic } = require("../storage");

function visitsFile(config, surface = "video-downloader") {
  const filename = surface === "editor" ? "editor-visits.json" : "video-downloader-visits.json";
  return path.join(config.dataDir, filename);
}

function normalizeCount(value) {
  const count = Number.parseInt(String(value ?? "0"), 10);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

async function getVisitCount(config, surface) {
  const state = await readJsonFileOptional(visitsFile(config, surface), {});
  return normalizeCount(state?.count);
}

async function recordVisit(config, surface) {
  const filePath = visitsFile(config, surface);
  return withJsonFileLock(filePath, async () => {
    const state = await readJsonFileOptional(filePath, {});
    const count = normalizeCount(state?.count) + 1;
    await writeJsonAtomic(filePath, { count, updatedAt: new Date().toISOString() });
    return count;
  });
}

module.exports = { getVisitCount, recordVisit, visitsFile };
