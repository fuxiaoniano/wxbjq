"use strict";

const fs = require("fs");
const path = require("path");
const { handleAdminApi } = require("./admin/controller");
const { handleAuthApi } = require("./auth/controller");
const { exportBackup, importBackup } = require("./backup");
const { publicBasePath } = require("./config");
const { createDraft, deleteDraft, listDrafts, readDraftById, updateDraft } = require("./drafts");
const {
  HttpError,
  consumeRateLimit,
  isHashedAsset,
  readJsonBody,
  resolvePublicFile,
  safeDecodePath,
  verifyWriteRequest,
} = require("./security");
const { applySecurityHeaders, sendError, sendJson, sendNoContent } = require("./responses");
const { handleMembershipApi } = require("./membership/controller");
const { handleWechatApi } = require("./wechat/controller");
const { logError } = require("./logging");
const {
  createTemplate,
  deleteTemplate,
  listTemplates,
  replaceTemplateCollection,
  updateTemplate,
} = require("./templates");

function stripBasePath(pathname, config) {
  const basePath = config.basePath;
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || "/";
  return pathname;
}

function firstForwardedValue(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

function canonicalHttpsLocation(req, config, requestUrl) {
  if (!config.trustProxyHeaders || !["GET", "HEAD"].includes(req.method || "GET")) return "";

  const publicUrl = new URL(config.appPublicUrl);
  if (publicUrl.protocol !== "https:") return "";

  const forwardedProto = firstForwardedValue(req.headers["x-forwarded-proto"]).toLowerCase();
  const forwardedHost = firstForwardedValue(req.headers["x-forwarded-host"] || req.headers.host);
  if (forwardedProto !== "http" || forwardedHost.toLowerCase() !== publicUrl.host.toLowerCase()) {
    return "";
  }

  return new URL(`${requestUrl.pathname}${requestUrl.search}`, publicUrl.origin).toString();
}

function withBasePath(config, urlPath) {
  const basePath = config.basePath;
  if (!basePath) return urlPath;
  return `${basePath}${urlPath === "/" ? "/" : urlPath}`;
}

function routeMatch(pattern, pathname) {
  const match = pathname.match(pattern);
  return match ? match.slice(1) : null;
}

function shouldUseBackupRateLimit(pathname) {
  return pathname === "/api/backup/import" || pathname === "/api/backup/export";
}

function isEditorStoragePath(pathname) {
  return (
    pathname === "/api/drafts" ||
    pathname.startsWith("/api/drafts/") ||
    pathname === "/api/system-templates" ||
    pathname.startsWith("/api/system-templates/") ||
    pathname.startsWith("/api/backup/")
  );
}

function isWriteMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

async function readBody(req, config) {
  return readJsonBody(req, config.maxRequestBodyBytes, config.requestReadTimeoutMs);
}

async function handleApi(req, res, requestUrl, config, pathname) {
  const method = req.method || "GET";
  const isWrite = isWriteMethod(method);
  const limit = shouldUseBackupRateLimit(pathname) ? 10 : isWrite ? 60 : 300;
  const bucket = shouldUseBackupRateLimit(pathname) ? "backup" : isWrite ? "write" : "get";
  if (!consumeRateLimit(req, bucket, limit, { config })) {
    sendError(res, 429, "TOO_MANY_REQUESTS", "请求过于频繁");
    return;
  }

  if (method === "OPTIONS") {
    applySecurityHeaders(res, { "Cache-Control": "no-store", Allow: "GET,POST,PUT,PATCH,DELETE,OPTIONS" });
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === "/api/health" && method === "GET") {
    sendJson(res, 200, {
      status: "ok",
      version: config.version,
      deploymentMode: config.deploymentMode,
      serverStorageEnabled: config.serverStorageEnabled,
      basePath: publicBasePath(config),
      storage: {
        drafts: config.editorStorageEnabled,
        templates: config.editorStorageEnabled,
      },
      auth: {
        enabled: config.authEnabled,
        registrationEnabled: config.registrationEnabled,
        emailProvider: config.email.provider,
      },
      wechat: { enabled: config.wechat.enabled },
    });
    return;
  }

  if (isEditorStoragePath(pathname) && !config.editorStorageEnabled) {
    sendError(res, 403, "SERVER_STORAGE_DISABLED", "当前部署模式未启用共享编辑器存储");
    return;
  }

  if (await handleAuthApi(req, res, requestUrl, config, pathname, readBody)) return;
  if (await handleMembershipApi(req, res, requestUrl, config, pathname)) return;
  if (await handleAdminApi(req, res, requestUrl, config, pathname, readBody)) return;
  if (await handleWechatApi(req, res, requestUrl, config, pathname, readBody)) return;

  if (pathname === "/api/drafts" && method === "GET") {
    sendJson(res, 200, await listDrafts(config, Object.fromEntries(requestUrl.searchParams)));
    return;
  }

  if (pathname === "/api/drafts" && method === "POST") {
    verifyWriteRequest(req, config);
    sendJson(res, 201, await createDraft(config, await readBody(req, config)));
    return;
  }

  const draftMatch = routeMatch(/^\/api\/drafts\/([A-Za-z0-9_-]+)$/, pathname);
  if (draftMatch) {
    const [id] = draftMatch;
    if (method === "GET") {
      sendJson(res, 200, await readDraftById(config, id));
      return;
    }
    if (method === "PUT") {
      verifyWriteRequest(req, config);
      sendJson(res, 200, await updateDraft(config, id, await readBody(req, config)));
      return;
    }
    if (method === "DELETE") {
      verifyWriteRequest(req, config);
      await deleteDraft(config, id);
      sendNoContent(res);
      return;
    }
  }

  if (pathname === "/api/system-templates" && method === "GET") {
    sendJson(res, 200, await listTemplates(config));
    return;
  }

  if (pathname === "/api/system-templates" && method === "POST") {
    verifyWriteRequest(req, config);
    sendJson(res, 201, await createTemplate(config, await readBody(req, config)));
    return;
  }

  if (pathname === "/api/system-templates" && method === "PUT") {
    verifyWriteRequest(req, config);
    sendJson(res, 200, await replaceTemplateCollection(config, await readBody(req, config)));
    return;
  }

  const templateMatch = routeMatch(/^\/api\/system-templates\/([A-Za-z0-9_-]+)$/, pathname);
  if (templateMatch) {
    const [id] = templateMatch;
    if (method === "PUT") {
      verifyWriteRequest(req, config);
      sendJson(res, 200, await updateTemplate(config, id, await readBody(req, config)));
      return;
    }
    if (method === "DELETE") {
      verifyWriteRequest(req, config);
      await deleteTemplate(config, id);
      sendNoContent(res);
      return;
    }
  }

  if (pathname === "/api/backup/export" && method === "POST") {
    verifyWriteRequest(req, config);
    await readBody(req, config);
    sendJson(res, 200, await exportBackup(config));
    return;
  }

  if (pathname === "/api/backup/import" && method === "POST") {
    verifyWriteRequest(req, config);
    sendJson(res, 200, await importBackup(config, await readBody(req, config)));
    return;
  }

  sendError(res, 404, "NOT_FOUND", "接口不存在");
}

function injectIndexConfig(html, config) {
  const attribute = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return html
    .replace(
      /<meta name="app-base-path" content="[^"]*"\s*\/?>/i,
      `<meta name="app-base-path" content="${attribute(publicBasePath(config))}" />`,
    )
    .replace(
      /<meta name="deployment-mode" content="[^"]*"\s*\/?>/i,
      `<meta name="deployment-mode" content="${attribute(config.deploymentMode)}" />`,
    )
    .replace(
      /<meta name="server-storage-enabled" content="[^"]*"\s*\/?>/i,
      `<meta name="server-storage-enabled" content="${String(config.editorStorageEnabled)}" />`,
    )
    .replace(
      /<meta name="auth-enabled" content="[^"]*"\s*\/?>/i,
      `<meta name="auth-enabled" content="${String(config.authEnabled)}" />`,
    )
    .replace(
      /<meta name="csrf-cookie-name" content="[^"]*"\s*\/?>/i,
      `<meta name="csrf-cookie-name" content="${attribute(config.csrfCookieName)}" />`,
    )
    .replace(
      /<meta name="wechat-enabled" content="[^"]*"\s*\/?>/i,
      `<meta name="wechat-enabled" content="${String(config.wechat.enabled)}" />`,
    );
}

