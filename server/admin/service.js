"use strict";

const { createId } = require("../data/json-collection-repository");
const { createHttpError } = require("../security");
const { getAuthService } = require("../auth/service");
const { normalizeEmail } = require("../auth/identity");
const { getMembershipService } = require("../membership/service");
const { getWechatService } = require("../wechat/service");
const {
  parseEntitlement,
  parseFeature,
  parseMembership,
  parsePlan,
  parsePlanFeature,
  parseUserUpdate,
} = require("./validation");

const serviceCache = new WeakMap();

function createAdminService(config) {
  const auth = getAuthService(config);
  const membership = getMembershipService(config);
  const repository = membership.repository;
  const wechat = getWechatService(config);

  async function audit(authContext, action, targetUserId, metadata = {}) {
    return auth.audit.record({
      actorUserId: authContext.user.id,
      targetUserId: targetUserId || null,
      action,
      ipHash: auth.contextFromRequest(authContext.req).ipHash,
      userAgent: auth.contextFromRequest(authContext.req).userAgent,
      metadata,
    });
  }

  async function listUsers() {
    await repository.ensureSeeded();
    const users = await auth.repository.users.list();
    const rows = await Promise.all(
      users.map(async (user) => {
        const activeMembership = await membership.getMembershipSummary(user.id);
        return {
          ...auth.safeUser(user),
          membership: {
            id: activeMembership.id,
            status: activeMembership.effectiveStatus,
            startsAt: activeMembership.startsAt,
            endsAt: activeMembership.endsAt,
            plan: activeMembership.plan,
          },
        };
      }),
    );
    return rows.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  }

  async function updateUser(id, body, authContext) {
    const input = parseUserUpdate(body);
    const existing = await auth.repository.users.findById(id);
    if (!existing) throw createHttpError(404, "USER_NOT_FOUND", "用户不存在");
    const protectedOwner = config.adminEmails.includes(normalizeEmail(existing.email));
    if (
      protectedOwner &&
      ((input.status && input.status !== "active") || input.role === "user" || input.emailVerified === false)
    ) {
      throw createHttpError(409, "SUPER_ADMIN_PROTECTED", "站点所有者账号不能被冻结、降级或取消邮箱验证");
    }
    if (id === authContext.user.id && input.status && input.status !== "active") {
      throw createHttpError(409, "SELF_LOCKOUT_BLOCKED", "不能停用当前登录的管理员账号");
    }
    if (id === authContext.user.id && input.role === "user") {
      throw createHttpError(409, "SELF_DEMOTION_BLOCKED", "不能移除当前登录账号的管理员权限");
    }
    const patch = { ...input };
    delete patch.emailVerified;
    if (input.emailVerified !== undefined) {
      patch.emailVerifiedAt = input.emailVerified ? existing.emailVerifiedAt || new Date().toISOString() : null;
    }
    const updated = await auth.repository.users.updateById(id, patch);
    if (input.status && input.status !== "active") {
      await auth.repository.revokeAllUserSessions(id, { reason: `account_${input.status}` });
    }
    await audit(authContext, "admin.user_updated", id, {
      status: input.status,
      role: input.role,
      emailVerified: input.emailVerified,
    });
    return auth.safeUser(updated);
  }

  async function listPlans() {
    await repository.ensureSeeded();
    return repository.plans.list();
  }

  async function createPlan(body, authContext) {
    const input = parsePlan(body);
    const created = await repository.plans.transaction((rows) => {
      if (rows.some((row) => row.slug === input.slug)) return null;
      const now = new Date().toISOString();
      const row = { ...input, active: input.active !== false, isDefault: false, id: createId("plan"), createdAt: now, updatedAt: now };
      rows.push(row);
      return structuredClone(row);
    });
    if (!created) throw createHttpError(409, "PLAN_EXISTS", "套餐标识已存在");
    await audit(authContext, "admin.plan_created", null, { planId: created.id, slug: created.slug });
    return created;
  }

  async function updatePlan(id, body, authContext) {
    const input = parsePlan(body, true);
    const existing = await repository.plans.findById(id);
    if (!existing) throw createHttpError(404, "PLAN_NOT_FOUND", "套餐不存在");
    if (input.slug) {
      const duplicate = await repository.plans.findOne((row) => row.id !== id && row.slug === input.slug);
      if (duplicate) throw createHttpError(409, "PLAN_EXISTS", "套餐标识已存在");
    }
    if (existing.isDefault && input.active === false) {
      throw createHttpError(409, "DEFAULT_PLAN_REQUIRED", "默认免费套餐不能停用");
    }
    const updated = await repository.plans.updateById(id, input);
    await audit(authContext, "admin.plan_updated", null, { planId: id, changes: input });
    return updated;
  }

  async function listFeatures() {
    await repository.ensureSeeded();
    return repository.features.list();
  }

  async function createFeature(body, authContext) {
    const input = parseFeature(body);
    const created = await repository.features.transaction((rows) => {
      if (rows.some((row) => row.key === input.key)) return null;
      const now = new Date().toISOString();
      const row = { ...input, active: input.active !== false, id: createId("feature"), createdAt: now, updatedAt: now };
      rows.push(row);
      return structuredClone(row);
    });
    if (!created) throw createHttpError(409, "FEATURE_EXISTS", "功能标识已存在");
    await audit(authContext, "admin.feature_created", null, { featureKey: created.key });
    return created;
  }

  async function updateFeature(id, body, authContext) {
    const input = parseFeature(body, true);
    const existing = await repository.features.findById(id);
    if (!existing) throw createHttpError(404, "FEATURE_NOT_FOUND", "功能不存在");
    if (input.key && input.key !== existing.key) {
      const duplicate = await repository.features.findOne((row) => row.key === input.key);
      if (duplicate) throw createHttpError(409, "FEATURE_EXISTS", "功能标识已存在");
      const inUse = await repository.planFeatures.findOne((row) => row.featureKey === existing.key);
      if (inUse) throw createHttpError(409, "FEATURE_KEY_IN_USE", "已配置套餐的功能标识不能直接修改");
    }
    const updated = await repository.features.updateById(id, input);
    await audit(authContext, "admin.feature_updated", null, { featureKey: updated.key, changes: input });
    return updated;
  }

  async function listPlanFeatures() {
    await repository.ensureSeeded();
    return repository.planFeatures.list();
  }

  async function setPlanFeature(planId, featureKey, body, authContext) {
    const input = parsePlanFeature(body);
    const [plan, feature] = await Promise.all([
      repository.plans.findById(planId),
      repository.features.findOne((row) => row.key === featureKey),
    ]);
    if (!plan) throw createHttpError(404, "PLAN_NOT_FOUND", "套餐不存在");
    if (!feature) throw createHttpError(404, "FEATURE_NOT_FOUND", "功能不存在");
    const updated = await repository.planFeatures.transaction((rows) => {
      const now = new Date().toISOString();
      let row = rows.find((item) => item.planId === planId && item.featureKey === featureKey);
      if (!row) {
        row = { id: createId("pf"), planId, featureKey, createdAt: now, updatedAt: now, ...input };
        rows.push(row);
      } else {
        Object.assign(row, input, { updatedAt: now });
      }
      return structuredClone(row);
    });
    await audit(authContext, "admin.plan_feature_updated", null, { planId, featureKey, ...input });
    return updated;
  }

  async function listMemberships() {
    return repository.memberships.list();
  }

  async function grantMembership(body, authContext) {
    const input = parseMembership(body);
    const [user, plan] = await Promise.all([
      auth.repository.users.findById(input.userId),
      repository.plans.findById(input.planId),
    ]);
    if (!user) throw createHttpError(404, "USER_NOT_FOUND", "用户不存在");
    if (!plan || plan.active === false) throw createHttpError(404, "PLAN_NOT_FOUND", "套餐不存在或已停用");
    const created = await repository.memberships.insert({
      ...input,
      source: "admin_grant",
      canceledAt: null,
      pausedAt: input.status === "paused" ? new Date().toISOString() : null,
      createdBy: authContext.user.id,
    });
    await audit(authContext, "admin.membership_created", input.userId, {
      membershipId: created.id,
      planId: input.planId,
      status: input.status,
      endsAt: input.endsAt,
    });
    return created;
  }

  async function updateMembership(id, body, authContext) {
    const input = parseMembership(body, true);
    delete input.userId;
    const existing = await repository.memberships.findById(id);
    if (!existing) throw createHttpError(404, "MEMBERSHIP_NOT_FOUND", "会员记录不存在");
    if (input.planId) {
      const plan = await repository.plans.findById(input.planId);
      if (!plan) throw createHttpError(404, "PLAN_NOT_FOUND", "套餐不存在");
    }
    const patch = { ...input };
    if (input.status === "paused") patch.pausedAt = new Date().toISOString();
    if (input.status === "canceled") patch.canceledAt = new Date().toISOString();
    const updated = await repository.memberships.updateById(id, patch);
    await audit(authContext, "admin.membership_updated", existing.userId, { membershipId: id, changes: input });
    return updated;
  }

  async function listEntitlements() {
    return repository.entitlements.list();
  }

  async function listWechatAccounts() {
    if (!config.wechat.enabled) return [];
    const users = await auth.repository.users.list();
    const emailById = new Map(users.map((user) => [user.id, user.email]));
    return (await wechat.listAccountsForAdmin()).map((account) => ({
      ...account,
      userEmail: emailById.get(account.userId) || null,
    }));
  }

  async function createEntitlement(body, authContext) {
    const input = parseEntitlement(body);
    const [user, feature] = await Promise.all([
      auth.repository.users.findById(input.userId),
      repository.features.findOne((row) => row.key === input.featureKey),
    ]);
    if (!user) throw createHttpError(404, "USER_NOT_FOUND", "用户不存在");
    if (!feature) throw createHttpError(404, "FEATURE_NOT_FOUND", "功能不存在");
    const created = await repository.entitlements.insert({
      ...input,
      startsAt: input.startsAt || new Date().toISOString(),
      endsAt: input.endsAt || null,
      quotaLimit: input.quotaLimit ?? null,
      quotaPeriod: input.quotaPeriod || null,
      createdBy: authContext.user.id,
    });
    await audit(authContext, "admin.entitlement_created", input.userId, {
      entitlementId: created.id,
      featureKey: input.featureKey,
      allowed: input.allowed,
    });
    return created;
  }

  async function updateEntitlement(id, body, authContext) {
    const input = parseEntitlement(body, true);
    delete input.userId;
    const existing = await repository.entitlements.findById(id);
    if (!existing) throw createHttpError(404, "ENTITLEMENT_NOT_FOUND", "用户特殊授权不存在");
    if (input.featureKey) {
      const feature = await repository.features.findOne((row) => row.key === input.featureKey);
      if (!feature) throw createHttpError(404, "FEATURE_NOT_FOUND", "功能不存在");
    }
    const updated = await repository.entitlements.updateById(id, input);
    await audit(authContext, "admin.entitlement_updated", existing.userId, { entitlementId: id, changes: input });
    return updated;
  }

  async function deleteEntitlement(id, authContext) {
    const removed = await repository.entitlements.removeById(id);
    if (!removed) throw createHttpError(404, "ENTITLEMENT_NOT_FOUND", "用户特殊授权不存在");
    await audit(authContext, "admin.entitlement_deleted", removed.userId, {
      entitlementId: id,
      featureKey: removed.featureKey,
    });
  }

  return {
    createEntitlement,
    createFeature,
    createPlan,
    deleteEntitlement,
    grantMembership,
    listEntitlements,
    listFeatures,
    listMemberships,
    listPlanFeatures,
    listPlans,
    listUsers,
    listWechatAccounts,
    setPlanFeature,
    updateEntitlement,
    updateFeature,
    updateMembership,
    updatePlan,
    updateUser,
  };
}

function getAdminService(config) {
  if (!serviceCache.has(config)) serviceCache.set(config, createAdminService(config));
  return serviceCache.get(config);
}

module.exports = {
  createAdminService,
  getAdminService,
};
