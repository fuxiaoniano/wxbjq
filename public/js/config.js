export function normalizeBasePath(value = "/") {
  let basePath = String(value || "/").trim();
  if (!basePath || basePath === "/") return "";
  basePath = `/${basePath.replace(/^\/+|\/+$/g, "")}`;
  return basePath.replace(/\/{2,}/g, "/");
}

function readMeta(name, fallback = "") {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || fallback;
}

export const appConfig = {
  basePath: normalizeBasePath(readMeta("app-base-path", "/")),
  deploymentMode: readMeta("deployment-mode", "local"),
  serverStorageEnabled: readMeta("server-storage-enabled", "true") === "true",
  authEnabled: readMeta("auth-enabled", "true") === "true",
  wechatEnabled: readMeta("wechat-enabled", "false") === "true",
  csrfCookieName: readMeta("csrf-cookie-name", "wechat_editor_csrf"),
};

export function apiUrl(path) {
  const normalized = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${appConfig.basePath}/api${normalized}`.replace(/\/{2,}/g, "/");
}

export function withBasePath(path) {
  const normalized = String(path || "/").startsWith("/") ? path : `/${path}`;
  return `${appConfig.basePath}${normalized}`.replace(/\/{2,}/g, "/") || "/";
}

export function canUseServerStorage() {
  return appConfig.deploymentMode === "local" && appConfig.serverStorageEnabled;
}
