"use strict";

const { requireAdmin, requireVerifiedEmail } = require("../auth/authorization");
const { getAuthService } = require("../auth/service");
const { sendJson, sendNoContent } = require("../responses");
const { verifyWriteRequest } = require("../security");
const { getAdminService } = require("./service");

async function handleAdminApi(req, res, requestUrl, config, pathname, readBody) {
  if (!pathname.startsWith("/api/admin/")) return false;
  const method = req.method || "GET";
  const auth = getAuthService(config);
  const authContext = await auth.authenticateRequest(req);
  authContext.req = req;
  requireVerifiedEmail(authContext);
  requireAdmin(authContext);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    verifyWriteRequest(req, config);
    auth.requireCsrf(req, authContext);
  }
  const admin = getAdminService(config);

  if (pathname === "/api/admin/users" && method === "GET") {
    sendJson(res, 200, { items: await admin.listUsers() });
    return true;
  }
  const userMatch = pathname.match(/^\/api\/admin\/users\/([A-Za-z0-9_-]+)$/);
  if (userMatch && method === "PATCH") {
    sendJson(res, 200, await admin.updateUser(userMatch[1], await readBody(req, config), authContext));
    return true;
  }

  if (pathname === "/api/admin/membership-plans" && method === "GET") {
    sendJson(res, 200, { items: await admin.listPlans() });
    return true;
  }
  if (pathname === "/api/admin/membership-plans" && method === "POST") {
    sendJson(res, 201, await admin.createPlan(await readBody(req, config), authContext));
    return true;
  }
  const planMatch = pathname.match(/^\/api\/admin\/membership-plans\/([A-Za-z0-9_-]+)$/);
  if (planMatch && method === "PATCH") {
    sendJson(res, 200, await admin.updatePlan(planMatch[1], await readBody(req, config), authContext));
    return true;
  }

  if (pathname === "/api/admin/features" && method === "GET") {
    sendJson(res, 200, { items: await admin.listFeatures() });
    return true;
  }
  if (pathname === "/api/admin/features" && method === "POST") {
    sendJson(res, 201, await admin.createFeature(await readBody(req, config), authContext));
    return true;
  }
  const adminFeatureMatch = pathname.match(/^\/api\/admin\/features\/([A-Za-z0-9_-]+)$/);
  if (adminFeatureMatch && method === "PATCH") {
    sendJson(res, 200, await admin.updateFeature(adminFeatureMatch[1], await readBody(req, config), authContext));
    return true;
  }

  if (pathname === "/api/admin/plan-features" && method === "GET") {
    sendJson(res, 200, { items: await admin.listPlanFeatures() });
    return true;
  }
  const planFeatureMatch = pathname.match(
    /^\/api\/admin\/plans\/([A-Za-z0-9_-]+)\/features\/([A-Za-z0-9._-]+)$/,
  );
  if (planFeatureMatch && method === "PUT") {
    sendJson(
      res,
      200,
      await admin.setPlanFeature(
        planFeatureMatch[1],
        planFeatureMatch[2],
        await readBody(req, config),
        authContext,
      ),
    );
    return true;
  }

  if (pathname === "/api/admin/memberships" && method === "GET") {
    sendJson(res, 200, { items: await admin.listMemberships() });
    return true;
  }
  if (pathname === "/api/admin/memberships" && method === "POST") {
    sendJson(res, 201, await admin.grantMembership(await readBody(req, config), authContext));
    return true;
  }
  const membershipMatch = pathname.match(/^\/api\/admin\/memberships\/([A-Za-z0-9_-]+)$/);
  if (membershipMatch && method === "PATCH") {
    sendJson(
      res,
      200,
      await admin.updateMembership(membershipMatch[1], await readBody(req, config), authContext),
    );
    return true;
  }

  if (pathname === "/api/admin/entitlements" && method === "GET") {
    sendJson(res, 200, { items: await admin.listEntitlements() });
    return true;
  }
  if (pathname === "/api/admin/entitlements" && method === "POST") {
    sendJson(res, 201, await admin.createEntitlement(await readBody(req, config), authContext));
    return true;
  }
  const entitlementMatch = pathname.match(/^\/api\/admin\/entitlements\/([A-Za-z0-9_-]+)$/);
  if (entitlementMatch && method === "PATCH") {
    sendJson(
      res,
      200,
      await admin.updateEntitlement(entitlementMatch[1], await readBody(req, config), authContext),
    );
    return true;
  }
  if (entitlementMatch && method === "DELETE") {
    await admin.deleteEntitlement(entitlementMatch[1], authContext);
    sendNoContent(res);
    return true;
  }

  if (pathname === "/api/admin/audit-logs" && method === "GET") {
    sendJson(res, 200, {
      items: await auth.audit.list({
        action: requestUrl.searchParams.get("action") || "",
        userId: requestUrl.searchParams.get("userId") || "",
        limit: requestUrl.searchParams.get("limit") || 100,
      }),
    });
    return true;
  }

  if (pathname === "/api/admin/wechat-accounts" && method === "GET") {
    sendJson(res, 200, { items: await admin.listWechatAccounts() });
    return true;
  }

  return false;
}

module.exports = {
  handleAdminApi,
};
