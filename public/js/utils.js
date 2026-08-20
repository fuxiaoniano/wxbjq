export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function debounce(fn, delay = 200) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

export function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 1024 * 100 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function getTextBytes(text) {
  return new Blob([text || ""]).size;
}

export const DEFAULT_INLINE_IMAGE_MAX_BYTES = 640 * 1024;

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function htmlToPlainText(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html || "";
  return wrapper.innerText.trim();
}

export function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function readFileAsText(file, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("没有选择文件"));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error("文件过大"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file, "utf-8");
  });
}

export function readFileAsDataUrl(file, maxBytes = DEFAULT_INLINE_IMAGE_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("没有选择文件"));
      return;
    }
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      reject(new Error("仅支持 jpg、png、webp、gif 图片"));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error(`本地图片不能超过 ${formatBytes(maxBytes)}，建议压缩后再插入或使用图片 URL`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export function writeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

export function readLocalJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

export function removeLocalKey(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // ignore storage failures
  }
}

let toastTimer = 0;

export function showToast(message, statusMessage = message) {
  const toast = qs("#toast");
  const statusText = qs("#statusText");
  if (statusText) statusText.textContent = statusMessage;
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

export function openModal(modal) {
  modal.hidden = false;
  modal.classList.add("open");
  document.body.classList.add("modal-open");
}

export function closeModal(modal) {
  modal.classList.remove("open");
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

export function safeJsonStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
