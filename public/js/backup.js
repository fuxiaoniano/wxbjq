import { apiJson } from "./api.js";
import { canUseServerStorage } from "./config.js";
import { sanitizeEditorHtml } from "./sanitizer.js?v=2.2.0";
import { downloadText, readFileAsText, safeJsonStringify, showToast } from "./utils.js";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function chooseBackupImportMode(backup, dialog = window) {
  const draftCount = Array.isArray(backup?.drafts) ? backup.drafts.length : 0;
  const templateCount = Array.isArray(backup?.templates) ? backup.templates.length : 0;
  const answer = dialog.prompt(
    [
      `备份包含 ${draftCount} 个草稿、${templateCount} 个模板。`,
      "输入“合并导入”会保留现有数据并追加导入。",
      "输入“覆盖导入”会先备份，然后覆盖服务器草稿和模板。",
      "留空或取消则不导入。",
    ].join("\n"),
    "合并导入",
  );
  if (answer === null) return "";
  const normalized = String(answer).trim();
  if (normalized === "合并导入") return "merge";
  if (normalized === "覆盖导入") return "overwrite";
  return "";
}

export function bindBackupTools(elements, editorController, draftManager, templateManager) {
  elements.exportHtmlBtn.addEventListener("click", () => {
    downloadText(`wechat-article-${stamp()}.html`, sanitizeEditorHtml(editorController.getHtml()), "text/html;charset=utf-8");
  });

  elements.exportTextBtn.addEventListener("click", () => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = sanitizeEditorHtml(editorController.getHtml());
    downloadText(`wechat-article-${stamp()}.txt`, wrapper.innerText.trim());
  });

  elements.exportDraftsBtn.addEventListener("click", async () => {
    const summaries = await draftManager.fetchSummaries();
    const drafts = [];
    for (const summary of summaries) {
      const draft = await draftManager.getDraft(summary.id);
      if (draft) drafts.push(draft);
    }
    downloadText(`wechat-drafts-${stamp()}.json`, safeJsonStringify({ version: 1, exportedAt: new Date().toISOString(), drafts }), "application/json;charset=utf-8");
  });

  elements.exportTemplatesBtn.addEventListener("click", () => {
    const templates = templateManager.allTemplates().filter((template) => template.custom);
    downloadText(`wechat-templates-${stamp()}.json`, safeJsonStringify({ version: 1, exportedAt: new Date().toISOString(), templates }), "application/json;charset=utf-8");
  });

  elements.exportBackupBtn.addEventListener("click", async () => {
    if (canUseServerStorage()) {
      try {
        const backup = await apiJson("/backup/export", { method: "POST", body: "{}" });
        downloadText(`wechat-editor-backup-${stamp()}.json`, safeJsonStringify(backup), "application/json;charset=utf-8");
        return;
      } catch (error) {
        // fall back to browser data below
      }
    }
    const summaries = await draftManager.fetchSummaries();
    const drafts = [];
    for (const summary of summaries) {
      const draft = await draftManager.getDraft(summary.id);
      if (draft) drafts.push(draft);
    }
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      drafts,
      templates: templateManager.allTemplates().filter((template) => template.custom),
      settings: {},
    };
    downloadText(`wechat-editor-backup-${stamp()}.json`, safeJsonStringify(backup), "application/json;charset=utf-8");
  });

  elements.importBackupBtn.addEventListener("click", () => elements.backupFileInput.click());
  elements.backupFileInput.addEventListener("change", async () => {
    const file = elements.backupFileInput.files[0];
    elements.backupFileInput.value = "";
    if (!file) return;
    try {
      const text = await readFileAsText(file, 2 * 1024 * 1024);
      const backup = JSON.parse(text);
      if (backup.version !== 1 || !Array.isArray(backup.drafts) || !Array.isArray(backup.templates)) {
        showToast("备份文件格式不正确", "导入失败");
        return;
      }
      const mode = chooseBackupImportMode(backup);
      if (!mode) {
        showToast("导入已取消", "未导入");
        return;
      }
      if (canUseServerStorage()) {
        const result = await apiJson("/backup/import", { method: "POST", body: JSON.stringify({ mode, backup }) });
        const renamed = Number(result.renamedDrafts || 0) + Number(result.renamedTemplates || 0);
        showToast(renamed ? `完整备份已导入，${renamed} 个冲突项已改名` : "完整备份已导入", "导入完成");
      } else {
        showToast("当前模式不写入服务器，请使用导出的 JSON 在本地管理模板和草稿", "未导入服务器");
      }
    } catch (error) {
      showToast(error.message || "备份导入失败", "导入失败");
    }
  });
}
