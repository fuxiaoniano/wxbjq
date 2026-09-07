import { appConfig, withBasePath } from "./config.js";
import { initAuthUI } from "./auth.js";
import { bindBackupTools } from "./backup.js";
import { bindCopyReport, beginCopyArticle } from "./clipboard.js?v=2.2.0";
import { createAutosave, maybeShowRecovery } from "./autosave.js";
import { createDraftManager } from "./drafts.js";
import { createEditorController } from "./editor.js";
import { bindImageTools } from "./images.js";
import { initMembershipUI } from "./membership.js";
import { initWechatAccountsUI } from "./wechat-accounts.js";
import { initWechatDraftUI } from "./wechat-drafts.js";
import { initSelection } from "./selection.js";
import { analyzeArticle, renderArticleStats } from "./statistics.js";
import { createTemplateManager } from "./templates.js";
import { bindToolbar, insertLink, removeLink } from "./toolbar.js";
import { debounce, qs, showToast } from "./utils.js";

const elements = {
  editor: qs("#editor"),
  sourceEditor: qs("#sourceEditor"),
  sourceModeBtn: qs("#sourceModeBtn"),
  copyBtn: qs("#copyBtn"),
  clearBtn: qs("#clearBtn"),
  newDraftBtn: qs("#newDraftBtn"),
  saveDraftBtn: qs("#saveDraftBtn"),
  saveAsDraftBtn: qs("#saveAsDraftBtn"),
  loadDraftBtn: qs("#loadDraftBtn"),
  currentDraftTitle: qs("#currentDraftTitle"),
  editorModeBadge: qs("#editorModeBadge"),
  phoneFrame: qs(".phone-frame"),
  toolbar: qs(".toolbar"),
  fontSizeSelect: qs("#fontSizeSelect"),
  foreColor: qs("#foreColor"),
  colorCodeInput: qs("#colorCodeInput"),
  backColor: qs("#backColor"),
  backColorCodeInput: qs("#backColorCodeInput"),
  linkInput: qs("#linkInput"),
  insertLinkBtn: qs("#insertLinkBtn"),
  unlinkBtn: qs("#unlinkBtn"),
  templateList: qs("#templateList"),
  templateCount: qs("#templateCount"),
  templateSearchInput: qs("#templateSearchInput"),
  templateCategoryFilter: qs("#templateCategoryFilter"),
  customOnlyToggle: qs("#customOnlyToggle"),
  templateInsertMode: qs("#templateInsertMode"),
  themeSelect: qs("#themeSelect"),
  themeColorInput: qs("#themeColorInput"),
  themeColorCodeInput: qs("#themeColorCodeInput"),
  updateArticleThemeBtn: qs("#updateArticleThemeBtn"),
  insertTemplateBtn: qs("#insertTemplateBtn"),
  deleteTemplateBtn: qs("#deleteTemplateBtn"),
  saveTemplateBtn: qs("#saveTemplateBtn"),
  templateNameInput: qs("#templateNameInput"),
  templateCategoryInput: qs("#templateCategoryInput"),
  templateHtmlInput: qs("#templateHtmlInput"),
  templateCleanReport: qs("#templateCleanReport"),
  draftModal: qs("#draftModal"),
  draftModalCloseBtn: qs("#draftModalCloseBtn"),
  draftList: qs("#draftList"),
  draftEmpty: qs("#draftEmpty"),
  recoverModal: qs("#recoverModal"),
  recoverCloseBtn: qs("#recoverCloseBtn"),
  recoverApplyBtn: qs("#recoverApplyBtn"),
  recoverPreviewBtn: qs("#recoverPreviewBtn"),
  recoverIgnoreBtn: qs("#recoverIgnoreBtn"),
  recoverPreview: qs("#recoverPreview"),
  copyReportModal: qs("#copyReportModal"),
  copyReportCloseBtn: qs("#copyReportCloseBtn"),
  copyReportStats: qs("#copyReportStats"),
  copyIssueList: qs("#copyIssueList"),
  copyFixBtn: qs("#copyFixBtn"),
  copyAnywayBtn: qs("#copyAnywayBtn"),
  copyCancelBtn: qs("#copyCancelBtn"),
  articleStats: qs("#articleStats"),
  imageUrlInput: qs("#imageUrlInput"),
  imageAltInput: qs("#imageAltInput"),
  imageWidthInput: qs("#imageWidthInput"),
  imageCenterToggle: qs("#imageCenterToggle"),
  imageFileInput: qs("#imageFileInput"),
  insertImageUrlBtn: qs("#insertImageUrlBtn"),
  chooseImageBtn: qs("#chooseImageBtn"),
  deleteImageBtn: qs("#deleteImageBtn"),
  exportHtmlBtn: qs("#exportHtmlBtn"),
  exportTextBtn: qs("#exportTextBtn"),
  exportDraftsBtn: qs("#exportDraftsBtn"),
  exportTemplatesBtn: qs("#exportTemplatesBtn"),
  exportBackupBtn: qs("#exportBackupBtn"),
  importBackupBtn: qs("#importBackupBtn"),
  backupFileInput: qs("#backupFileInput"),
  homeLink: qs("#homeLink"),
};

