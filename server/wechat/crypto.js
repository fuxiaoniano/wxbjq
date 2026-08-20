"use strict";

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const FORMAT_VERSION = 1;

function requireKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("微信公众号凭据加密密钥不可用");
  }
  return key;
}

function encryptSecret(value, key, keyVersion = "1", purpose = "wechat-secret") {
  requireKey(key);
  const plaintext = String(value || "");
  if (!plaintext) throw new Error("不能加密空凭据");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(`${purpose}:v${FORMAT_VERSION}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    version: FORMAT_VERSION,
    algorithm: ALGORITHM,
    keyVersion: String(keyVersion),
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptSecret(envelope, key, purpose = "wechat-secret") {
  requireKey(key);
  if (!envelope || envelope.version !== FORMAT_VERSION || envelope.algorithm !== ALGORITHM) {
    throw new Error("微信公众号凭据格式不受支持");
  }
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, "base64"));
    decipher.setAAD(Buffer.from(`${purpose}:v${FORMAT_VERSION}`, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    const safeError = new Error("微信公众号凭据解密失败");
    safeError.code = "WECHAT_CREDENTIAL_DECRYPT_FAILED";
    throw safeError;
  }
}

module.exports = {
  ALGORITHM,
  FORMAT_VERSION,
  decryptSecret,
  encryptSecret,
};
