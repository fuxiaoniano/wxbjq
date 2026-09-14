"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const parse5 = require("parse5");
const { createHttpError, verifyWriteRequest } = require("../security");
const { applySecurityHeaders, sendError, sendJson } = require("../responses");

const ALLOWED_VIDEO_HOSTS = new Set(["adsmind.gdtimg.com"]);
const DOUYIN_PAGE_HOSTS = new Set(["douyin.com", "www.douyin.com"]);
const DOUYIN_RENDER_TIMEOUT_MS = 60 * 1000;
const DOUYIN_VIRTUAL_TIME_MS = 12 * 1000;
const CHROME_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const execFileAsync = promisify(execFile);

function parseVideoUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch (error) {
    throw createHttpError(400, "INVALID_VIDEO_URL", "视频链接格式不正确");
  }

  const host = url.hostname.toLowerCase();
  const isDirectVideo = ALLOWED_VIDEO_HOSTS.has(host) && url.pathname.toLowerCase().endsWith(".mp4");
  const douyinMatch = DOUYIN_PAGE_HOSTS.has(host) && url.pathname.match(/^\/video\/(\d+)\/?$/i);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || (!isDirectVideo && !douyinMatch)) {
    throw createHttpError(
      400,
      "UNSUPPORTED_VIDEO_URL",
      "仅支持抖音视频页或 adsmind.gdtimg.com 的 MP4 原视频链接",
    );
  }
  url.hash = "";
  if (douyinMatch) {
    url.protocol = "https:";
    url.hostname = "www.douyin.com";
    url.pathname = `/video/${douyinMatch[1]}`;
    url.search = "";
  }
  return url;
}

function isDouyinPageUrl(url) {
  return DOUYIN_PAGE_HOSTS.has(url.hostname.toLowerCase()) && /^\/video\/\d+$/i.test(url.pathname);
}

function parseMediaUrl(value) {
  let url;
  try {
    url = value instanceof URL ? new URL(value) : new URL(String(value || ""));
  } catch (error) {
    throw createHttpError(502, "INVALID_VIDEO_SOURCE", "解析到的视频源地址无效");
  }
  const host = url.hostname.toLowerCase();
  const isAdsmind = ALLOWED_VIDEO_HOSTS.has(host) && url.pathname.toLowerCase().endsWith(".mp4");
  const isDouyinCdn = host === "douyinvod.com" || host.endsWith(".douyinvod.com");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isAdsmind)) {
    throw createHttpError(502, "INVALID_VIDEO_SOURCE", "解析到的视频源协议不安全");
  }
  if (url.username || url.password || url.port || (!isAdsmind && !isDouyinCdn)) {
    throw createHttpError(502, "UNSUPPORTED_VIDEO_SOURCE", "解析到的视频源不在允许的服务器范围内");
  }
  url.hash = "";
  return url;
}

function attributeValue(node, name) {
  return node.attrs?.find((attribute) => attribute.name === name)?.value || "";
}

function collectSourceUrls(node, urls = []) {
  if (!node || typeof node !== "object") return urls;
  if (node.tagName === "video" || node.tagName === "source") {
    const source = attributeValue(node, "src");
    if (source) urls.push(source);
  }
  for (const child of node.childNodes || []) collectSourceUrls(child, urls);
  return urls;
}

function sourceBitrate(url) {
  const bitrate = Number(url.searchParams.get("br") || 0);
  return Number.isFinite(bitrate) ? bitrate : 0;
}

function extractDouyinSourceFromHtml(html) {
  const document = parse5.parse(String(html || ""));
  const sources = [];
  for (const value of collectSourceUrls(document)) {
    try {
      sources.push(parseMediaUrl(value));
    } catch (error) {
      // Ignore non-video sources and retain the strict host check for accepted candidates.
    }
  }
  sources.sort((left, right) => sourceBitrate(right) - sourceBitrate(left));
  if (!sources.length) {
    throw createHttpError(
      502,
      "DOUYIN_VIDEO_NOT_FOUND",
      "未能解析抖音原视频，请确认链接可公开播放后重试",
    );
  }
  return sources[0];
}

