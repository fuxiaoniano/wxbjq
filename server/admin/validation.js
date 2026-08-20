"use strict";

const { createHttpError } = require("../security");

const MEMBERSHIP_STATUSES = new Set([
  "trialing",
  "active",
  "expired",
  "canceled",
  "paused",
  "granted",
  "lifetime",
]);
const USER_STATUSES = new Set(["active", "disabled", "frozen"]);
const FEATURE_ACCESS = new Set(["public", "authenticated", "verified", "plan"]);
const QUOTA_PERIODS = new Set(["daily", "monthly", "lifetime"]);

function invalid(message) {
  throw createHttpError(422, "VALIDATION_ERROR", message);
}

function object(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("请求内容格式不正确");
  return body;
}

function text(value, name, max = 120, required = true) {
  const result = String(value ?? "").trim();
  if (required && !result) invalid(`请填写${name}`);
  if (result.length > max) invalid(`${name}不能超过 ${max} 个字符`);
  return result;
}

function dateValue(value, name, allowNull = true) {
  if ((value === null || value === "" || value === undefined) && allowNull) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) invalid(`${name}格式不正确`);
  return date.toISOString();
}

function quota(value, period) {
  if (value === null || value === "" || value === undefined) {
    return { quotaLimit: null, quotaPeriod: null };
  }
  const quotaLimit = Number(value);
  if (!Number.isInteger(quotaLimit) || quotaLimit < 0 || quotaLimit > 1_000_000) invalid("配额必须是 0-1000000 的整数");
  if (!QUOTA_PERIODS.has(period)) invalid("请选择正确的配额周期");
  return { quotaLimit, quotaPeriod: period };
}

function parseUserUpdate(body) {
  const value = object(body);
  const result = {};
  if (value.status !== undefined) {
    if (!USER_STATUSES.has(value.status)) invalid("用户状态不正确");
    result.status = value.status;
  }
  if (value.role !== undefined) {
    if (!["user", "admin"].includes(value.role)) invalid("用户角色不正确");
    result.role = value.role;
  }
  if (value.emailVerified !== undefined) result.emailVerified = value.emailVerified === true;
  if (!Object.keys(result).length) invalid("没有可更新的用户字段");
  return result;
}

function parsePlan(body, partial = false) {
  const value = object(body);
  const result = {};
  if (!partial || value.slug !== undefined) {
    const slug = text(value.slug, "套餐标识", 50);
    if (!/^[a-z][a-z0-9_-]*$/.test(slug)) invalid("套餐标识只能使用小写字母、数字、下划线和短横线");
    result.slug = slug;
  }
  if (!partial || value.name !== undefined) result.name = text(value.name, "套餐名称", 80);
  if (!partial || value.description !== undefined) result.description = text(value.description, "套餐说明", 300, false);
  if (!partial || value.rank !== undefined) {
    const rank = Number(value.rank ?? 0);
    if (!Number.isInteger(rank) || rank < 0 || rank > 10000) invalid("套餐等级必须是 0-10000 的整数");
    result.rank = rank;
  }
  if (value.active !== undefined) result.active = value.active === true;
  if (value.isDefault !== undefined) result.isDefault = value.isDefault === true;
  return result;
}

function parseFeature(body, partial = false) {
  const value = object(body);
  const result = {};
  if (!partial || value.key !== undefined) {
    const key = text(value.key, "功能标识", 100);
    if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(key)) invalid("功能标识格式不正确");
    result.key = key;
  }
  if (!partial || value.name !== undefined) result.name = text(value.name, "功能名称", 100);
  if (!partial || value.description !== undefined) result.description = text(value.description, "功能说明", 300, false);
  if (!partial || value.defaultAccess !== undefined) {
    if (!FEATURE_ACCESS.has(value.defaultAccess)) invalid("默认访问策略不正确");
    result.defaultAccess = value.defaultAccess;
  }
  if (value.active !== undefined) result.active = value.active === true;
  return result;
}

function parsePlanFeature(body) {
  const value = object(body);
  return {
    enabled: value.enabled === true,
    ...quota(value.quotaLimit, value.quotaPeriod),
  };
}

function parseMembership(body, partial = false) {
  const value = object(body);
  const result = {};
  if (!partial || value.userId !== undefined) result.userId = text(value.userId, "用户", 100);
  if (!partial || value.planId !== undefined) result.planId = text(value.planId, "套餐", 100);
  if (!partial || value.status !== undefined) {
    if (!MEMBERSHIP_STATUSES.has(value.status)) invalid("会员状态不正确");
    result.status = value.status;
  }
  if (!partial || value.startsAt !== undefined) result.startsAt = dateValue(value.startsAt || new Date(), "开始时间", false);
  if (value.endsAt !== undefined) result.endsAt = dateValue(value.endsAt, "结束时间");
  if (result.endsAt && result.startsAt && new Date(result.endsAt) <= new Date(result.startsAt)) invalid("结束时间必须晚于开始时间");
  return result;
}

function parseEntitlement(body, partial = false) {
  const value = object(body);
  const result = {};
  if (!partial || value.userId !== undefined) result.userId = text(value.userId, "用户", 100);
  if (!partial || value.featureKey !== undefined) result.featureKey = text(value.featureKey, "功能标识", 100);
  if (!partial || value.allowed !== undefined) result.allowed = value.allowed === true;
  if (value.startsAt !== undefined) result.startsAt = dateValue(value.startsAt, "开始时间");
  if (value.endsAt !== undefined) result.endsAt = dateValue(value.endsAt, "结束时间");
  if (value.quotaLimit !== undefined || value.quotaPeriod !== undefined) {
    Object.assign(result, quota(value.quotaLimit, value.quotaPeriod));
  }
  return result;
}

module.exports = {
  MEMBERSHIP_STATUSES,
  parseEntitlement,
  parseFeature,
  parseMembership,
  parsePlan,
  parsePlanFeature,
  parseUserUpdate,
};
