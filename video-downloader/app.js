import { apiUrl } from "./config.js";
import {
  extractVideoLinks,
  filenameFromUrl,
  formatBytes,
  renamedFilename,
  runDownloadPipeline,
  uniqueFilename,
} from "./core.js";

const elements = {
  urlInput: document.querySelector("#urlInput"),
  sourceTypes: [...document.querySelectorAll('input[name="sourceType"]')],
  clearButton: document.querySelector("#clearButton"),
  chooseFolderButton: document.querySelector("#chooseFolderButton"),
  folderName: document.querySelector("#folderName"),
  renamePattern: document.querySelector("#renamePattern"),
  renamePreview: document.querySelector("#renamePreview"),
  startButton: document.querySelector("#startButton"),
  cancelButton: document.querySelector("#cancelButton"),
  linkCount: document.querySelector("#linkCount"),
  inputHint: document.querySelector("#inputHint"),
  queueTitle: document.querySelector("#queueTitle"),
  queueStats: document.querySelector("#queueStats"),
  emptyState: document.querySelector("#emptyState"),
  downloadList: document.querySelector("#downloadList"),
  visitorCount: document.querySelector("#visitorCount"),
  visitorCountValue: document.querySelector("#visitorCountValue"),
  toast: document.querySelector("#toast"),
};

const VISITOR_STORAGE_KEY = "wechat-editor-video-downloader-visitor-v1";

const state = {
  directoryHandle: null,
  outputDirectory: "",
  items: [],
  running: false,
  cancelled: false,
  controllers: new Set(),
  toastTimer: 0,
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3200);
}

async function syncVisitorCount() {
  let hasVisited = true;
  let storageAvailable = true;
  try {
    hasVisited = window.localStorage.getItem(VISITOR_STORAGE_KEY) === "1";
  } catch (error) {
    storageAvailable = false;
  }

  try {
    const response = await fetch(apiUrl("/video-download/visits"), hasVisited || !storageAvailable
      ? { method: "GET", cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Editor-Request": "1" },
          body: "{}",
        });
    if (!response.ok) return;
    const payload = await response.json();
    const count = Number(payload.count);
    if (!Number.isSafeInteger(count) || count < 0) return;
    if (!hasVisited && storageAvailable) window.localStorage.setItem(VISITOR_STORAGE_KEY, "1");
    elements.visitorCountValue.textContent = count.toLocaleString("zh-CN");
    elements.visitorCount.hidden = false;
  } catch (error) {
    // Visitor statistics must never interrupt the downloader workflow.
  }
}

function statusLabel(item) {
  if (item.status === "resolving") return "解析中";
  if (item.status === "ready") return "待下载";
  if (item.status === "downloading") {
    if (item.total > 0) return `${Math.min(100, Math.round((item.loaded / item.total) * 100))}%`;
    return item.loaded > 0 ? formatBytes(item.loaded) : "下载中";
  }
  return {
    queued: "等待中",
    done: "已完成",
    error: "失败",
    cancelled: "已停止",
  }[item.status] || "等待中";
}

function renderQueue() {
  const total = state.items.length;
  const done = state.items.filter((item) => item.status === "done").length;
  const failed = state.items.filter((item) => item.status === "error").length;
  elements.emptyState.hidden = total > 0;
  elements.downloadList.hidden = total === 0;
  elements.queueTitle.textContent = total ? `${total} 个下载任务` : "准备就绪";
  elements.queueStats.textContent = total
    ? `已完成 ${done}${failed ? ` · 失败 ${failed}` : ""} · 共 ${total}`
    : "";
  elements.downloadList.innerHTML = state.items
    .map((item, index) => {
      const progress = item.total > 0 ? Math.min(100, (item.loaded / item.total) * 100) : 0;
      const sourceMeta = item.sourceType === "douyin" ? "抖音原视频 · 无 App Logo" : "高清原文件 · MP4";
      const meta = item.error || (item.total ? `${formatBytes(item.loaded)} / ${formatBytes(item.total)}` : sourceMeta);
      return `<li class="download-item">
        <span class="item-index">${String(index + 1).padStart(2, "0")}</span>
        <div class="item-copy">
          <p class="item-name" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</p>
          <p class="item-meta">${escapeHtml(meta)}</p>
          ${item.status === "downloading" ? `<div class="progress-track" aria-hidden="true"><div class="progress-bar" style="width:${progress}%"></div></div>` : ""}
        </div>
        <span class="item-state" data-state="${escapeHtml(item.status)}">${escapeHtml(statusLabel(item))}</span>
      </li>`;
    })
    .join("");
}

function updateControls() {
  elements.startButton.disabled = state.running || (!state.directoryHandle && !state.outputDirectory) || state.items.length === 0;
  elements.chooseFolderButton.disabled = state.running;
  elements.clearButton.disabled = state.running;
  elements.urlInput.disabled = state.running;
  elements.renamePattern.disabled = state.running;
  elements.cancelButton.hidden = !state.running;
  elements.startButton.hidden = state.running;
}