async function handleStatic(req, res, config, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "请求方法不支持");
    return;
  }
  if (!consumeRateLimit(req, "get", 300, { config })) {
    sendError(res, 429, "TOO_MANY_REQUESTS", "请求过于频繁");
    return;
  }

  const file = resolvePublicFile(pathname, config);
  if (!file.ok) {
    sendError(res, file.statusCode, file.code, file.message);
    return;
  }

  try {
    let buffer = await fs.promises.readFile(file.filePath);
    if (file.extension === ".html") {
      buffer = Buffer.from(injectIndexConfig(buffer.toString("utf8"), config), "utf8");
    }
    const cacheControl =
      file.extension === ".html"
        ? "no-store"
        : isHashedAsset(file.publicPath)
          ? "public, max-age=31536000, immutable"
          : "no-store";
    applySecurityHeaders(res, {
      "Content-Type": file.contentType,
      "Cache-Control": cacheControl,
    });
    res.writeHead(200);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(buffer);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", "资源不存在");
      return;
    }
    throw error;
  }
}

async function handleRequest(req, res, config) {
  let requestUrl;
  try {
    if (String(req.url || "").startsWith("//")) {
      sendError(res, 400, "INVALID_PATH", "请求路径不正确");
      return;
    }
    requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  } catch (error) {
    sendError(res, 400, "INVALID_REQUEST", "请求格式不正确");
    return;
  }

  const decoded = safeDecodePath(requestUrl.pathname);
  if (!decoded.ok) {
    sendError(res, 400, decoded.code, decoded.message);
    return;
  }

  if (
    config.basePath &&
    decoded.value !== config.basePath &&
    !decoded.value.startsWith(`${config.basePath}/`)
  ) {
    sendError(res, 404, "NOT_FOUND", "资源不存在");
    return;
  }

  const canonicalLocation = canonicalHttpsLocation(req, config, requestUrl);
  if (canonicalLocation) {
    applySecurityHeaders(res, { Location: canonicalLocation, "Cache-Control": "no-store" });
    res.writeHead(308);
    res.end();
    return;
  }

  let pathname = stripBasePath(decoded.value, config);
  if (config.basePath && decoded.value === config.basePath) {
    applySecurityHeaders(res, { Location: withBasePath(config, "/"), "Cache-Control": "no-store" });
    res.writeHead(308);
    res.end();
    return;
  }

  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (pathname.startsWith("/api/")) {
    await handleApi(req, res, requestUrl, config, pathname);
    return;
  }

  await handleStatic(req, res, config, pathname);
}

function handleError(res, error) {
  if (res.writableEnded) return;
  if (error instanceof HttpError || error.statusCode) {
    sendError(
      res,
      error.statusCode || 500,
      error.code || "INVALID_REQUEST",
      error.publicMessage || error.message || "请求处理失败",
      error.fields || (error.feature ? { feature: error.feature } : undefined),
    );
    return;
  }
  logError("server", error);
  sendError(res, 500, "INTERNAL_ERROR", "服务器处理请求失败");
}

module.exports = {
  canonicalHttpsLocation,
  handleError,
  handleRequest,
  injectIndexConfig,
  stripBasePath,
};
