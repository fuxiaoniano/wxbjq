"use strict";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function baseTemplate(title, introduction, actionLabel, actionUrl, note) {
  const safeUrl = escapeHtml(actionUrl);
  return {
    text: `${title}\n\n${introduction}\n\n${actionLabel}：${actionUrl}\n\n${note}`,
    html: `<!doctype html><html lang="zh-CN"><body style="margin:0;padding:24px;background:#f4f7f8;color:#253246;font-family:Arial,'Microsoft YaHei',sans-serif"><main style="max-width:560px;margin:0 auto;padding:28px;background:#fff;border:1px solid #dfe7e8"><h1 style="margin:0 0 18px;font-size:22px">${escapeHtml(title)}</h1><p style="line-height:1.8">${escapeHtml(introduction)}</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;color:#fff;background:#157a6e;text-decoration:none">${escapeHtml(actionLabel)}</a></p><p style="color:#66757f;font-size:13px;line-height:1.7">${escapeHtml(note)}</p><p style="color:#66757f;font-size:12px;word-break:break-all">按钮无法打开时，请访问：${safeUrl}</p></main></body></html>`,
  };
}

function verificationEmail(url, expiresHours) {
  return {
    subject: "验证你的微信编辑器账号邮箱",
    ...baseTemplate(
      "验证邮箱",
      "你正在注册微信编辑器账号。请完成邮箱验证后使用会员功能。",
      "验证邮箱",
      url,
      `链接将在 ${expiresHours} 小时后失效，并且只能使用一次。如果不是你本人操作，可以忽略此邮件。`,
    ),
  };
}

function passwordResetEmail(url, expiresMinutes) {
  return {
    subject: "重置你的微信编辑器账号密码",
    ...baseTemplate(
      "重置密码",
      "我们收到了你的密码重置请求。",
      "设置新密码",
      url,
      `链接将在 ${expiresMinutes} 分钟后失效，并且只能使用一次。如果不是你本人操作，请忽略此邮件。`,
    ),
  };
}

module.exports = {
  passwordResetEmail,
  verificationEmail,
};
