"use strict";

const { createHttpError } = require("../security");
const { isValidEmail, normalizeEmail } = require("./identity");

function invalid(message, fields = {}) {
  const error = createHttpError(422, "VALIDATION_ERROR", message);
  error.fields = fields;
  throw error;
}

function requireObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("请求内容格式不正确");
  return body;
}

function parseEmail(value) {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) invalid("请输入有效的邮箱地址", { email: "邮箱格式不正确" });
  return email;
}

function validatePassword(password, config, fieldName = "password") {
  if (typeof password !== "string") invalid("请输入密码", { [fieldName]: "请输入密码" });
  if (password.length < config.passwordMinLength || password.length > config.passwordMaxLength) {
    invalid(`密码长度需要为 ${config.passwordMinLength}-${config.passwordMaxLength} 位`, {
      [fieldName]: `密码长度需要为 ${config.passwordMinLength}-${config.passwordMaxLength} 位`,
    });
  }
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
    invalid("密码必须同时包含字母和数字", {
      [fieldName]: "请同时使用字母和数字",
    });
  }
  return password;
}

function parseRegister(body, config) {
  const value = requireObject(body);
  const password = validatePassword(value.password, config);
  if (password !== value.confirmPassword) invalid("两次输入的密码不一致", { confirmPassword: "密码不一致" });
  if (value.termsAccepted !== true) invalid("请先同意用户协议和隐私政策", { termsAccepted: "需要同意" });
  return {
    email: parseEmail(value.email),
    password,
    challengeToken: String(value.challengeToken || "").slice(0, 2048),
  };
}

function parseLogin(body) {
  const value = requireObject(body);
  if (typeof value.password !== "string" || !value.password) invalid("邮箱或密码错误");
  return {
    email: parseEmail(value.email),
    password: value.password,
    remember: value.remember === true,
  };
}

function parseEmailOnly(body) {
  return { email: parseEmail(requireObject(body).email) };
}

function parseToken(body) {
  const token = String(requireObject(body).token || "");
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) invalid("链接无效或已失效");
  return { token };
}

function parseResetPassword(body, config) {
  const value = requireObject(body);
  const token = parseToken(value).token;
  const password = validatePassword(value.password, config);
  if (password !== value.confirmPassword) invalid("两次输入的密码不一致", { confirmPassword: "密码不一致" });
  return { token, password };
}

function parseChangePassword(body, config) {
  const value = requireObject(body);
  if (typeof value.currentPassword !== "string" || !value.currentPassword) {
    invalid("请输入当前密码", { currentPassword: "请输入当前密码" });
  }
  const newPassword = validatePassword(value.newPassword, config, "newPassword");
  if (newPassword !== value.confirmPassword) invalid("两次输入的新密码不一致", { confirmPassword: "密码不一致" });
  if (value.currentPassword === newPassword) invalid("新密码不能与当前密码相同", { newPassword: "请使用不同的密码" });
  return { currentPassword: value.currentPassword, newPassword };
}

module.exports = {
  parseChangePassword,
  parseEmail,
  parseEmailOnly,
  parseLogin,
  parseRegister,
  parseResetPassword,
  parseToken,
  validatePassword,
};
