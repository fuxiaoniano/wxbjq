import { apiJson } from "./api.js";

let capabilities = new Map();

export function setCapabilities(items = []) {
  capabilities = new Map(items.map((item) => [item.featureKey, item]));
  document.dispatchEvent(new CustomEvent("entitlements:changed", { detail: { items } }));
}

export function getFeatureAccess(featureKey) {
  return capabilities.get(featureKey) || null;
}

export function canUseFeature(featureKey) {
  return getFeatureAccess(featureKey)?.allowed === true;
}

export async function refreshEntitlements() {
  const payload = await apiJson("/features");
  setCapabilities(payload?.items || []);
  return payload?.items || [];
}

export async function checkFeature(featureKey) {
  const access = await apiJson(`/features/${encodeURIComponent(featureKey)}/check`);
  capabilities.set(featureKey, access);
  return access;
}

export async function requireFeature(featureKey) {
  const access = await checkFeature(featureKey);
  if (access.allowed) return access;
  if (access.code === "AUTH_REQUIRED") {
    document.dispatchEvent(new CustomEvent("auth:required", { detail: { featureKey } }));
  } else if (access.code === "EMAIL_NOT_VERIFIED") {
    document.dispatchEvent(new CustomEvent("auth:verification-required", { detail: { featureKey } }));
  } else {
    document.dispatchEvent(new CustomEvent("membership:upgrade-required", { detail: { access } }));
  }
  return null;
}
