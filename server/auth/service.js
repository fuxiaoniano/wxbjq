"use strict";

const crypto = require("crypto");
const { createAuditService } = require("../audit/service");
const { createEmailService } = require("../email/service");
const { consumeRateLimit, createHttpError, getRequestIp } = require("../security");
const { verifyAutomationGuard } = require("./automation-guard");
const { parseCookies } = require("./cookies");
const { normalizeEmail } = require("./identity");
const { hashPassword, passwordNeedsRehash, verifyPassword } = require("./password");
const { createAuthRepository } = require("./repository");
const { generateOpaqueToken, hashOpaqueToken, safeEqual } = require("./tokens");
const {
  parseChangePassword,
  parseEmailOnly,
  parseLogin,
  parseRegister,
  parseResetPassword,
  parseToken,
} = require("./validation");

const serviceCache = new WeakMap();
const GENERIC_REGISTRATION_MESSAGE = "如果该邮箱可以注册，我们已经发送了验证邮件，请前往邮箱查看。";
const GENERIC_EMAIL_MESSAGE = "如果该邮箱对应有效账号，我们已经发送了邮件，请前往邮箱查看。";

function effectiveRole(config, user) {
  return config.adminEmails.includes(normalizeEmail(user.email)) ? "admin" : user.role || "user";
}

function isSuperAdmin(config, user) {
  return config.adminEmails.includes(normalizeEmail(user.email));
}

