"use strict";

const { createHttpError } = require("../security");
const { createMembershipRepository } = require("./repository");

const serviceCache = new WeakMap();
const ACTIVE_MEMBERSHIP_STATUSES = new Set(["trialing", "active", "granted", "lifetime"]);

function isWithinRange(record, now = Date.now()) {
  const startsAt = record.startsAt ? new Date(record.startsAt).getTime() : 0;
  const endsAt = record.endsAt ? new Date(record.endsAt).getTime() : Number.POSITIVE_INFINITY;
  return startsAt <= now && endsAt > now;
}

function effectiveMembershipStatus(record, now = Date.now()) {
  if (!record) return "free";
  if (record.status === "lifetime") return "lifetime";
  if (record.status === "paused") return "paused";
  if (record.status === "canceled") return "canceled";
  if (record.endsAt && new Date(record.endsAt).getTime() <= now) return "expired";
  if (!ACTIVE_MEMBERSHIP_STATUSES.has(record.status) || !isWithinRange(record, now)) {
    return record.status === "expired" ? "expired" : record.status;
  }
  return record.status;
}

function membershipIsActive(record, now = Date.now()) {
  if (!record || !ACTIVE_MEMBERSHIP_STATUSES.has(record.status)) return false;
  return record.status === "lifetime" || isWithinRange(record, now);
}

function periodKey(period, now = new Date()) {
  if (period === "daily") return now.toISOString().slice(0, 10);
  if (period === "monthly") return now.toISOString().slice(0, 7);
  return "lifetime";
}

function reasonForCode(code) {
  const reasons = {
    AUTH_REQUIRED: "登录后可用",
    EMAIL_NOT_VERIFIED: "完成邮箱验证后可用",
    FEATURE_DISABLED: "功能当前未开放",
    MEMBERSHIP_REQUIRED: "当前套餐不包含此功能",
    ENTITLEMENT_DENIED: "该账号已被单独限制此功能",
    QUOTA_EXCEEDED: "当前周期配额已用完",
  };
  return reasons[code] || "功能暂不可用";
}

