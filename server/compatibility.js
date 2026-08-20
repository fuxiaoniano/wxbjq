"use strict";

const { ALLOWED_TAGS, sanitizeStoredHtml, sanitizeStyle } = require("./sanitizer");

function createIssueMap() {
  return new Map();
}

function addIssue(map, code, level, message, count = 1) {
  const current = map.get(code);
  if (current) {
    current.count += count;
    return;
  }
  map.set(code, { code, level, message, count });
}

function inspectWechatCompatibility(html) {
  const source = String(html || "");
  const issues = createIssueMap();
  const statistics = {
    sizeBytes: Buffer.byteLength(source, "utf8"),
    imageCount: (source.match(/<img\b/gi) || []).length,
    linkCount: (source.match(/<a\b/gi) || []).length,
  };

  const tagPattern = /<\s*([a-zA-Z][\w:-]*)([^<>]*)>/g;
  let match;
  while ((match = tagPattern.exec(source))) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] || "";
    if (!ALLOWED_TAGS.has(tag)) {
      addIssue(issues, "UNKNOWN_TAG", "warning", "发现微信公众号可能不兼容的未知标签");
    }
    if (/\sclass\s*=/i.test(attrs)) {
      addIssue(issues, "CLASS_DEPENDENCY", "warning", "发现依赖 class 的样式");
    }
    if (/\sid\s*=/i.test(attrs)) {
      addIssue(issues, "ID_DEPENDENCY", "warning", "发现依赖 id 的样式");
    }
    if (/\sdata-(?!width\b)[\w-]+\s*=/i.test(attrs)) {
      addIssue(issues, "EDITOR_DATA_ATTRIBUTE", "warning", "发现编辑器内部 data 属性");
    }
    const styleMatch = attrs.match(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const style = styleMatch ? styleMatch[1] ?? styleMatch[2] ?? styleMatch[3] ?? "" : "";
    const lowerStyle = style.toLowerCase();
    if (/display\s*:\s*flex/.test(lowerStyle)) {
      addIssue(issues, "UNSUPPORTED_FLEX", "warning", "发现微信公众号可能不兼容的 Flex 布局");
    }
    if (/display\s*:\s*grid|grid-template|grid\s*:/.test(lowerStyle)) {
      addIssue(issues, "UNSUPPORTED_GRID", "warning", "发现微信公众号可能不兼容的 Grid 布局");
    }
    if (/\bgap\s*:/.test(lowerStyle)) {
      addIssue(issues, "UNSUPPORTED_GAP", "warning", "发现微信公众号可能不兼容的 gap 间距");
    }
    if (/position\s*:\s*(absolute|fixed)/.test(lowerStyle)) {
      addIssue(issues, "UNSUPPORTED_POSITION", "warning", "发现绝对或固定定位");
    }
    if (/var\s*\(--/.test(lowerStyle)) {
      addIssue(issues, "CSS_VARIABLE", "warning", "发现 CSS 变量");
    }
    if (/font-family\s*:/.test(lowerStyle) && /https?:|@font-face/.test(source)) {
      addIssue(issues, "EXTERNAL_FONT", "warning", "发现外部字体依赖");
    }
    if (tag === "img") {
      if (/\ssrc\s*=\s*["']\s*["']/i.test(attrs) || !/\ssrc\s*=/i.test(attrs)) {
        addIssue(issues, "EMPTY_IMAGE_SRC", "error", "发现空图片地址");
      }
      if (/(?:width|max-width)\s*:\s*(\d{4,})px/i.test(lowerStyle) || /width\s*:\s*(10[1-9]|[2-9]\d{2,})%/i.test(lowerStyle)) {
        addIssue(issues, "OVERSIZED_IMAGE", "warning", "发现可能超出正文宽度的图片");
      }
    }
    if (tag === "a" && /\shref\s*=\s*["']?\s*(javascript:|vbscript:|file:|filesystem:|data:)/i.test(attrs)) {
      addIssue(issues, "DANGEROUS_LINK", "error", "发现危险链接协议");
    }
  }

  if (/<style\b/i.test(source)) {
    addIssue(issues, "STYLE_TAG", "warning", "发现 style 标签");
  }
  if (/@font-face|fonts\.(googleapis|gstatic)|typekit/i.test(source)) {
    addIssue(issues, "EXTERNAL_FONT", "warning", "发现外部字体依赖");
  }

  const list = [...issues.values()];
  return {
    issues: list,
    warningCount: list.filter((issue) => issue.level === "warning").reduce((sum, issue) => sum + issue.count, 0),
    errorCount: list.filter((issue) => issue.level === "error").reduce((sum, issue) => sum + issue.count, 0),
    statistics,
  };
}

function normalizeStyleForWechat(style) {
  let next = String(style || "")
    .replace(/display\s*:\s*(flex|grid)\s*;?/gi, "display: block;")
    .replace(/\b(grid-template-[^:]+|grid|flex|gap|position|top|right|bottom|left|z-index|transform|animation|transition|filter|backdrop-filter|box-shadow)\s*:[^;]+;?/gi, "")
    .replace(/var\s*\([^)]*\)/gi, "#d92d20")
    .replace(/font-family\s*:[^;]+;?/gi, "");

  next = next.replace(/width\s*:\s*(\d{4,})px\s*;?/gi, "width: 100%; max-width: 100%;");
  next = next.replace(/width\s*:\s*(10[1-9]|[2-9]\d{2,})%\s*;?/gi, "width: 100%; max-width: 100%;");
  return sanitizeStyle(next);
}

function normalizeWechatHtml(html) {
  const sanitized = sanitizeStoredHtml(html, { forClipboard: true });
  let output = sanitized.replace(/<([a-zA-Z][\w:-]*)([^<>]*?)>/g, (match, tagName, attrs) => {
    const tag = tagName.toLowerCase();
    let nextAttrs = String(attrs || "")
      .replace(/\s(?:class|id|contenteditable|draggable)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\sdata-(?!width\b)[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

    nextAttrs = nextAttrs.replace(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (_, a, b, c) => {
      const style = normalizeStyleForWechat(a ?? b ?? c ?? "");
      return style ? ` style="${style.replace(/"/g, "&quot;")}"` : "";
    });

    if (tag === "img") {
      if (!/\sstyle\s*=/.test(nextAttrs)) {
        nextAttrs += ' style="max-width: 100%; height: auto; display: block; margin-left: auto; margin-right: auto"';
      } else {
        nextAttrs = nextAttrs.replace(/\sstyle\s*=\s*"([^"]*)"/i, (_, style) => {
          const merged = normalizeStyleForWechat(`${style}; max-width: 100%; height: auto; display: block; margin-left: auto; margin-right: auto`);
          return ` style="${merged.replace(/"/g, "&quot;")}"`;
        });
      }
    }

    return `<${tag}${nextAttrs}>`;
  });

  output = output.replace(/<section([^>]*)>\s*<\/section>/gi, "");
  return sanitizeStoredHtml(output, { forClipboard: true });
}

module.exports = {
  inspectWechatCompatibility,
  normalizeWechatHtml,
};
