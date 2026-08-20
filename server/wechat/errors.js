"use strict";

const { createHttpError } = require("../security");

const TOKEN_INVALID_CODES = new Set([40001, 40014, 42001]);

const ERROR_MAP = new Map([
  [-1, ["WECHAT_TEMPORARILY_UNAVAILABLE", "微信系统暂时繁忙，请稍后重试", 503, true]],
  [40013, ["WECHAT_INVALID_APP_ID", "AppID 不正确，请检查后重试", 422, false]],
  [40125, ["WECHAT_INVALID_APP_SECRET", "AppSecret 不正确，请检查后重试", 422, false]],
  [40164, ["WECHAT_IP_NOT_WHITELISTED", "服务器 IP 不在公众号白名单中，请先在微信公众平台添加", 422, false]],
  [40243, ["WECHAT_APP_SECRET_FROZEN", "公众号 AppSecret 已冻结，请先在微信公众平台解冻", 422, false]],
  [45009, ["WECHAT_DAILY_LIMIT_REACHED", "微信接口今日调用额度已用完", 429, false]],
  [45011, ["WECHAT_RATE_LIMITED", "微信接口调用过于频繁，请稍后重试", 429, true]],
  [40007, ["WECHAT_INVALID_MEDIA", "封面素材无效，请重新选择封面", 422, false]],
  [45001, ["WECHAT_MEDIA_TOO_LARGE", "上传到微信的图片过大", 422, false]],
  [45008, ["WECHAT_DRAFT_TOO_LARGE", "文章内容超过微信草稿限制", 422, false]],
  [48001, ["WECHAT_DRAFT_PERMISSION_DENIED", "该公众号没有草稿或素材接口权限", 403, false]],
  [50004, ["WECHAT_TOKEN_API_FORBIDDEN", "该公众号当前不能使用 Access Token 接口", 422, false]],
  [50007, ["WECHAT_ACCOUNT_FROZEN", "该公众号已被冻结", 422, false]],
  [89503, ["WECHAT_ADMIN_CONFIRMATION_REQUIRED", "本次调用需要公众号管理员确认", 422, false]],
  [89506, ["WECHAT_IP_CONFIRMATION_REJECTED", "公众号管理员拒绝了该服务器 IP，请稍后再试", 422, false]],
  [89507, ["WECHAT_IP_CONFIRMATION_REJECTED", "公众号管理员拒绝了该服务器 IP，请稍后再试", 422, false]],
]);

class WechatApiError extends Error {
  constructor(errcode, internalMessage = "", options = {}) {
    const mapped = ERROR_MAP.get(Number(errcode));
    super(mapped?.[1] || "微信接口调用失败");
    this.name = "WechatApiError";
    this.errcode = Number.isFinite(Number(errcode)) ? Number(errcode) : null;
    this.code = mapped?.[0] || options.code || "WECHAT_API_ERROR";
    this.statusCode = mapped?.[2] || options.statusCode || 502;
    this.retryable = mapped?.[3] ?? options.retryable ?? false;
    this.internalMessage = String(internalMessage || "").slice(0, 240);
  }
}

function toHttpError(error) {
  if (error instanceof WechatApiError) {
    return createHttpError(error.statusCode, error.code, error.message);
  }
  return createHttpError(503, "WECHAT_TEMPORARILY_UNAVAILABLE", "微信服务暂时不可用，请稍后重试");
}

function isInvalidAccessTokenError(error) {
  return error instanceof WechatApiError && TOKEN_INVALID_CODES.has(error.errcode);
}

module.exports = {
  ERROR_MAP,
  TOKEN_INVALID_CODES,
  WechatApiError,
  isInvalidAccessTokenError,
  toHttpError,
};
