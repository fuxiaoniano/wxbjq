"use strict";

const path = require("path");
const { isLoopbackHost } = require("./config");

const ALLOWED_STATIC_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
]);

const MIME_TYPES = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const rateBuckets = new Map();
let lastRateCleanup = 0;

class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.publicMessage = message;
  }
}

function createHttpError(statusCode, code, message) {
  return new HttpError(statusCode, code, message);
}

function hasControlCharacters(value) {
  return /[\x00-\x1f\x7f]/.test(value);
}

function decodeOnce(pathname) {
  try {
    return { ok: true, value: decodeURIComponent(pathname) };
  } catch (error) {
    return { ok: false, code: "INVALID_PATH_ENCODING", message: "URL 编码不正确" };
  }
}

function safeDecodePath(pathname) {
  if (typeof pathname !== "string") {
    return { ok: false, code: "INVALID_PATH", message: "请求路径不正确" };
  }
  if (pathname.includes("\0") || /%00/i.test(pathname)) {
    return { ok: false, code: "INVALID_PATH", message: "请求路径不正确" };
  }

  const decoded = decodeOnce(pathname);
  if (!decoded.ok) return decoded;
  const value = decoded.value;

  if (!value.startsWith("/")) {
    return { ok: false, code: "INVALID_PATH", message: "请求路径不正确" };
  }
  if (value.startsWith("//") || value.includes("\\") || hasControlCharacters(value)) {
    return { ok: false, code: "INVALID_PATH", message: "请求路径不正确" };
  }
  if (/%[0-9a-f]{2}/i.test(value)) {
    const decodedAgain = decodeOnce(value);
    if (!decodedAgain.ok) return decodedAgain;
    if (decodedAgain.value !== value) {
      const second = decodedAgain.value;
      if (
        second.includes("..") ||
        second.includes("\\") ||
        second.includes("\0") ||
        hasControlCharacters(second)
      ) {
        return { ok: false, code: "INVALID_PATH", message: "请求路径不正确" };
      }
    }
  }

  return { ok: true, value };
}

function isSafePublicPath(pathname) {
  const decoded = safeDecodePath(pathname);
  if (!decoded.ok) return false;
  const value = decoded.value;
  if (value.includes("\\") || value.includes("\0")) return false;
  const parts = value.split("/");
  if (parts.some((part) => part === ".." || part === ".")) return false;
  return true;
}

function resolvePublicFile(pathname, config) {
  const decoded = safeDecodePath(pathname);
  if (!decoded.ok) {
    return { ok: false, statusCode: 400, code: decoded.code, message: decoded.message };
  }

  let publicPath = decoded.value;
  if (publicPath === "/") publicPath = "/index.html";
  if (!isSafePublicPath(publicPath)) {
    return { ok: false, statusCode: 404, code: "NOT_FOUND", message: "资源不存在" };
  }

  const extension = path.extname(publicPath).toLowerCase();
  if (!ALLOWED_STATIC_EXTENSIONS.has(extension)) {
    return { ok: false, statusCode: 404, code: "NOT_FOUND", message: "资源不存在" };
  }

  const filePath = path.resolve(config.publicDir, `.${publicPath}`);
  const relative = path.relative(config.publicDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false, statusCode: 404, code: "NOT_FOUND", message: "资源不存在" };
  }

  return {
    ok: true,
    filePath,
    publicPath,
    extension,
    contentType: MIME_TYPES[extension] || "application/octet-stream",
  };
}

function getRequestIp(req, config = {}) {
  const forwarded = req.headers["x-forwarded-for"];
  if (config.trustProxyHeaders && typeof forwarded === "string" && forwarded.trim()) {
    const hops = forwarded.split(",").map((item) => item.trim()).filter(Boolean);
    return hops[hops.length - 1] || req.socket.remoteAddress || "unknown";
  }
  return req.socket.remoteAddress || "unknown";
}

