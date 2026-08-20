import { sanitizeEditorHtml } from "./sanitizer.js?v=2.1.3-src-placeholder-fix";
import { closeModal, debounce, openModal, readLocalJson, removeLocalKey, showToast, writeLocalJson } from "./utils.js";

const RECOVERY_KEY = "wechat-editor-recovery-v1";

function getRecovery() {
  return readLocalJson(RECOVERY_KEY, null);
}

export function clearRecovery() {
  removeLocalKey(RECOVERY_KEY);
}

export function createAutosave(editorController, getCurrentDraftId) {
  let storageWarningShown = false;

  function saveTemporary() {
    const html = sanitizeEditorHtml(editorController.getHtml());
    const saved = writeLocalJson(RECOVERY_KEY, {
      html,
      updatedAt: new Date().toISOString(),
      draftId: getCurrentDraftId(),
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
