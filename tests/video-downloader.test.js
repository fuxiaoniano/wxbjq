"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createTestApp } = require("./app-helper");
const {
  fetchVideo,
  filenameFromVideoUrl,
  extractDouyinSourceFromHtml,
  douyinVideoIdFromRedirect,
  expandDouyinShortUrl,
  parseVideoUrl,
  safeRequestedFilename,
} = require("../server/video-downloader/controller");

const rootDir = path.resolve(__dirname, "..");

test("video URL validation accepts adsmind MP4 and canonical Douyin video pages", () => {
  const valid = parseVideoUrl("http://adsmind.gdtimg.com/path/original.f0.mp4?token=abc");
  assert.equal(valid.hostname, "adsmind.gdtimg.com");
  assert.equal(filenameFromVideoUrl(valid), "original.f0.mp4");
  const douyin = parseVideoUrl("https://www.douyin.com/video/7660743515634175295");
  assert.equal(douyin.toString(), "https://www.douyin.com/video/7660743515634175295");
  const short = parseVideoUrl("https://v.douyin.com/ZqRI6p-J388/");
  assert.equal(short.toString(), "https://v.douyin.com/ZqRI6p-J388/");
  assert.throws(() => parseVideoUrl("http://127.0.0.1/private.mp4"), /仅支持/);
  assert.throws(() => parseVideoUrl("https://adsmind.gdtimg.com/file.txt"), /仅支持/);
  assert.throws(() => parseVideoUrl("https://adsmind.gdtimg.com:8443/file.mp4"), /仅支持/);
  assert.equal(safeRequestedFilename("../CON.mp4"), "_CON.mp4");
});

test("Douyin share short links expand only to approved video pages", async () => {
  const short = parseVideoUrl("https://v.douyin.com/ZqRI6p-J388/");
  const location = "https://www.iesdouyin.com/share/video/7660128643805717705/?region=CN";
  assert.equal(douyinVideoIdFromRedirect(location, short), "7660128643805717705");
  assert.equal(douyinVideoIdFromRedirect("https://example.com/video/123", short), "");
  const expanded = await expandDouyinShortUrl(short, {
    douyinShortLinkFetch: async () => new Response(null, {
      status: 302,
      headers: { Location: location },
    }),
  });
  assert.equal(expanded.toString(), "https://www.douyin.com/video/7660128643805717705");
});

test("Douyin DOM extraction selects the highest-bitrate no-logo playback source", () => {
  const html = `<video><source src="https://v26-web.douyinvod.com/low/?br=425&amp;mime_type=video_mp4"><source src="https://v26-web.douyinvod.com/high/?br=3166&amp;mime_type=video_mp4"></video>`;
  const resolved = extractDouyinSourceFromHtml(html);
  assert.equal(resolved.hostname, "v26-web.douyinvod.com");
  assert.equal(resolved.pathname, "/high/");
});

test("video fetch rejects redirects outside the approved host", async () => {
  const source = parseVideoUrl("https://adsmind.gdtimg.com/file.mp4");
  await assert.rejects(
    fetchVideo(source, {
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/secret.mp4" },
      }),
    }),
    /视频源/,
  );
});

