const editor = document.querySelector("#editor");
const sourceEditor = document.querySelector("#sourceEditor");
const sourceModeBtn = document.querySelector("#sourceModeBtn");
const copyBtn = document.querySelector("#copyBtn");
const clearBtn = document.querySelector("#clearBtn");
const saveDraftBtn = document.querySelector("#saveDraftBtn");
const loadDraftBtn = document.querySelector("#loadDraftBtn");
const insertLinkBtn = document.querySelector("#insertLinkBtn");
const linkInput = document.querySelector("#linkInput");
const foreColor = document.querySelector("#foreColor");
const articleTitle = document.querySelector("#articleTitle");
const articleAuthor = document.querySelector("#articleAuthor");
const statusText = document.querySelector("#statusText");
const toast = document.querySelector("#toast");
const emptyTemplate = document.querySelector("#emptyTemplate");

const draftKey = "wechat-editor-draft";
let sourceMode = false;
let toastTimer = 0;

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  statusText.textContent = message;
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function setDefaultContent() {
  editor.innerHTML = emptyTemplate.innerHTML.trim();
}

function getArticleHtml() {
  const title = articleTitle.value.trim();
  const author = articleAuthor.value.trim();
  const titleHtml = title
    ? `<h1 style="margin: 0 0 12px; color: #111827; font-size: 24px; line-height: 1.35; font-weight: 800;">${escapeHtml(title)}</h1>`
    : "";
  const authorHtml = author
    ? `<p style="margin: 0 0 24px; color: #8a94a6; font-size: 14px;">${escapeHtml(author)}</p>`
    : "";

  return `
    <section style="max-width: 677px; margin: 0 auto; color: #333333; font-size: 16px; line-height: 1.8;">
      ${titleHtml}
      ${authorHtml}
      ${editor.innerHTML}
    </section>
  `.replace(/\n\s+/g, "\n").trim();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlToPlainText(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.innerText.trim();
}

async function copyArticle() {
  if (sourceMode) {
    editor.innerHTML = sourceEditor.value;
  }

  const html = getArticleHtml();
  const text = htmlToPlainText(html);

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
    } else {
      await fallbackCopy(html);
    }
    showToast("已复制微信富文本，可粘贴到公众号后台");
  } catch (error) {
    await fallbackCopy(html);
    showToast("已复制，若样式缺失请用浏览器授权剪贴板");
  }
}

function fallbackCopy(html) {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.contentEditable = "true";
    box.style.position = "fixed";
    box.style.left = "-9999px";
    box.innerHTML = html;
    document.body.appendChild(box);

    const range = document.createRange();
    range.selectNodeContents(box);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("copy");
    selection.removeAllRanges();
    box.remove();
    resolve();
  });
}

function toggleSourceMode() {
  sourceMode = !sourceMode;
  document.querySelector(".phone-frame").classList.toggle("source-active", sourceMode);
  sourceModeBtn.setAttribute("aria-pressed", String(sourceMode));
  sourceModeBtn.textContent = sourceMode ? "返回可视化编辑" : "HTML 源代码编辑";

  if (sourceMode) {
    sourceEditor.value = editor.innerHTML.trim();
    sourceEditor.focus();
    showToast("已进入 HTML 源码模式");
  } else {
    editor.innerHTML = sourceEditor.value.trim() || emptyTemplate.innerHTML.trim();
    editor.focus();
    showToast("已返回可视化编辑");
  }
}

function clearContent() {
  const ok = window.confirm("确认清空正文内容吗？标题和作者会保留。");
  if (!ok) return;

  editor.innerHTML = "";
  sourceEditor.value = "";
  if (sourceMode) {
    sourceEditor.focus();
  } else {
    editor.focus();
  }
  showToast("正文已清空");
}

function saveDraft() {
  const draft = {
    title: articleTitle.value,
    author: articleAuthor.value,
    html: sourceMode ? sourceEditor.value : editor.innerHTML,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(draftKey, JSON.stringify(draft));
  showToast("草稿已保存到本机");
}

function loadDraft() {
  const raw = localStorage.getItem(draftKey);
  if (!raw) {
    showToast("还没有保存过草稿");
    return;
  }
  const draft = JSON.parse(raw);
  articleTitle.value = draft.title || "";
  articleAuthor.value = draft.author || "";
  editor.innerHTML = draft.html || emptyTemplate.innerHTML.trim();
  sourceEditor.value = draft.html || "";
  showToast("草稿已恢复");
}

function insertLink() {
  const url = linkInput.value.trim();
  if (!url) {
    showToast("请先输入链接地址");
    return;
  }
  if (sourceMode) {
    showToast("请先返回可视化编辑再插入链接");
    return;
  }
  editor.focus();
  document.execCommand("createLink", false, url);
  linkInput.value = "";
  showToast("链接已添加到选中文字");
}

document.querySelectorAll(".toolbar button[data-command]").forEach((button) => {
  button.addEventListener("click", () => {
    if (sourceMode) toggleSourceMode();
    editor.focus();
    document.execCommand(button.dataset.command, false, null);
  });
});

foreColor.addEventListener("input", () => {
  if (sourceMode) toggleSourceMode();
  editor.focus();
  document.execCommand("foreColor", false, foreColor.value);
});

copyBtn.addEventListener("click", copyArticle);
clearBtn.addEventListener("click", clearContent);
sourceModeBtn.addEventListener("click", toggleSourceMode);
saveDraftBtn.addEventListener("click", saveDraft);
loadDraftBtn.addEventListener("click", loadDraft);
insertLinkBtn.addEventListener("click", insertLink);

setDefaultContent();
