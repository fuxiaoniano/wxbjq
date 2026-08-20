"use strict";

const nodemailer = require("nodemailer");

function createConsoleProvider() {
  return {
    name: "console",
    async send(message) {
      console.info(`[mail] queued ${message.type || "message"} for ${message.to}`);
      return { messageId: `console-${Date.now()}` };
    },
  };
}

function createSmtpProvider(config) {
  const smtp = config.email.smtp;
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    name: "smtp",
    async send(message) {
      return transport.sendMail({
        from: { name: config.email.fromName, address: config.email.fromAddress },
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}

function createEmailProvider(config) {
  if (config.emailProviderInstance) return config.emailProviderInstance;
  if (config.email.provider === "console") return createConsoleProvider();
  if (config.email.provider === "smtp") return createSmtpProvider(config);
  throw new Error(`不支持的 EMAIL_PROVIDER：${config.email.provider}`);
}

module.exports = {
  createConsoleProvider,
  createEmailProvider,
  createSmtpProvider,
};
