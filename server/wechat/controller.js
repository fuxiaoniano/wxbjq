"use strict";

const { requireVerifiedEmail } = require("../auth/authorization");
const { getAuthService } = require("../auth/service");
const { getMembershipService } = require("../membership/service");
const { sendJson, sendNoContent } = require("../responses");
const { verifyWriteRequest } = require("../security");
const { getWechatService } = require("./service");
const { getWechatDraftService } = require("./draft-service");
const { parseIdempotencyKey } = require("./draft-validation");

async function handleWechatApi(req, res, requestUrl, config, pathname, readBody) {
  if (!pathname.startsWith("/api/wechat/")) return false;
  const method = req.method || "GET";
  const auth = getAuthService(config);
  const authContext = requireVerifiedEmail(await auth.authenticateRequest(req));
  authContext.req = req;
  const isDraftRoute = pathname.startsWith("/api/wechat/drafts") || pathname === "/api/wechat/draft-records";
  if (!isDraftRoute) await getMembershipService(config).requireFeature(authContext.user, "wechat.account.bind");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    verifyWriteRequest(req, config);
    auth.requireCsrf(req, authContext);
  }
  const wechat = getWechatService(config);
  const drafts = getWechatDraftService(config);

  if (pathname === "/api/wechat/drafts/preview" && method === "POST") {
    sendJson(res, 200, await drafts.preview(await readBody(req, config), authContext));
    return true;
  }
  if (pathname === "/api/wechat/drafts" && method === "POST") {
    const key = parseIdempotencyKey(req.headers["idempotency-key"]);
    const result = await drafts.createDraft(await readBody(req, config), key, authContext);
    const status = result.reused ? (result.operation.status === "processing" ? 202 : 200) : 201;
    sendJson(res, status, result);
    return true;
  }
  const draftOperationMatch = pathname.match(/^\/api\/wechat\/drafts\/([A-Za-z0-9_-]+)$/);
  if (draftOperationMatch && method === "GET") {
    sendJson(res, 200, await drafts.getOperation(authContext.user.id, draftOperationMatch[1]));
    return true;
  }
  if (pathname === "/api/wechat/draft-records" && method === "GET") {
    sendJson(res, 200, { items: await drafts.listRecords(authContext.user.id, requestUrl.searchParams.get("limit")) });
    return true;
  }

  if (pathname === "/api/wechat/accounts" && method === "GET") {
    sendJson(res, 200, { items: await wechat.listAccounts(authContext.user) });
    return true;
  }
  if (pathname === "/api/wechat/accounts" && method === "POST") {
    sendJson(res, 201, await wechat.createAccount(await readBody(req, config), authContext));
    return true;
  }

  const accountMatch = pathname.match(/^\/api\/wechat\/accounts\/([A-Za-z0-9_-]+)$/);
  if (accountMatch && method === "PATCH") {
    sendJson(res, 200, await wechat.updateAccount(accountMatch[1], await readBody(req, config), authContext));
    return true;
  }
  if (accountMatch && method === "DELETE") {
    await wechat.deleteAccount(accountMatch[1], authContext);
    sendNoContent(res);
    return true;
  }

  const verifyMatch = pathname.match(/^\/api\/wechat\/accounts\/([A-Za-z0-9_-]+)\/verify$/);
  if (verifyMatch && method === "POST") {
    sendJson(res, 200, await wechat.verifyAccount(verifyMatch[1], authContext));
    return true;
  }

  return false;
}

module.exports = {
  handleWechatApi,
};
