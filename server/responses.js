"use strict";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; "),
};

function applySecurityHeaders(res, extra = {}) {
  for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...extra })) {
    res.setHeader(name, value);
  }
}

function appendHeader(res, name, value) {
  const current = res.getHeader(name);
  if (!current) {
    res.setHeader(name, value);
    return;
  }
  const values = Array.isArray(current) ? current : [current];
  res.setHeader(name, [...values, ...(Array.isArray(value) ? value : [value])]);
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  if (res.writableEnded) return;
  applySecurityHeaders(res, {
    "Content-Type": "application/json;charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.writeHead(statusCode);
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, code, message, details) {
  const payload = {
    error: {
      code,
      message,
    },
  };
  if (details && typeof details === "object") payload.error.details = details;
  sendJson(res, statusCode, payload);
}

function sendNoContent(res, extraHeaders = {}) {
  if (res.writableEnded) return;
  applySecurityHeaders(res, { "Cache-Control": "no-store", ...extraHeaders });
  res.writeHead(204);
  res.end();
}

module.exports = {
  SECURITY_HEADERS,
  appendHeader,
  applySecurityHeaders,
  sendError,
  sendJson,
  sendNoContent,
};
