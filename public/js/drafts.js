import { apiJson } from "./api.js";
import { canUseServerStorage } from "./config.js";
import { clearRecovery } from "./autosave.js";
import { analyzeArticle } from "./statistics.js";
import { sanitizeEditorHtml, isHtmlEmpty } from "./sanitizer.js?v=2.1.3-src-placeholder-fix";
import {
  closeModal,
  createId,
  escapeHtml,
  formatBytes,
  formatDateTime,
  htmlToPlainText,
  openModal,
  readLocalJson,
  showToast,
  writeLocalJson,
} from "./utils.js";

const LOCAL_DRAFTS_KEY = "wechat-editor-drafts";
const LEGACY_DRAFT_KEY = "wechat-editor-draft";
const MAX_LOCAL_DRAFTS = 80;

function createTitle(html) {
  const text = htmlToPlainText(html).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 28) : `未命名草稿 ${formatDateTime(new Date().toISOString())}`;
}

function normalizeDraft(draft) {
  if (!draft?.html) return null;
  const html = sanitizeEditorHtml(draft.html);
  const stats = analyzeArticle(html);
  const now = new Date().toISOString();
  return {
    ...draft,
    id: String(draft.id || createId("draft")).replace(/[^\w-]/g, "") || createId("draft"),
    title: String(draft.title || createTitle(html)).trim().slice(0, 80) || "未命名草稿",
    html,
    createdAt: draft.createdAt || draft.savedAt || now,
    updatedAt: draft.updatedAt || draft.savedAt || now,
    savedAt: draft.savedAt || draft.updatedAt || now,
    wordCount: stats.characters,
    bytes: stats.htmlBytes,
    schemaVersion: 1,
  };
}

function summarizeDraft(draft) {
  return {
    id: draft.id,
    title: draft.title,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    savedAt: draft.savedAt,
    wordCount: draft.wordCount || analyzeArticle(draft.html).characters,
    bytes: draft.bytes || analyzeArticle(draft.html).htmlBytes,
  };
}

function loadLocalDrafts() {
  const drafts = Array.isArray(readLocalJson(LOCAL_DRAFTS_KEY, [])) ? readLocalJson(LOCAL_DRAFTS_KEY, []) : [];
  const normalized = drafts.map(normalizeDraft).filter(Boolean);
  const legacy = normalizeDraft(readLocalJson(LEGACY_DRAFT_KEY, null));
  if (legacy && !normalized.some((draft) => draft.html === legacy.html)) normalized.unshift(legacy);
  normalized.sort((a, b) => new Date(b.updatedAt || b.savedAt) - new Date(a.updatedAt || a.savedAt));
  writeLocalJson(LOCAL_DRAFTS_KEY, normalized.slice(0, MAX_LOCAL_DRAFTS));
  return normalized.slice(0, MAX_LOCAL_DRAFTS);
}

function saveLocalDraft(draft) {
  const normalized = normalizeDraft(draft);
  if (!normalized) return null;
  const now = new Date().toISOString();
  normalized.updatedAt = now;
  normalized.savedAt = now;
  const drafts = [normalized, ...loadLocalDrafts().filter((item) => item.id !== normalized.id)];
  if (drafts.length > MAX_LOCAL_DRAFTS) {
    throw new Error("浏览器草稿数量已达上限");
  }
  if (!writeLocalJson(LOCAL_DRAFTS_KEY, drafts)) {
    throw new Error("浏览器存储写入失败，请导出备份或清理浏览器存储空间");
  }
  return summarizeDraft(normalized);
}

function deleteLocalDraft(id) {
  const saved = writeLocalJson(
    LOCAL_DRAFTS_KEY,
    loadLocalDrafts().filter((draft) => draft.id !== id),
  );
  if (!saved) {
    throw new Error("浏览器存储写入失败，草稿未删除");
  }
}

function getLocalDraft(id) {
  return loadLocalDrafts().find((draft) => draft.id === id) || null;
}

