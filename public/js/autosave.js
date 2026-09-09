import { sanitizeEditorHtml } from "./sanitizer.js?v=2.2.0";
import { closeModal, debounce, openModal, readLocalJson, removeLocalKey, showToast, writeLocalJson } from "./utils.js";

const RECOVERY_KEY = "wechat-editor-recovery-v1";

function getRecovery() {
  return readLocalJson(RECOVERY_KEY, null);
}

export function clearRecovery() {
  removeLocalKey(RECOVERY_KEY);
}

export function normalizeRecoveryContext(current) {
  const context = typeof current === "string" ? { draftId: current } : current || {};
  return {
    draftId: String(context.draftId || ""),
    title: String(context.title || "").trim().slice(0, 80),
    author: String(context.author || "").trim().slice(0, 16),
    digest: String(context.digest || "").trim().slice(0, 128),
  };
}

export function createAutosave(editorController, getCurrentDraftContext) {
  let storageWarningShown = false;

  function saveTemporary() {
    const html = sanitizeEditorHtml(editorController.getHtml());
    const context = normalizeRecoveryContext(getCurrentDraftContext?.());
    const saved = writeLocalJson(RECOVERY_KEY, {
      html,
      updatedAt: new Date().toISOString(),
      ...context,
      sourceMode: editorController.sourceMode,
    });
    if (!saved && !storageWarningShown) {
      storageWarningShown = true;
      showToast("浏览器存储空间不足，自动恢复保存失败", "自动保存失败");
    }
  }

  const debouncedSave = debounce(saveTemporary, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveTemporary();
  });
  window.addEventListener("beforeunload", saveTemporary);

  return {
    schedule: debouncedSave,
    flush: saveTemporary,
  };
}

export function maybeShowRecovery(elements, editorController, onRecovered) {
  const record = getRecovery();
  if (!record?.html) return;
  if (sanitizeEditorHtml(editorController.getHtml()) === sanitizeEditorHtml(record.html)) return;
  elements.recoverPreview.innerHTML = sanitizeEditorHtml(record.html);
  openModal(elements.recoverModal);

  elements.recoverApplyBtn.onclick = () => {
    editorController.setHtml(record.html);
    onRecovered?.(record);
    closeModal(elements.recoverModal);
    showToast("未保存内容已恢复", "已恢复");
  };
  elements.recoverPreviewBtn.onclick = () => {
    elements.recoverPreview.hidden = !elements.recoverPreview.hidden;
  };
  elements.recoverIgnoreBtn.onclick = () => {
    clearRecovery();
    closeModal(elements.recoverModal);
  };
  elements.recoverCloseBtn.onclick = () => closeModal(elements.recoverModal);
}