function chromeCandidates(explicitPath) {
  const candidates = [explicitPath];
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
  }
  return candidates.filter(Boolean);
}

function findChromeExecutable(explicitPath = process.env.VIDEO_DOWNLOADER_CHROME_PATH) {
  const executable = chromeCandidates(explicitPath).find((candidate) => fs.existsSync(candidate));
  if (!executable) {
    throw createHttpError(
      503,
      "CHROME_NOT_FOUND",
      "解析抖音链接需要安装 Chrome，或设置 VIDEO_DOWNLOADER_CHROME_PATH",
    );
  }
  return executable;
}

async function resolveDouyinVideo(url, options = {}) {
  const executable = findChromeExecutable(options.chromePath);
  const profileRoot = path.resolve(os.tmpdir());
  const profileDirectory = await fs.promises.mkdtemp(path.join(profileRoot, "wechat-editor-douyin-"));
  try {
    const execute = options.execFile || execFileAsync;
    const { stdout } = await execute(executable, [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profileDirectory}`,
      `--virtual-time-budget=${DOUYIN_VIRTUAL_TIME_MS}`,
      "--dump-dom",
      url.toString(),
    ], {
      encoding: "utf8",
      timeout: DOUYIN_RENDER_TIMEOUT_MS,
      maxBuffer: CHROME_MAX_OUTPUT_BYTES,
      windowsHide: true,
    });
    return extractDouyinSourceFromHtml(stdout);
  } catch (error) {
    if (error.statusCode) throw error;
    if (error.stdout) {
      try {
        return extractDouyinSourceFromHtml(error.stdout);
      } catch (parseError) {
        // Continue with the more useful renderer error below.
      }
    }
    if (error.killed || error.code === "ETIMEDOUT") {
      throw createHttpError(504, "DOUYIN_RENDER_TIMEOUT", "抖音页面解析超时，请稍后重试");
    }
    throw createHttpError(502, "DOUYIN_RENDER_FAILED", "无法解析抖音页面，请确认链接可公开播放");
  } finally {
    if (path.dirname(profileDirectory) === profileRoot) {
      await fs.promises.rm(profileDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function resolveVideoUrl(inputUrl, config = {}) {
  if (!isDouyinPageUrl(inputUrl)) return parseMediaUrl(inputUrl);
  if (config.douyinVideoResolver) {
    return parseMediaUrl(await config.douyinVideoResolver(inputUrl));
  }
  return resolveDouyinVideo(inputUrl, { chromePath: config.videoDownloaderChromePath });
}

function filenameFromVideoUrl(url) {
  let basename = "video.mp4";
  try {
    basename = decodeURIComponent(path.posix.basename(url.pathname)) || basename;
  } catch (error) {
    basename = path.posix.basename(url.pathname) || basename;
  }
  const safeName = basename
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);
  return (safeName || "video.mp4").toLowerCase().endsWith(".mp4")
    ? safeName
    : `${safeName || "video"}.mp4`;
}

function safeRequestedFilename(value) {
  const basename = path.basename(String(value || "video.mp4"))
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 180) || "video.mp4";
  const withExtension = basename.toLowerCase().endsWith(".mp4") ? basename : `${basename}.mp4`;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(withExtension)
    ? `_${withExtension}`
    : withExtension;
}

function isLoopbackRequest(req, config) {
  const address = String(req.socket.remoteAddress || "").toLowerCase();
  return config.deploymentMode === "local" && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
}

function requireLocalRequest(req, config) {
  if (!isLoopbackRequest(req, config)) {
    throw createHttpError(403, "LOCAL_ACCESS_REQUIRED", "选择本地文件夹仅限本机访问");
  }
}

async function pickNativeFolder(config) {
  if (process.platform !== "win32" && !config.videoFolderPicker) {
    throw createHttpError(501, "NATIVE_PICKER_UNAVAILABLE", "当前系统不支持原生文件夹选择器");
  }
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.Description = '选择视频保存文件夹'",
    "$dialog.ShowNewFolderButton = $true",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "  [Console]::Write($dialog.SelectedPath)",
    "}",
  ].join("\n");
  try {
    const { stdout } = await (config.videoFolderPicker
      ? config.videoFolderPicker()
      : execFileAsync(executable, ["-NoProfile", "-STA", "-Command", script], {
          encoding: "utf8",
          windowsHide: false,
          maxBuffer: 16 * 1024,
        }));
    return String(stdout || "").trim();
  } catch (error) {
    throw createHttpError(500, "FOLDER_PICKER_FAILED", "无法打开文件夹选择窗口");
  }
}

async function validateOutputDirectory(value) {
  const raw = String(value || "").trim();
  if (!raw || !path.isAbsolute(raw)) {
    throw createHttpError(400, "INVALID_OUTPUT_DIRECTORY", "请选择有效的本地文件夹");
  }
  const outputDirectory = path.resolve(raw);
  let stat;
  try {
    stat = await fs.promises.stat(outputDirectory);
  } catch (error) {
    throw createHttpError(400, "OUTPUT_DIRECTORY_NOT_FOUND", "所选文件夹不存在");
  }
  if (!stat.isDirectory()) {
    throw createHttpError(400, "INVALID_OUTPUT_DIRECTORY", "保存位置必须是文件夹");
  }
  return outputDirectory;
}

async function reserveOutputFile(outputDirectory, requestedFilename) {
  const filename = safeRequestedFilename(requestedFilename);
  const extension = path.extname(filename);
  const stem = filename.slice(0, -extension.length);
  for (let number = 1; number <= 10_000; number += 1) {
    const candidate = number === 1 ? filename : `${stem} (${number})${extension}`;
    const filePath = path.join(outputDirectory, candidate);
    try {
      const handle = await fs.promises.open(filePath, "wx");
      return { candidate, filePath, handle };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw createHttpError(409, "FILENAME_CONFLICT", "同名文件过多，请修改重命名规则");
}

function redirectLocation(response, currentUrl) {
  if (![301, 302, 303, 307, 308].includes(response.status)) return null;
  const location = response.headers.get("location");
  if (!location) {
    throw createHttpError(502, "INVALID_VIDEO_RESPONSE", "视频服务器返回了无效重定向");
  }
  return parseMediaUrl(new URL(location, currentUrl).toString());
}

async function fetchVideo(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const signal = options.signal;
  let currentUrl = url;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let response;
    try {
      response = await fetchImpl(currentUrl, {
        redirect: "manual",
        signal,
        headers: {
          Accept: "video/mp4,video/*;q=0.9,*/*;q=0.1",
          Referer: options.referer || "https://www.douyin.com/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
        },
      });
    } catch (error) {
      if (signal?.aborted) {
        throw createHttpError(504, "VIDEO_DOWNLOAD_TIMEOUT", "视频下载已超时或中断");
      }
      throw createHttpError(502, "VIDEO_FETCH_FAILED", "无法连接视频服务器");
    }

    const redirected = redirectLocation(response, currentUrl);
    if (redirected) {
      if (redirects === MAX_REDIRECTS) {
        throw createHttpError(502, "TOO_MANY_REDIRECTS", "视频链接重定向次数过多");
      }
      currentUrl = redirected;
      continue;
    }

    if (!response.ok || !response.body) {
      throw createHttpError(
        502,
        "VIDEO_SOURCE_REJECTED",
        response.status === 401 || response.status === 403
          ? "视频链接已失效或被来源服务器拒绝"
          : `视频服务器返回异常状态（${response.status}）`,
      );
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_VIDEO_BYTES) {
      throw createHttpError(413, "VIDEO_TOO_LARGE", "单个视频不能超过 2 GB");
    }
    return { response, finalUrl: currentUrl };
  }

  throw createHttpError(502, "VIDEO_FETCH_FAILED", "无法获取视频文件");
}

function createSizeLimitStream() {
  let received = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > MAX_VIDEO_BYTES) {
        callback(createHttpError(413, "VIDEO_TOO_LARGE", "单个视频不能超过 2 GB"));
        return;
      }
      callback(null, chunk);
    },
  });
}

async function handleVideoDownloaderApi(req, res, config, pathname, readBody) {
  const supportedPath = [
    "/api/video-download",
    "/api/video-download/resolve",
    "/api/video-download/folder-picker",
    "/api/video-download/save",
  ].includes(pathname);
  if (!supportedPath) return false;
  if (req.method !== "POST") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "请使用 POST 请求下载视频");
    return true;
  }

  verifyWriteRequest(req, config, { requireStorage: false });
  const body = await readBody(req, config);
  if (pathname === "/api/video-download/folder-picker") {
    requireLocalRequest(req, config);
    const selectedPath = await pickNativeFolder(config);
    const payload = selectedPath
      ? { path: selectedPath, name: path.basename(selectedPath) || selectedPath }
      : { path: "", name: "" };
    sendJson(res, 200, payload);
    return true;
  }

  const inputUrl = parseVideoUrl(body.url);
  if (pathname === "/api/video-download/resolve") {
    const sourceUrl = await resolveVideoUrl(inputUrl, config);
    sendJson(res, 200, { resolvedUrl: sourceUrl.toString() });
    return true;
  }
  let outputDirectory = "";
  if (pathname === "/api/video-download/save") {
    requireLocalRequest(req, config);
    outputDirectory = await validateOutputDirectory(body.outputDirectory);
  }
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), DOWNLOAD_TIMEOUT_MS);
  timeout.unref?.();
  const abortOnDisconnect = () => {
    if (!res.writableEnded) abortController.abort();
  };
  req.once("aborted", abortOnDisconnect);
  res.once("close", abortOnDisconnect);

  try {
    if (body.resolvedUrl && !isDouyinPageUrl(inputUrl)) {
      throw createHttpError(400, "INVALID_RESOLVED_VIDEO", "预解析地址仅适用于抖音视频");
    }
    const sourceUrl = body.resolvedUrl
      ? parseMediaUrl(body.resolvedUrl)
      : await resolveVideoUrl(inputUrl, config);
    const { response, finalUrl } = await fetchVideo(sourceUrl, {
      fetchImpl: config.videoDownloadFetch,
      referer: isDouyinPageUrl(inputUrl) ? inputUrl.toString() : "https://ad.qq.com/",
      signal: abortController.signal,
    });
    if (pathname === "/api/video-download/save") {
      const reserved = await reserveOutputFile(
        outputDirectory,
        body.filename || filenameFromVideoUrl(finalUrl),
      );
      let saved = false;
      try {
        await pipeline(
          Readable.fromWeb(response.body),
          createSizeLimitStream(),
          reserved.handle.createWriteStream(),
        );
        saved = true;
      } finally {
        if (!saved) {
          await reserved.handle.close().catch(() => {});
          await fs.promises.unlink(reserved.filePath).catch(() => {});
        }
      }
      const stat = await fs.promises.stat(reserved.filePath);
      sendJson(res, 200, { filename: reserved.candidate, bytes: stat.size });
      return true;
    }
    const filename = safeRequestedFilename(body.filename || filenameFromVideoUrl(inputUrl));
    const contentLength = response.headers.get("content-length");
    const headers = {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "_")}"`,
      "Cache-Control": "no-store",
      "Accept-Ranges": "none",
    };
    if (contentLength && /^\d+$/.test(contentLength)) headers["Content-Length"] = contentLength;
    applySecurityHeaders(res, headers);
    res.writeHead(200);

    try {
      await pipeline(Readable.fromWeb(response.body), createSizeLimitStream(), res);
    } catch (error) {
      if (!res.destroyed) res.destroy(error);
    }
  } finally {
    clearTimeout(timeout);
    req.off("aborted", abortOnDisconnect);
    res.off("close", abortOnDisconnect);
  }
  return true;
}

module.exports = {
  ALLOWED_VIDEO_HOSTS,
  DOUYIN_PAGE_HOSTS,
  extractDouyinSourceFromHtml,
  fetchVideo,
  findChromeExecutable,
  filenameFromVideoUrl,
  handleVideoDownloaderApi,
  isLoopbackRequest,
  parseVideoUrl,
  resolveDouyinVideo,
  resolveVideoUrl,
  safeRequestedFilename,
  validateOutputDirectory,
};