function createMembershipService(config) {
  const repository = createMembershipRepository(config);

  async function getActiveMembership(userId) {
    await repository.ensureSeeded();
    const [memberships, plans] = await Promise.all([
      repository.memberships.list((row) => row.userId === userId),
      repository.plans.list((row) => row.active !== false),
    ]);
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const active = memberships
      .filter((membership) => membershipIsActive(membership))
      .map((membership) => ({ membership, plan: planById.get(membership.planId) }))
      .filter((item) => item.plan)
      .sort(
        (left, right) =>
          (right.plan.rank || 0) - (left.plan.rank || 0) ||
          new Date(right.membership.updatedAt) - new Date(left.membership.updatedAt),
      )[0];
    if (active) {
      return {
        ...active.membership,
        effectiveStatus: effectiveMembershipStatus(active.membership),
        plan: active.plan,
      };
    }
    const freePlan = plans.find((plan) => plan.isDefault) || plans.find((plan) => plan.slug === "free") || null;
    return {
      id: null,
      userId,
      planId: freePlan?.id || null,
      status: "free",
      effectiveStatus: "free",
      source: "default",
      startsAt: null,
      endsAt: null,
      plan: freePlan,
    };
  }

  async function getMembershipSummary(userId) {
    const activeMembership = await getActiveMembership(userId);
    if (activeMembership.id) return activeMembership;

    const [memberships, plans] = await Promise.all([
      repository.memberships.list((row) => row.userId === userId),
      repository.plans.list(),
    ]);
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const latest = memberships
      .map((membership) => ({ membership, plan: planById.get(membership.planId) }))
      .filter((item) => item.plan)
      .sort(
        (left, right) =>
          new Date(right.membership.updatedAt || right.membership.createdAt || 0) -
          new Date(left.membership.updatedAt || left.membership.createdAt || 0),
      )[0];
    if (!latest) return activeMembership;
    return {
      ...latest.membership,
      effectiveStatus: effectiveMembershipStatus(latest.membership),
      plan: latest.plan,
    };
  }

  async function getUsage(userId, featureKey, quotaPeriod) {
    if (!quotaPeriod) return { used: 0, periodKey: null };
    const key = periodKey(quotaPeriod);
    const row = await repository.usage.findOne(
      (item) => item.userId === userId && item.featureKey === featureKey && item.periodKey === key,
    );
    return { used: row?.count || 0, periodKey: key };
  }

  async function resolveFeature(user, featureKey) {
    await repository.ensureSeeded();
    const feature = await repository.features.findOne((row) => row.key === featureKey);
    if (!feature || feature.active === false) {
      return result(false, "FEATURE_DISABLED", featureKey, feature);
    }
    if (feature.defaultAccess === "public") return result(true, null, featureKey, feature, { source: "public" });
    if (!user) return result(false, "AUTH_REQUIRED", featureKey, feature);
    if (feature.defaultAccess === "authenticated") {
      return result(true, null, featureKey, feature, { source: "authenticated" });
    }
    if (!user.emailVerifiedAt) return result(false, "EMAIL_NOT_VERIFIED", featureKey, feature);
    if (user.role === "admin") {
      return result(true, null, featureKey, feature, { source: "admin", quotaLimit: null, quotaPeriod: null });
    }

    const entitlements = await repository.entitlements.list(
      (row) => row.userId === user.id && row.featureKey === featureKey && isWithinRange(row),
    );
    const entitlement = entitlements.sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))[0];
    if (entitlement && entitlement.allowed === false) {
      return result(false, "ENTITLEMENT_DENIED", featureKey, feature, { source: "user_entitlement" });
    }
    if (entitlement && entitlement.allowed === true) {
      const usage = await getUsage(user.id, featureKey, entitlement.quotaPeriod);
      return withQuota(
        result(true, null, featureKey, feature, {
          source: "user_entitlement",
          quotaLimit: entitlement.quotaLimit ?? null,
          quotaPeriod: entitlement.quotaPeriod || null,
          ...usage,
        }),
      );
    }

    if (feature.defaultAccess === "verified") {
      return result(true, null, featureKey, feature, { source: feature.defaultAccess });
    }

    const activeMembership = await getActiveMembership(user.id);
    const planFeature = activeMembership.planId
      ? await repository.planFeatures.findOne(
          (row) => row.planId === activeMembership.planId && row.featureKey === featureKey,
        )
      : null;
    if (!planFeature || !planFeature.enabled) {
      return result(false, "MEMBERSHIP_REQUIRED", featureKey, feature, {
        source: "plan",
        planId: activeMembership.planId,
      });
    }
    const usage = await getUsage(user.id, featureKey, planFeature.quotaPeriod);
    return withQuota(
      result(true, null, featureKey, feature, {
        source: "plan",
        planId: activeMembership.planId,
        quotaLimit: planFeature.quotaLimit ?? null,
        quotaPeriod: planFeature.quotaPeriod || null,
        ...usage,
      }),
    );
  }

  function result(allowed, code, featureKey, feature, extra = {}) {
    return {
      featureKey,
      name: feature?.name || featureKey,
      allowed,
      code,
      reason: code ? reasonForCode(code) : null,
      quotaLimit: null,
      quotaPeriod: null,
      used: 0,
      remaining: null,
      ...extra,
    };
  }

  function withQuota(value) {
    if (value.quotaLimit === null || value.quotaLimit === undefined) return value;
    const remaining = Math.max(value.quotaLimit - value.used, 0);
    return {
      ...value,
      allowed: value.allowed && remaining > 0,
      code: remaining > 0 ? value.code : "QUOTA_EXCEEDED",
      reason: remaining > 0 ? value.reason : reasonForCode("QUOTA_EXCEEDED"),
      remaining,
    };
  }

  async function requireFeature(user, featureKey) {
    const access = await resolveFeature(user, featureKey);
    if (!access.allowed) {
      const status = access.code === "AUTH_REQUIRED" ? 401 : access.code === "QUOTA_EXCEEDED" ? 429 : 403;
      const error = createHttpError(status, access.code, access.reason);
      error.feature = access;
      throw error;
    }
    return access;
  }

  async function consumeFeatureUsage(user, featureKey, amount = 1) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
      throw createHttpError(422, "INVALID_USAGE_AMOUNT", "使用量参数不正确");
    }
    const access = await requireFeature(user, featureKey);
    if (!access.quotaPeriod || access.quotaLimit === null) return { ...access, consumed: amount };
    const key = periodKey(access.quotaPeriod);
    const updated = await repository.usage.transaction((rows) => {
      let row = rows.find(
        (item) => item.userId === user.id && item.featureKey === featureKey && item.periodKey === key,
      );
      const current = row?.count || 0;
      if (current + amount > access.quotaLimit) return null;
      const now = new Date().toISOString();
      if (!row) {
        row = {
          id: `use_${user.id}_${featureKey.replace(/[^a-z0-9]/gi, "_")}_${key}`,
          userId: user.id,
          featureKey,
          periodKey: key,
          period: access.quotaPeriod,
          count: 0,
          createdAt: now,
          updatedAt: now,
        };
        rows.push(row);
      }
      row.count += amount;
      row.updatedAt = now;
      return structuredClone(row);
    });
    if (!updated) throw createHttpError(429, "QUOTA_EXCEEDED", reasonForCode("QUOTA_EXCEEDED"));
    return {
      ...access,
      consumed: amount,
      used: updated.count,
      remaining: Math.max(access.quotaLimit - updated.count, 0),
    };
  }

  async function refundFeatureUsage(user, featureKey, amount = 1) {
    const access = await resolveFeature(user, featureKey);
    if (!access.quotaPeriod || access.quotaLimit === null) return access;
    const key = periodKey(access.quotaPeriod);
    await repository.usage.transaction((rows) => {
      const row = rows.find(
        (item) => item.userId === user.id && item.featureKey === featureKey && item.periodKey === key,
      );
      if (row) {
        row.count = Math.max(0, (row.count || 0) - amount);
        row.updatedAt = new Date().toISOString();
      }
    });
    return resolveFeature(user, featureKey);
  }

  async function getMembershipContext(user) {
    await repository.ensureSeeded();
    const [membership, features] = await Promise.all([
      getMembershipSummary(user.id),
      repository.features.list((row) => row.active !== false),
    ]);
    const capabilities = await Promise.all(features.map((feature) => resolveFeature(user, feature.key)));
    return {
      membership: {
        id: membership.id,
        status: membership.effectiveStatus,
        source: membership.source,
        startsAt: membership.startsAt,
        endsAt: membership.endsAt,
        plan: membership.plan,
      },
      capabilities,
    };
  }

  async function listFeatureAccess(user = null) {
    await repository.ensureSeeded();
    const features = await repository.features.list((row) => row.active !== false);
    return Promise.all(features.map((feature) => resolveFeature(user, feature.key)));
  }

  return {
    consumeFeatureUsage,
    effectiveMembershipStatus,
    getActiveMembership,
    getMembershipSummary,
    getMembershipContext,
    listFeatureAccess,
    repository,
    refundFeatureUsage,
    requireFeature,
    resolveFeature,
  };
}

function getMembershipService(config) {
  if (!serviceCache.has(config)) serviceCache.set(config, createMembershipService(config));
  return serviceCache.get(config);
}

module.exports = {
  ACTIVE_MEMBERSHIP_STATUSES,
  createMembershipService,
  effectiveMembershipStatus,
  getMembershipService,
  isWithinRange,
  membershipIsActive,
  periodKey,
};
