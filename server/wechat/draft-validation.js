"use strict";

const { createHttpError } = require("../security");

function text(value, name, max, required = false) {
  const result = String(value ?? "").trim();
  if (required && !result) throw createHttpError(422, "INVALID_DRAFT", `${name}不能为空`);
  if (result.length > max) throw createHttpError(422, "INVALID_DRAFT", `${name}不能超过 ${max} 个字符`);
  return result;
}

function parseDraftInput(body, config) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createHttpError(422, "INVALID_DRAFT", "草稿参数不正确");
  }
  const accountId = text(body.accountId, "公众号", 100, true);
  if (!/^[A-Za-z0-9_-]+$/.test(accountId)) throw createHttpError(422, "INVALID_DRAFT", "公众号参数不正确");
  const title = text(body.title, "标题", 32, true);
  const author = text(body.author, "作者", 16);
  const digest = text(body.digest, "摘要", 128);
  const content = String(body.content || "");
  if (!content.trim()) throw createHttpError(422, "INVALID_DRAFT", "正文不能为空");
  if (Buffer.byteLength(content, "utf8") > config.wechat.draftHtmlMaxBytes) {
    throw createHttpError(413, "DRAFT_CONTENT_TOO_LARGE", "正文内容过大");
  }
  const contentSourceUrl = text(body.contentSourceUrl, "原文链接", 1024);
  if (contentSourceUrl) {
    let source;
    try { source = new URL(contentSourceUrl); } catch (error) {
      throw createHttpError(422, "INVALID_SOURCE_URL", "原文链接格式不正确");
    }
    if (!["http:", "https:"].includes(source.protocol)) {
      throw createHttpError(422, "INVALID_SOURCE_URL", "原文链接仅支持 HTTP 或 HTTPS");
    }
  }
  const coverMediaId = text(body.coverMediaId, "封面素材 ID", 256);
  const coverImage = String(body.coverImage || "").trim();
  if (!coverMediaId && !coverImage) {
    throw createHttpError(422, "COVER_REQUIRED", "请选择封面图片或填写微信封面素材 ID");
  }
  if (coverMediaId && !/^[A-Za-z0-9_-]{6,256}$/.test(coverMediaId)) {
    throw createHttpError(422, "INVALID_COVER_MEDIA_ID", "封面素材 ID 格式不正确");
  }
  return {
    accountId,
    title,
    author,
    digest,
    content,
    contentSourceUrl,
    coverMediaId,
    coverImage,
    needOpenComment: body.needOpenComment === true ? 1 : 0,
    onlyFansCanComment: body.onlyFansCanComment === true ? 1 : 0,
    articleVersion: text(body.articleVersion, "文章版本", 100) || null,
  };
}

function parseIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
    throw createHttpError(422, "INVALID_IDEMPOTENCY_KEY", "提交标识不正确，请刷新页面后重试");
  }
  return key;
}

module.exports = { parseDraftInput, parseIdempotencyKey };
