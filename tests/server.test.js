"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const test = require("node:test");
const { createAppServer, loadConfig } = require("../server");
const { ensureDataStore, readJsonFile, writeJsonAtomic } = require("../server/storage");
const { sanitizeStoredHtml } = require("../server/sanitizer");
const { inspectWechatCompatibility, normalizeWechatHtml } = require("../server/compatibility");

const rootDir = path.resolve(__dirname, "..");

async function createTestServer(extraEnv = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-editor-test-"));
  const config = loadConfig({
    rootDir,
    env: {
      HOST: "127.0.0.1",
      PORT: "0",
      NODE_ENV: "test",
      DATA_DIR: path.join(tempDir, "data"),
      SYSTEM_TEMPLATES_FILE: path.join(tempDir, "system-templates.json"),
      TRUSTED_ORIGINS: "http://127.0.0.1:0",
      ...extraEnv,
    },
  });
  await ensureDataStore(config);
  const server = createAppServer(config);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  config.trustedOrigins = [origin];

  async function request(urlPath, options = {}) {
    return fetch(`${origin}${urlPath}`, options);
  }

  async function json(urlPath, options = {}) {
    const response = await request(urlPath, options);
    const payload = await response.json().catch(() => null);
    return { response, payload };
  }

  function close() {
    return new Promise((resolve) => server.close(resolve));
  }

  return { tempDir, config, origin, request, json, close };
}

function writeHeaders(origin, extra = {}) {
  return {
    Origin: origin,
    "Content-Type": "application/json",
    "X-Editor-Request": "1",
    ...extra,
  };
}