test("protected video stream endpoint works", async () => {
  const app = await createTestApp();
  try {
    app.config.videoDownloadFetch = async () => new Response(Uint8Array.from([0, 1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "video/mp4", "Content-Length": "4" },
    });
    app.config.douyinVideoResolver = async () => new URL("https://v26-web.douyinvod.com/source/?br=3000");
    const rejected = await app.request("/api/video-download", {
      method: "POST",
      headers: { Origin: app.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://adsmind.gdtimg.com/file.mp4" }),
    });
    assert.equal(rejected.status, 403);

    const response = await app.request("/api/video-download", {
      method: "POST",
      headers: {
        Origin: app.origin,
        "Content-Type": "application/json",
        "X-Editor-Request": "1",
      },
      body: JSON.stringify({ url: "https://adsmind.gdtimg.com/file.mp4" }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), Uint8Array.from([0, 1, 2, 3]));

    const douyinResponse = await app.request("/api/video-download", {
      method: "POST",
      headers: {
        Origin: app.origin,
        "Content-Type": "application/json",
        "X-Editor-Request": "1",
      },
      body: JSON.stringify({
        url: "https://www.douyin.com/video/7660743515634175295",
        filename: "douyin_7660743515634175295.mp4",
      }),
    });
    assert.equal(douyinResponse.status, 200);
    assert.deepEqual(new Uint8Array(await douyinResponse.arrayBuffer()), Uint8Array.from([0, 1, 2, 3]));

    const resolved = await app.post("/api/video-download/resolve", {
      url: "https://www.douyin.com/video/7660743515634175295",
    });
    assert.equal(resolved.response.status, 200);
    assert.equal(resolved.payload.resolvedUrl, "https://v26-web.douyinvod.com/source/?br=3000");

    const outputDirectory = path.dirname(app.config.dataDir);
    const saved = await app.post("/api/video-download/save", {
      url: "https://adsmind.gdtimg.com/file.mp4",
      filename: "素材_01.mp4",
      outputDirectory,
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload.filename, "素材_01.mp4");
    assert.deepEqual(fs.readFileSync(path.join(outputDirectory, "素材_01.mp4")), Buffer.from([0, 1, 2, 3]));

    app.config.videoFolderPicker = async () => ({ stdout: outputDirectory });
    const picked = await app.post("/api/video-download/folder-picker", {});
    assert.equal(picked.response.status, 200);
    assert.equal(picked.payload.path, outputDirectory);
  } finally {
    await app.close();
  }
});

test("browser link extraction handles Markdown tables, escapes, and duplicates", async () => {
  const source = path.join(rootDir, "video-downloader", "core.js");
  const sourceText = fs.readFileSync(source, "utf8");
  const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(sourceText)}`);
  const text = [
    "[http://adsmind.gdtimg.com/a\\_file.mp4?x=1\\&y=2](http://adsmind.gdtimg.com/a_file.mp4?x=1&y=2)",
    "http://adsmind.gdtimg.com/a_file.mp4?x=1&y=2",
    "https://example.com/not-allowed.mp4",
  ].join("\n");
  const result = module.extractVideoLinks(text, "adsmind");
  assert.deepEqual(result.links, ["http://adsmind.gdtimg.com/a_file.mp4?x=1&y=2"]);
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.unsupportedCount, 1);

  const douyinResult = module.extractVideoLinks([
    "https://www.douyin.com/video/7660743515634175295",
    "https://douyin.com/video/7660743515634175295/",
    "https://www.douyin.com/note/123",
  ].join("\n"), "douyin");
  assert.deepEqual(douyinResult.links, ["https://www.douyin.com/video/7660743515634175295"]);
  assert.equal(douyinResult.duplicateCount, 1);
  assert.equal(douyinResult.unsupportedCount, 1);
  assert.equal(module.filenameFromUrl(douyinResult.links[0]), "douyin_7660743515634175295.mp4");

  const shareText = [
    "9.97 :9pm 码字的氛围感 https://v.douyin.com/ZqRI6p-J388/ 复制此链接，打开Dou音搜索",
    "8.99 05/08 奏折手机 https://v.douyin.com/fn3q1WQs2Us/ 复制此链接，直接观看视频",
  ].join("\n");
  const shortLinks = module.extractVideoLinks(shareText, "douyin");
  assert.deepEqual(shortLinks.links, [
    "https://v.douyin.com/ZqRI6p-J388/",
    "https://v.douyin.com/fn3q1WQs2Us/",
  ]);

  const used = new Set(["clip.mp4"]);
  assert.equal(module.uniqueFilename("clip.mp4", used), "clip (2).mp4");
  assert.equal(
    module.renamedFilename("素材_{序号}_{日期}_{原名}", "clip.f0.mp4", 3, 12, new Date(2026, 8, 13)),
    "素材_03_20260913_clip.f0.mp4",
  );
  assert.equal(module.renamedFilename("自定义名称.mp4", "clip.mp4", 1, 1), "自定义名称.mp4");

  const items = [{ id: 1, status: "queued" }, { id: 2, status: "queued" }, { id: 3, status: "queued" }];
  const events = [];
  let releaseFirstDownload;
  let markFirstDownloadStarted;
  const firstDownloadStarted = new Promise((resolve) => {
    markFirstDownloadStarted = resolve;
  });
  await module.runDownloadPipeline(items, {
    resolve: async (item) => {
      events.push(`resolve-${item.id}`);
      item.status = "ready";
      if (item.id === 2) {
        await firstDownloadStarted;
        releaseFirstDownload();
      }
    },
    download: async (item) => {
      events.push(`download-${item.id}-start`);
      if (item.id === 1) {
        markFirstDownloadStarted();
        await new Promise((resolve) => {
          releaseFirstDownload = resolve;
        });
      }
      events.push(`download-${item.id}-end`);
      item.status = "done";
    },
    downloadConcurrency: 2,
    isCancelled: () => false,
  });
  assert.ok(events.indexOf("resolve-2") < events.indexOf("download-1-end"));
});

test("downloader UI remains isolated from the editor assets", () => {
  const html = fs.readFileSync(path.join(rootDir, "video-downloader", "index.html"), "utf8");
  assert.match(html, /\.\/styles\.css/);
  assert.match(html, /\.\/app\.js/);
  assert.match(html, /value="douyin" checked/);
  assert.match(html, /value="adsmind"/);
  assert.match(html, /name="app-base-path" content="\/wechat-editor\/public"/);
  assert.match(html, /https:\/\/fuxiaonian\.net\//);
  assert.doesNotMatch(html, /返回微信编辑器|\.\.\/js\//);
});
