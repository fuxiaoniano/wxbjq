"use strict";

const { createWechatClient } = require("./client");

function createDirectWechatAccountProvider(config) {
  const client = createWechatClient(config);
  return {
    type: "direct",
    async verifyCredentials(credentials) {
      return client.getStableAccessToken({
        appId: credentials.appId,
        appSecret: credentials.appSecret,
        forceRefresh: false,
      });
    },
  };
}

function createWechatAccountProvider(config, type = "direct") {
  if (config.wechatAccountProviderInstance) return config.wechatAccountProviderInstance;
  if (type === "direct") return createDirectWechatAccountProvider(config);
  throw new Error("不支持的微信公众号授权方式");
}

module.exports = {
  createDirectWechatAccountProvider,
  createWechatAccountProvider,
};
