"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootDir = path.resolve(__dirname, "..");
const tempRoots = [];

function createFrontendFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-editor-test-frontend-"));
  tempRoots.push(tempDir);
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ type: "module" }), "utf8");

  const sourceDir = path.join(rootDir, "public", "js");
  const targetDir = path.join(tempDir, "public", "js");
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of fs.readdirSync(sourceDir)) {
    if (file.endsWith(".js")) fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  }

  return {
    importModule(file) {
      return import(`${pathToFileURL(path.join(targetDir, file)).href}?test=${Date.now()}-${Math.random()}`);
    },
  };
}

function installMinimalBrowserGlobals(meta = {}) {
  global.document = {
    querySelector(selector) {
      const match = String(selector).match(/^meta\[name="([^"]+)"\]$/);
      if (!match || !(match[1] in meta)) return null;
      return {
        getAttribute(name) {
          return name === "content" ? meta[match[1]] : "";
        },
      };
    },
    createElement() {
      return {
        classList: { add() {}, remove() {} },
        setAttribute() {},
        getAttribute() {
          return "";
        },
        appendChild() {},
        remove() {},
      };
    },
    body: {
      appendChild() {},
      classList: { add() {}, remove() {} },
    },
  };
  global.window = {
    addEventListener() {},
    clearTimeout,
    setTimeout,
    getSelection() {
      return null;
    },
  };
}

