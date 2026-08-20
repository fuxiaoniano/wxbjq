"use strict";

const { readJsonFile, writeJsonAtomic } = require("./storage");

const DEFAULT_SETTINGS = {
  themeName: "default-red",
  themeColor: "#d92d20",
  updatedAt: "",
};

function sanitizeColor(value, fallback = DEFAULT_SETTINGS.themeColor) {
  const match = String(value || "").trim().match(/^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  return match ? `#${match[1].toLowerCase()}${(match[2] || "").toLowerCase()}` : fallback;
}

function normalizeSettings(input = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...(input && typeof input === "object" ? input : {}),
    themeName: String(input.themeName || DEFAULT_SETTINGS.themeName).slice(0, 80),
    themeColor: sanitizeColor(input.themeColor),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

async function getSettings(config) {
  const settings = await readJsonFile(config.settingsFile, DEFAULT_SETTINGS);
  return normalizeSettings(settings || {});
}

async function updateSettings(config, body) {
  const settings = normalizeSettings(body || {});
  await writeJsonAtomic(config.settingsFile, settings);
  return settings;
}

module.exports = {
  getSettings,
  normalizeSettings,
  updateSettings,
};
