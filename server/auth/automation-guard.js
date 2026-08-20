"use strict";

const { createHttpError } = require("../security");

async function verifyAutomationGuard(config, payload, context) {
  if (config.automationGuardInstance) {
    const accepted = await config.automationGuardInstance.verify(payload.challengeToken, context);
    if (!accepted) throw createHttpError(422, "AUTOMATION_CHECK_FAILED", "人机验证未通过，请重试");
    return;
  }
  if (config.automationGuardProvider === "none") return;
  throw createHttpError(503, "AUTOMATION_CHECK_UNAVAILABLE", "人机验证服务暂时不可用");
}

module.exports = {
  verifyAutomationGuard,
};
