import { isSafeHref, sanitizeEditorHtml, sanitizeStyle } from "./sanitizer.js?v=2.2.0";
import { getTextBytes } from "./utils.js";

const ALLOWED_TAGS = new Set([
  "section",
  "p",
  "span",
  "strong",
  "b",
  "i",
  "em",
  "u",
  "s",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "ul",
  "ol",
  "li",
  "img",
  "br",
  "a",
]);

function addIssue(map, code, level, message) {
  const current = map.get(code);
  if (current) current.count += 1;
  else map.set(code, { code, level, message, count: 1 });
}

export function inspectWechatCompatibility(html) {
  const clean = sanitizeEditorHtml(html || "");
  const template = document.createElement("template");
  template.innerHTML = clean;
  const issues = new Map();

  for (const element of template.content.querySelectorAll("*")) {
    const tag = element.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) addIssue(issues, "UNKNOWN_TAG", "warning", "发现微信公众号可能不兼容的未知标签");
    if (element.hasAttribute("class")) addIssue(issues, "CLASS_DEPENDENCY", "warning", "发现依赖 class 的样式");
    if (element.hasAttribute("id")) addIssue(issues, "ID_DEPENDENCY", "warning", "发现依赖 id 的样式");
    for (const attr of [...element.attributes]) {
      if (attr.name.startsWith("data-") && attr.name !== "data-width") {
        addIssue(issues, "EDITOR_DATA_ATTRIBUTE", "warning", "发现编辑器内部 data 属性");
      }
    }
    const style = element.getAttribute("style") || "";
    const lowerStyle = style.toLowerCase();
    if (/display\s*:\s*flex/.test(lowerStyle)) addIssue(issues, "UNSUPPORTED_FLEX", "warning", "发现微信公众号可能不兼容的 Flex 布局");
    if (/display\s*:\s*grid|grid-template|grid\s*:/.test(lowerStyle)) addIssue(issues, "UNSUPPORTED_GRID", "warning", "发现微信公众号可能不兼容的 Grid 布局");
    if (/\bgap\s*:/.test(lowerStyle)) addIssue(issues, "UNSUPPORTED_GAP", "warning", "发现微信公众号可能不兼容的 gap 间距");
    if (/position\s*:\s*(absolute|fixed)/.test(lowerStyle)) addIssue(issues, "UNSUPPORTED_POSITION", "warning", "发现绝对或固定定位");
    if (/var\s*\(--/.test(lowerStyle)) addIssue(issues, "CSS_VARIABLE", "warning", "发现 CSS 变量");
    if (tag === "img") {
      if (!element.getAttribute("src")) addIssue(issues, "EMPTY_IMAGE_SRC", "error", "发现空图片地址");
      if (/(?:width|max-width)\s*:\s*(\d{4,})px/i.test(lowerStyle) || /width\s*:\s*(10[1-9]|[2-9]\d{2,})%/i.test(lowerStyle)) {
        addIssue(issues, "OVERSIZED_IMAGE", "warning", "发现可能超出正文宽度的图片");
      }
    }
    if (tag === "a" && !isSafeHref(element.getAttribute("href") || "")) {
      addIssue(issues, "DANGEROUS_LINK", "error", "发现危险链接协议");
    }
  }

  const list = [...issues.values()];
  return {
    issues: list,
    warningCount: list.filter((issue) => issue.level === "warning").reduce((sum, issue) => sum + issue.count, 0),
    errorCount: list.filter((issue) => issue.level === "error").reduce((sum, issue) => sum + issue.count, 0),
    statistics: {
      htmlBytes: getTextBytes(clean),
      imageCount: template.content.querySelectorAll("img").length,
      linkCount: template.content.querySelectorAll("a[href]").length,
    },
  };
}

function normalizeStyle(style) {
  let next = String(style || "")
    .replace(/display\s*:\s*(flex|grid)\s*;?/gi, "display: block;")
    .replace(/\b(grid-template-[^:]+|grid|flex|gap|position|top|right|bottom|left|z-index|transform|animation|transition|filter|backdrop-filter|box-shadow)\s*:[^;]+;?/gi, "")
    .replace(/var\s*\([^)]*\)/gi, "#d92d20")
    .replace(/font-family\s*:[^;]+;?/gi, "");
  next = next.replace(/width\s*:\s*(\d{4,})px\s*;?/gi, "width: 100%; max-width: 100%;");
  next = next.replace(/width\s*:\s*(10[1-9]|[2-9]\d{2,})%\s*;?/gi, "width: 100%; max-width: 100%;");
  return sanitizeStyle(next);
}

export function ensureParagraphSpacing(style) {
  const value = String(style || "").trim();
  if (/(^|;)\s*margin\s*:/i.test(value) || /(^|;)\s*margin-bottom\s*:/i.test(value)) return value;
  return value ? `${value}; margin-bottom: 16px` : "margin: 0 0 16px";
}

export function normalizeWechatHtml(html) {
  const clean = sanitizeEditorHtml(html || "", { forClipboard: true });
  const template = document.createElement("template");
  template.innerHTML = clean;

  for (const element of template.content.querySelectorAll("*")) {
    element.removeAttribute("class");
    element.removeAttribute("id");
    element.removeAttribute("contenteditable");
    element.removeAttribute("draggable");
    for (const attr of [...element.attributes]) {
      if (attr.name.startsWith("data-") && attr.name !== "data-width") element.removeAttribute(attr.name);
    }
    let style = normalizeStyle(element.getAttribute("style") || "");
    if (element.tagName.toLowerCase() === "p") style = ensureParagraphSpacing(style);
    if (style) element.setAttribute("style", style);
    else element.removeAttribute("style");
    if (element.tagName.toLowerCase() === "img") {
      const imageStyle = normalizeStyle(`${style}; max-width: 100%; height: auto; display: block; margin-left: auto; margin-right: auto`);
      element.setAttribute("style", imageStyle);
    }
  }

  return sanitizeEditorHtml(template.innerHTML, { forClipboard: true });
}
