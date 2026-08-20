"use strict";

const { createEmailProvider } = require("./providers");
const { passwordResetEmail, verificationEmail } = require("./templates");

function createActionUrl(config, action, token) {
  const url = new URL(config.appPublicUrl);
  url.hash = `${action}=${encodeURIComponent(token)}`;
  return url.toString();
}

function createEmailService(config) {
  const provider = createEmailProvider(config);

  async function sendVerification(email, token) {
    const url = createActionUrl(config, "verify-email", token);
    const content = verificationEmail(url, Math.round(config.emailVerificationTtlMs / 3_600_000));
    return provider.send({ type: "email_verification", to: email, ...content });
  }

  async function sendPasswordReset(email, token) {
    const url = createActionUrl(config, "reset-password", token);
    const content = passwordResetEmail(url, Math.round(config.passwordResetTtlMs / 60_000));
    return provider.send({ type: "password_reset", to: email, ...content });
  }

  return { providerName: provider.name, sendPasswordReset, sendVerification };
}

module.exports = {
  createActionUrl,
  createEmailService,
};
