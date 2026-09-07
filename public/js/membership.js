import { apiJson } from "./api.js";
import { refreshEntitlements, setCapabilities } from "./entitlements.js";
import { getCurrentUser } from "./auth.js";
import { withBasePath } from "./config.js";
import { closeModal, formatDateTime, openModal, qs, showToast } from "./utils.js";

const STATUS_LABELS = {
  free: "免费用户",
  scheduled: "待生效",
  trialing: "试用中",
  active: "有效会员",
  expired: "已过期",
  canceled: "已取消",
  paused: "已暂停",
  granted: "管理员赠送",
  lifetime: "永久会员",
};

function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function setFormBusy(form, busy) {
  for (const control of form.elements) control.disabled = busy;
}

export function initMembershipUI(authController) {
  const elements = {
    entry: qs("#membershipEntryBtn"),
    modal: qs("#membershipModal"),
    close: qs("#membershipModalCloseBtn"),
    tabs: qs("#membershipTabs"),
    summary: qs("#membershipSummary"),
    capabilityList: qs("#capabilityList"),
    changePasswordForm: qs("#changePasswordForm"),
    sessionList: qs("#sessionList"),
    refreshSessions: qs("#refreshSessionsBtn"),
    logout: qs("#logoutBtn"),
    adminEntry: qs("#adminEntryBtn"),
  };

  elements.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-membership-view]");
    if (!button) return;
    const view = button.dataset.membershipView;
    for (const item of elements.tabs.querySelectorAll("[data-membership-view]")) {
      item.setAttribute("aria-selected", String(item === button));
    }
    for (const panel of elements.modal.querySelectorAll("[data-membership-panel]")) {
      panel.hidden = panel.dataset.membershipPanel !== view;
    }
    if (view === "security") loadSessions();
  });

  function quotaText(capability) {
    if (capability.quotaLimit === null) return "不限次数";
    const period = { daily: "每日", monthly: "每月", lifetime: "总计" }[capability.quotaPeriod] || "";
    return `${period} ${capability.quotaLimit} 次，剩余 ${capability.remaining} 次`;
  }

  function renderMembership(payload) {
    elements.summary.replaceChildren();
    const plan = payload.membership.plan;
    const heading = node("div", "membership-plan-name", plan?.name || "免费用户");
    const status = node(
      "span",
      `membership-status status-${payload.membership.status}`,
      STATUS_LABELS[payload.membership.status] || payload.membership.status,
    );
    const row = node("div", "section-row");
    row.append(heading, status);
    elements.summary.append(row, node("p", "membership-email", payload.user.email));
    const expiry = payload.membership.endsAt
      ? `有效期至 ${formatDateTime(payload.membership.endsAt)}`
      : payload.membership.status === "lifetime"
        ? "永久有效"
        : "当前没有付费会员有效期";
    elements.summary.append(node("p", "membership-expiry", expiry));

    elements.capabilityList.replaceChildren();
    for (const capability of payload.capabilities) {
      const item = node("div", `capability-item ${capability.allowed ? "available" : "restricted"}`);
      const copy = node("div");
      copy.append(
        node("strong", "", capability.name),
        node("p", "", capability.allowed ? quotaText(capability) : capability.reason),
      );
      item.append(copy, node("span", "capability-state", capability.allowed ? "可用" : "受限"));
      elements.capabilityList.append(item);
    }
    setCapabilities(payload.capabilities);
  }

  async function openMembership() {
    if (!getCurrentUser()) {
      authController.openAuth("login", "请先登录后查看会员中心");
      return;
    }
    openModal(elements.modal);
    elements.summary.replaceChildren(node("p", "loading-text", "正在读取会员信息..."));
    try {
      renderMembership(await apiJson("/membership/me"));
    } catch (error) {
      elements.summary.replaceChildren(node("p", "form-feedback error", error.message || "会员信息读取失败"));
    }
  }

  async function loadSessions() {
    elements.sessionList.replaceChildren(node("p", "loading-text", "正在读取登录设备..."));
    try {
      const payload = await apiJson("/auth/sessions");
      elements.sessionList.replaceChildren();
      for (const session of payload.items) {
        const item = node("div", "session-item");
        const detail = node("div");
        detail.append(
          node("strong", "", session.current ? "当前设备" : session.ipLabel || "登录设备"),
          node("p", "", `${session.userAgent || "未知浏览器"} · ${formatDateTime(session.lastSeenAt)}`),
        );
        item.append(detail);
        if (!session.current) {
          const revoke = node("button", "button danger small", "退出");
          revoke.type = "button";
          revoke.addEventListener("click", async () => {
            revoke.disabled = true;
            try {
              await apiJson(`/auth/sessions/${session.id}`, { method: "DELETE" });
              await loadSessions();
            } catch (error) {
              showToast(error.message || "会话撤销失败");
              revoke.disabled = false;
            }
          });
          item.append(revoke);
        }
        elements.sessionList.append(item);
      }
    } catch (error) {
      elements.sessionList.replaceChildren(node("p", "form-feedback error", error.message || "登录设备读取失败"));
    }
  }

  elements.entry.addEventListener("click", openMembership);
  elements.close.addEventListener("click", () => closeModal(elements.modal));
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeModal(elements.modal);
  });
  elements.refreshSessions.addEventListener("click", loadSessions);

  elements.changePasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = elements.changePasswordForm;
    const values = Object.fromEntries(new FormData(form).entries());
    setFormBusy(form, true);
    try {
      const payload = await apiJson("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(values),
      });
      form.reset();
      showToast(payload.message);
      await authController.refresh();
      await loadSessions();
    } catch (error) {
      showToast(error.message || "密码修改失败");
    } finally {
      setFormBusy(form, false);
    }
  });

  elements.logout.addEventListener("click", async () => {
    elements.logout.disabled = true;
    try {
      await apiJson("/auth/logout", { method: "POST", body: "{}" });
      closeModal(elements.modal);
      authController.renderUser(null);
      setCapabilities([]);
      showToast("已安全退出");
    } catch (error) {
      showToast(error.message || "退出失败");
    } finally {
      elements.logout.disabled = false;
    }
  });

  elements.adminEntry.addEventListener("click", () => {
    if (!getCurrentUser()?.isAdmin) return;
    window.open(withBasePath("/admin.html"), "_blank", "noopener");
  });

  document.addEventListener("auth:changed", (event) => {
    if (event.detail.user) refreshEntitlements().catch(() => setCapabilities([]));
    else setCapabilities([]);
  });
  document.addEventListener("membership:upgrade-required", () => openMembership());

  return { openMembership };
}
