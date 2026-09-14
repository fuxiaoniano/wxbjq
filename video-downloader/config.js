function normalizeBasePath(value = "/") {
  let basePath = String(value || "/").trim();
  if (!basePath || basePath === "/") return "";
  basePath = `/${basePath.replace(/^\/+|\/+$/g, "")}`;
  return basePath.replace(/\/{2,}/g, "/");
}

function readMeta(name, fallback = "") {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || fallback;
}

const basePath = normalizeBasePath(readMeta("app-base-path", "/"));

export function apiUrl(path) {
  const normalized = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${basePath}/api${normalized}`.replace(/\/{2,}/g, "/");
}
