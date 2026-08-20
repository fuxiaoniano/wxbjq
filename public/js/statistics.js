import { sanitizeEditorHtml } from "./sanitizer.js?v=2.1.3-src-placeholder-fix";
import { formatBytes, getTextBytes } from "./utils.js";

export function analyzeArticle(html) {
  const template = document.createElement("template");
  template.innerHTML = sanitizeEditorHtml(html || "");
  const text = template.content.textContent || "";
  const compactText = text.replace(/\s+/g, "");
  const chineseChars = (compactText.match(/[\u4e00-\u9fff]/g) || []).length;
  const paragraphs = template.content.querySelectorAll("p, blockquote, li").length;
  const headings = template.content.querySelectorAll("h1, h2, h3").length;
  const images = template.content.querySelectorAll("img").length;
  const links = template.content.querySelectorAll("a[href]").length;
  const readingMinutes = Math.max(1, Math.ceil(compactText.length / 450));

  return {
    characters: compactText.length,
    chineseChars,
    paragraphs,
    headings,
    images,
    links,
    readingMinutes,
    htmlBytes: getTextBytes(template.innerHTML),
  };
}

export function renderArticleStats(container, stats) {
  const rows = [
    ["总字符数", `${stats.characters}`],
    ["中文字符数", `${stats.chineseChars}`],
    ["段落数", `${stats.paragraphs}`],
    ["标题数", `${stats.headings}`],
    ["图片数", `${stats.images}`],
    ["链接数", `${stats.links}`],
    ["预计阅读时间", `约 ${stats.readingMinutes} 分钟`],
    ["HTML 字节数", formatBytes(stats.htmlBytes)],
  ];
  container.innerHTML = rows.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join("");
}