export function createDraftManager(elements, editorController) {
  let currentDraftId = "";
  let summaries = [];
  let serverAvailable = canUseServerStorage();

  function setCurrentDraft(draft) {
    currentDraftId = draft?.id || "";
    elements.currentDraftTitle.textContent = draft?.title || "未命名草稿";
  }

  async function fetchSummaries() {
    if (serverAvailable) {
      try {
        const payload = await apiJson("/drafts?page=1&pageSize=100");
        return payload.items || payload;
      } catch (error) {
        serverAvailable = false;
      }
    }
    return loadLocalDrafts().map(summarizeDraft);
  }

  async function getDraft(id) {
    if (serverAvailable) {
      try {
        return normalizeDraft(await apiJson(`/drafts/${encodeURIComponent(id)}`));
      } catch (error) {
        serverAvailable = false;
      }
    }
    return getLocalDraft(id);
  }

  async function createDraftOnStore(draft) {
    if (serverAvailable) {
      try {
        return await apiJson("/drafts", { method: "POST", body: JSON.stringify(draft) });
      } catch (error) {
        if (error.code !== "SERVER_STORAGE_DISABLED") throw error;
        serverAvailable = false;
      }
    }
    return saveLocalDraft(draft);
  }

  async function updateDraftOnStore(id, draft) {
    if (serverAvailable) {
      try {
        return await apiJson(`/drafts/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(draft) });
      } catch (error) {
        if (error.code !== "SERVER_STORAGE_DISABLED") throw error;
        serverAvailable = false;
      }
    }
    return saveLocalDraft({ ...draft, id });
  }

  async function deleteDraftOnStore(id) {
    if (serverAvailable) {
      try {
        await apiJson(`/drafts/${encodeURIComponent(id)}`, { method: "DELETE" });
        return;
      } catch (error) {
        if (error.code !== "SERVER_STORAGE_DISABLED") throw error;
        serverAvailable = false;
      }
    }
    deleteLocalDraft(id);
  }

  async function refreshDraftList() {
    elements.draftList.innerHTML = '<p class="draft-loading">正在读取草稿...</p>';
    elements.draftEmpty.hidden = true;
    try {
      summaries = await fetchSummaries();
      renderDraftList();
      return true;
    } catch (error) {
      summaries = [];
      elements.draftList.innerHTML = `<p class="draft-empty">${escapeHtml(error.message || "草稿读取失败，请稍后重试。")}</p>`;
      elements.draftEmpty.hidden = true;
      return false;
    }
  }

  function renderDraftList() {
    elements.draftList.innerHTML = "";
    elements.draftEmpty.hidden = summaries.length > 0;
    for (const draft of summaries) {
      const item = document.createElement("article");
      item.className = "draft-item";
      item.dataset.draftId = draft.id;
      item.innerHTML = `
        <div class="draft-item-info">
          <h3>${escapeHtml(draft.title || "未命名草稿")}</h3>
          <p>${formatDateTime(draft.updatedAt || draft.savedAt)} · ${draft.wordCount || 0} 字 · ${formatBytes(draft.bytes)}</p>
        </div>
        <div class="draft-item-actions">
          <button class="button secondary small" data-draft-action="restore" type="button">恢复</button>
          <button class="button ghost small" data-draft-action="rename" type="button">重命名</button>
          <button class="button ghost small" data-draft-action="copy" type="button">复制</button>
          <button class="button danger small" data-draft-action="delete" type="button">删除</button>
        </div>
      `;
      elements.draftList.appendChild(item);
    }
  }

  async function saveCurrent(options = {}) {
    const html = sanitizeEditorHtml(editorController.getHtml());
    if (isHtmlEmpty(html)) {
      showToast("正文为空", "未保存");
      return null;
    }
    const currentTitle = elements.currentDraftTitle.textContent || "";
    const title = options.title || (currentDraftId && currentTitle !== "未命名草稿" ? currentTitle : createTitle(html));
    const draft = normalizeDraft({
      id: options.saveAs ? createId("draft") : currentDraftId || createId("draft"),
      title,
      html,
    });
    const summary = currentDraftId && !options.saveAs
      ? await updateDraftOnStore(currentDraftId, draft)
      : await createDraftOnStore(draft);
    setCurrentDraft({ ...draft, id: summary.id || draft.id, title: summary.title || draft.title });
    clearRecovery();
    showToast(options.saveAs ? "草稿已另存" : "草稿已保存", serverAvailable ? "文件已保存" : "浏览器已保存");
    return summary;
  }

  async function saveAs() {
    const title = window.prompt("草稿标题", createTitle(editorController.getHtml()));
    if (title === null) return;
    await saveCurrent({ saveAs: true, title: title.trim() || createTitle(editorController.getHtml()) });
  }

  function newDraft() {
    if (!editorController.isEmpty()) {
      const ok = window.confirm("当前正文尚未保存，确认新建空白草稿吗？");
      if (!ok) return;
    }
    editorController.clear();
    setCurrentDraft(null);
    showToast("已新建空白草稿");
  }

  async function openDraftModal() {
    openModal(elements.draftModal);
    await refreshDraftList();
  }

  async function restoreDraft(id) {
    const draft = await getDraft(id);
    if (!draft) {
      showToast("草稿读取失败", "恢复失败");
      return;
    }
    editorController.setHtml(draft.html);
    setCurrentDraft(draft);
    closeModal(elements.draftModal);
    showToast(`草稿已恢复：${draft.title}`, "已恢复");
  }

  async function renameDraft(id) {
    const draft = await getDraft(id);
    if (!draft) return;
    const title = window.prompt("新的草稿标题", draft.title || "未命名草稿");
    if (title === null) return;
    await updateDraftOnStore(id, { ...draft, title: title.trim() || "未命名草稿" });
    if (currentDraftId === id) elements.currentDraftTitle.textContent = title.trim() || "未命名草稿";
    await refreshDraftList();
    showToast("草稿已重命名");
  }

  async function copyDraft(id) {
    const draft = await getDraft(id);
    if (!draft) return;
    await createDraftOnStore({ ...draft, id: createId("draft"), title: `${draft.title || "未命名草稿"} 副本` });
    await refreshDraftList();
    showToast("草稿已复制");
  }

  async function removeDraft(id) {
    const draft = summaries.find((item) => item.id === id);
    const ok = window.confirm(`确认删除草稿「${draft?.title || "未命名草稿"}」吗？`);
    if (!ok) return;
    await deleteDraftOnStore(id);
    if (currentDraftId === id) setCurrentDraft(null);
    await refreshDraftList();
    showToast("草稿已删除");
  }

  elements.draftList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-draft-action]");
    const item = event.target.closest(".draft-item");
    if (!button || !item) return;
    const id = item.dataset.draftId;
    const action = button.dataset.draftAction;
    try {
      if (action === "restore") await restoreDraft(id);
      if (action === "rename") await renameDraft(id);
      if (action === "copy") await copyDraft(id);
      if (action === "delete") await removeDraft(id);
    } catch (error) {
      showToast(error.message || "草稿操作失败", "操作失败");
    }
  });
  elements.draftModalCloseBtn.addEventListener("click", () => closeModal(elements.draftModal));
  elements.draftModal.addEventListener("click", (event) => {
    if (event.target === elements.draftModal) closeModal(elements.draftModal);
  });

  return {
    get currentDraftId() {
      return currentDraftId;
    },
    setCurrentDraft,
    saveCurrent,
    saveAs,
    newDraft,
    openDraftModal,
    fetchSummaries,
    getDraft,
    loadLocalDrafts,
  };
}
