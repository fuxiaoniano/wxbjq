"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAppServer, loadConfig } = require("../server");
const { ensureDataStore } = require("../server/storage");

const rootDir = path.resolve(__dirname, "..");

function createCaptureProvider() {
  const messages = [];
  return {
    name: "capture",
    messages,
    async send(message) {
      messages.push(structuredClone(message));
      return { messageId: `test-${messages.length}` };
    },
  };
}

async function createTestApp(extraEnv = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-member-test-"));
  const provider = createCaptureProvider();
  const config = loadConfig({
    rootDir,
    env: {
      HOST: "127.0.0.1",
      PORT: "0",
      NODE_ENV: "test",
      DATA_DIR: path.join(tempDir, "data"),
      SYSTEM_TEMPLATES_FILE: path.join(tempDir, "system-templates.json"),
      APP_PUBLIC_URL: "http://editor.test/",
      SESSION_SECRET: "test-session-secret-with-at-least-thirty-two-characters",
      EMAIL_PROVIDER: "console",
      REGISTER_RATE_LIMIT_PER_HOUR: "1000",
      LOGIN_RATE_LIMIT_PER_15_MINUTES: "1000",
      EMAIL_RATE_LIMIT_PER_HOUR: "1000",
      PASSWORD_RESET_RATE_LIMIT_PER_HOUR: "1000",
      ...extraEnv,
    },
  });
  config.emailProviderInstance = provider;
  config.passwordHashOptions = { N: 1024, r: 8, p: 1, keyLength: 32 };
  await ensureDataStore(config);
  const server = createAppServer(config);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  config.trustedOrigins = [origin];

  async function request(urlPath, options = {}, jar = null) {
    const headers = new Headers(options.headers || {});
    if (jar && Object.keys(jar).length) {
      headers.set("Cookie", Object.entries(jar).map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; "));
    }
    const response = await fetch(`${origin}${urlPath}`, { ...options, headers });
    if (jar) applyResponseCookies(response, jar);
    return response;
  }

  async function json(urlPath, options = {}, jar = null) {
    const response = await request(urlPath, options, jar);
    const payload = await response.json().catch(() => null);
    return { response, payload };
  }

  async function post(urlPath, body, jar = null, extra = {}) {
    const headers = new Headers({ Origin: origin, "Content-Type": "application/json", "X-Editor-Request": "1", ...(extra.headers || {}) });
    if (jar?.[config.csrfCookieName]) headers.set("X-CSRF-Token", jar[config.csrfCookieName]);
    return json(urlPath, { method: extra.method || "POST", headers, body: JSON.stringify(body || {}) }, jar);
  }

  return {
    config,
    origin,
    post,
    provider,
    request,
    json,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function applyResponseCookies(response, jar) {
  const values = response.headers.getSetCookie ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
  for (const value of values) {
    const [pair] = value.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const cookieValue = decodeURIComponent(pair.slice(separator + 1));
    if (/Max-Age=0/i.test(value)) delete jar[name];
    else jar[name] = cookieValue;
  }
}

function tokenFromMessage(message, action) {
  const match = message.text.match(new RegExp(`#${action}=([A-Za-z0-9_-]+)`));
  assert.ok(match, `missing ${action} token`);
  return match[1];
}

module.exports = {
  createTestApp,
  tokenFromMessage,
};
