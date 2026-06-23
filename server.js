const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const dataRoot = path.join(root, "data");
const draftsRoot = path.join(dataRoot, "drafts");
const systemTemplatesFile = path.join(root, "system-templates.json");
const port = Number(process.env.PORT || 8090);
const types = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
};

function ensureDataStore() {
  fs.mkdirSync(draftsRoot, { recursive: true });
  if (!fs.existsSync(systemTemplatesFile)) {
    fs.writeFileSync(systemTemplatesFile, "[]\n", "utf8");
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json;charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendEmpty(res, statusCode) {
  res.writeHead(statusCode, { "Cache-Control": "no-store" });
  res.end();
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function normalizeTemplates(templates) {
  if (!Array.isArray(templates)) return [];

  return templates
    .filter((template) => template && template.id && template.name && template.html)
    .map((template) => ({
      ...template,
      id: String(template.id),
      name: String(template.name).slice(0, 80),
      category: String(template.category || "导入系统模板").slice(0, 80),
      html: String(template.html),
    }));
}

function normalizeDraft(draft) {
  if (!draft || !draft.html) return null;
  const id = String(draft.id || `draft-${Date.now()}`).replace(/[^\w-]/g, "");
  if (!id) return null;

  return {
    id,
    title: String(draft.title || "未命名草稿").slice(0, 80),
    html: String(draft.html),
    savedAt: draft.savedAt || new Date().toISOString(),
  };
}

function isSafeId(id) {
  return /^[\w-]+$/.test(id);
}

function getDraftFile(id) {
  if (!isSafeId(id)) return "";
  const filePath = path.resolve(draftsRoot, `${id}.json`);
  const relative = path.relative(draftsRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "";
  return filePath;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

async function listDrafts() {
  ensureDataStore();
  const files = await fs.promises.readdir(draftsRoot);
  const drafts = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        const filePath = path.join(draftsRoot, file);
        const draft = normalizeDraft(readJsonFile(filePath, null));
        if (!draft) return null;
        const stat = await fs.promises.stat(filePath);
        return {
          id: draft.id,
          title: draft.title,
          savedAt: draft.savedAt,
          bytes: stat.size,
        };
      }),
  );

  return drafts.filter(Boolean).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

async function handleApi(req, res, requestUrl) {
  ensureDataStore();

  if (requestUrl.pathname === "/api/system-templates" && req.method === "GET") {
    sendJson(res, 200, normalizeTemplates(readJsonFile(systemTemplatesFile, [])));
    return;
  }

  if (requestUrl.pathname === "/api/system-templates" && req.method === "PUT") {
    try {
      const body = await readRequestBody(req);
      const templates = normalizeTemplates(body.templates || body);
      await fs.promises.writeFile(systemTemplatesFile, `${JSON.stringify(templates, null, 2)}\n`, "utf8");
      sendJson(res, 200, templates);
    } catch (error) {
      sendJson(res, 400, { error: "Invalid system template payload" });
    }
    return;
  }

  if (requestUrl.pathname === "/api/drafts" && req.method === "GET") {
    sendJson(res, 200, await listDrafts());
    return;
  }

  if (requestUrl.pathname === "/api/drafts" && req.method === "POST") {
    try {
      const draft = normalizeDraft(await readRequestBody(req));
      if (!draft) {
        sendJson(res, 400, { error: "Invalid draft payload" });
        return;
      }

      const filePath = getDraftFile(draft.id);
      if (!filePath) {
        sendJson(res, 400, { error: "Invalid draft id" });
        return;
      }

      await fs.promises.writeFile(filePath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
      const stat = await fs.promises.stat(filePath);
      sendJson(res, 201, {
        id: draft.id,
        title: draft.title,
        savedAt: draft.savedAt,
        bytes: stat.size,
      });
    } catch (error) {
      sendJson(res, 400, { error: "Invalid draft payload" });
    }
    return;
  }

  const draftMatch = requestUrl.pathname.match(/^\/api\/drafts\/([\w-]+)$/);
  if (draftMatch) {
    const id = draftMatch[1];
    const filePath = getDraftFile(id);

    if (!filePath) {
      sendJson(res, 400, { error: "Invalid draft id" });
      return;
    }

    if (req.method === "GET") {
      if (!fs.existsSync(filePath)) {
        sendJson(res, 404, { error: "Draft not found" });
        return;
      }
      sendJson(res, 200, normalizeDraft(readJsonFile(filePath, null)));
      return;
    }

    if (req.method === "DELETE") {
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          sendJson(res, 500, { error: "Failed to delete draft" });
          return;
        }
      }
      sendEmpty(res, 204);
      return;
    }
  }

  sendJson(res, 404, { error: "Not found" });
}

function getStaticFilePath(urlPath) {
  const normalizedPath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.resolve(root, `.${normalizedPath}`);
  const relative = path.relative(root, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) return "";
  return filePath;
}

const server = http
  .createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, requestUrl);
      return;
    }

    let urlPath = decodeURIComponent(requestUrl.pathname);
    if (urlPath === "/") urlPath = "/index.html";

    const filePath = getStaticFilePath(urlPath);
    if (!filePath) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, buffer) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, {
        "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(buffer);
    });
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`微信编辑器已启动：http://127.0.0.1:${port}`);
  });

module.exports = server;
