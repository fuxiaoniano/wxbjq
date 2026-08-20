import { apiJson } from "./api.js";
import { appConfig } from "./config.js";
import { closeModal, openModal, qs, showToast } from "./utils.js";

let currentUser = null;

function formPayload(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setBusy(form, busy) {
  for (const control of form.elements) control.disabled = busy;
  form.setAttribute("aria-busy", String(busy));
}

export function getCurrentUser() {
  return currentUser;
}

export function initAuthUI() {
  const elements = {
    modal: qs("#authModal"),
    title: qs("#authModalTitle"),
    close: qs("#authModalCloseBtn"),
    tabs: qs("#authTabs"),
    feedback: qs("#authFeedback"),
    loginForm: qs("#loginForm"),
    registerForm: qs("#registerForm"),
    forgotForm: qs("#forgotPasswordForm"),
    resetForm: qs("#resetPasswordForm"),
    openForgot: qs("#openForgotBtn"),
    authEntry: qs("#authEntryBtn"),
    membershipEntry: qs("#membershipEntryBtn"),
    wechatAccountEntry: qs("#wechatAccountEntryBtn"),
    adminEntry: qs("#adminEntryBtn"),
    notice: qs("#emailVerificationNotice"),
    resend: qs("#resendVerificationBtn"),
  };

  function feedback(message, isError = false) {
    elements.feedback.textContent = message || "";
    elements.feedback.hidden = !message;
    elements.feedback.classList.toggle("error", isError);
  }

  function switchView(view) {
    const titles = {
      login: "登录微信编辑器",
      register: "创建微信编辑器账号",
      forgot: "找回密码",
      reset: "设置新密码",
    };
    elements.title.textContent = titles[view] || titles.login;
    for (const panel of elements.modal.querySelectorAll("[data-auth-panel]")) {
      panel.hidden = panel.dataset.authPanel !== view;
    }
    for (const tab of elements.tabs.querySelectorAll("[data-auth-view]")) {
      tab.setAttribute("aria-selected", String(tab.dataset.authView === view));
    }
    elements.tabs.hidden = !["login", "register"].includes(view);
    feedback("");
  }

  function openAuth(view = "login", message = "", isError = false) {
    switchView(view);
    feedback(message, isError);
    openModal(elements.modal);
    window.setTimeout(() => elements.modal.querySelector("form:not([hidden]) input:not([type='hidden'])")?.focus(), 0);
  }

  function renderUser(user) {
    currentUser = user;
    elements.authEntry.hidden = Boolean(user) || !appConfig.authEnabled;
    elements.membershipEntry.hidden = !user;
    elements.wechatAccountEntry.hidden = !user || !appConfig.wechatEnabled;
    elements.adminEntry.hidden = !user?.isAdmin;
    elements.notice.hidden = !user || Boolean(user.emailVerifiedAt);
    if (user) elements.membershipEntry.textContent = user.email.split("@")[0] || "会员中心";
    document.dispatchEvent(new CustomEvent("auth:changed", { detail: { user } }));
  }

  async function refresh() {
    if (!appConfig.authEnabled) {
      renderUser(null);
      return null;
    }
    try {
      const payload = await apiJson("/auth/me");
      renderUser(payload.user || null);
    } catch (error) {
      renderUser(null);
    }
    return currentUser;
  }

  elements.authEntry.addEventListener("click", () => openAuth("login"));
  elements.close.addEventListener("click", () => closeModal(elements.modal));
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeModal(elements.modal);
  });
  elements.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-auth-view]");
    if (button) switchView(button.dataset.authView);
  });
  elements.modal.addEventListener("click", (event) => {
    const button = event.target.closest("[data-auth-view]");
    if (button && !elements.tabs.contains(button)) switchView(button.dataset.authView);
  });
  elements.openForgot.addEventListener("click", () => switchView("forgot"));

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formPayload(elements.loginForm);
    const remember = elements.loginForm.elements.remember.checked;
    setBusy(elements.loginForm, true);
    try {
      const payload = await apiJson("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          remember,
        }),
      });
      renderUser(payload.user);
      elements.loginForm.reset();
      closeModal(elements.modal);
      showToast(payload.emailVerificationRequired ? "登录成功，请尽快验证邮箱" : "登录成功");
    } catch (error) {
      feedback(error.message || "登录失败", true);
    } finally {
      setBusy(elements.loginForm, false);
    }
  });

  elements.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formPayload(elements.registerForm);
    const termsAccepted = elements.registerForm.elements.termsAccepted.checked;
    setBusy(elements.registerForm, true);
    try {
      const payload = await apiJson("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          confirmPassword: values.confirmPassword,
          termsAccepted,
          challengeToken: "",
        }),
      });
      elements.loginForm.elements.email.value = values.email;
      elements.registerForm.reset();
      switchView("login");
      feedback(payload.message);
    } catch (error) {
      feedback(error.message || "注册失败", true);
    } finally {
      setBusy(elements.registerForm, false);
    }
  });

  elements.forgotForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formPayload(elements.forgotForm);
    setBusy(elements.forgotForm, true);
    try {
      const payload = await apiJson("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(values),
      });
      feedback(payload.message);
    } catch (error) {
      feedback(error.message || "邮件发送失败", true);
    } finally {
      setBusy(elements.forgotForm, false);
    }
  });

  elements.resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formPayload(elements.resetForm);
    setBusy(elements.resetForm, true);
    try {
      const payload = await apiJson("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(values),
      });
      elements.resetForm.reset();
      switchView("login");
      feedback(payload.message);
      renderUser(null);
    } catch (error) {
      feedback(error.message || "密码重置失败", true);
    } finally {
      setBusy(elements.resetForm, false);
    }
  });

  elements.resend.addEventListener("click", async () => {
    if (!currentUser) return;
    elements.resend.disabled = true;
    try {
      const payload = await apiJson("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: currentUser.email }),
      });
      showToast(payload.message);
    } catch (error) {
      showToast(error.message || "发送失败");
    } finally {
      elements.resend.disabled = false;
    }
  });

  document.addEventListener("auth:required", () => {
    if (!currentUser) openAuth("login", "请先登录后继续");
  });
  document.addEventListener("auth:verification-required", () => {
    if (!currentUser) openAuth("login");
    else showToast("请先完成邮箱验证");
  });

  async function processActionHash() {
    const raw = window.location.hash.slice(1);
    if (!raw) return;
    const separator = raw.indexOf("=");
    const action = separator > 0 ? raw.slice(0, separator) : "";
    const token = separator > 0 ? decodeURIComponent(raw.slice(separator + 1)) : "";
    if (!token || !["verify-email", "reset-password"].includes(action)) return;
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (action === "reset-password") {
      elements.resetForm.elements.token.value = token;
      openAuth("reset");
      return;
    }
    openAuth("login", "正在验证邮箱，请稍候");
    try {
      const payload = await apiJson("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      await refresh();
      feedback(payload.message);
    } catch (error) {
      feedback(error.message || "邮箱验证失败", true);
    }
  }

  refresh().then(processActionHash);
  return { openAuth, refresh, renderUser };
}
