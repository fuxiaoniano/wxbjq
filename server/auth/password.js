"use strict";

const crypto = require("crypto");
const { promisify } = require("util");

const scryptAsync = promisify(crypto.scrypt);
const DEFAULT_PARAMS = Object.freeze({ N: 65_536, r: 8, p: 1, keyLength: 64 });
const MAX_MEMORY_BYTES = 128 * 1024 * 1024;

async function hashPassword(password, options = {}) {
  const params = { ...DEFAULT_PARAMS, ...options };
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(String(password), salt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: options.maxmem || MAX_MEMORY_BYTES,
  });
  return [
    "scrypt",
    params.N,
    params.r,
    params.p,
    salt.toString("base64url"),
    Buffer.from(derived).toString("base64url"),
  ].join("$");
}

async function verifyPassword(password, encoded) {
  try {
    const [algorithm, nValue, rValue, pValue, saltValue, hashValue] = String(encoded).split("$");
    if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
    const N = Number.parseInt(nValue, 10);
    const r = Number.parseInt(rValue, 10);
    const p = Number.parseInt(pValue, 10);
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (!N || !r || !p || salt.length < 16 || expected.length < 32) return false;
    const actual = await scryptAsync(String(password), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEMORY_BYTES,
    });
    return crypto.timingSafeEqual(expected, Buffer.from(actual));
  } catch (error) {
    return false;
  }
}

function passwordNeedsRehash(encoded) {
  const [, nValue, rValue, pValue] = String(encoded || "").split("$");
  return (
    Number.parseInt(nValue, 10) !== DEFAULT_PARAMS.N ||
    Number.parseInt(rValue, 10) !== DEFAULT_PARAMS.r ||
    Number.parseInt(pValue, 10) !== DEFAULT_PARAMS.p
  );
}

module.exports = {
  DEFAULT_PARAMS,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
};
