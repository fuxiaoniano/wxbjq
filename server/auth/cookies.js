"use strict";

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch (error) {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  return parts.join("; ");
}

function sessionCookies(config, session) {
  const maxAge = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
  const common = {
    path: config.cookiePath,
    sameSite: "Lax",
    secure: config.cookieSecure,
  };
  if (session.remember) common.maxAge = maxAge;
  return [
    serializeCookie(config.sessionCookieName, session.rawToken, { ...common, httpOnly: true }),
    serializeCookie(config.csrfCookieName, session.csrfToken, { ...common, httpOnly: false }),
  ];
}

function clearSessionCookies(config) {
  const common = {
    expires: new Date(0),
    maxAge: 0,
    path: config.cookiePath,
    sameSite: "Lax",
    secure: config.cookieSecure,
  };
  return [
    serializeCookie(config.sessionCookieName, "", { ...common, httpOnly: true }),
    serializeCookie(config.csrfCookieName, "", { ...common, httpOnly: false }),
  ];
}

module.exports = {
  clearSessionCookies,
  parseCookies,
  serializeCookie,
  sessionCookies,
};
