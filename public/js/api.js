import { apiUrl, appConfig } from "./config.js";

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(";")) {
    const value = part.trim();
    if (!value.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(value.slice(prefix.length));
    } catch (error) {
      return value.slice(prefix.length);
    }
  }
  return "";
}

export async function apiJson(path, options = {}) {
  const method = options.method || "GET";
  const headers = new Headers(options.headers || {});
  if (method !== "GET" && method !== "HEAD") {
    headers.set("Content-Type", "application/json");
    headers.set("X-Editor-Request", "1");
    const csrfToken = readCookie(appConfig.csrfCookieName);
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    method,
    headers,
    credentials: "same-origin",
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { error: { code: "INVALID_RESPONSE", message: text.slice(0, 120) } };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error?.message || `请求失败：${response.status}`);
    error.status = response.status;
    error.code = payload?.error?.code || "REQUEST_FAILED";
    error.payload = payload;
    if (response.status === 401) {
      document.dispatchEvent(new CustomEvent("auth:required", { detail: { error } }));
    }
    throw error;
  }

  return payload;
}