function consumeRateLimit(req, bucketName, limit, options = {}) {
  const windowMs = options.windowMs || 60_000;
  const now = Date.now();
  if (now - lastRateCleanup > windowMs) {
    for (const [key, bucket] of rateBuckets.entries()) {
      if (now - bucket.startedAt > (bucket.windowMs || 60_000) * 2) rateBuckets.delete(key);
    }
    lastRateCleanup = now;
  }

  const identifier = options.identifier || getRequestIp(req, options.config);
  const key = `${bucketName}:${identifier}`;
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    rateBuckets.set(key, { count: 1, startedAt: now, windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function clearRateLimits() {
  rateBuckets.clear();
  lastRateCleanup = 0;
}

function normalizeOriginHost(origin) {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    return "";
  }
}

function hostMatchesTrustedOrigin(hostHeader, trustedOrigins) {
  const host = String(hostHeader || "").toLowerCase();
  if (!host) return false;
  return trustedOrigins.some((origin) => {
    try {
      return new URL(origin).host.toLowerCase() === host;
    } catch (error) {
      return false;
    }
  });
}

function verifyWriteRequest(req, config, options = {}) {
  const requireStorage = options.requireStorage !== false;
  if (requireStorage && !config.serverStorageEnabled) {
    throw createHttpError(
      403,
      "SERVER_STORAGE_DISABLED",
      "当前部署模式未启用服务器存储",
    );
  }

  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw createHttpError(403, "FORBIDDEN_ORIGIN", "跨站请求被拒绝");
  }

  const origin = req.headers.origin;
  if (origin) {
    const normalized = normalizeOriginHost(origin);
    if (!normalized || !config.trustedOrigins.includes(normalized)) {
      throw createHttpError(403, "FORBIDDEN_ORIGIN", "请求来源不受信任");
    }
  } else if (config.deploymentMode === "public-stateless") {
    throw createHttpError(403, "FORBIDDEN_ORIGIN", "缺少可信请求来源");
  } else {
    const hostHeader = String(req.headers.host || "");
    const hostname = hostHeader.startsWith("[")
      ? hostHeader.slice(1, hostHeader.indexOf("]"))
      : hostHeader.split(":")[0];
    const allowedByHost =
      hostMatchesTrustedOrigin(hostHeader, config.trustedOrigins) || isLoopbackHost(hostname);
    if (!allowedByHost || fetchSite === "cross-site") {
      throw createHttpError(403, "FORBIDDEN_ORIGIN", "缺少可信请求来源");
    }
  }

  if (req.headers["x-editor-request"] !== "1") {
    throw createHttpError(403, "MISSING_EDITOR_HEADER", "缺少编辑器请求头");
  }

  if (["POST", "PUT", "PATCH"].includes(req.method || "")) {
    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    if (!contentType.split(";")[0].trim().match(/^application\/json$/)) {
      throw createHttpError(415, "UNSUPPORTED_MEDIA_TYPE", "请求必须使用 application/json");
    }
  }
}

function readJsonBody(req, maxBytes, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    function finish(callback, value) {
      if (settled) return;
      settled = true;
      req.setTimeout(0);
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("aborted", onAborted);
      req.off("error", onError);
      callback(value);
    }

    function onData(chunk) {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        req.pause();
        finish(reject, createHttpError(413, "PAYLOAD_TOO_LARGE", "请求体过大"));
        req.resume();
        return;
      }
      chunks.push(chunk);
    }

    function onEnd() {
      const body = Buffer.concat(chunks, totalBytes).toString("utf8");
      if (!body.trim()) {
        finish(resolve, {});
        return;
      }
      try {
        finish(resolve, JSON.parse(body));
      } catch (error) {
        finish(reject, createHttpError(400, "INVALID_JSON", "JSON 格式不正确"));
      }
    }

    function onAborted() {
      finish(reject, createHttpError(400, "REQUEST_ABORTED", "请求已中断"));
    }

    function onError() {
      finish(reject, createHttpError(400, "INVALID_REQUEST", "请求格式不正确"));
    }

    const declaredBytes = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      finish(reject, createHttpError(413, "PAYLOAD_TOO_LARGE", "请求体过大"));
      req.resume();
      return;
    }

    req.setTimeout(timeoutMs, () => {
      finish(reject, createHttpError(408, "REQUEST_TIMEOUT", "请求读取超时"));
    });
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("aborted", onAborted);
    req.on("error", onError);
  });
}

function isHashedAsset(publicPath) {
  return /\.[a-f0-9]{8,}\.[a-z0-9]+$/i.test(publicPath);
}

module.exports = {
  HttpError,
  clearRateLimits,
  consumeRateLimit,
  createHttpError,
  getRequestIp,
  isHashedAsset,
  readJsonBody,
  resolvePublicFile,
  safeDecodePath,
  verifyWriteRequest,
};
