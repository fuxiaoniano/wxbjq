"use strict";

const { createJsonCollectionRepository } = require("../data/json-collection-repository");
const { DEFAULT_FEATURES, DEFAULT_PLANS, DEFAULT_PLAN_FEATURES } = require("./catalog");

function createMembershipRepository(config) {
  const plans = createJsonCollectionRepository(config.membershipFiles.plans, { idPrefix: "plan" });
  const memberships = createJsonCollectionRepository(config.membershipFiles.memberships, { idPrefix: "mem" });
  const features = createJsonCollectionRepository(config.membershipFiles.features, { idPrefix: "feature" });
  const planFeatures = createJsonCollectionRepository(config.membershipFiles.planFeatures, { idPrefix: "pf" });
  const entitlements = createJsonCollectionRepository(config.membershipFiles.entitlements, { idPrefix: "ent" });
  const usage = createJsonCollectionRepository(config.membershipFiles.usage, { idPrefix: "use" });
  let initialized = false;

  async function seedCollection(repository, defaults) {
    await repository.transaction((rows) => {
      const now = new Date().toISOString();
      for (const record of defaults) {
        if (rows.some((row) => row.id === record.id)) continue;
        rows.push({ ...structuredClone(record), createdAt: now, updatedAt: now });
      }
    });
  }

  async function ensureSeeded() {
    if (initialized) return;
    await seedCollection(plans, DEFAULT_PLANS);
    await seedCollection(features, DEFAULT_FEATURES);
    await seedCollection(planFeatures, DEFAULT_PLAN_FEATURES);
    initialized = true;
  }

  return {
    ensureSeeded,
    entitlements,
    features,
    memberships,
    planFeatures,
    plans,
    usage,
  };
}

module.exports = {
  createMembershipRepository,
};