function applyPendingFilenames(usedNames = new Set()) {
  const today = new Date();
  state.items.forEach((item, index) => {
    if (item.status === "done") {
      usedNames.add(item.filename.toLowerCase());
      return;
    }
    const renamed = renamedFilename(
      elements.renamePattern.value,
      item.sourceFilename,
      index + 1,
      state.items.length,
      today,
    );
    item.filename = uniqueFilename(renamed, usedNames);
  });
  const exampleSource = state.items[0]?.sourceFilename || "original-video.mp4";
  elements.renamePreview.textContent = `示例：${renamedFilename(elements.renamePattern.value, exampleSource, 1, Math.max(1, state.items.length), today)}`;
}

function syncInput() {
  const sourceType = elements.sourceTypes.find((input) => input.checked)?.value || "douyin";
  const result = extractVideoLinks(elements.urlInput.value, sourceType);
  const previous = new Map(state.items.map((item) => [item.url, item]));
  state.items = result.links.map((url) => {
    const existing = previous.get(url);
    if (existing) return existing;
    const sourceFilename = filenameFromUrl(url);
    return {
      url,
      sourceFilename,
      filename: sourceFilename,
      status: "queued",
      loaded: 0,
      total: 0,
      error: "",
      sourceType,
    };
  });
  applyPendingFilenames();

  if (!result.links.length) {
    elements.linkCount.textContent = elements.urlInput.value.trim() ? "没有可用链接" : "等待粘贴链接";
  } else {
    elements.linkCount.textContent = `已识别 ${result.links.length} 个视频`;
  }
  const notes = [];
  if (result.duplicateCount) notes.push(`已去重 ${result.duplicateCount} 个`);
  if (result.unsupportedCount) notes.push(`忽略 ${result.unsupportedCount} 个不支持的链接`);
  const defaultHint = sourceType === "douyin"
    ? "自动解析不带抖音 App Logo 的原视频流"
    : "仅处理 adsmind.gdtimg.com 的 MP4 原视频直链";
  elements.inputHint.textContent = notes.join(" · ") || defaultHint;
  elements.urlInput.placeholder = sourceType === "douyin"
    ? "粘贴抖音视频链接，每行一条；也支持 Markdown 表格或混合文本。"
    : "粘贴 adsmind.gdtimg.com 的 MP4 链接，每行一条。";
  renderQueue();
  updateControls();
}

async function chooseFolder() {
  elements.chooseFolderButton.disabled = true;
  elements.folderName.textContent = "正在打开选择窗口…";
  try {
    let browserPickerError = null;
    if ("showDirectoryPicker" in window && window.isSecureContext) {
      try {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        state.directoryHandle = handle;
        state.outputDirectory = "";
        elements.folderName.textContent = handle.name;
        elements.chooseFolderButton.title = handle.name;
        showToast(`已选择文件夹：${handle.name}`);
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
        browserPickerError = error;
      }
    }
    const response = await fetch(apiUrl("/video-download/folder-picker"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Editor-Request": "1" },
      body: "{}",
    });
    if (response.ok) {
      const selected = await response.json();
      if (selected.path) {
        state.outputDirectory = selected.path;
        state.directoryHandle = null;
        elements.folderName.textContent = selected.name || selected.path;
        elements.chooseFolderButton.title = selected.path;
        showToast(`已选择文件夹：${selected.path}`);
        return;
      }
      elements.folderName.textContent = state.outputDirectory ? pathLabel(state.outputDirectory) : "选择本地文件夹";
      return;
    }
    throw new Error(browserPickerError?.message || await responseError(response));
  } catch (error) {
    elements.folderName.textContent = state.directoryHandle?.name || (state.outputDirectory ? pathLabel(state.outputDirectory) : "选择本地文件夹");
    if (error.name !== "AbortError") showToast(error.message || "无法打开文件夹选择窗口");
  } finally {
    updateControls();
  }
}

function pathLabel(value) {
  return String(value || "").split(/[\\/]/).filter(Boolean).pop() || value;
}

async function existingFilenames() {
  const names = new Set();
  if (!state.directoryHandle) return names;
  for await (const [name] of state.directoryHandle.entries()) names.add(name.toLowerCase());
  return names;
}

async function responseError(response) {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message || `下载请求失败（${response.status}）`;
}

