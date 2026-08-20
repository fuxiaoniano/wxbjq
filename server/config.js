"use strict";

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const VERSION = "2.0.0";

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseInteger(value, fallback, min = 0) {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number) || number < min) return fallback;
  return number;
}

function parseEncryptionKey(value, label) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new Error(`${label} 必须是 Base64 编码的 32 字节密钥`);
  }
  const key = Buffer.from(text, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/g, "") !== text.replace(/=+$/g, "")) {
    throw new Error(`${label} 必须是 Base64 编码的 32 字节密钥`);
  }
  return key;
}

function normalizeBasePath(value = "/") {
  let basePath = String(value || "/").trim();
  if (!basePath || basePath === "/") return "";
  basePath = `/${basePath.replace(/^\/+|\/+$/g, "")}`;
  return basePath.replace(/\/{2,}/g, "/");
}

function isLoopbackHost(host) {
  const normalized = String(host || "").trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

function splitList(value, fallback = "") {
  return [
    ...new Set(
      String(value || fallback)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function splitOrigins(value, fallback) {
  return splitList(value, fallback).map((origin) => {
    try {
      return new URL(origin).origin;
    } catch (error) {
      return origin;
    }
  });
}

function defaultTrustedOrigins(port) {
  return [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ].join(",");
}

function readEnvironment(rootDir, providedEnvironment) {
  if (providedEnvironment) return providedEnvironment;
  const envFile = path.join(rootDir, ".env");
  let fileEnvironment = {};
  try {
    fileEnvironment = dotenv.parse(fs.readFileSync(envFile));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { ...fileEnvironment, ...process.env };
}

function normalizeAppPublicUrl(value, host, port, basePath) {
  const fallbackHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  const fallback = `http://${fallbackHost}:${port}${basePath || ""}/`;
  let parsed;
  try {
    parsed = new URL(String(value || fallback));
  } catch (error) {
    throw new Error("APP_PUBLIC_URL 必须是完整的 HTTP 或 HTTPS 地址");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("APP_PUBLIC_URL 只允许使用 HTTP 或 HTTPS");
  }
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = `${parsed.pathname.replace(/\/+$/g, "") || ""}/`;
  return parsed.toString();
}

function validateCookieName(value, label) {
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)) {
    throw new Error(`${label} 不是有效的 Cookie 名称`);
  }
  return value;
}

function loadConfig(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, "..");
  const env = readEnvironment(rootDir, options.env);
  const host = env.HOST || "127.0.0.1";
  const port = parseInteger(env.PORT, 8090, 0);
  const nodeEnv = env.NODE_ENV || "development";
  const deploymentMode = env.DEPLOYMENT_MODE || "local";
  const basePath = normalizeBasePath(env.APP_BASE_PATH || "/");
  const publicDir = path.join(rootDir, "public");
  const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(rootDir, "data");
  const authDir = path.join(dataDir, "auth");
  const membershipDir = path.join(dataDir, "membership");
  const wechatDir = path.join(dataDir, "wechat");
  const serverStorageEnabled =
    deploymentMode === "public-stateless"
      ? false
      : parseBoolean(env.SERVER_STORAGE_ENABLED, true);
  const authEnabled = parseBoolean(env.AUTH_ENABLED, deploymentMode !== "public-stateless");
  const appPublicUrl = normalizeAppPublicUrl(env.APP_PUBLIC_URL, host, port, basePath);
  // The public application URL is an operator-controlled first-party origin. Keeping it in
  // the allowlist prevents a domain migration from rejecting the editor's own write requests.
  const trustedOrigins = [
    ...new Set([
      new URL(appPublicUrl).origin,
      ...splitOrigins(env.TRUSTED_ORIGINS, defaultTrustedOrigins(port)),
    ]),
  ];
  const sessionCookieName = validateCookieName(
    env.SESSION_COOKIE_NAME || "wechat_editor_session",
    "SESSION_COOKIE_NAME",
  );
  const csrfCookieName = validateCookieName(
    env.CSRF_COOKIE_NAME || "wechat_editor_csrf",
    "CSRF_COOKIE_NAME",
  );
  const wechatEnabled = parseBoolean(env.WECHAT_ENABLED, false);
  const wechatApiBaseUrl = new URL(env.WECHAT_API_BASE_URL || "https://api.weixin.qq.com");
  const wechatCredentialKey = parseEncryptionKey(env.WECHAT_CREDENTIAL_KEY, "WECHAT_CREDENTIAL_KEY");

  const config = {
    version: VERSION,
    nodeEnv,
    rootDir,
    publicDir,
    dataDir,
    draftsDir: path.join(dataDir, "drafts"),
    backupsDir: path.join(dataDir, "backups"),
    settingsFile: path.join(dataDir, "settings.json"),
    systemTemplatesFile: env.SYSTEM_TEMPLATES_FILE
      ? path.resolve(env.SYSTEM_TEMPLATES_FILE)
      : path.join(rootDir, "system-templates.json"),
    host,
    port,
    basePath,
    appPublicUrl,
    deploymentMode,
    serverStorageEnabled,
    authEnabled,
    registrationEnabled: parseBoolean(env.REGISTRATION_ENABLED, true),
    allowUnverifiedLogin: parseBoolean(env.ALLOW_UNVERIFIED_LOGIN, true),
    allowUnauthenticatedRemoteStorage: parseBoolean(
      env.ALLOW_UNAUTHENTICATED_REMOTE_STORAGE,
      false,
    ),
    trustedOrigins,
    trustProxyHeaders: parseBoolean(env.TRUST_PROXY_HEADERS, false),
    sessionSecret:
      env.SESSION_SECRET || "development-only-session-secret-change-before-production",
    sessionCookieName,
    csrfCookieName,
    cookiePath: basePath || "/",
    cookieSecure: parseBoolean(env.COOKIE_SECURE, nodeEnv === "production"),
    sessionTtlMs: parseInteger(env.SESSION_TTL_HOURS, 12, 1) * 60 * 60 * 1000,
    rememberSessionTtlMs:
      parseInteger(env.REMEMBER_SESSION_TTL_DAYS, 30, 1) * 24 * 60 * 60 * 1000,
    emailVerificationTtlMs:
      parseInteger(env.EMAIL_VERIFICATION_TTL_HOURS, 24, 1) * 60 * 60 * 1000,
    passwordResetTtlMs:
      parseInteger(env.PASSWORD_RESET_TTL_MINUTES, 30, 5) * 60 * 1000,
    passwordMinLength: parseInteger(env.PASSWORD_MIN_LENGTH, 8, 8),
    passwordMaxLength: parseInteger(env.PASSWORD_MAX_LENGTH, 128, 32),
    termsVersion: String(env.TERMS_VERSION || "1").slice(0, 40),
    adminEmails: splitList(env.ADMIN_EMAILS).map((email) => email.toLowerCase()),
    automationGuardProvider: env.AUTOMATION_GUARD_PROVIDER || "none",
    email: {
      provider: String(env.EMAIL_PROVIDER || (nodeEnv === "production" ? "smtp" : "console"))
        .trim()
        .toLowerCase(),
      fromName: env.EMAIL_FROM_NAME || "微信编辑器",
      fromAddress: env.EMAIL_FROM_ADDRESS || env.SMTP_USER || "no-reply@example.invalid",
      smtp: {
        host: env.SMTP_HOST || "",
        port: parseInteger(env.SMTP_PORT, 465, 1),
        secure: parseBoolean(env.SMTP_SECURE, true),
        user: env.SMTP_USER || "",
        pass: env.SMTP_PASS || "",
      },
    },
    authRateLimits: {
      registerPerHour: parseInteger(env.REGISTER_RATE_LIMIT_PER_HOUR, 5, 1),
      loginPer15Minutes: parseInteger(env.LOGIN_RATE_LIMIT_PER_15_MINUTES, 10, 1),
      emailPerHour: parseInteger(env.EMAIL_RATE_LIMIT_PER_HOUR, 5, 1),
      passwordResetPerHour: parseInteger(env.PASSWORD_RESET_RATE_LIMIT_PER_HOUR, 5, 1),
    },
    authFiles: {
      users: path.join(authDir, "users.json"),
      emailVerificationTokens: path.join(authDir, "email-verification-tokens.json"),
      passwordResetTokens: path.join(authDir, "password-reset-tokens.json"),
      sessions: path.join(authDir, "sessions.json"),
      auditLogs: path.join(authDir, "audit-logs.json"),
    },
    membershipFiles: {
      plans: path.join(membershipDir, "plans.json"),
      memberships: path.join(membershipDir, "memberships.json"),
      features: path.join(membershipDir, "features.json"),
      planFeatures: path.join(membershipDir, "plan-features.json"),
      entitlements: path.join(membershipDir, "user-entitlements.json"),
      usage: path.join(membershipDir, "feature-usage.json"),
    },
    wechat: {
      enabled: wechatEnabled,
      apiBaseUrl: wechatApiBaseUrl,
      credentialKey: wechatCredentialKey,
      credentialKeyVersion: String(env.WECHAT_CREDENTIAL_KEY_VERSION || "1").slice(0, 40),
      requestTimeoutMs: parseInteger(env.WECHAT_REQUEST_TIMEOUT_MS, 10_000, 1000),
      tokenRefreshSkewMs: parseInteger(env.WECHAT_TOKEN_REFRESH_SKEW_SECONDS, 300, 60) * 1000,
      accountsHardMax: parseInteger(env.WECHAT_ACCOUNTS_HARD_MAX, 50, 1),
      draftHtmlMaxBytes: parseInteger(env.WECHAT_DRAFT_HTML_MAX_BYTES, 1024 * 1024, 1024),
      draftTextMaxCharacters: parseInteger(env.WECHAT_DRAFT_TEXT_MAX_CHARACTERS, 20_000, 100),
      imageMaxBytes: parseInteger(env.WECHAT_IMAGE_MAX_BYTES, 1024 * 1024, 1024),
      coverImageMaxBytes: parseInteger(env.WECHAT_COVER_IMAGE_MAX_BYTES, 10 * 1024 * 1024, 1024),
      imageMaxPixels: parseInteger(env.WECHAT_IMAGE_MAX_PIXELS, 40_000_000, 1),
      imageDownloadTimeoutMs: parseInteger(env.WECHAT_IMAGE_DOWNLOAD_TIMEOUT_MS, 10_000, 1000),
      imageRedirectLimit: parseInteger(env.WECHAT_IMAGE_REDIRECT_LIMIT, 3, 0),
    },
    wechatFiles: {
      accounts: path.join(wechatDir, "accounts.json"),
      authorizations: path.join(wechatDir, "authorizations.json"),
      accessTokens: path.join(wechatDir, "access-token-cache.json"),
      draftOperations: path.join(wechatDir, "draft-operations.json"),
      draftRecords: path.join(wechatDir, "draft-records.json"),
      imageCache: path.join(wechatDir, "image-cache.json"),
    },
    maxRequestBodyBytes: parseInteger(env.MAX_REQUEST_BODY_BYTES, 2 * 1024 * 1024, 1024),
    maxDraftHtmlBytes: parseInteger(env.MAX_DRAFT_HTML_BYTES, 1024 * 1024, 1024),
    maxTemplateHtmlBytes: parseInteger(env.MAX_TEMPLATE_HTML_BYTES, 300 * 1024, 1024),
    maxDrafts: parseInteger(env.MAX_DRAFTS, 100, 1),
    maxTemplates: parseInteger(env.MAX_TEMPLATES, 200, 1),
    maxBrowserDrafts: parseInteger(env.MAX_BROWSER_DRAFTS, 80, 1),
    requestReadTimeoutMs: parseInteger(env.REQUEST_READ_TIMEOUT_MS, 10_000, 1000),
  };

  validateStartupSafety(config);
  return config;
}

function validateStartupSafety(config) {
  if (config.authEnabled && !config.serverStorageEnabled) {
    throw new Error("启用账号系统时必须同时启用 SERVER_STORAGE_ENABLED");
  }
  if (
    !isLoopbackHost(config.host) &&
    config.serverStorageEnabled &&
    !config.allowUnauthenticatedRemoteStorage
  ) {
    throw new Error(
      [
        "当前配置会向远程访问者开放未认证的写接口。",
        "请关闭服务器存储，绑定回环地址，或明确设置",
        "ALLOW_UNAUTHENTICATED_REMOTE_STORAGE=true。",
      ].join("\n"),
    );
  }

  if (!config.authEnabled || config.nodeEnv !== "production") return;
  if (Buffer.byteLength(config.sessionSecret, "utf8") < 32) {
    throw new Error("生产环境 SESSION_SECRET 至少需要 32 个字符");
  }
  if (!config.appPublicUrl.startsWith("https://")) {
    throw new Error("生产环境 APP_PUBLIC_URL 必须使用 HTTPS");
  }
  if (!config.cookieSecure) {
    throw new Error("生产环境 COOKIE_SECURE 必须为 true");
  }
  if (config.email.provider !== "smtp") {
    throw new Error("生产环境启用账号系统时 EMAIL_PROVIDER 必须为 smtp");
  }
  const smtp = config.email.smtp;
  if (!smtp.host || !smtp.user || !smtp.pass || !config.email.fromAddress) {
    throw new Error("生产环境 SMTP 配置不完整，请检查 SMTP_HOST、SMTP_USER、SMTP_PASS 和 EMAIL_FROM_ADDRESS");
  }
  if (config.wechat.enabled) {
    if (!config.wechat.credentialKey) {
      throw new Error("启用微信公众号绑定时必须配置 WECHAT_CREDENTIAL_KEY");
    }
    if (config.wechat.apiBaseUrl.protocol !== "https:" || config.wechat.apiBaseUrl.hostname !== "api.weixin.qq.com") {
      throw new Error("生产环境 WECHAT_API_BASE_URL 必须使用微信官方 HTTPS 地址");
    }
  }
}

function publicBasePath(config) {
  return config.basePath || "/";
}

module.exports = {
  VERSION,
  isLoopbackHost,
  loadConfig,
  normalizeBasePath,
  parseBoolean,
  publicBasePath,
  readEnvironment,
};
