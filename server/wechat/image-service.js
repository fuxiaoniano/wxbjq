"use strict";

const crypto = require("node:crypto");
const dns = require("node:dns/promises");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");
const { createHttpError } = require("../security");

const TRUSTED_WECHAT_IMAGE_HOSTS = new Set(["mmbiz.qpic.cn", "mmbiz.qlogo.cn"]);

function isPrivateAddress(address) {
  const value = String(address || "").toLowerCase().split("%")[0];
  if (net.isIPv4(value)) {
    const octets = value.split(".").map(Number);
    return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
      octets[0] >= 224;
  }
  if (!net.isIPv6(value)) return true;
  if (value === "::" || value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd") ||
      value.startsWith("ff") || value.startsWith("2001:db8:") || value.startsWith("2001:10:") || value.startsWith("2001:2:")) return true;
  if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
  return false;
}

function detectImage(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (buffer.length < 24) return null;
    return { mimeType: "image/png", extension: ".png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { mimeType: "image/jpeg", extension: ".jpg", height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) return null;
      offset += 2 + length;
    }
    return null;
  }
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
    if (buffer.length < 10) return null;
    return { mimeType: "image/gif", extension: ".gif", width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  return null;
}

function parseDataImage(source, maxBytes) {
  const match = String(source || "").match(/^data:image\/(png|jpeg|gif);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) throw createHttpError(422, "INVALID_IMAGE", "Base64 图片格式不正确");
  const encoded = match[2].replace(/\s/g, "");
  if (encoded.length > Math.ceil(maxBytes * 4 / 3) + 8) throw createHttpError(413, "IMAGE_TOO_LARGE", "图片文件过大");
  const buffer = Buffer.from(encoded, "base64");
  return validateImage(buffer, maxBytes);
}

function validateImage(buffer, maxBytes, options = {}) {
  if (!buffer.length || buffer.length > maxBytes) throw createHttpError(413, "IMAGE_TOO_LARGE", "图片文件过大");
  const detected = detectImage(buffer);
  if (!detected || (options.contentImage && detected.mimeType === "image/gif")) {
    throw createHttpError(422, "UNSUPPORTED_IMAGE", options.contentImage ? "正文图片仅支持 JPG 或 PNG" : "封面仅支持 JPG、PNG 或 GIF");
  }
  if (!detected.width || !detected.height || (options.maxPixels && detected.width * detected.height > options.maxPixels)) {
    throw createHttpError(422, "IMAGE_DIMENSIONS_INVALID", "图片像素尺寸无效或过大");
  }
  return { buffer, ...detected, hash: crypto.createHash("sha256").update(buffer).digest("hex") };
}

async function resolvePublicAddress(hostname) {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw createHttpError(422, "IMAGE_URL_BLOCKED", "图片地址指向了不允许访问的网络");
  }
  return addresses[0];
}

async function downloadImage(source, config, maxBytes, redirectsLeft = config.wechat.imageRedirectLimit) {
  let url;
  try { url = new URL(source); } catch (error) {
    throw createHttpError(422, "INVALID_IMAGE_URL", "图片地址格式不正确");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw createHttpError(422, "INVALID_IMAGE_URL", "图片地址仅支持 HTTP 或 HTTPS");
  }
  if ((url.protocol === "http:" && url.port && url.port !== "80") || (url.protocol === "https:" && url.port && url.port !== "443")) {
    throw createHttpError(422, "IMAGE_URL_BLOCKED", "图片地址端口不允许访问");
  }
  const address = await resolvePublicAddress(url.hostname);
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = client.get(url, {
      headers: { Accept: "image/png,image/jpeg,image/gif", "User-Agent": "WechatEditorImageFetcher/1.0" },
      lookup(hostname, options, callback) { callback(null, address.address, address.family); },
      servername: url.hostname,
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        if (redirectsLeft <= 0) return reject(createHttpError(422, "IMAGE_REDIRECT_LIMIT", "图片地址重定向次数过多"));
        return downloadImage(new URL(response.headers.location, url).toString(), config, maxBytes, redirectsLeft - 1).then(resolve, reject);
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(createHttpError(422, "IMAGE_DOWNLOAD_FAILED", "图片下载失败"));
      }
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          request.destroy();
          reject(createHttpError(413, "IMAGE_TOO_LARGE", "图片文件过大"));
        } else chunks.push(chunk);
      });
      response.on("end", () => {
        if (!settled && bytes <= maxBytes) {
          settled = true;
          resolve(Buffer.concat(chunks, bytes));
        }
      });
    });
    request.setTimeout(config.wechat.imageDownloadTimeoutMs, () => request.destroy(createHttpError(408, "IMAGE_DOWNLOAD_TIMEOUT", "图片下载超时")));
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error.statusCode ? error : createHttpError(422, "IMAGE_DOWNLOAD_FAILED", "图片下载失败"));
    });
  });
}

function isTrustedWechatImage(source) {
  try {
    const url = new URL(source);
    return url.protocol === "https:" && TRUSTED_WECHAT_IMAGE_HOSTS.has(url.hostname.toLowerCase());
  } catch (error) { return false; }
}

function createWechatImageService(config, repository, client, tokenService) {
  async function readSource(source, maxBytes, options) {
    const buffer = String(source).startsWith("data:image/")
      ? parseDataImage(source, maxBytes).buffer
      : await downloadImage(source, config, maxBytes);
    return validateImage(buffer, maxBytes, { ...options, maxPixels: config.wechat.imageMaxPixels });
  }

  async function uploadContentImage(account, source) {
    if (isTrustedWechatImage(source)) return source;
    const image = await readSource(source, config.wechat.imageMaxBytes, { contentImage: true });
    const cached = await repository.imageCache.findOne(
      (row) => row.userId === account.userId && row.accountId === account.id && row.kind === "content" && row.hash === image.hash,
    );
    if (cached?.wechatUrl) return cached.wechatUrl;
    const result = await tokenService.withAccessToken(account, (accessToken) => client.uploadArticleImage(accessToken, {
      buffer: image.buffer,
      filename: `article-${image.hash.slice(0, 12)}${image.extension}`,
      mimeType: image.mimeType,
    }));
    await repository.imageCache.insert({ userId: account.userId, accountId: account.id, kind: "content", hash: image.hash, wechatUrl: result.url });
    return result.url;
  }

  async function uploadCover(account, source) {
    const image = await readSource(source, config.wechat.coverImageMaxBytes, {});
    const cached = await repository.imageCache.findOne(
      (row) => row.userId === account.userId && row.accountId === account.id && row.kind === "cover" && row.hash === image.hash,
    );
    if (cached?.mediaId) return cached.mediaId;
    const result = await tokenService.withAccessToken(account, (accessToken) => client.uploadPermanentImage(accessToken, {
      buffer: image.buffer,
      filename: `cover-${image.hash.slice(0, 12)}${image.extension}`,
      mimeType: image.mimeType,
    }));
    await repository.imageCache.insert({ userId: account.userId, accountId: account.id, kind: "cover", hash: image.hash, mediaId: result.mediaId });
    return result.mediaId;
  }

  return { isTrustedWechatImage, readSource, uploadContentImage, uploadCover };
}

module.exports = { createWechatImageService, detectImage, downloadImage, isPrivateAddress, isTrustedWechatImage, parseDataImage, validateImage };
