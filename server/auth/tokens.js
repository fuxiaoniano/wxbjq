"use strict";

const crypto = require("crypto");

function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hashOpaqueToken(token, secret) {
  return crypto.createHmac("sha256", secret).update(String(token || ""), "utf8").digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  generateOpaqueToken,
  hashOpaqueToken,
  safeEqual,
};
