"use strict";

const { WechatApiError } = require("./errors");

const MAX_RESPONSE_BYTES = 64 * 1024;

function createWechatClient(config) {
  if (config.wechatClientInstance) return config.wechatClientInstance;
  const baseUrl = new URL(config.wechat.apiBaseUrl);

  async function requestJson(pathname, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.wechat.requestTimeoutMs);
    try {
      const response = await fetch(new URL(pathname, baseUrl), { ...options, signal: controller.signal });
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
        throw new WechatApiError(null, "response_too_large", { code: "WECHAT_INVALID_RESPONSE" });
      }
      let payload;
      try {
        payload = JSON.parse(text);
      } catch (error) {
        throw new WechatApiError(null, "invalid_json", { code: "WECHAT_INVALID_RESPONSE" });
      }
      if (!response.ok) {
        throw new WechatApiError(payload?.errcode, `http_${response.status}`, { retryable: response.status >= 500 });
      }
      if (payload?.errcode && Number(payload.errcode) !== 0) {
        throw new WechatApiError(payload.errcode, payload.errmsg);
      }
      return payload;
    } catch (error) {
      if (error instanceof WechatApiError) throw error;
      throw new WechatApiError(null, error.name === "AbortError" ? "timeout" : error.code || error.name, {
        code: "WECHAT_NETWORK_ERROR",
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function requestMultipart(pathname, accessToken, image) {
    const form = new FormData();
    form.append("media", new Blob([image.buffer], { type: image.mimeType }), image.filename);
    return requestJson(`${pathname}${pathname.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
    });
  }

  async function getStableAccessToken({ appId, appSecret, forceRefresh = false }) {
    const payload = await requestJson("/cgi-bin/stable_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "client_credential",
        appid: appId,
        secret: appSecret,
        force_refresh: forceRefresh === true,
      }),
    });
    if (typeof payload.access_token !== "string" || !payload.access_token || !Number.isFinite(Number(payload.expires_in))) {
      throw new WechatApiError(null, "missing_token", { code: "WECHAT_INVALID_RESPONSE" });
    }
    return { accessToken: payload.access_token, expiresIn: Math.max(1, Number(payload.expires_in)) };
  }

  async function uploadArticleImage(accessToken, image) {
    const payload = await requestMultipart("/cgi-bin/media/uploadimg", accessToken, image);
    if (typeof payload.url !== "string" || !payload.url) {
      throw new WechatApiError(null, "missing_image_url", { code: "WECHAT_INVALID_RESPONSE" });
    }
    return { url: payload.url };
  }

  async function uploadPermanentImage(accessToken, image) {
    const payload = await requestMultipart("/cgi-bin/material/add_material?type=image", accessToken, image);
    if (typeof payload.media_id !== "string" || !payload.media_id) {
      throw new WechatApiError(null, "missing_media_id", { code: "WECHAT_INVALID_RESPONSE" });
    }
    return { mediaId: payload.media_id, url: payload.url || null };
  }

  async function createDraft(accessToken, article) {
    const payload = await requestJson(`/cgi-bin/draft/add?access_token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ articles: [article] }),
    });
    if (typeof payload.media_id !== "string" || !payload.media_id) {
      throw new WechatApiError(null, "missing_draft_media_id", { code: "WECHAT_INVALID_RESPONSE" });
    }
    return { mediaId: payload.media_id };
  }

  return { createDraft, getStableAccessToken, uploadArticleImage, uploadPermanentImage };
}

module.exports = {
  MAX_RESPONSE_BYTES,
  createWechatClient,
};
