"use strict";

const { sendJson, sendNoContent } = require("../responses");
const { verifyWriteRequest } = require("../security");
const { clearSessionCookies, sessionCookies } = require("./cookies");
const { getAuthService } = require("./service");

function setCookieHeaders(cookies) {
  return { "Set-Cookie": cookies };
}

async function handleAuthApi(req, res, requestUrl, config, pathname, readBody) {
  if (!pathname.startsWith("/api/auth/")) return false;
  if (!config.authEnabled) return false;
  const service = getAuthService(config);
  const method = req.method || "GET";

  if (pathname === "/api/auth/register" && method === "POST") {
    verifyWriteRequest(req, config);
    sendJson(res, 202, await service.register(await readBody(req, config), req));
    return true;
  }

  if (pathname === "/api/auth/resend-verification" && method === "POST") {
    verifyWriteRequest(req, config);
    sendJson(res, 202, await service.resendVerification(await readBody(req, config), req));
    return true;
  }

  if (pathname === "/api/auth/verify-email" && method === "POST") {
    verifyWriteRequest(req, config);
    sendJson(res, 200, await service.verifyEmail(await readBody(req, config), req));
    return true;
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    verifyWriteRequest(req, config);
    const result = await service.login(await readBody(req, config), req);
    sendJson(
      res,
      200,
      {
        user: result.user,
        emailVerificationRequired: result.emailVerificationRequired,
      },
      setCookieHeaders(sessionCookies(config, result.session)),
    );
    return true;
  }

  if (pathname === "/api/auth/me" && method === "GET") {
    const authContext = await service.authenticateRequest(req, { optional: true });
    sendJson(res, 200, {
      authEnabled: config.authEnabled,
      user: authContext ? service.safeUser(authContext.user) : null,
    });
    return true;
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    verifyWriteRequest(req, config);
    const authContext = await service.authenticateRequest(req, { optional: true });
    if (authContext) service.requireCsrf(req, authContext);
    await service.logout(req, authContext);
    sendNoContent(res, setCookieHeaders(clearSessionCookies(config)));
    return true;
  }

  if (pathname === "/api/auth/forgot-password" && method === "POST") {
    verifyWriteRequest(req, config);
    sendJson(res, 202, await service.forgotPassword(await readBody(req, config), req));
    return true;
  }

  if (pathname === "/api/auth/reset-password" && method === "POST") {
    verifyWriteRequest(req, config);
    sendJson(
      res,
      200,
      await service.resetPassword(await readBody(req, config), req),
      setCookieHeaders(clearSessionCookies(config)),
    );
    return true;
  }

  if (pathname === "/api/auth/change-password" && method === "POST") {
    verifyWriteRequest(req, config);
    const authContext = await service.authenticateRequest(req);
    service.requireCsrf(req, authContext);
    const result = await service.changePassword(await readBody(req, config), req, authContext);
    sendJson(
      res,
      200,
      { message: result.message, user: result.user },
      setCookieHeaders(sessionCookies(config, result.session)),
    );
    return true;
  }

  if (pathname === "/api/auth/sessions" && method === "GET") {
    const authContext = await service.authenticateRequest(req);
    sendJson(res, 200, { items: await service.listSessions(authContext) });
    return true;
  }

  const sessionMatch = pathname.match(/^\/api\/auth\/sessions\/([A-Za-z0-9_-]+)$/);
  if (sessionMatch && method === "DELETE") {
    verifyWriteRequest(req, config);
    const authContext = await service.authenticateRequest(req);
    service.requireCsrf(req, authContext);
    const result = await service.revokeSession(sessionMatch[1], authContext);
    if (result.currentSessionRevoked) {
      sendNoContent(res, setCookieHeaders(clearSessionCookies(config)));
    } else {
      sendNoContent(res);
    }
    return true;
  }

  return false;
}

module.exports = {
  handleAuthApi,
};
