"use strict";

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

const REMOVE_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "svg",
  "math",
  "canvas",
  "video",
  "audio",
  "link",
  "meta",
  "base",
  "template",
]);

const ALLOWED_ATTRIBUTES = new Set(["style", "href", "src", "alt", "title", "target", "rel", "data-width"]);

const STRIP_ATTRIBUTES = new Set([
  "id",
  "class",
  "contenteditable",
  "draggable",
  "srcdoc",
  "formaction",
  "xlink:href",
]);

const ALLOWED_CSS_PROPERTIES = new Set([
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "color",
  "background",
  "background-color",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-color",
  "border-style",
  "border-width",
  "border-radius",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "text-align",
  "text-decoration",
  "letter-spacing",
  "width",
  "max-width",
  "min-width",
  "height",
  "max-height",
  "display",
  "vertical-align",
  "white-space",
  "word-break",
  "overflow-wrap",
]);

const ALLOWED_DISPLAY_VALUES = new Set(["block", "inline", "inline-block", "none"]);
const ALLOWED_REL_TOKENS = new Set(["nofollow", "noopener", "noreferrer", "sponsored", "ugc"]);
const VOID_TAGS = new Set(["img", "br"]);

function createReport() {
  return {
    removedTags: 0,
    removedAttributes: 0,
    removedCss: 0,
    removedUrls: 0,
    finalHtmlBytes: 0,
  };
}