test.after(() => {
  for (const tempDir of tempRoots) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("administrator tools use a standalone page and WeChat credentials stay out of display markup", () => {
  const index = fs.readFileSync(path.join(rootDir, "public", "index.html"), "utf8");
  const admin = fs.readFileSync(path.join(rootDir, "public", "admin.html"), "utf8");
  const membership = fs.readFileSync(path.join(rootDir, "public", "js", "membership.js"), "utf8");
  const wechat = fs.readFileSync(path.join(rootDir, "public", "js", "wechat-accounts.js"), "utf8");
  assert.match(index, /id="adminEntryBtn"[^>]*>管理后台</);
  assert.match(admin, /id="adminWorkspace"/);
  assert.match(membership, /window\.open\(withBasePath\("\/admin\.html"\)/);
  assert.doesNotMatch(index, /id="adminModal"/);
  assert.doesNotMatch(membership, /\/admin\/users|adminPlanFeatureForm|loadAdminData/);
  assert.ok(!admin.includes("encryptedAppSecret"));
  assert.ok(!wechat.includes("accessToken"));
});

test("base path helpers generate prefixed app and api URLs", async () => {
  installMinimalBrowserGlobals({
    "app-base-path": "/wechat-editor/",
    "deployment-mode": "local",
    "server-storage-enabled": "true",
  });
  const fixture = createFrontendFixture();
  const config = await fixture.importModule("config.js");

  assert.equal(config.appConfig.basePath, "/wechat-editor");
  assert.equal(config.withBasePath("/"), "/wechat-editor/");
  assert.equal(config.withBasePath("index.html"), "/wechat-editor/index.html");
  assert.equal(config.apiUrl("/health"), "/wechat-editor/api/health");
});

test("local image Data URLs use a server-compatible default size limit", async () => {
  installMinimalBrowserGlobals();
  const fixture = createFrontendFixture();
  const utils = await fixture.importModule("utils.js");

  assert.equal(utils.DEFAULT_INLINE_IMAGE_MAX_BYTES, 640 * 1024);
  await assert.rejects(
    utils.readFileAsDataUrl({ type: "image/png", size: utils.DEFAULT_INLINE_IMAGE_MAX_BYTES + 1 }),
    /640 KB/,
  );
});

test("empty image src attributes remain available to the editor", async () => {
  installMinimalBrowserGlobals();
  const fixture = createFrontendFixture();
  const { isSafeImageSrc } = await fixture.importModule("sanitizer.js");

  assert.equal(isSafeImageSrc(""), true);
  assert.equal(isSafeImageSrc("   "), true);
  assert.equal(isSafeImageSrc("这里粘贴微信公众号qpic图片地址"), true);
  assert.equal(isSafeImageSrc("https://mmbiz.qpic.cn/example/image/1"), true);
  assert.equal(isSafeImageSrc("javascript:alert(1)"), false);
  assert.equal(isSafeImageSrc("//evil.example/image.png"), false);
});

test("browser CSS sanitization rejects escaped URLs", async () => {
  installMinimalBrowserGlobals();
  const fixture = createFrontendFixture();
  const { sanitizeStyle } = await fixture.importModule("sanitizer.js");

  assert.equal(
    sanitizeStyle("background:u\\72l(javascript:alert(1));color:#123456"),
    "color: #123456",
  );
});

test("theme replacement keeps semantic color shades distinct", async () => {
  installMinimalBrowserGlobals();
  const fixture = createFrontendFixture();
  const { replaceThemeColors } = await fixture.importModule("templates.js");
  const html = '<p style="color:#d92d20;background:#fbeae9">text</p>';

  assert.equal(
    replaceThemeColors(html, ["#d92d20"], "#2563eb"),
    '<p style="color:#2563eb;background:#e9effd">text</p>',
  );
});

test("WeChat idempotency keys work in browsers without randomUUID", async () => {
  installMinimalBrowserGlobals();
  const fixture = createFrontendFixture();
  const { createIdempotencyKey } = await fixture.importModule("wechat-drafts.js");

  assert.equal(createIdempotencyKey({ randomUUID: () => "uuid-key" }), "uuid-key");
  assert.equal(
    createIdempotencyKey({
      getRandomValues(bytes) {
        bytes.fill(0xab);
        return bytes;
      },
    }),
    `draft-${"ab".repeat(16)}`,
  );
});

test("copy conversion adds paragraph spacing when the editor relied on CSS", async () => {
  installMinimalBrowserGlobals();
  const fixture = createFrontendFixture();
  const { ensureParagraphSpacing } = await fixture.importModule("wechat-compatibility.js");

  assert.equal(ensureParagraphSpacing(""), "margin: 0 0 16px");
  assert.equal(ensureParagraphSpacing("color: #333"), "color: #333; margin-bottom: 16px");
  assert.equal(ensureParagraphSpacing("margin: 0 0 24px"), "margin: 0 0 24px");
  assert.equal(ensureParagraphSpacing("margin-bottom: 8px"), "margin-bottom: 8px");
});

test("localStorage write failures are observable to callers", async () => {
  installMinimalBrowserGlobals();
  global.localStorage = {
    setItem() {
      throw new Error("quota exceeded");
    },
  };
  const fixture = createFrontendFixture();
  const { writeLocalJson } = await fixture.importModule("utils.js");

  assert.equal(writeLocalJson("wechat-editor-test", { ok: true }), false);
});

test("backup import mode requires an explicit typed confirmation", async () => {
  installMinimalBrowserGlobals();
  const fixture = createFrontendFixture();
  const { chooseBackupImportMode } = await fixture.importModule("backup.js");

  const prompts = [];
  const backup = { drafts: [{ id: "a" }, { id: "b" }], templates: [{ id: "t" }] };
  const dialog = {
    prompt(message, defaultValue) {
      prompts.push({ message, defaultValue });
      return "覆盖导入";
    },
  };

  assert.equal(chooseBackupImportMode(backup, dialog), "overwrite");
  assert.match(prompts[0].message, /2 个草稿、1 个模板/);
  assert.equal(prompts[0].defaultValue, "合并导入");
  assert.equal(chooseBackupImportMode(backup, { prompt: () => "合并导入" }), "merge");
  assert.equal(chooseBackupImportMode(backup, { prompt: () => "确定" }), "");
  assert.equal(chooseBackupImportMode(backup, { prompt: () => null }), "");
});

test("toolbar style updates remove conflicting inline styles from selected content", async () => {
  installMinimalBrowserGlobals();
  global.Node = { ELEMENT_NODE: 1 };
  const fixture = createFrontendFixture();
  const { removeConflictingInlineStyles } = await fixture.importModule("toolbar.js");
  const changed = [];

  function fakeElement(style) {
    return {
      nodeType: 1,
      style,
      getAttribute(name) {
        return name === "style" ? this.style : "";
      },
      setAttribute(name, value) {
        if (name === "style") this.style = value;
        changed.push(["set", value]);
      },
      removeAttribute(name) {
        if (name === "style") this.style = "";
        changed.push(["remove", name]);
      },
    };
  }

  const child = fakeElement("font-size: 18px; color: #111111; background: #eeeeee");
  const root = fakeElement("color: #222222; font-weight: 700");
  root.querySelectorAll = (selector) => (selector === "[style]" ? [child] : []);

  removeConflictingInlineStyles(root, "color");
  assert.equal(root.style, "font-weight: 700");
  assert.equal(child.style, "font-size: 18px; background: #eeeeee");

  removeConflictingInlineStyles(root, "background-color");
  assert.equal(child.style, "font-size: 18px");
  assert.ok(changed.some(([action]) => action === "set"));
});

test("draft modal opens before draft list request finishes", async () => {
  installMinimalBrowserGlobals({
    "server-storage-enabled": "true",
  });
  const originalFetch = global.fetch;
  let resolveFetch;
  global.fetch = () => new Promise((resolve) => {
    resolveFetch = resolve;
  });

  try {
    const fixture = createFrontendFixture();
    const { createDraftManager } = await fixture.importModule("drafts.js");
    const classNames = new Set();
    const elements = {
      currentDraftTitle: { textContent: "" },
      draftModal: {
        hidden: true,
        classList: {
          add(name) {
            classNames.add(name);
          },
          remove(name) {
            classNames.delete(name);
          },
        },
        addEventListener() {},
      },
      draftModalCloseBtn: { addEventListener() {} },
      draftList: { innerHTML: "", addEventListener() {} },
      draftEmpty: { hidden: true },
    };
    const manager = createDraftManager(elements, {
      getHtml() {
        return "";
      },
      isEmpty() {
        return true;
      },
    });

    const pending = manager.openDraftModal();
    assert.equal(elements.draftModal.hidden, false);
    assert.equal(classNames.has("open"), true);
    assert.match(elements.draftList.innerHTML, /draft-loading/);

    resolveFetch({
      ok: true,
      async text() {
        return '{"items":[]}';
      },
    });
    await pending;
    assert.equal(elements.draftEmpty.hidden, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("deleting a selected image records undo history and commits the DOM change", async () => {
  installMinimalBrowserGlobals();
  const fixture = createFrontendFixture();
  const { deleteSelectedImage } = await fixture.importModule("images.js");
  const calls = [];
  const wrapper = {
    remove() {
      calls.push("remove-wrapper");
    },
  };
  const image = {
    closest(selector) {
      if (selector === "section") return wrapper;
      if (selector === "img") return image;
      return null;
    },
  };
  const parentElement = {
    closest(selector) {
      return selector === "img" ? image : null;
    },
  };
  const doc = {
    defaultView: {
      getSelection() {
        return { anchorNode: { nodeType: 3, parentElement } };
      },
    },
    activeElement: {
      closest() {
        return null;
      },
    },
  };
  const editorController = {
    ensureVisualMode() {
      calls.push("ensure-visual");
    },
    recordHistorySnapshot() {
      calls.push("history");
    },
    commitDomChange() {
      calls.push("commit");
    },
  };

  assert.equal(deleteSelectedImage(editorController, doc), true);
  assert.deepEqual(calls, ["ensure-visual", "history", "remove-wrapper", "commit"]);
});

test("deleting without a selected image is a no-op after restoring visual mode", async () => {
  installMinimalBrowserGlobals();
  const fixture = createFrontendFixture();
  const { deleteSelectedImage } = await fixture.importModule("images.js");
  const calls = [];
  const doc = {
    defaultView: {
      getSelection() {
        return { anchorNode: { nodeType: 3, parentElement: { closest: () => null } } };
      },
    },
    activeElement: {
      closest() {
        return null;
      },
    },
  };
  const editorController = {
    ensureVisualMode() {
      calls.push("ensure-visual");
    },
    recordHistorySnapshot() {
      calls.push("history");
    },
    commitDomChange() {
      calls.push("commit");
    },
  };

  assert.equal(deleteSelectedImage(editorController, doc), false);
  assert.deepEqual(calls, ["ensure-visual"]);
});

test("deleting a marked image works when the image itself is not focused", async () => {
  installMinimalBrowserGlobals();
  const fixture = createFrontendFixture();
  const { deleteSelectedImage } = await fixture.importModule("images.js");
  const calls = [];
  const wrapper = {
    remove() {
      calls.push("remove-wrapper");
    },
  };
  const markedImage = {
    isConnected: true,
    closest(selector) {
      return selector === "section" ? wrapper : null;
    },
  };
  const doc = {
    defaultView: {
      getSelection() {
        return { anchorNode: { nodeType: 3, parentElement: { closest: () => null } } };
      },
    },
    activeElement: {
      closest() {
        return null;
      },
    },
    querySelector(selector) {
      return selector === 'img[data-editor-selected="true"]' ? markedImage : null;
    },
  };
  const editorController = {
    ensureVisualMode() {
      calls.push("ensure-visual");
    },
    recordHistorySnapshot() {
      calls.push("history");
    },
    commitDomChange() {
      calls.push("commit");
    },
  };

  assert.equal(deleteSelectedImage(editorController, doc), true);
  assert.deepEqual(calls, ["ensure-visual", "history", "remove-wrapper", "commit"]);
});