initSelection(elements.editor);

let autosave = null;

const refreshStats = debounce(() => {
  renderArticleStats(elements.articleStats, analyzeArticle(editorController.getHtml()));
}, 180);

const editorController = createEditorController(elements, {
  onChange: () => {
    refreshStats();
    autosave?.schedule();
  },
});

const draftManager = createDraftManager(elements, editorController);
const templateManager = createTemplateManager(elements, editorController);
const authController = initAuthUI();
initMembershipUI(authController);
initWechatAccountsUI(authController);
initWechatDraftUI(authController, editorController, draftManager);
autosave = createAutosave(editorController, () => draftManager.currentDraftId);

bindToolbar(elements, editorController);
bindCopyReport(elements);
bindImageTools(elements, editorController);
bindBackupTools(elements, editorController, draftManager, templateManager);

elements.homeLink.href = withBasePath("/");
elements.sourceModeBtn.addEventListener("click", () => editorController.toggleSourceMode());
elements.copyBtn.addEventListener("click", () => beginCopyArticle(editorController, elements));
elements.clearBtn.addEventListener("click", () => {
  if (editorController.isEmpty() || window.confirm("确认清空正文内容吗？")) {
    editorController.clear();
    draftManager.setCurrentDraft(null);
    showToast("正文已清空");
  }
});
elements.newDraftBtn.addEventListener("click", () => draftManager.newDraft());
elements.saveDraftBtn.addEventListener("click", () => {
  draftManager.saveCurrent().catch((error) => showToast(error.message || "草稿保存失败", "保存失败"));
});
elements.saveAsDraftBtn.addEventListener("click", () => {
  draftManager.saveAs().catch((error) => showToast(error.message || "草稿另存失败", "保存失败"));
});
elements.loadDraftBtn.addEventListener("click", () => {
  draftManager.openDraftModal().catch((error) => showToast(error.message || "草稿读取失败", "读取失败"));
});
elements.insertLinkBtn.addEventListener("click", () => {
  if (insertLink(editorController, elements.linkInput.value)) elements.linkInput.value = "";
});
elements.unlinkBtn.addEventListener("click", () => removeLink(editorController));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    for (const modal of [
      elements.draftModal,
      elements.recoverModal,
      elements.copyReportModal,
      qs("#authModal"),
      qs("#membershipModal"),
      qs("#wechatAccountModal"),
      qs("#wechatDraftModal"),
    ]) {
      if (modal && !modal.hidden) {
        modal.classList.remove("open");
        modal.hidden = true;
        document.body.classList.remove("modal-open");
      }
    }
  }
});

editorController.setHtml("", { silent: true });
renderArticleStats(elements.articleStats, analyzeArticle(""));
templateManager.init().catch((error) => showToast(error.message || "模板读取失败", "模板读取失败"));
maybeShowRecovery(elements, editorController, (record) => {
  draftManager.setCurrentDraft({ id: record.draftId || "", title: "恢复的未保存内容" });
});

if (!appConfig.serverStorageEnabled) {
  showToast("当前为公网无状态模式，草稿和模板保存在浏览器", "public-stateless");
}
