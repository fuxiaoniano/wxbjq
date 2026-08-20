"use strict";

const SENSITIVE_ASSIGNMENT = /((?:password|pass|appsecret|secret|access[_-]?token|refresh[_-]?token|verification[_-]?token|reset[_-]?token|cookie|token)\s*[=:]\s*)[^\s,;]+/gi;
const AUTHORIZATION_HEADER = /(authorization\s*[=:]\s*)(?:Bearer\s+)?[^\s,;]+/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;

function redactLogText(value) {
  return String(value || "")
    .replace(AUTHORIZATION_HEADER, "$1[redacted]")
    .replace(SENSITIVE_ASSIGNMENT, "$1[redacted]")
    .replace(BEARER_TOKEN, "Bearer [redacted]")
    .slice(0, 2000);
}

function logError(scope, error) {
  const message = error && error.message ? error.message : error;
  console.error(`[${scope}] ${redactLogText(message || "unexpected error")}`);
}

module.exports = {
  logError,
  redactLogText,
};
