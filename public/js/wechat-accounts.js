import { apiJson } from "./api.js";
import { getCurrentUser } from "./auth.js";
import { requireFeature } from "./entitlements.js";
import { closeModal, formatDateTime, openModal, qs, showToast } from "./utils.js";

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function initWechatAccountsUI(authController) {
  const ui = {
    entry: qs("#wechatAccountEntryBtn"),
    modal: qs("#wechatAccountModal"),
    close: qs("#wechatAccountModalCloseBtn"),
    form: qs("#wechatAccountForm"),
    cancelEdit: qs("#cancelWechatAccountEditBtn"),
    feedback: qs("#wechatAccountFeedback"),
    list: qs("#wechatAccountList"),
  };

  function feedback(message, error = false) {
    ui.feedback.textContent = message || "";
    ui.feedback.hidden = !message;
    ui.feedback.classList.toggle("error", error);
  }

  function setBusy(busy) {
    for (const control of ui.form.elements) control.disabled = busy;
    ui.form.setAttribute("aria-busy", String(busy));
  }

  function resetForm() {
    ui.form.reset();
    ui.form.elements.accountId.value = "";
    ui.form.elements.appId.required = true;
    ui.form.elements.appSecret.required = true;
    ui.form.querySelector("button[type='submit']").textContent = "验证并绑定";
    ui.cancelEdit.hidden = true;
  }

  function beginEdit(account) {
    ui.form.elements.accountId.value = account.id;
    ui.form.elements.displayName.value = account.displayName;
    ui.form.elements.appId.value = "";
    ui.form.elements.appSecret.value = "";
    ui.form.elements.appId.required = false;
    ui.form.elements.appSecret.required = false;
    ui.form.elements.isDefault.checked = account.isDefault;
    ui.form.querySelector("button[type='submit']").textContent = "保存修改";
    ui.cancelEdit.hidden = false;
    ui.form.elements.displayName.focus();
  }

  async function action(button, operation, successMessage) {
    button.disabled = true;
    try {
      await operation();
      if (successMessage) showToast(successMessage);
      await loadAccounts();
    } catch (error) {
      feedback(error.message || "公众号操作失败", true);
    } finally {
      button.disabled = false;
    }
  }

  function renderAccount(account) {
    const item = element("article", `wechat-account-item status-${account.status}`);
    const identity = element("div", "wechat-account-identity");
    const avatar = element("div", "wechat-account-avatar", account.displayName.slice(0, 1));
    const copy = element("div");
    const title = element("div", "wechat-account-title");
    title.append(element("strong", "", account.displayName));
    if (account.isDefault) title.append(element("span", "status-pill", "默认"));
    copy.append(title, element("p", "", `${account.maskedAppId} · ${account.status === "active" ? "连接正常" : "需要检查"}`));
    identity.append(avatar, copy);

    const detail = element("div", "wechat-account-detail");
    detail.append(
      element("span", "", account.lastVerifiedAt ? `验证于 ${formatDateTime(account.lastVerifiedAt)}` : "尚未验证"),
      element("span", "", account.permissions?.draftApi === true ? "草稿接口可用" : "草稿权限待后续验证"),
    );
    if (account.lastErrorMessage) detail.append(element("span", "wechat-account-error", account.lastErrorMessage));

    const buttons = element("div", "wechat-account-actions");
    const verify = element("button", "button ghost small", "测试连接");
    verify.type = "button";
    verify.addEventListener("click", () => action(verify, () => apiJson(`/wechat/accounts/${account.id}/verify`, { method: "POST", body: "{}" }), "连接验证成功"));
    const edit = element("button", "button ghost small", "修改");
    edit.type = "button";
    edit.addEventListener("click", () => beginEdit(account));
    buttons.append(verify, edit);
    if (!account.isDefault) {
      const makeDefault = element("button", "button ghost small", "设为默认");
      makeDefault.type = "button";
      makeDefault.addEventListener("click", () => action(makeDefault, () => apiJson(`/wechat/accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) }), "默认公众号已更新"));
      buttons.append(makeDefault);
    }
    const remove = element("button", "button danger small", "解绑");
    remove.type = "button";
    remove.addEventListener("click", () => {
      if (!window.confirm(`确认解绑“${account.displayName}”吗？历史操作记录会保留。`)) return;
      action(remove, () => apiJson(`/wechat/accounts/${account.id}`, { method: "DELETE" }), "公众号已解绑");
    });
    buttons.append(remove);
    item.append(identity, detail, buttons);
    return item;
  }

  async function loadAccounts() {
    ui.list.replaceChildren(element("p", "loading-text", "正在读取公众号..."));
    try {
      const payload = await apiJson("/wechat/accounts");
      ui.list.replaceChildren();
      if (!payload.items.length) {
        ui.list.append(element("p", "wechat-account-empty", "尚未绑定公众号"));
        return;
      }
      for (const account of payload.items) ui.list.append(renderAccount(account));
    } catch (error) {
      ui.list.replaceChildren(element("p", "form-feedback error", error.message || "公众号读取失败"));
    }
  }

  async function openAccounts() {
    if (!getCurrentUser()) {
      authController.openAuth("login", "请先登录后管理公众号");
      return;
    }
    const access = await requireFeature("wechat.account.bind");
    if (!access) return;
    feedback("");
    resetForm();
    openModal(ui.modal);
    await loadAccounts();
  }

  ui.entry.addEventListener("click", () => openAccounts().catch((error) => feedback(error.message, true)));
  ui.close.addEventListener("click", () => closeModal(ui.modal));
  ui.modal.addEventListener("click", (event) => {
    if (event.target === ui.modal) closeModal(ui.modal);
  });
  ui.cancelEdit.addEventListener("click", resetForm);
  ui.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = ui.form;
    const accountId = form.elements.accountId.value;
    const payload = {
      displayName: form.elements.displayName.value,
      isDefault: form.elements.isDefault.checked,
    };
    if (form.elements.appId.value) payload.appId = form.elements.appId.value;
    if (form.elements.appSecret.value) payload.appSecret = form.elements.appSecret.value;
    setBusy(true);
    feedback(accountId ? "正在保存公众号..." : "正在验证公众号凭据...");
    try {
      await apiJson(accountId ? `/wechat/accounts/${accountId}` : "/wechat/accounts", {
        method: accountId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      resetForm();
      feedback(accountId ? "公众号信息已保存" : "公众号绑定成功");
      await loadAccounts();
    } catch (error) {
      feedback(error.message || "公众号保存失败", true);
    } finally {
      setBusy(false);
    }
  });

  return { loadAccounts, openAccounts };
}