function safeUser(config, user) {
  if (!user) return null;
  const role = effectiveRole(config, user);
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt || null,
    status: user.status,
    role,
    isAdmin: role === "admin",
    isSuperAdmin: isSuperAdmin(config, user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function createAuthService(config) {
  const repository = createAuthRepository(config);
  const audit = createAuditService(config);
  const email = createEmailService(config);
  const passwordHashOptions = config.passwordHashOptions || {};
  const dummyPasswordHash = hashPassword(generateOpaqueToken(), passwordHashOptions);

  function contextFromRequest(req) {
    const ip = getRequestIp(req, config);
    return {
      ip,
      ipHash: hashOpaqueToken(ip, config.sessionSecret),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 240),
    };
  }

  function consumeAuthLimit(req, bucket, limit, windowMs, identifier = "", options = {}) {
    const ip = getRequestIp(req, config);
    const suffix = identifier
      ? crypto.createHash("sha256").update(identifier).digest("base64url").slice(0, 18)
      : "";
    const accepted = consumeRateLimit(req, bucket, limit, {
      config,
      windowMs,
      identifier: `${options.includeIp === false ? "account" : ip}:${suffix}`,
    });
    if (!accepted) throw createHttpError(429, "TOO_MANY_REQUESTS", "请求过于频繁，请稍后再试");
  }

  async function issueVerification(user) {
    const rawToken = generateOpaqueToken();
    await repository.replaceEmailVerificationToken({
      userId: user.id,
      tokenHash: hashOpaqueToken(rawToken, config.sessionSecret),
      expiresAt: new Date(Date.now() + config.emailVerificationTtlMs).toISOString(),
      usedAt: null,
      invalidatedAt: null,
    });
    await email.sendVerification(user.email, rawToken);
  }

  async function issuePasswordReset(user) {
    const rawToken = generateOpaqueToken();
    await repository.replacePasswordResetToken({
      userId: user.id,
      tokenHash: hashOpaqueToken(rawToken, config.sessionSecret),
      expiresAt: new Date(Date.now() + config.passwordResetTtlMs).toISOString(),
      usedAt: null,
      invalidatedAt: null,
    });
    await email.sendPasswordReset(user.email, rawToken);
  }

  async function register(body, req) {
    if (!config.authEnabled) throw createHttpError(404, "NOT_FOUND", "接口不存在");
    if (!config.registrationEnabled) throw createHttpError(403, "REGISTRATION_DISABLED", "当前未开放自助注册");
    const input = parseRegister(body, config);
    consumeAuthLimit(req, "auth-register", config.authRateLimits.registerPerHour, 60 * 60 * 1000);
    consumeAuthLimit(
      req,
      "auth-register-email",
      config.authRateLimits.emailPerHour,
      60 * 60 * 1000,
      input.email,
      { includeIp: false },
    );
    await verifyAutomationGuard(config, input, contextFromRequest(req));

    const existing = await repository.findUserByEmail(input.email);
    if (existing) {
      await audit.record({
        action: "auth.register",
        outcome: "ignored_existing",
        ipHash: contextFromRequest(req).ipHash,
        userAgent: contextFromRequest(req).userAgent,
        metadata: { emailHash: hashOpaqueToken(input.email, config.sessionSecret) },
      });
      return { message: GENERIC_REGISTRATION_MESSAGE };
    }

    const passwordHash = await hashPassword(input.password, passwordHashOptions);
    const user = await repository.createUser({
      email: input.email,
      normalizedEmail: input.email,
      passwordHash,
      emailVerifiedAt: null,
      status: "active",
      role: config.adminEmails.includes(input.email) ? "admin" : "user",
      failedLoginCount: 0,
      lastLoginAt: null,
      passwordChangedAt: null,
      termsAcceptedAt: new Date().toISOString(),
      termsVersion: config.termsVersion,
    });
    if (!user) return { message: GENERIC_REGISTRATION_MESSAGE };

    const requestContext = contextFromRequest(req);
    await audit.record({
      actorUserId: user.id,
      targetUserId: user.id,
      action: "auth.register",
      ipHash: requestContext.ipHash,
      userAgent: requestContext.userAgent,
    });
    try {
      await issueVerification(user);
    } catch (error) {
      await audit.record({
        actorUserId: user.id,
        targetUserId: user.id,
        action: "auth.verification_email",
        outcome: "failed",
        ipHash: requestContext.ipHash,
        metadata: { provider: email.providerName, errorCode: error.code || "EMAIL_SEND_FAILED" },
      });
      throw createHttpError(503, "EMAIL_DELIVERY_FAILED", "账号已创建，但验证邮件发送失败，请稍后点击重新发送");
    }
    return { message: GENERIC_REGISTRATION_MESSAGE };
  }

  async function resendVerification(body, req) {
    const input = parseEmailOnly(body);
    consumeAuthLimit(req, "auth-resend-ip", config.authRateLimits.emailPerHour, 60 * 60 * 1000);
    consumeAuthLimit(
      req,
      "auth-resend-email",
      config.authRateLimits.emailPerHour,
      60 * 60 * 1000,
      input.email,
      { includeIp: false },
    );
    const user = await repository.findUserByEmail(input.email);
    if (user && !user.emailVerifiedAt && user.status === "active") {
      try {
        await issueVerification(user);
        const requestContext = contextFromRequest(req);
        await audit.record({
          actorUserId: user.id,
          targetUserId: user.id,
          action: "auth.verification_email_resent",
          ipHash: requestContext.ipHash,
          userAgent: requestContext.userAgent,
        });
      } catch (error) {
        await audit.record({
          targetUserId: user.id,
          action: "auth.verification_email_resent",
          outcome: "failed",
          ipHash: contextFromRequest(req).ipHash,
          metadata: { errorCode: error.code || "EMAIL_SEND_FAILED" },
        });
      }
    }
    return { message: GENERIC_EMAIL_MESSAGE };
  }

  async function verifyEmail(body, req) {
    const { token } = parseToken(body);
    const consumed = await repository.consumeEmailVerificationToken(
      hashOpaqueToken(token, config.sessionSecret),
    );
    if (consumed.state === "expired") throw createHttpError(410, "TOKEN_EXPIRED", "验证链接已过期，请重新发送验证邮件");
    if (consumed.state === "used") {
      const user = consumed.record && (await repository.users.findById(consumed.record.userId));
      if (user?.emailVerifiedAt) return { message: "邮箱已经验证，无需重复操作", alreadyVerified: true };
    }
    if (consumed.state !== "valid") throw createHttpError(400, "TOKEN_INVALID", "验证链接无效或已失效");
    const now = new Date().toISOString();
    const user = await repository.users.updateById(consumed.record.userId, { emailVerifiedAt: now });
    if (!user) throw createHttpError(400, "TOKEN_INVALID", "验证链接无效或已失效");
    const requestContext = contextFromRequest(req);
    await audit.record({
      actorUserId: user.id,
      targetUserId: user.id,
      action: "auth.email_verified",
      ipHash: requestContext.ipHash,
      userAgent: requestContext.userAgent,
    });
    return { message: "邮箱验证成功，现在可以使用会员功能", user: safeUser(config, user) };
  }

  async function createSessionForUser(user, req, remember) {
    const rawToken = generateOpaqueToken();
    const csrfToken = generateOpaqueToken();
    const ttl = remember ? config.rememberSessionTtlMs : config.sessionTtlMs;
    const requestContext = contextFromRequest(req);
    const session = await repository.createSession({
      userId: user.id,
      tokenHash: hashOpaqueToken(rawToken, config.sessionSecret),
      csrfTokenHash: hashOpaqueToken(csrfToken, config.sessionSecret),
      expiresAt: new Date(Date.now() + ttl).toISOString(),
      lastSeenAt: new Date().toISOString(),
      revokedAt: null,
      revokeReason: null,
      remember,
      ipHash: requestContext.ipHash,
      ipLabel: maskIp(requestContext.ip),
      userAgent: requestContext.userAgent,
    });
    return { ...session, rawToken, csrfToken };
  }

  async function login(body, req) {
    const input = parseLogin(body);
    consumeAuthLimit(
      req,
      "auth-login-ip",
      config.authRateLimits.loginPer15Minutes * 5,
      15 * 60 * 1000,
    );
    consumeAuthLimit(
      req,
      "auth-login-account",
      config.authRateLimits.loginPer15Minutes,
      15 * 60 * 1000,
      input.email,
      { includeIp: false },
    );
    const user = await repository.findUserByEmail(input.email);
    const passwordValid = user
      ? await verifyPassword(input.password, user.passwordHash)
      : await verifyPassword(input.password, await dummyPasswordHash);
    const requestContext = contextFromRequest(req);

    if (!user || !passwordValid) {
      if (user) {
        await repository.users.updateById(user.id, {
          failedLoginCount: Math.min((user.failedLoginCount || 0) + 1, 1000),
        });
      }
      await audit.record({
        targetUserId: user?.id || null,
        action: "auth.login",
        outcome: "failed",
        ipHash: requestContext.ipHash,
        userAgent: requestContext.userAgent,
        metadata: { emailHash: hashOpaqueToken(input.email, config.sessionSecret) },
      });
      throw createHttpError(401, "INVALID_CREDENTIALS", "邮箱或密码错误");
    }
    if (user.status !== "active") {
      await audit.record({
        targetUserId: user.id,
        action: "auth.login",
        outcome: "blocked",
        ipHash: requestContext.ipHash,
        metadata: { status: user.status },
      });
      throw createHttpError(403, "ACCOUNT_UNAVAILABLE", "账号当前不可用，请联系管理员");
    }
    if (!user.emailVerifiedAt && !config.allowUnverifiedLogin) {
      throw createHttpError(403, "EMAIL_NOT_VERIFIED", "请先完成邮箱验证");
    }

    if (passwordNeedsRehash(user.passwordHash)) {
      await repository.users.updateById(user.id, {
        passwordHash: await hashPassword(input.password, passwordHashOptions),
      });
    }
    const oldContext = await authenticateRequest(req, { optional: true, allowUnavailable: true });
    if (oldContext) await repository.revokeSession(oldContext.session.id, oldContext.user.id, "login_rotated");
    const session = await createSessionForUser(user, req, input.remember);
    const updatedUser = await repository.users.updateById(user.id, {
      failedLoginCount: 0,
      lastLoginAt: new Date().toISOString(),
    });
    await audit.record({
      actorUserId: user.id,
      targetUserId: user.id,
      action: "auth.login",
      ipHash: requestContext.ipHash,
      userAgent: requestContext.userAgent,
    });
    return {
      user: safeUser(config, updatedUser || user),
      session,
      emailVerificationRequired: !user.emailVerifiedAt,
    };
  }

  async function authenticateRequest(req, options = {}) {
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[config.sessionCookieName];
    if (!rawToken) {
      if (options.optional) return null;
      throw createHttpError(401, "AUTH_REQUIRED", "请先登录");
    }
    const session = await repository.findSessionByTokenHash(
      hashOpaqueToken(rawToken, config.sessionSecret),
    );
    if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
      if (options.optional) return null;
      throw createHttpError(401, "SESSION_EXPIRED", "登录状态已失效，请重新登录");
    }
    const user = await repository.users.findById(session.userId);
    if (!user) {
      if (options.optional) return null;
      throw createHttpError(401, "SESSION_EXPIRED", "登录状态已失效，请重新登录");
    }
    if (user.status !== "active" && !options.allowUnavailable) {
      await repository.revokeSession(session.id, user.id, "account_unavailable");
      throw createHttpError(403, "ACCOUNT_UNAVAILABLE", "账号当前不可用，请联系管理员");
    }
    if (Date.now() - new Date(session.lastSeenAt).getTime() > 5 * 60 * 1000) {
      await repository.sessions.updateById(session.id, { lastSeenAt: new Date().toISOString() });
    }
    return { cookies, session, user: { ...user, role: effectiveRole(config, user) } };
  }

  function requireCsrf(req, authContext) {
    const cookieToken = authContext.cookies[config.csrfCookieName] || "";
    const headerToken = String(req.headers["x-csrf-token"] || "");
    if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
      throw createHttpError(403, "CSRF_CHECK_FAILED", "安全校验失败，请刷新页面后重试");
    }
    const providedHash = hashOpaqueToken(headerToken, config.sessionSecret);
    if (!safeEqual(providedHash, authContext.session.csrfTokenHash)) {
      throw createHttpError(403, "CSRF_CHECK_FAILED", "安全校验失败，请重新登录");
    }
  }

  async function forgotPassword(body, req) {
    const input = parseEmailOnly(body);
    consumeAuthLimit(
      req,
      "auth-password-reset-ip",
      config.authRateLimits.passwordResetPerHour,
      60 * 60 * 1000,
    );
    consumeAuthLimit(
      req,
      "auth-password-reset-email",
      config.authRateLimits.passwordResetPerHour,
      60 * 60 * 1000,
      input.email,
      { includeIp: false },
    );
    const user = await repository.findUserByEmail(input.email);
    if (user && user.status === "active") {
      try {
        await issuePasswordReset(user);
        await audit.record({
          targetUserId: user.id,
          action: "auth.password_reset_requested",
          ipHash: contextFromRequest(req).ipHash,
        });
      } catch (error) {
        await audit.record({
          targetUserId: user.id,
          action: "auth.password_reset_requested",
          outcome: "failed",
          ipHash: contextFromRequest(req).ipHash,
          metadata: { errorCode: error.code || "EMAIL_SEND_FAILED" },
        });
      }
    }
    return { message: GENERIC_EMAIL_MESSAGE };
  }

  async function resetPassword(body, req) {
    const input = parseResetPassword(body, config);
    const consumed = await repository.consumePasswordResetToken(
      hashOpaqueToken(input.token, config.sessionSecret),
    );
    if (consumed.state === "expired") throw createHttpError(410, "TOKEN_EXPIRED", "重置链接已过期，请重新申请");
    if (consumed.state !== "valid") throw createHttpError(400, "TOKEN_INVALID", "重置链接无效或已使用");
    const user = await repository.users.findById(consumed.record.userId);
    if (!user || user.status !== "active") throw createHttpError(400, "TOKEN_INVALID", "重置链接无效或已使用");
    const now = new Date().toISOString();
    await repository.users.updateById(user.id, {
      passwordHash: await hashPassword(input.password, passwordHashOptions),
      passwordChangedAt: now,
      failedLoginCount: 0,
    });
    await repository.revokeAllUserSessions(user.id, { reason: "password_reset" });
    const requestContext = contextFromRequest(req);
    await audit.record({
      actorUserId: user.id,
      targetUserId: user.id,
      action: "auth.password_reset",
      ipHash: requestContext.ipHash,
      userAgent: requestContext.userAgent,
    });
    return { message: "密码重置成功，请使用新密码登录" };
  }

  async function changePassword(body, req, authContext) {
    const input = parseChangePassword(body, config);
    if (!(await verifyPassword(input.currentPassword, authContext.user.passwordHash))) {
      throw createHttpError(400, "CURRENT_PASSWORD_INCORRECT", "当前密码不正确");
    }
    const now = new Date().toISOString();
    const updatedUser = await repository.users.updateById(authContext.user.id, {
      passwordHash: await hashPassword(input.newPassword, passwordHashOptions),
      passwordChangedAt: now,
    });
    await repository.revokeAllUserSessions(authContext.user.id, { reason: "password_changed" });
    const session = await createSessionForUser(updatedUser, req, authContext.session.remember);
    const requestContext = contextFromRequest(req);
    await audit.record({
      actorUserId: authContext.user.id,
      targetUserId: authContext.user.id,
      action: "auth.password_changed",
      ipHash: requestContext.ipHash,
      userAgent: requestContext.userAgent,
    });
    return { message: "密码修改成功，其他设备已退出登录", user: safeUser(config, updatedUser), session };
  }

  async function logout(req, authContext) {
    if (authContext) {
      await repository.revokeSession(authContext.session.id, authContext.user.id, "logout");
      const requestContext = contextFromRequest(req);
      await audit.record({
        actorUserId: authContext.user.id,
        targetUserId: authContext.user.id,
        action: "auth.logout",
        ipHash: requestContext.ipHash,
        userAgent: requestContext.userAgent,
      });
    }
  }

  async function listSessions(authContext) {
    const rows = await repository.listUserSessions(authContext.user.id);
    return rows
      .sort((left, right) => new Date(right.lastSeenAt) - new Date(left.lastSeenAt))
      .map((row) => ({
        id: row.id,
        current: row.id === authContext.session.id,
        ipLabel: row.ipLabel,
        userAgent: row.userAgent,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
        expiresAt: row.expiresAt,
      }));
  }

  async function revokeSession(sessionId, authContext) {
    const revoked = await repository.revokeSession(sessionId, authContext.user.id, "user_revoked");
    if (!revoked) throw createHttpError(404, "SESSION_NOT_FOUND", "会话不存在或已失效");
    return { currentSessionRevoked: sessionId === authContext.session.id };
  }

  return {
    audit,
    authenticateRequest,
    changePassword,
    contextFromRequest,
    forgotPassword,
    listSessions,
    login,
    logout,
    register,
    repository,
    requireCsrf,
    resendVerification,
    resetPassword,
    revokeSession,
    safeUser: (user) => safeUser(config, user),
    verifyEmail,
  };
}

function getAuthService(config) {
  if (!serviceCache.has(config)) serviceCache.set(config, createAuthService(config));
  return serviceCache.get(config);
}

function maskIp(ip) {
  const value = String(ip || "unknown");
  if (value.includes(".")) {
    const parts = value.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  }
  if (value.includes(":")) return `${value.split(":").slice(0, 3).join(":")}:*`;
  return "unknown";
}

module.exports = {
  GENERIC_EMAIL_MESSAGE,
  GENERIC_REGISTRATION_MESSAGE,
  createAuthService,
  effectiveRole,
  getAuthService,
  isSuperAdmin,
  maskIp,
  safeUser,
};
