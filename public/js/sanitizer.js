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

const ALLOWED_ATTRS = new Set(["style", "href", "src", "alt", "title", "target", "rel", "data-width"]);
const ALLOWED_CSS = new Set([
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

const ALLOWED_DISPLAY = new Set(["block", "inline", "inline-block", "none"]);

function createReport() {
  return {
    removedTags: 0,
    removedAttributes: 0,
    removedCss: 0,
    removedUrls: 0,
    finalHtmlBytes: 0,
  };
}

function textBytes(value) {
  return new Blob([value || ""]).size;
}

function normalizeUrl(value) {
  return String(value || "").replace(/[\x00-\x1f\x7f\s]/g, "").trim();
}

function protocolOf(value) {
  const match = normalizeUrl(value).match(/^([a-z][a-z0-9+.-]*):/i);
  return match ? `${match[1].toLowerCase()}:` : "";
}

export function isSafeHref(value) {
  return ["https:", "http:", "mailto:"].includes(protocolOf(value));
}

export function isSafeImageSrc(value) {
  const normalized = normalizeUrl(value);
  // Keep an intentionally empty src attribute. It is used by imported layout
  // placeholders and must remain editable in source/visual mode.
  if (normalized === "") return true;
  const lower = normalized.toLowerCase();
  if (["https:", "http:"].includes(protocolOf(normalized))) return true;
  if (lower.startsWith("blob:")) return true;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(lower)) return true;
  if (lower.startsWith("/uploads/")) return true;
  // Keep relative placeholders such as "这里粘贴微信公众号qpic图片地址"
  // editable. Protocol-based values still have to pass the checks above.
  if (!protocolOf(normalized) && !normalized.startsWith("//") && !/[\\<>"']/ .test(normalized)) return true;
  return false;
}

export function sanitizeStyle(style, report = createReport()) {
  const kept = [];
  String(style || "")
    .split(";")
    .forEach((part) => {
      const index = part.indexOf(":");
      if (index <= 0) return;
      const property = part.slice(0, index).trim().toLowerCase();
      const value = part.slice(index + 1).trim().replace(/[\x00-\x1f\x7f]/g, "");
      const lower = value.toLowerCase();
      if (!ALLOWED_CSS.has(property)) {
        report.removedCss += 1;
        return;
      }
      if (!value || /url\s*\(|@import|expression\s*\(|behavior\s*:|!important/i.test(value)) {
        report.removedCss += 1;
        return;
      }
      if (property === "display" && !ALLOWED_DISPLAY.has(lower)) {
        report.removedCss += 1;
        return;
      }
      if (/[\{\}<>]/.test(value)) {
        report.removedCss += 1;
        return;
      }
      kept.push(`${property}: ${value.replace(/\s+/g, " ")}`);
    });
  return kept.join("; ");
}

function unwrapElement(element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  element.remove();
}

function sanitizeElement(element, report, options) {
  const tag = element.tagName.toLowerCase();
  if (REMOVE_WITH_CONTENT.has(tag)) {
    report.removedTags += 1;
    element.remove();
    return;
  }
  if (!ALLOWED_TAGS.has(tag)) {
    report.removedTags += 1;
    unwrapElement(element);
    return;
  }

  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    let value = attribute.value || "";
    if (
      name.startsWith("on") ||
      name === "id" ||
      name === "class" ||
      name === "contenteditable" ||
      name === "draggable" ||
      name === "srcdoc" ||
      name === "formaction" ||
      name === "xlink:href" ||
      (name.startsWith("data-") && name !== "data-width") ||
      !ALLOWED_ATTRS.has(name)
    ) {
      element.removeAttribute(attribute.name);
      report.removedAttributes += 1;
      continue;
    }

    if (name === "href") {
      if (tag !== "a" || !isSafeHref(value)) {
        element.removeAttribute(attribute.name);
        report.removedUrls += 1;
        continue;
      }
      element.setAttribute("href", normalizeUrl(value));
      element.setAttribute("rel", "noopener noreferrer");
    }

    if (name === "src") {
      if (tag === "img" && normalizeUrl(value) === "") {
        element.setAttribute("src", "");
        continue;
      }
      if (tag !== "img" || !isSafeImageSrc(value)) {
        element.removeAttribute(attribute.name);
        report.removedUrls += 1;
        continue;
      }
      element.setAttribute("src", normalizeUrl(value));
    }

    if (name === "target") {
      if (value !== "_blank") {
        element.removeAttribute(attribute.name);
        report.removedAttributes += 1;
      } else {
        element.setAttribute("rel", "noopener noreferrer");
      }
    }

    if (name === "rel") {
      const rel = value
        .split(/\s+/)
        .filter((token) => /^[a-z0-9_-]+$/i.test(token))
        .join(" ");
      if (rel) element.setAttribute("rel", rel);
      else element.removeAttribute(attribute.name);
    }

    if (name === "style") {
      const cleanStyle = sanitizeStyle(value, report);
      if (cleanStyle) element.setAttribute("style", cleanStyle);
      else element.removeAttribute("style");
    }

    if (name === "data-width") {
      value = value.replace(/[^\d.%pxrememvwvh]/gi, "").slice(0, 20);
      if (value) element.setAttribute("data-width", value);
      else element.removeAttribute("data-width");
    }
  }

  if (options.forClipboard) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith("data-") && attribute.name !== "data-width") {
        element.removeAttribute(attribute.name);
        report.removedAttributes += 1;
      }
    }
  }
}

export function sanitizeEditorHtml(html, options = {}) {
  const report = createReport();
  const template = document.createElement("template");
  template.innerHTML = String(html || "");

  let changed = true;
  while (changed) {
    changed = false;
    for (const element of [...template.content.querySelectorAll("*")]) {
      const before = element.isConnected;
      sanitizeElement(element, report, options);
      if (before && !element.isConnected) changed = true;
    }
  }

  const clean = template.innerHTML.replace(/\sstyle=""(?=[\s>])/g, "").trim();
  report.finalHtmlBytes = textBytes(clean);
  return options.returnReport ? { html: clean, report } : clean;
}

export function isHtmlEmpty(html) {
  const template = document.createElement("template");
  template.innerHTML = sanitizeEditorHtml(html || "");
  const text = template.content.textContent.replace(/\s+/g, "");
  return !text && !template.content.querySelector("img");
}
