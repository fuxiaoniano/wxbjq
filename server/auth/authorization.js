"use strict";

const { createHttpError } = require("../security");
const { getMembershipService } = require("../membership/service");
const { getAuthService } = require("./service");

async function requireAuth(req, config) {
  return getAuthService(config).authenticateRequest(req);
}

function requireVerifiedEmail(authContext) {
  if (!authContext.user.emailVerifiedAt) {
    throw createHttpError(403, "EMAIL_NOT_VERIFIED", "请先完成邮箱验证");
  }
  return authContext;
}

function requireAdmin(authContext) {
  if (authContext.user.role !== "admin") {
    throw createHttpError(403, "ADMIN_REQUIRED", "需要管理员权限");
  }
  return authContext;
}

async function requireFeature(req, config, featureKey) {
  const authContext = requireVerifiedEmail(await requireAuth(req, config));
  const feature = await getMembershipService(config).requireFeature(authContext.user, featureKey);
  return { authContext, feature };
}

async function checkQuota(req, config, featureKey) {
  const authContext = requireVerifiedEmail(await requireAuth(req, config));
  const feature = await getMembershipService(config).requireFeature(authContext.user, featureKey);
  return { authContext, feature };
}

module.exports = {
  requireAdmin,
  requireAuth,
  requireFeature,
  requireVerifiedEmail,
  checkQuota,
};
