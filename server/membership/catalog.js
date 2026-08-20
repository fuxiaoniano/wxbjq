"use strict";

const DEFAULT_PLANS = Object.freeze([
  {
    id: "plan_free",
    slug: "free",
    name: "免费用户",
    description: "保留编辑器现有基础能力",
    rank: 0,
    active: true,
    isDefault: true,
  },
  {
    id: "plan_pro",
    slug: "pro",
    name: "专业会员",
    description: "适合个人公众号运营者",
    rank: 100,
    active: true,
    isDefault: false,
  },
  {
    id: "plan_business",
    slug: "business",
    name: "团队会员",
    description: "适合需要管理多个公众号的团队",
    rank: 200,
    active: true,
    isDefault: false,
  },
]);

const DEFAULT_FEATURES = Object.freeze([
  {
    id: "feature_wechat_account_bind",
    key: "wechat.account.bind",
    name: "绑定微信公众号",
    description: "绑定并管理微信公众号",
    defaultAccess: "plan",
    active: true,
  },
  {
    id: "feature_wechat_account_multiple",
    key: "wechat.account.multiple",
    name: "绑定多个公众号",
    description: "同一账号管理多个微信公众号",
    defaultAccess: "plan",
    active: true,
  },
  {
    id: "feature_wechat_draft_create",
    key: "wechat.draft.create",
    name: "保存到公众号草稿箱",
    description: "把编辑器文章保存到指定公众号草稿箱",
    defaultAccess: "plan",
    active: true,
  },
  {
    id: "feature_editor_premium_placeholder",
    key: "editor.premium.xxx",
    name: "高级编辑功能预留",
    description: "供后续高级编辑功能复用统一权限判断",
    defaultAccess: "plan",
    active: true,
  },
]);

const DEFAULT_PLAN_FEATURES = Object.freeze([
  {
    id: "pf_pro_wechat_bind",
    planId: "plan_pro",
    featureKey: "wechat.account.bind",
    enabled: true,
    quotaLimit: 1,
    quotaPeriod: "lifetime",
  },
  {
    id: "pf_pro_wechat_multiple",
    planId: "plan_pro",
    featureKey: "wechat.account.multiple",
    enabled: false,
    quotaLimit: null,
    quotaPeriod: null,
  },
  {
    id: "pf_pro_wechat_draft",
    planId: "plan_pro",
    featureKey: "wechat.draft.create",
    enabled: true,
    quotaLimit: 100,
    quotaPeriod: "monthly",
  },
  {
    id: "pf_pro_editor_premium",
    planId: "plan_pro",
    featureKey: "editor.premium.xxx",
    enabled: true,
    quotaLimit: null,
    quotaPeriod: null,
  },
  {
    id: "pf_business_wechat_bind",
    planId: "plan_business",
    featureKey: "wechat.account.bind",
    enabled: true,
    quotaLimit: 10,
    quotaPeriod: "lifetime",
  },
  {
    id: "pf_business_wechat_multiple",
    planId: "plan_business",
    featureKey: "wechat.account.multiple",
    enabled: true,
    quotaLimit: 10,
    quotaPeriod: "lifetime",
  },
  {
    id: "pf_business_wechat_draft",
    planId: "plan_business",
    featureKey: "wechat.draft.create",
    enabled: true,
    quotaLimit: 1000,
    quotaPeriod: "monthly",
  },
  {
    id: "pf_business_editor_premium",
    planId: "plan_business",
    featureKey: "editor.premium.xxx",
    enabled: true,
    quotaLimit: null,
    quotaPeriod: null,
  },
]);

module.exports = {
  DEFAULT_FEATURES,
  DEFAULT_PLANS,
  DEFAULT_PLAN_FEATURES,
};
