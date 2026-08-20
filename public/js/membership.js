import { apiJson } from "./api.js";
import { refreshEntitlements, setCapabilities } from "./entitlements.js";
import { getCurrentUser } from "./auth.js";
import { withBasePath } from "./config.js";
import { closeModal, formatDateTime, openModal, qs, showToast } from "./utils.js";

const STATUS_LABELS = {
  free: "免费用户",
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

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
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
    adminModal: qs("#adminModal"),
    adminClose: qs("#adminModalCloseBtn"),
    adminTabs: qs("#adminTabs"),
    adminFeedback: qs("#adminFeedback"),
    adminUserSelect: qs("#adminUserSelect"),
    adminUserForm: qs("#adminUserForm"),
    adminMembershipForm: qs("#adminMembershipForm"),
    adminEntitlementForm: qs("#adminEntitlementForm"),
    adminEntitlementList: qs("#adminEntitlementList"),
    adminPlanForm: qs("#adminPlanForm"),
    adminFeatureForm: qs("#adminFeatureForm"),
    adminPlanFeatureForm: qs("#adminPlanFeatureForm"),
    auditList: qs("#auditList"),
    refreshAudit: qs("#refreshAuditBtn"),
  };

  const adminState = {
    users: [],
    plans: [],
    features: [],
    planFeatures: [],
    memberships: [],
    entitlements: [],
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

  elements.adminTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-view]");
    if (!button) return;
    const view = button.dataset.adminView;
    for (const item of elements.adminTabs.querySelectorAll("[data-admin-view]")) {
      item.setAttribute("aria-selected", String(item === button));
    }
    for (const panel of elements.adminModal.querySelectorAll("[data-admin-panel]")) {
      panel.hidden = panel.dataset.adminPanel !== view;
    }
    if (view === "audit") loadAudit();
  });

  function renderMembership(payload) {
    elements.summary.replaceChildren();
    const plan = payload.membership.plan;
    const heading = node("div", "membership-plan-name", plan?.name || "免费用户");
    const status = node("span", `membership-status status-${payload.membership.status}`, STATUS_LABELS[payload.membership.status] || payload.membership.status);
    const row = node("div", "section-row");
    row.append(heading, status);
    elements.summary.append(row);
    elements.summary.append(node("p", "membership-email", payload.user.email));
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
      copy.append(node("strong", "", capability.name), node("p", "", capability.allowed ? quotaText(capability) : capability.reason));
      item.append(copy, node("span", "capability-state", capability.allowed ? "可用" : "受限"));
      elements.capabilityList.append(item);
    }
    setCapabilities(payload.capabilities);
  }

  function quotaText(capability) {
    if (capability.quotaLimit === null) return "不限次数";
    const period = { daily: "每日", monthly: "每月", lifetime: "总计" }[capability.quotaPeriod] || "";
    return `${period} ${capability.quotaLimit} 次，剩余 ${capability.remaining} 次`;
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
      const payload = await apiJson("/auth/change-password", { method: "POST", body: JSON.stringify(values) });
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

  function adminFeedback(message, error = false) {
    elements.adminFeedback.textContent = message || "";
    elements.adminFeedback.hidden = !message;
    elements.adminFeedback.classList.toggle("error", error);
  }

  async function loadAdminData() {
    adminFeedback("正在读取会员数据...");
    try {
      const [users, plans, features, planFeatures, memberships, entitlements] = await Promise.all([
        apiJson("/admin/users"),
        apiJson("/admin/membership-plans"),
        apiJson("/admin/features"),
        apiJson("/admin/plan-features"),
        apiJson("/admin/memberships"),
        apiJson("/admin/entitlements"),
      ]);
      Object.assign(adminState, {
        users: users.items,
        plans: plans.items,
        features: features.items,
        planFeatures: planFeatures.items,
        memberships: memberships.items,
        entitlements: entitlements.items,
      });
      renderAdminSelectors();
      adminFeedback("");
    } catch (error) {
      adminFeedback(error.message || "会员数据读取失败", true);
    }
  }

  function fillSelect(select, items, valueKey, label) {
    const previous = select.value;
    select.replaceChildren();
    for (const item of items) {
      const option = document.createElement("option");
      option.value = item[valueKey];
      option.textContent = label(item);
      select.append(option);
    }
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  }

  function renderAdminSelectors() {
    fillSelect(elements.adminUserSelect, adminState.users, "id", (user) => `${user.email} · ${STATUS_LABELS[user.membership.status] || user.membership.status}`);
    for (const select of [elements.adminMembershipForm.elements.planId, elements.adminPlanFeatureForm.elements.planId]) {
      fillSelect(select, adminState.plans.filter((plan) => plan.active !== false), "id", (plan) => plan.name);
    }
    for (const select of [elements.adminEntitlementForm.elements.featureKey, elements.adminPlanFeatureForm.elements.featureKey]) {
      fillSelect(select, adminState.features.filter((feature) => feature.active !== false), "key", (feature) => `${feature.name} (${feature.key})`);
    }
    renderCatalogSelect(elements.adminPlanForm.elements.id, adminState.plans, (plan) => plan.name);
    renderCatalogSelect(elements.adminFeatureForm.elements.id, adminState.features, (feature) => `${feature.name} (${feature.key})`);
    renderSelectedUser();
    fillPlanFeatureForm();
  }

  function renderCatalogSelect(select, items, label) {
    const previous = select.value;
    select.replaceChildren(new Option("新建", ""));
    for (const item of items) select.append(new Option(label(item), item.id));
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  }

  function selectedUser() {
    return adminState.users.find((user) => user.id === elements.adminUserSelect.value) || adminState.users[0] || null;
  }

  function renderSelectedUser() {
    const user = selectedUser();
    if (!user) return;
    elements.adminUserSelect.value = user.id;
    elements.adminUserForm.elements.status.value = user.status;
    elements.adminUserForm.elements.role.value = user.role;
    elements.adminUserForm.elements.emailVerified.checked = Boolean(user.emailVerifiedAt);
    const records = adminState.memberships
      .filter((item) => item.userId === user.id)
      .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
    const record = records[0] || null;
    const form = elements.adminMembershipForm;
    form.elements.membershipId.value = record?.id || "";
    form.elements.planId.value = record?.planId || "plan_pro";
    form.elements.status.value = record?.status || "granted";
    form.elements.startsAt.value = localDateTime(record?.startsAt || new Date());
    form.elements.endsAt.value = localDateTime(record?.endsAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    renderEntitlements(user.id);
  }

  function renderEntitlements(userId) {
    elements.adminEntitlementList.replaceChildren();
    const rows = adminState.entitlements.filter((item) => item.userId === userId);
    if (!rows.length) {
      elements.adminEntitlementList.append(node("p", "loading-text", "该用户没有特殊授权"));
      return;
    }
    for (const row of rows) {
      const item = node("div", "admin-record-item");
      item.append(node("span", "", `${row.featureKey} · ${row.allowed ? "允许" : "禁止"}`));
      const remove = node("button", "button danger small", "删除");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          await apiJson(`/admin/entitlements/${row.id}`, { method: "DELETE" });
          await loadAdminData();
        } catch (error) {
          adminFeedback(error.message || "删除失败", true);
          remove.disabled = false;
        }
      });
      item.append(remove);
      elements.adminEntitlementList.append(item);
    }
  }

  elements.adminUserSelect.addEventListener("change", renderSelectedUser);
  elements.adminUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = selectedUser();
    if (!user) return;
    const form = elements.adminUserForm;
    setFormBusy(form, true);
    try {
      await apiJson(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: form.elements.status.value,
          role: form.elements.role.value,
          emailVerified: form.elements.emailVerified.checked,
        }),
      });
      await loadAdminData();
      adminFeedback("账号状态已保存");
    } catch (error) {
      adminFeedback(error.message || "保存失败", true);
    } finally {
      setFormBusy(form, false);
    }
  });

  elements.adminMembershipForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = selectedUser();
    if (!user) return;
    const form = elements.adminMembershipForm;
    const id = form.elements.membershipId.value;
    const body = {
      userId: user.id,
      planId: form.elements.planId.value,
      status: form.elements.status.value,
      startsAt: isoOrNull(form.elements.startsAt.value),
      endsAt: form.elements.status.value === "lifetime" ? null : isoOrNull(form.elements.endsAt.value),
    };
    setFormBusy(form, true);
    try {
      await apiJson(id ? `/admin/memberships/${id}` : "/admin/memberships", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      await loadAdminData();
      adminFeedback("会员记录已保存");
    } catch (error) {
      adminFeedback(error.message || "会员记录保存失败", true);
    } finally {
      setFormBusy(form, false);
    }
  });

  elements.adminEntitlementForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = selectedUser();
    if (!user) return;
    const form = elements.adminEntitlementForm;
    const quotaValue = form.elements.quotaLimit.value;
    setFormBusy(form, true);
    try {
      await apiJson("/admin/entitlements", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          featureKey: form.elements.featureKey.value,
          allowed: form.elements.allowed.value === "true",
          quotaLimit: quotaValue === "" ? null : Number(quotaValue),
          quotaPeriod: quotaValue === "" ? null : form.elements.quotaPeriod.value,
        }),
      });
      form.elements.quotaLimit.value = "";
      await loadAdminData();
      adminFeedback("特殊授权已添加");
    } catch (error) {
      adminFeedback(error.message || "授权失败", true);
    } finally {
      setFormBusy(form, false);
    }
  });

  function fillPlanForm() {
    const form = elements.adminPlanForm;
    const plan = adminState.plans.find((item) => item.id === form.elements.id.value);
    form.elements.slug.value = plan?.slug || "";
    form.elements.name.value = plan?.name || "";
    form.elements.description.value = plan?.description || "";
    form.elements.rank.value = plan?.rank ?? 100;
    form.elements.active.checked = plan?.active !== false;
  }

  function fillFeatureForm() {
    const form = elements.adminFeatureForm;
    const feature = adminState.features.find((item) => item.id === form.elements.id.value);
    form.elements.key.value = feature?.key || "";
    form.elements.name.value = feature?.name || "";
    form.elements.description.value = feature?.description || "";
    form.elements.defaultAccess.value = feature?.defaultAccess || "plan";
    form.elements.active.checked = feature?.active !== false;
  }

  elements.adminPlanForm.elements.id.addEventListener("change", fillPlanForm);
  elements.adminFeatureForm.elements.id.addEventListener("change", fillFeatureForm);

  elements.adminPlanForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = elements.adminPlanForm;
    const id = form.elements.id.value;
    setFormBusy(form, true);
    try {
      await apiJson(id ? `/admin/membership-plans/${id}` : "/admin/membership-plans", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify({
          slug: form.elements.slug.value,
          name: form.elements.name.value,
          description: form.elements.description.value,
          rank: Number(form.elements.rank.value),
          active: form.elements.active.checked,
        }),
      });
      await loadAdminData();
      adminFeedback("套餐已保存");
    } catch (error) {
      adminFeedback(error.message || "套餐保存失败", true);
    } finally {
      setFormBusy(form, false);
    }
  });

  elements.adminFeatureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = elements.adminFeatureForm;
    const id = form.elements.id.value;
    setFormBusy(form, true);
    try {
      await apiJson(id ? `/admin/features/${id}` : "/admin/features", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify({
          key: form.elements.key.value,
          name: form.elements.name.value,
          description: form.elements.description.value,
          defaultAccess: form.elements.defaultAccess.value,
          active: form.elements.active.checked,
        }),
      });
      await loadAdminData();
      adminFeedback("功能定义已保存");
    } catch (error) {
      adminFeedback(error.message || "功能保存失败", true);
    } finally {
      setFormBusy(form, false);
    }
  });

  function fillPlanFeatureForm() {
    const form = elements.adminPlanFeatureForm;
    const record = adminState.planFeatures.find(
      (item) => item.planId === form.elements.planId.value && item.featureKey === form.elements.featureKey.value,
    );
    form.elements.enabled.checked = record?.enabled === true;
    form.elements.quotaLimit.value = record?.quotaLimit ?? "";
    form.elements.quotaPeriod.value = record?.quotaPeriod || "monthly";
  }

  elements.adminPlanFeatureForm.elements.planId.addEventListener("change", fillPlanFeatureForm);
  elements.adminPlanFeatureForm.elements.featureKey.addEventListener("change", fillPlanFeatureForm);
  elements.adminPlanFeatureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = elements.adminPlanFeatureForm;
    const quotaValue = form.elements.quotaLimit.value;
    setFormBusy(form, true);
    try {
      await apiJson(`/admin/plans/${form.elements.planId.value}/features/${form.elements.featureKey.value}`, {
        method: "PUT",
        body: JSON.stringify({
          enabled: form.elements.enabled.checked,
          quotaLimit: quotaValue === "" ? null : Number(quotaValue),
          quotaPeriod: quotaValue === "" ? null : form.elements.quotaPeriod.value,
        }),
      });
      await loadAdminData();
      adminFeedback("套餐功能已保存");
    } catch (error) {
      adminFeedback(error.message || "套餐功能保存失败", true);
    } finally {
      setFormBusy(form, false);
    }
  });

  async function loadAudit() {
    elements.auditList.replaceChildren(node("p", "loading-text", "正在读取审计日志..."));
    try {
      const payload = await apiJson("/admin/audit-logs?limit=200");
      elements.auditList.replaceChildren();
      for (const log of payload.items) {
        const item = node("div", "audit-item");
        item.append(
          node("strong", "", log.action),
          node("p", "", `${formatDateTime(log.createdAt)} · ${log.outcome}`),
          node("code", "", JSON.stringify(log.metadata || {})),
        );
        elements.auditList.append(item);
      }
    } catch (error) {
      elements.auditList.replaceChildren(node("p", "form-feedback error", error.message || "审计日志读取失败"));
    }
  }

  elements.adminEntry.addEventListener("click", async () => {
    if (!getCurrentUser()?.isAdmin) return;
    window.open(withBasePath("/admin.html"), "_blank", "noopener");
  });
  elements.adminClose.addEventListener("click", () => closeModal(elements.adminModal));
  elements.adminModal.addEventListener("click", (event) => {
    if (event.target === elements.adminModal) closeModal(elements.adminModal);
  });
  elements.refreshAudit.addEventListener("click", loadAudit);

  document.addEventListener("auth:changed", (event) => {
    if (event.detail.user) refreshEntitlements().catch(() => setCapabilities([]));
    else setCapabilities([]);
  });
  document.addEventListener("membership:upgrade-required", () => openMembership());

  return { openMembership, loadAdminData };
}