function rawRequest(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: rawPath,
        method: "GET",
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("serves only public static files", async () => {
  const app = await createTestServer();
  try {
    assert.equal((await app.request("/index.html")).status, 200);
    assert.equal((await app.request("/styles.css")).status, 200);
    app.config.wechat.enabled = true;
    const adminHtml = await (await app.request("/admin.html")).text();
    assert.match(adminHtml, /<meta name="wechat-enabled" content="true" \/>/);
    for (const blocked of [
      "/server.js",
      "/system-templates.json",
      "/data/drafts/test.json",
      "/.git/config",
      "/.env",
      "/package.json",
      "/README.md",
    ]) {
      const response = await app.request(blocked);
      assert.notEqual(response.status, 200, blocked);
      const text = await response.text();
      assert.ok(!text.includes("createAppServer"));
      assert.ok(!text.includes("system-templates"));
    }
  } finally {
    await app.close();
  }
});

test("the configured public application origin is always trusted", () => {
  const config = loadConfig({
    rootDir,
    env: {
      HOST: "127.0.0.1",
      PORT: "8090",
      NODE_ENV: "test",
      APP_PUBLIC_URL: "https://fuxiaonian.net/wechat-editor/public/",
      APP_BASE_PATH: "/wechat-editor/public",
      TRUSTED_ORIGINS: "http://127.0.0.1:8090",
    },
  });

  assert.ok(config.trustedOrigins.includes("https://fuxiaonian.net"));
  assert.ok(config.trustedOrigins.includes("http://127.0.0.1:8090"));
});

test("configuration validates deployment URLs, modes, and password bounds", () => {
  const common = {
    HOST: "127.0.0.1",
    PORT: "8090",
    NODE_ENV: "test",
  };
  assert.throws(
    () => loadConfig({ rootDir, env: { ...common, DEPLOYMENT_MODE: "unknown" } }),
    /DEPLOYMENT_MODE/,
  );
  assert.throws(
    () => loadConfig({
      rootDir,
      env: {
        ...common,
        APP_PUBLIC_URL: "https://example.com/editor/",
        APP_BASE_PATH: "/different",
      },
    }),
    /APP_PUBLIC_URL/,
  );
  assert.throws(
    () => loadConfig({
      rootDir,
      env: { ...common, APP_PUBLIC_URL: "https://user:pass@example.com/" },
    }),
    /用户名或密码/,
  );
  assert.throws(
    () => loadConfig({
      rootDir,
      env: { ...common, PASSWORD_MIN_LENGTH: "64", PASSWORD_MAX_LENGTH: "32" },
    }),
    /PASSWORD_MIN_LENGTH/,
  );
});

test("production public deployments keep shared editor storage disabled by default", () => {
  const env = {
    HOST: "127.0.0.1",
    PORT: "8090",
    NODE_ENV: "production",
    AUTH_ENABLED: "false",
    SERVER_STORAGE_ENABLED: "true",
    APP_PUBLIC_URL: "https://fuxiaonian.net/wechat-editor/public/",
    APP_BASE_PATH: "/wechat-editor/public",
  };
  const secured = loadConfig({ rootDir, env });
  assert.equal(secured.serverStorageEnabled, true);
  assert.equal(secured.editorStorageEnabled, false);

  const explicitlyShared = loadConfig({
    rootDir,
    env: { ...env, ALLOW_UNAUTHENTICATED_REMOTE_STORAGE: "true" },
  });
  assert.equal(explicitlyShared.editorStorageEnabled, true);
});

test("proxied HTTP page requests redirect to the configured HTTPS URL", async () => {
  const app = await createTestServer({
    APP_PUBLIC_URL: "https://fuxiaonian.net/wechat-editor/public/",
    APP_BASE_PATH: "/wechat-editor/public",
    TRUST_PROXY_HEADERS: "true",
  });
  try {
    const response = await app.request("/wechat-editor/public/?from=http", {
      redirect: "manual",
      headers: {
        "X-Forwarded-Host": "fuxiaonian.net",
        "X-Forwarded-Proto": "http",
      },
    });
    assert.equal(response.status, 308);
    assert.equal(
      response.headers.get("location"),
      "https://fuxiaonian.net/wechat-editor/public/?from=http",
    );

    const secureResponse = await app.request("/wechat-editor/public/api/health", {
      headers: {
        "X-Forwarded-Host": "fuxiaonian.net",
        "X-Forwarded-Proto": "https",
      },
    });
    assert.equal(secureResponse.status, 200);
    assert.equal((await app.request("/api/health")).status, 404);
  } finally {
    await app.close();
  }
});

test("public production mode keeps accounts available while editor drafts stay browser-local", async () => {
  const app = await createTestServer({
    NODE_ENV: "production",
    AUTH_ENABLED: "false",
    SERVER_STORAGE_ENABLED: "true",
    APP_PUBLIC_URL: "https://fuxiaonian.net/wechat-editor/public/",
    APP_BASE_PATH: "/wechat-editor/public",
  });
  try {
    const health = await app.json("/wechat-editor/public/api/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.payload.serverStorageEnabled, true);
    assert.equal(health.payload.storage.drafts, false);
    assert.equal(health.payload.storage.templates, false);

    const index = await (await app.request("/wechat-editor/public/")).text();
    assert.match(index, /name="server-storage-enabled" content="false"/);
    const drafts = await app.json("/wechat-editor/public/api/drafts");
    assert.equal(drafts.response.status, 403);
    assert.equal(drafts.payload.error.code, "SERVER_STORAGE_DISABLED");
  } finally {
    await app.close();
  }
});

test("malformed and traversal URLs do not crash the server", async () => {
  const app = await createTestServer();
  try {
    const port = new URL(app.origin).port;
    for (const urlPath of ["/%E0%A4%A", "/%00", "/..%2fserver.js", "/%2e%2e/server.js", "/%5cserver.js", "//server.js"]) {
      const status = await rawRequest(port, urlPath);
      assert.ok([400, 404].includes(status), `${urlPath} returned ${status}`);
      assert.equal((await app.request("/api/health")).status, 200);
    }
  } finally {
    await app.close();
  }
});

test("write endpoints enforce origin, content type, custom header, size and mode", async () => {
  const app = await createTestServer({ MAX_REQUEST_BODY_BYTES: "1024" });
  try {
    const body = JSON.stringify({ title: "安全草稿", html: "<p>hello</p>" });
    assert.equal((await app.request("/api/drafts", { method: "POST", headers: writeHeaders("http://evil.test"), body })).status, 403);
    assert.equal((await app.request("/api/drafts", { method: "POST", headers: { Origin: app.origin, "Content-Type": "application/json" }, body })).status, 403);
    assert.equal((await app.request("/api/drafts", { method: "POST", headers: { Origin: app.origin, "X-Editor-Request": "1", "Content-Type": "text/plain" }, body })).status, 415);
    assert.equal((await app.request("/api/drafts", { method: "POST", headers: writeHeaders(app.origin, { "Sec-Fetch-Site": "cross-site" }), body })).status, 403);
    assert.equal((await app.request("/api/drafts", { method: "POST", headers: writeHeaders(app.origin), body: JSON.stringify({ html: "x".repeat(2048) }) })).status, 413);
    const ok = await app.json("/api/drafts", { method: "POST", headers: writeHeaders(app.origin), body });
    assert.equal(ok.response.status, 201);
    assert.match(ok.payload.id, /^draft-/);
  } finally {
    await app.close();
  }

  const publicApp = await createTestServer({ DEPLOYMENT_MODE: "public-stateless", SERVER_STORAGE_ENABLED: "false" });
  try {
    const result = await publicApp.json("/api/drafts", {
      method: "POST",
      headers: writeHeaders(publicApp.origin),
      body: JSON.stringify({ title: "x", html: "<p>x</p>" }),
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.payload.error.code, "SERVER_STORAGE_DISABLED");
  } finally {
    await publicApp.close();
  }
});

test("default trusted origins include common loopback hosts", () => {
  const config = loadConfig({
    rootDir,
    env: {
      HOST: "localhost",
      PORT: "8090",
      NODE_ENV: "test",
      DATA_DIR: path.join(os.tmpdir(), "wechat-editor-origin-test"),
      SYSTEM_TEMPLATES_FILE: path.join(os.tmpdir(), "wechat-editor-origin-test.json"),
    },
  });
  assert.ok(config.trustedOrigins.includes("http://127.0.0.1:8090"));
  assert.ok(config.trustedOrigins.includes("http://localhost:8090"));
  assert.ok(config.trustedOrigins.includes("http://[::1]:8090"));
  assert.equal(config.trustProxyHeaders, false);
});

test("draft CRUD, pagination, migration, limits and atomic backups", async () => {
  const app = await createTestServer({ MAX_DRAFTS: "2", MAX_DRAFT_HTML_BYTES: "1024" });
  try {
    const created = await app.json("/api/drafts", {
      method: "POST",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({ title: "第一篇", html: '<p style="color:#333">内容</p>' }),
    });
    assert.equal(created.response.status, 201);
    const id = created.payload.id;

    const detail = await app.json(`/api/drafts/${id}`);
    assert.equal(detail.response.status, 200);
    assert.equal(detail.payload.title, "第一篇");
    assert.equal(detail.payload.wordCount, 2);

    const updated = await app.json(`/api/drafts/${id}`, {
      method: "PUT",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({ title: "重命名", html: "<p>新内容</p>" }),
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.payload.title, "重命名");
    assert.ok(fs.existsSync(path.join(app.config.draftsDir, `${id}.json.bak`)));

    const second = await app.json("/api/drafts", {
      method: "POST",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({ title: "第二篇", html: "<p>two</p>" }),
    });
    assert.equal(second.response.status, 201);
    assert.equal((await app.json("/api/drafts?page=1&pageSize=1")).payload.items.length, 1);

    const limited = await app.json("/api/drafts", {
      method: "POST",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({ title: "第三篇", html: "<p>three</p>" }),
    });
    assert.equal(limited.response.status, 409);

    const oldPath = path.join(app.config.draftsDir, "legacy.json");
    fs.writeFileSync(oldPath, JSON.stringify({ id: "legacy", title: "旧草稿", html: "<p>旧</p>", savedAt: "2026-01-01T00:00:00.000Z" }), "utf8");
    const migrated = await app.json("/api/drafts/legacy");
    assert.equal(migrated.response.status, 200);
    assert.equal(migrated.payload.schemaVersion, 1);
    assert.ok(fs.existsSync(`${oldPath}.bak`));

    assert.equal((await app.request("/api/drafts/bad..id")).status, 404);
    assert.equal((await app.request(`/api/drafts/${id}`, { method: "DELETE", headers: writeHeaders(app.origin) })).status, 204);
  } finally {
    await app.close();
  }
});

test("template CRUD sanitizes html and enforces limits", async () => {
  const app = await createTestServer({ MAX_TEMPLATES: "1", MAX_TEMPLATE_HTML_BYTES: "1024" });
  try {
    const created = await app.json("/api/system-templates", {
      method: "POST",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({ name: "模板", category: "分类", html: '<section><p onclick="x()">正文</p><script>alert(1)</script></section>' }),
    });
    assert.equal(created.response.status, 201);
    assert.ok(!created.payload.html.includes("script"));
    assert.ok(!created.payload.html.includes("onclick"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const firstList = await app.json("/api/system-templates");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const secondList = await app.json("/api/system-templates");
    assert.equal(firstList.payload[0].updatedAt, created.payload.updatedAt);
    assert.equal(secondList.payload[0].updatedAt, created.payload.updatedAt);

    const limited = await app.json("/api/system-templates", {
      method: "POST",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({ name: "模板2", html: "<p>two</p>" }),
    });
    assert.equal(limited.response.status, 409);

    const empty = await app.json(`/api/system-templates/${created.payload.id}`, {
      method: "PUT",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({ name: "bad", html: "<script>alert(1)</script>" }),
    });
    assert.equal(empty.response.status, 400);

    const updated = await app.json(`/api/system-templates/${created.payload.id}`, {
      method: "PUT",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({ name: "更新", category: "分类", html: '<section style="display:flex;gap:10px;color:#333"><p>ok</p></section>' }),
    });
    assert.equal(updated.response.status, 200);
    assert.ok(!updated.payload.html.includes("flex"));
    assert.equal((await app.request(`/api/system-templates/${created.payload.id}`, { method: "DELETE", headers: writeHeaders(app.origin) })).status, 204);
  } finally {
    await app.close();
  }
});

test("concurrent draft creation enforces the collection limit atomically", async () => {
  const app = await createTestServer({ MAX_DRAFTS: "1" });
  try {
    const requests = ["concurrent-a", "concurrent-b"].map((id) =>
      app.json("/api/drafts", {
        method: "POST",
        headers: writeHeaders(app.origin),
        body: JSON.stringify({ id, title: id, html: `<p>${id}</p>` }),
      }),
    );
    const results = await Promise.all(requests);
    assert.deepEqual(results.map((item) => item.response.status).sort(), [201, 409]);
    const list = await app.json("/api/drafts?page=1&pageSize=10");
    assert.equal(list.payload.total, 1);
  } finally {
    await app.close();
  }
});

test("template collection replacement rejects duplicate template ids", async () => {
  const app = await createTestServer({ MAX_TEMPLATES: "5", MAX_TEMPLATE_HTML_BYTES: "1024" });
  try {
    const duplicated = await app.json("/api/system-templates", {
      method: "PUT",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({
        templates: [
          { id: "dup-template", name: "A", category: "C", html: "<section><p>A</p></section>" },
          { id: "dup-template", name: "B", category: "C", html: "<section><p>B</p></section>" },
        ],
      }),
    });
    assert.equal(duplicated.response.status, 409);
    assert.equal(duplicated.payload.error.code, "TEMPLATE_ID_DUPLICATED");
  } finally {
    await app.close();
  }
});

test("backup export and import validate, sanitize and create pre-import backup", async () => {
  const app = await createTestServer();
  try {
    await app.json("/api/drafts", {
      method: "POST",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({ id: "draft-a", title: "A", html: "<p>A</p>" }),
    });
    const exported = await app.json("/api/backup/export", { method: "POST", headers: writeHeaders(app.origin), body: "{}" });
    assert.equal(exported.response.status, 200);
    assert.equal(exported.payload.version, 1);
    assert.equal(exported.payload.drafts.length, 1);

    const invalid = await app.json("/api/backup/import", { method: "POST", headers: writeHeaders(app.origin), body: "{bad" });
    assert.equal(invalid.response.status, 400);

    const unknown = await app.json("/api/backup/import", {
      method: "POST",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({ backup: { version: 99, drafts: [], templates: [] } }),
    });
    assert.equal(unknown.response.status, 400);

    const imported = await app.json("/api/backup/import", {
      method: "POST",
      headers: writeHeaders(app.origin),
      body: JSON.stringify({
        mode: "merge",
        backup: {
          version: 1,
          exportedAt: new Date().toISOString(),
          drafts: [{ id: "draft-a", title: "B", html: '<p onclick="x()">B</p>' }],
          templates: [{ id: "template-b", name: "T", category: "C", html: '<section><svg onload="x()"></svg><p>T</p></section>' }],
          settings: { themeColor: "#2563eb" },
        },
      }),
    });
    assert.equal(imported.response.status, 200);
    assert.equal(imported.payload.importedDrafts, 1);
    assert.equal(imported.payload.renamedDrafts, 1);
    assert.notEqual(imported.payload.draftSummaries[0].id, "draft-a");
    assert.ok(fs.readdirSync(app.config.backupsDir).some((file) => file.includes("before-import")));
    const original = await readJsonFile(path.join(app.config.draftsDir, "draft-a.json"));
    assert.equal(original.title, "A");
    const draft = await readJsonFile(path.join(app.config.draftsDir, `${imported.payload.draftSummaries[0].id}.json`));
    assert.ok(!draft.html.includes("onclick"));
  } finally {
    await app.close();
  }
});

test("sanitizer removes dangerous tags, protocols, attributes and css", () => {
  const dirty = `
    <p style="color:#333;position:fixed;z-index:999">普通段落</p>
    <script>alert(1)</script>
    <style>body{display:none}</style>
    <img src="x" alt="说明" onerror="alert(1)">
    <a href="javascript:alert(1)">危险链接</a>
    <a href="https://example.com" target="_blank">安全链接</a>
    <svg onload="alert(1)"></svg>
    <section style="background-image:url(javascript:alert(1));padding:10px"></section>
  `;
  const clean = sanitizeStoredHtml(dirty);
  assert.ok(clean.includes("普通段落"));
  assert.ok(clean.includes("color: #333"));
  assert.ok(clean.includes("padding: 10px"));
  assert.ok(clean.includes("alt=\"说明\""));
  assert.ok(clean.includes("https://example.com"));
  assert.ok(clean.includes("noopener"));
  assert.ok(!clean.includes("script"));
  assert.ok(!clean.includes("style>"));
  assert.ok(!clean.includes("onerror"));
  assert.ok(!clean.includes("javascript:"));
  assert.ok(!clean.includes("position"));
  assert.ok(!clean.includes("background-image"));
  assert.ok(!clean.includes("svg"));
  assert.equal(
    sanitizeStoredHtml('<img src="http://example.com/a.png" alt="x">'),
    '<img src="http://example.com/a.png" alt="x">',
  );
  assert.equal(sanitizeStoredHtml('<img src="" alt="占位图">'), '<img src="" alt="占位图">');
  assert.equal(
    sanitizeStoredHtml('<img src="这里粘贴微信公众号qpic图片地址" alt="占位图">'),
    '<img src="这里粘贴微信公众号qpic图片地址" alt="占位图">',
  );
});

test("sanitizer tokenizes quoted attributes and blocked self-closing tags safely", () => {
  assert.equal(
    sanitizeStoredHtml('<p title="1 > 0">ok</p>'),
    '<p title="1 &gt; 0">ok</p>',
  );
  assert.equal(
    sanitizeStoredHtml("<p>2 < 3 and 5 > 4</p>"),
    "<p>2 &lt; 3 and 5 &gt; 4</p>",
  );
  assert.equal(
    sanitizeStoredHtml("<svg /><p>kept</p>"),
    "<p>kept</p>",
  );
  assert.equal(
    sanitizeStoredHtml("<svg><svg /></svg><p>after</p>"),
    "<p>after</p>",
  );
  const rel = sanitizeStoredHtml('<a href="https://example.com" rel="opener nofollow">safe</a>');
  assert.match(rel, /nofollow/);
  assert.match(rel, /noopener/);
  assert.match(rel, /noreferrer/);
  assert.doesNotMatch(rel, /\bopener\b/);
  assert.equal(
    sanitizeStoredHtml('<p style="background:u\\72l(javascript:alert(1));color:#123456">safe</p>'),
    '<p style="color: #123456">safe</p>',
  );
  assert.doesNotThrow(() => sanitizeStoredHtml('<a href="&#999999999999;">safe</a>'));
});

test("atomic JSON writes preserve a valid backup when the primary file is corrupt", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-editor-storage-recovery-"));
  const filePath = path.join(tempDir, "records.json");
  const backupPath = `${filePath}.bak`;
  try {
    fs.writeFileSync(filePath, "{broken", "utf8");
    fs.writeFileSync(backupPath, JSON.stringify([{ id: "last-good" }]), "utf8");

    assert.deepEqual(await readJsonFile(filePath, []), [{ id: "last-good" }]);
    await writeJsonAtomic(filePath, [{ id: "new-primary" }]);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, "utf8")), [{ id: "new-primary" }]);
    assert.deepEqual(JSON.parse(fs.readFileSync(backupPath, "utf8")), [{ id: "last-good" }]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("wechat compatibility detects and normalizes unsupported html without losing text", () => {
  const html = '<section id="x" class="c" data-editor="1" style="display:grid;gap:10px;position:absolute;--x:red;width:120%"><p>正文文本</p><img src="https://example.com/a.png" style="width:1200px"></section>';
  const report = inspectWechatCompatibility(html);
  assert.ok(report.warningCount >= 5);
  const normalized = normalizeWechatHtml(html);
  assert.ok(normalized.includes("正文文本"));
  assert.ok(!normalized.includes("display:grid"));
  assert.ok(!normalized.includes("gap"));
  assert.ok(!normalized.includes("position"));
  assert.ok(!normalized.includes("class="));
  assert.ok(!normalized.includes("id="));
  assert.ok(!normalized.includes("data-editor"));
  assert.ok(normalized.includes("max-width: 100%"));
});
