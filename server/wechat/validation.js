"use strict";

const { createHttpError } = require("../security");

function invalid(message) {
  throw createHttpError(422, "VALIDATION_ERROR", message);
}

function object(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("请求内容格式不正确");
  return body;
}

function displayName(value, required = true) {
  const result = String(value ?? "").trim();
  if (required && !result) invalid("请填写公众号名称");
  if (result.length > 80) invalid("公众号名称不能超过 80 个字符");
  return result;
}

function appId(value, required = true) {
  const result = String(value ?? "").trim();
  if (required && !result) invalid("请填写 AppID");
  if (result && !/^wx[A-Za-z0-9]{10,30}$/.test(result)) invalid("AppID 格式不正确");
  return result;
}

function appSecret(value, required = true) {
  const result = String(value ?? "").trim();
  if (required && !result) invalid("请填写 AppSecret");
  if (result && !/^[A-Za-z0-9_-]{16,128}$/.test(result)) invalid("AppSecret 格式不正确");
  return result;
}

function parseCreateAccount(body) {
  const value = object(body);
  return {
    displayName: displayName(value.displayName),
    appId: appId(value.appId),
    appSecret: appSecret(value.appSecret),
    isDefault: value.isDefault === true,
  };
}

function parseUpdateAccount(body) {
  const value = object(body);
  const result = {};
  if (value.displayName !== undefined) result.displayName = displayName(value.displayName);
  if (value.appId !== undefined && value.appId !== "") result.appId = appId(value.appId);
  if (value.appSecret !== undefined && value.appSecret !== "") result.appSecret = appSecret(value.appSecret);
  if (value.isDefault !== undefined) result.isDefault = value.isDefault === true;
  if (!Object.keys(result).length) invalid("没有可更新的公众号字段");
  return result;
}

module.exports = {
  parseCreateAccount,
  parseUpdateAccount,
};