function byteLength(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function decodeHtmlEntities(value) {
  const decodeCodePoint = (code, radix) => {
    const number = Number.parseInt(code, radix);
    if (!Number.isInteger(number) || number < 0 || number > 0x10ffff) return "\uFFFD";
    if (number >= 0xd800 && number <= 0xdfff) return "\uFFFD";
    return String.fromCodePoint(number);
  };
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => decodeCodePoint(code, 16))
    .replace(/&#([0-9]+);/g, (_, code) => decodeCodePoint(code, 10));
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripControl(value) {
  return String(value || "").replace(/[\x00-\x1f\x7f]/g, "").trim();
}

function normalizeUrlValue(value) {
  return stripControl(decodeHtmlEntities(value)).replace(/\s+/g, "");
}

function getProtocol(value) {
  const normalized = normalizeUrlValue(value);
  const match = normalized.match(/^([a-z][a-z0-9+.-]*):/i);
  return match ? `${match[1].toLowerCase()}:` : "";
}

function isSafeHref(value) {
  const protocol = getProtocol(value);
  return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
}

function isSafeImageSrc(value, options = {}) {
  const normalized = normalizeUrlValue(value);
  if (normalized === "") return true;
  const lower = normalized.toLowerCase();
  if (lower.startsWith("data:image/png;base64,")) return true;
  if (lower.startsWith("data:image/jpeg;base64,")) return true;
  if (lower.startsWith("data:image/jpg;base64,")) return true;
  if (lower.startsWith("data:image/webp;base64,")) return true;
  if (lower.startsWith("data:image/gif;base64,")) return true;
  if (lower.startsWith("blob:")) return true;
  const protocol = getProtocol(normalized);
  if (protocol === "http:" || protocol === "https:") return true;
  const localPrefixes = options.localImagePrefixes || ["/uploads/"];
  if (localPrefixes.some((prefix) => normalized.startsWith(prefix))) return true;
  return !getProtocol(normalized) && !normalized.startsWith("//") && !/[\\<>"']/.test(normalized);
}

function sanitizeCssValue(property, value) {
  const raw = stripControl(decodeHtmlEntities(value));
  const lower = raw.toLowerCase();
  if (!raw || lower.includes("!important")) return "";
  if (/[\\]|\/\*/.test(raw) || /(url\s*\(|@import|expression\s*\(|behavior\s*:)/i.test(raw)) return "";
  if (/(position|z-index|transform|animation|transition|filter|backdrop-filter|grid|flex|gap|content|cursor|pointer-events|clip-path|mask)/i.test(property)) {
    return "";
  }
  if (property === "display") {
    const display = lower.trim();
    return ALLOWED_DISPLAY_VALUES.has(display) ? display : "";
  }
  if (/[\{\}<>]/.test(raw)) return "";
  return raw.replace(/\s+/g, " ").trim();
}

function sanitizeStyle(style, report = createReport()) {
  const declarations = String(style || "").split(";");
  const kept = [];
  for (const declaration of declarations) {
    const index = declaration.indexOf(":");
    if (index <= 0) continue;
    const property = declaration.slice(0, index).trim().toLowerCase();
    const value = declaration.slice(index + 1).trim();
    if (!ALLOWED_CSS_PROPERTIES.has(property)) {
      report.removedCss += 1;
      continue;
    }
    const safeValue = sanitizeCssValue(property, value);
    if (!safeValue) {
      report.removedCss += 1;
      continue;
    }
    kept.push(`${property}: ${safeValue}`);
  }
  return kept.join("; ");
}

function parseAttributes(rawAttributes) {
  const attributes = [];
  const pattern = /([^\s=\/"'<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(rawAttributes || ""))) {
    attributes.push({
      name: match[1],
      value: match[2] ?? match[3] ?? match[4] ?? "",
    });
  }
  return attributes;
}

function sanitizeAttributes(tag, rawAttributes, report, options = {}) {
  const output = [];
  let targetBlank = false;
  let relValue = "";

  for (const attribute of parseAttributes(rawAttributes)) {
    const name = attribute.name.toLowerCase();
    let value = stripControl(attribute.value);

    if (
      name.startsWith("on") ||
      STRIP_ATTRIBUTES.has(name) ||
      (name.startsWith("data-") && name !== "data-width") ||
      !ALLOWED_ATTRIBUTES.has(name)
    ) {
      report.removedAttributes += 1;
      continue;
    }

    if (options.forClipboard && name.startsWith("data-") && name !== "data-width") {
      report.removedAttributes += 1;
      continue;
    }

    if (name === "href") {
      if (tag !== "a" || !isSafeHref(value)) {
        report.removedUrls += 1;
        continue;
      }
      value = normalizeUrlValue(value);
    }

    if (name === "src") {
      if (tag !== "img" || !isSafeImageSrc(value, options)) {
        report.removedUrls += 1;
        continue;
      }
      value = normalizeUrlValue(value);
    }

    if (name === "target") {
      value = value === "_blank" ? "_blank" : "";
      if (!value) {
        report.removedAttributes += 1;
        continue;
      }
      targetBlank = true;
    }

    if (name === "rel") {
      relValue = value
        .split(/\s+/)
        .map((token) => token.toLowerCase())
        .filter((token) => ALLOWED_REL_TOKENS.has(token))
        .join(" ");
      if (!relValue) {
        report.removedAttributes += 1;
        continue;
      }
      continue;
    }

    if (name === "style") {
      value = sanitizeStyle(value, report);
      if (!value) continue;
    }

    if (name === "data-width") {
      value = value.replace(/[^\d.%pxrememvwvh]/gi, "").slice(0, 20);
      if (!value) {
        report.removedAttributes += 1;
        continue;
      }
    }

    output.push(`${name}="${escapeAttribute(value)}"`);
  }

  if (tag === "a") {
    const relTokens = new Set(relValue.split(/\s+/).filter(Boolean));
    if (targetBlank || output.some((item) => item.startsWith("href="))) {
      relTokens.add("noopener");
      relTokens.add("noreferrer");
    }
    if (relTokens.size) {
      output.push(`rel="${escapeAttribute([...relTokens].join(" "))}"`);
    }
  }

  return output.length ? ` ${output.join(" ")}` : "";
}

function escapeText(value) {
  return String(value || "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function findTagEnd(input, start) {
  let quote = "";
  for (let index = start + 1; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return index;
  }
  return -1;
}

function readHtmlTag(input, start) {
  const end = findTagEnd(input, start);
  if (end < 0) return null;
  const raw = input.slice(start + 1, end);
  if (/^\s*[!?]/.test(raw)) {
    return { end, ignored: true };
  }
  const closing = /^\s*\//.test(raw);
  const body = raw.replace(/^\s*\//, "");
  const match = body.match(/^\s*([a-zA-Z][\w:-]*)/);
  if (!match) return null;
  const tag = match[1].toLowerCase();
  const selfClosing = /\/\s*$/.test(body);
  const rawAttributes = closing ? "" : body.slice(match.index + match[0].length).replace(/\/\s*$/, "");
  return { end, closing, selfClosing, tag, rawAttributes };
}

function skipBlockedTagContent(input, token) {
  let depth = 1;
  let cursor = token.end + 1;
  while (cursor < input.length) {
    const next = input.indexOf("<", cursor);
    if (next < 0) return input.length;
    const nextToken = readHtmlTag(input, next);
    if (!nextToken) {
      cursor = next + 1;
      continue;
    }
    if (nextToken.tag === token.tag) {
      if (nextToken.closing) depth -= 1;
      else if (!nextToken.selfClosing) depth += 1;
      if (depth <= 0) return nextToken.end + 1;
    }
    cursor = nextToken.end + 1;
  }
  return input.length;
}

function sanitizeStoredHtml(html, options = {}) {
  const report = createReport();
  let input = String(html || "");
  input = input.replace(/<!--[\s\S]*?-->/g, "");

  const output = [];
  let cursor = 0;
  while (cursor < input.length) {
    const nextTag = input.indexOf("<", cursor);
    if (nextTag < 0) {
      output.push(escapeText(input.slice(cursor)));
      break;
    }

    output.push(escapeText(input.slice(cursor, nextTag)));
    const token = readHtmlTag(input, nextTag);
    if (!token) {
      output.push("&lt;");
      cursor = nextTag + 1;
      continue;
    }
    cursor = token.end + 1;
    if (token.ignored) continue;

    const { tag } = token;
    if (REMOVE_WITH_CONTENT.has(tag)) {
      report.removedTags += 1;
      if (!token.closing && !token.selfClosing) {
        cursor = skipBlockedTagContent(input, token);
      }
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      report.removedTags += 1;
      continue;
    }
    if (token.closing) {
      if (!VOID_TAGS.has(tag)) output.push(`</${tag}>`);
      continue;
    }

    const attrs = sanitizeAttributes(tag, token.rawAttributes, report, options);
    output.push(`<${tag}${attrs}>`);
  }

  const cleaned = output.join("")
    .replace(/\sstyle=""(?=[\s>])/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
  report.finalHtmlBytes = byteLength(cleaned);

  if (options.returnReport) {
    return { html: cleaned, report };
  }
  return cleaned;
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|li|section|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isHtmlEffectivelyEmpty(html) {
  const text = stripHtml(html).replace(/\s+/g, "");
  const hasImage = /<img\b/i.test(html);
  return !text && !hasImage;
}

module.exports = {
  ALLOWED_TAGS,
  sanitizeStoredHtml,
  sanitizeStyle,
  stripHtml,
  isHtmlEffectivelyEmpty,
  isSafeHref,
  isSafeImageSrc,
};
