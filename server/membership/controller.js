"use strict";

const { getAuthService } = require("../auth/service");
const { sendJson } = require("../responses");
const { getMembershipService } = require("./service");

async function handleMembershipApi(req, res, requestUrl, config, pathname) {
  const method = req.method || "GET";
  const isMembershipRoute =
    pathname.startsWith("/api/membership/") || pathname === "/api/features" || pathname.startsWith("/api/features/");
  if (!isMembershipRoute) return false;

  const auth = getAuthService(config);
  const membership = getMembershipService(config);

  if (pathname === "/api/membership/me" && method === "GET") {
    const authContext = await auth.authenticateRequest(req);
    sendJson(res, 200, {
      user: auth.safeUser(authContext.user),
      ...(await membership.getMembershipContext(authContext.user)),
    });
    return true;
  }

  if (pathname === "/api/membership/plans" && method === "GET") {
    await membership.repository.ensureSeeded();
    const [plans, planFeatures] = await Promise.all([
      membership.repository.plans.list((row) => row.active !== false),
      membership.repository.planFeatures.list((row) => row.enabled === true),
    ]);
    sendJson(res, 200, {
      items: plans
        .sort((left, right) => (left.rank || 0) - (right.rank || 0))
        .map((plan) => ({
          ...plan,
          features: planFeatures.filter((row) => row.planId === plan.id),
        })),
    });
    return true;
  }

  if (pathname === "/api/features" && method === "GET") {
    const authContext = await auth.authenticateRequest(req, { optional: true });
    sendJson(res, 200, { items: await membership.listFeatureAccess(authContext?.user || null) });
    return true;
  }

  const featureMatch = pathname.match(/^\/api\/features\/([A-Za-z0-9._-]+)\/check$/);
  if (featureMatch && method === "GET") {
    const authContext = await auth.authenticateRequest(req, { optional: true });
    sendJson(res, 200, await membership.resolveFeature(authContext?.user || null, featureMatch[1]));
    return true;
  }

  return false;
}

module.exports = {
  handleMembershipApi,
};