async function downloadItem(item) {
  const controller = new AbortController();
  state.controllers.add(controller);
  let writable;
  let fileCreated = false;
  item.status = "downloading";
  item.error = "";
  item.loaded = 0;
  renderQueue();

  try {
    if (state.outputDirectory) {
      const response = await fetch(apiUrl("/video-download/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Editor-Request": "1" },
        body: JSON.stringify({
          url: item.url,
          resolvedUrl: item.resolvedUrl || undefined,
          filename: item.filename,
          outputDirectory: state.outputDirectory,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response));
      const saved = await response.json();
      item.filename = saved.filename || item.filename;
      item.loaded = Number(saved.bytes || 0);
      item.total = item.loaded;
      item.status = "done";
      return;
    }

    const response = await fetch(apiUrl("/video-download"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Editor-Request": "1" },
      body: JSON.stringify({ url: item.url, resolvedUrl: item.resolvedUrl || undefined }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await responseError(response));
    if (!response.body) throw new Error("浏览器无法读取视频数据流");

    item.total = Number(response.headers.get("content-length") || 0);
    const fileHandle = await state.directoryHandle.getFileHandle(item.filename, { create: true });
    fileCreated = true;
    writable = await fileHandle.createWritable();
    const reader = response.body.getReader();
    let lastRender = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      item.loaded += value.byteLength;
      const now = performance.now();
      if (now - lastRender > 120) {
        lastRender = now;
        renderQueue();
      }
    }
    await writable.close();
    writable = null;
    item.status = "done";
  } catch (error) {
    if (writable) await writable.abort().catch(() => {});
    if (fileCreated && state.directoryHandle.removeEntry) {
      await state.directoryHandle.removeEntry(item.filename).catch(() => {});
    }
    item.status = controller.signal.aborted || state.cancelled ? "cancelled" : "error";
    item.error = item.status === "cancelled" ? "下载已停止，未完成文件已清理" : (error.message || "下载失败");
  } finally {
    state.controllers.delete(controller);
    renderQueue();
  }
}

async function resolveItem(item) {
  item.error = "";
  if (item.sourceType !== "douyin") {
    item.status = "ready";
    renderQueue();
    return;
  }

  const controller = new AbortController();
  state.controllers.add(controller);
  item.status = "resolving";
  renderQueue();
  try {
    const response = await fetch(apiUrl("/video-download/resolve"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Editor-Request": "1" },
      body: JSON.stringify({ url: item.url }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await responseError(response));
    const payload = await response.json();
    if (!payload.resolvedUrl) throw new Error("未能解析抖音原视频地址");
    item.resolvedUrl = payload.resolvedUrl;
    item.status = "ready";
  } catch (error) {
    item.status = controller.signal.aborted || state.cancelled ? "cancelled" : "error";
    item.error = item.status === "cancelled" ? "解析已停止" : (error.message || "解析失败");
  } finally {
    state.controllers.delete(controller);
    renderQueue();
  }
}

async function startDownloads() {
  if ((!state.directoryHandle && !state.outputDirectory) || state.running) return;
  const pending = state.items.filter((item) => item.status !== "done");
  if (!pending.length) {
    showToast("所有视频都已下载完成。");
    return;
  }

  try {
    const usedNames = await existingFilenames();
    applyPendingFilenames(usedNames);
    for (const item of pending) {
      item.status = "queued";
      item.error = "";
      item.loaded = 0;
      item.total = 0;
      item.resolvedUrl = "";
    }
  } catch (error) {
    showToast("无法读取文件夹内容，请重新选择文件夹。");
    return;
  }

  state.running = true;
  state.cancelled = false;
  updateControls();
  renderQueue();
  await runDownloadPipeline(pending, {
    resolve: resolveItem,
    download: downloadItem,
    downloadConcurrency: 2,
    isCancelled: () => state.cancelled,
  });
  if (state.cancelled) {
    for (const item of pending) {
      if (item.status === "queued") item.status = "cancelled";
    }
  }
  state.running = false;
  updateControls();
  renderQueue();

  const done = state.items.filter((item) => item.status === "done").length;
  const failed = state.items.filter((item) => item.status === "error").length;
  if (state.cancelled) showToast(`下载已停止，已完成 ${done} 个。`);
  else if (failed) showToast(`下载结束：成功 ${done} 个，失败 ${failed} 个。`);
  else showToast(`${done} 个视频已全部保存到“${state.directoryHandle?.name || pathLabel(state.outputDirectory)}”。`);
}

function cancelDownloads() {
  state.cancelled = true;
  for (const controller of state.controllers) controller.abort();
  elements.cancelButton.disabled = true;
}

elements.urlInput.addEventListener("input", syncInput);
for (const input of elements.sourceTypes) {
  input.addEventListener("change", () => {
    elements.urlInput.value = "";
    syncInput();
    elements.urlInput.focus();
  });
}
elements.renamePattern.addEventListener("input", () => {
  applyPendingFilenames();
  renderQueue();
});
elements.clearButton.addEventListener("click", () => {
  elements.urlInput.value = "";
  syncInput();
  elements.urlInput.focus();
});
elements.chooseFolderButton.addEventListener("click", chooseFolder);
elements.startButton.addEventListener("click", startDownloads);
elements.cancelButton.addEventListener("click", cancelDownloads);
window.addEventListener("beforeunload", (event) => {
  if (!state.running) return;
  event.preventDefault();
  event.returnValue = "";
});

syncInput();
void syncVisitorCount();
