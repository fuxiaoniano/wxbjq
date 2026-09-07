import { analyzeArticle } from "./statistics.js";
import { sanitizeEditorHtml, isHtmlEmpty } from "./sanitizer.js?v=2.2.0";
import { inspectWechatCompatibility, normalizeWechatHtml } from "./wechat-compatibility.js?v=2.2.0";
import { closeModal, formatBytes, htmlToPlainText, openModal, showToast } from "./utils.js";

let pendingCopy = null;

function articleWrapper(html) {
  return `<section style="max-width: 677px; margin: 0 auto; color: #333333; font-size: 16px; line-height: 1.8;">${html}</section>`;
}

function renderReport(elements, stats, report) {
  const rows = [
    ["字符数", stats.characters],
    ["段落数", stats.paragraphs],
    ["标题数", stats.headings],
    ["图片数", stats.images],
    ["链接数", stats.links],
    ["HTML 大小", formatBytes(stats.htmlBytes)],
    ["兼容警告数", report.warningCount],
    ["高风险错误数", report.errorCount],
    ["空图片数", report.issues.find((issue) => issue.code === "EMPTY_IMAGE_SRC")?.count || 0],
    ["危险链接数", report.issues.find((issue) => issue.code === "DANGEROUS_LINK")?.count || 0],
  ];
  elements.copyReportStats.innerHTML = rows.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join("");
  elements.copyIssueList.innerHTML = report.issues
    .map((issue) => `<li class="${issue.level}">${issue.message} × ${issue.count}</li>`)
    .join("");
  elements.copyAnywayBtn.hidden = report.errorCount > 0;
}

async function writeClipboard(html) {
  const text = htmlToPlainText(html);
  if (navigator.clipboard && window.ClipboardItem) {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    return;
  }
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
  const copied = document.execCommand("copy");
  selection.removeAllRanges();
  box.remove();
  if (!copied) throw new Error("浏览器拒绝了复制请求");
}

async function copyPreparedHtml(html) {
  await writeClipboard(html);
  showToast("已复制微信富文本，可粘贴到公众号后台", "已复制");
}

export function beginCopyArticle(editorController, elements) {
  const clean = sanitizeEditorHtml(editorController.getHtml(), { forClipboard: true });
  if (isHtmlEmpty(clean)) {
    showToast("正文为空", "未复制");
    return;
  }
  const report = inspectWechatCompatibility(clean);
  const normalized = normalizeWechatHtml(clean);
  const finalReport = inspectWechatCompatibility(normalized);
  const stats = analyzeArticle(normalized);
  pendingCopy = {
    clean: articleWrapper(clean),
    normalized: articleWrapper(normalized),
    report: finalReport.errorCount ? finalReport : report,
  };
  renderReport(elements, stats, pendingCopy.report);
  if (pendingCopy.report.warningCount || pendingCopy.report.errorCount) {
    openModal(elements.copyReportModal);
    return;
  }
  copyPreparedHtml(pendingCopy.normalized).catch(() => {
    showToast("复制失败，请检查浏览器剪贴板权限", "复制失败");
  });
}

export function bindCopyReport(elements) {
  elements.copyReportCloseBtn.addEventListener("click", () => closeModal(elements.copyReportModal));
  elements.copyCancelBtn.addEventListener("click", () => closeModal(elements.copyReportModal));
  elements.copyFixBtn.addEventListener("click", async () => {
    if (!pendingCopy) return;
    try {
      await copyPreparedHtml(pendingCopy.normalized);
      closeModal(elements.copyReportModal);
    } catch (error) {
      showToast("复制失败，请检查浏览器剪贴板权限", "复制失败");
    }
  });
  elements.copyAnywayBtn.addEventListener("click", async () => {
    if (!pendingCopy || pendingCopy.report.errorCount) return;
    try {
      await copyPreparedHtml(pendingCopy.clean);
      closeModal(elements.copyReportModal);
    } catch (error) {
      showToast("复制失败，请检查浏览器剪贴板权限", "复制失败");
    }
  });
}
