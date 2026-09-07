"use strict";

const parse5 = require("parse5");
const { createHttpError } = require("../security");

const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "i", "img", "li", "ol", "p", "pre", "section", "span", "strong", "table", "tbody",
  "td", "th", "thead", "tr", "u", "ul",
]);
const DROP_CONTENT_TAGS = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea"]);
const ALLOWED_ATTRS = new Set(["alt", "class", "colspan", "height", "href", "rel", "rowspan", "src", "style", "target", "title", "width"]);
const ALLOWED_REL_TOKENS = new Set(["nofollow", "noopener", "noreferrer", "sponsored", "ugc"]);
const ALLOWED_STYLES = new Set([
  "background", "background-color", "border", "border-color", "border-radius", "border-style", "border-width",
  "color", "display", "font-family", "font-size", "font-style", "font-weight", "height", "line-height",
  "margin", "margin-bottom", "margin-left", "margin-right", "margin-top", "max-width", "padding", "padding-bottom",
  "padding-left", "padding-right", "padding-top", "text-align", "text-decoration", "vertical-align", "white-space", "width",
]);

function safeUrl(value, image = false) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (image && /^data:image\/(png|jpeg|gif);base64,/i.test(text)) return text;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : "";
  } catch (error) {
    return image && text.startsWith("/") ? text : "";
  }
}

function cleanStyle(value) {
  return String(value || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf(":");
      if (index < 1) return "";
      const property = part.slice(0, index).trim().toLowerCase();
      const styleValue = part.slice(index + 1).trim();
      if (!ALLOWED_STYLES.has(property) || /[\\]|\/\*/.test(styleValue) || /url\s*\(|expression|javascript|@import/i.test(styleValue)) return "";
      return `${property}:${styleValue.slice(0, 300)}`;
    })
    .filter(Boolean)
    .join(";");
}

function sanitizeNode(node, report) {
  if (!node.childNodes) return;
  for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
    const child = node.childNodes[index];
    if (!child.tagName) {
      sanitizeNode(child, report);
      continue;
    }
    const tag = child.tagName.toLowerCase();
    if (DROP_CONTENT_TAGS.has(tag)) {
      node.childNodes.splice(index, 1);
      report.removedElements += 1;
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      sanitizeNode(child, report);
      const replacement = child.childNodes || [];
      for (const item of replacement) item.parentNode = node;
      node.childNodes.splice(index, 1, ...replacement);
      report.removedElements += 1;
      continue;
    }
    const attrs = [];
    for (const attr of child.attrs || []) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || !ALLOWED_ATTRS.has(name)) {
        report.removedAttributes += 1;
        continue;
      }
      let value = attr.value;
      if (name === "style") value = cleanStyle(value);
      if (name === "src") value = safeUrl(value, true);
      if (name === "href") value = safeUrl(value, false);
      if (name === "rel") {
        value = value
          .split(/\s+/)
          .map((token) => token.toLowerCase())
          .filter((token) => ALLOWED_REL_TOKENS.has(token))
          .join(" ");
      }
      if (!value) {
        report.removedAttributes += 1;
        continue;
      }
      attrs.push({ name, value });
    }
    if (tag === "a" && attrs.some((attr) => attr.name === "href")) {
      const rel = new Set(
        String(attrs.find((attr) => attr.name === "rel")?.value || "")
          .split(/\s+/)
          .filter(Boolean),
      );
      rel.add("noopener");
      rel.add("noreferrer");
      const existingRel = attrs.find((attr) => attr.name === "rel");
      if (existingRel) existingRel.value = [...rel].join(" ");
      else attrs.push({ name: "rel", value: [...rel].join(" ") });
    }
    child.attrs = attrs;
    sanitizeNode(child, report);
  }
}

function getAttr(node, name) {
  return (node.attrs || []).find((attr) => attr.name === name)?.value || "";
}

function setAttr(node, name, value) {
  node.attrs = (node.attrs || []).filter((attr) => attr.name !== name);
  node.attrs.push({ name, value });
}

function collectImages(node, result = []) {
  for (const child of node.childNodes || []) {
    if (child.tagName === "img") result.push(child);
    collectImages(child, result);
  }
  return result;
}

async function convertWechatContent(html, options = {}) {
  const fragment = parse5.parseFragment(String(html || ""));
  const report = { removedElements: 0, removedAttributes: 0, images: 0, uploadedImages: 0 };
  sanitizeNode(fragment, report);
  const images = collectImages(fragment);
  report.images = images.length;
  let content = parse5.serialize(fragment);
  const plainText = content.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ").trim();
  if (!plainText) throw createHttpError(422, "DRAFT_CONTENT_EMPTY", "清理后正文为空，请检查文章内容");
  if (options.maxCharacters && [...plainText].length > options.maxCharacters) {
    throw createHttpError(413, "DRAFT_CONTENT_TOO_LARGE", `正文不能超过 ${options.maxCharacters} 个字符`);
  }
  if (options.uploadImage) {
    for (const image of images) {
      const src = getAttr(image, "src");
      if (!src) continue;
      const uploadedUrl = await options.uploadImage(src);
      setAttr(image, "src", uploadedUrl);
      report.uploadedImages += uploadedUrl === src ? 0 : 1;
    }
  }
  content = parse5.serialize(fragment);
  if (options.maxBytes && Buffer.byteLength(content, "utf8") > options.maxBytes) {
    throw createHttpError(413, "DRAFT_CONTENT_TOO_LARGE", "转换后的正文超过微信草稿大小限制");
  }
  return { content, report, plainText };
}

module.exports = { cleanStyle, convertWechatContent, safeUrl };
