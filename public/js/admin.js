import { apiJson } from "./api.js";
import { appConfig, withBasePath } from "./config.js";
import { formatDateTime, qs } from "./utils.js";

const state = { users: [], plans: [], features: [], planFeatures: [], memberships: [], entitlements: [], wechat: [] };
const elements = {
  access: qs("#adminAccessState"),
  workspace: qs("#adminWorkspace"),
  identity: qs("#adminIdentity"),
  editorLink: qs("#editorLink"),
  back: qs("#backToEditor"),
  refresh: qs("#refreshAdminBtn"),
  tabs: qs("#adminPageTabs"),
  feedback: qs("#adminPageFeedback"),
  userSelect: qs("#adminPageUserSelect"),
  userForm: qs("#adminPageUserForm"),
  ownerProtection: qs("#ownerProtection"),
  membershipForm: qs("#adminPageMembershipForm"),
  entitlementForm: qs("#adminPageEntitlementForm"),
  entitlementList: qs("#adminPageEntitlementList"),
  planForm: qs("#adminPagePlanForm"),
  featureForm: qs("#adminPageFeatureForm"),
  planFeatureForm: qs("#adminPagePlanFeatureForm"),
  wechatRows: qs("#adminWechatRows"),
  auditList: qs("#adminPageAuditList"),
  refreshAudit: qs("#refreshAdminAuditBtn"),
};

elements.editorLink.href = withBasePath("/");
elements.back.href = withBasePath("/");

function setFeedback(message, error = false) {
  elements.feedback.textContent = message || "";
  elements.feedback.hidden = !message;
  elements.feedback.classList.toggle("error", error);
}

function setBusy(form, busy) {
  for (const control of form.elements) control.disabled = busy;
}

function showAccessState(titleText, messageText, withLink = false) {
  const title = document.createElement("h1");
  title.textContent = titleText;
  const message = document.createElement("p");
  message.textContent = messageText;
  elements.access.replaceChildren(title, message);
  if (withLink) {
    const link = document.createElement("a");
    link.className = "button primary";
    link.href = withBasePath("/");
    link.textContent = "返回编辑器登录";
    elements.access.append(link);
  }
}

function optionList(select, items, valueKey, label, first = null) {
  const previous = select.value;
  select.replaceChildren();
  if (first) select.append(new Option(first.label, first.value));
  for (const item of items) select.append(new Option(label(item), item[valueKey]));
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function isoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

function selectedUser() {
  return state.users.find((user) => user.id === elements.userSelect.value) || state.users[0] || null;
}

function renderSelectedUser() {
  const user = selectedUser();
  if (!user) return;
  elements.userSelect.value = user.id;
  elements.userForm.elements.status.value = user.status;
  elements.userForm.elements.role.value = user.role;
  elements.userForm.elements.emailVerified.checked = Boolean(user.emailVerifiedAt);
  elements.ownerProtection.hidden = !user.isSuperAdmin;
  for (const control of [
    elements.userForm.elements.status,
    elements.userForm.elements.role,
    elements.userForm.elements.emailVerified,
  ]) control.disabled = user.isSuperAdmin;

  const records = state.memberships
    .filter((item) => item.userId === user.id)
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  const record = records[0] || null;
  const form = elements.membershipForm;
  form.elements.membershipId.value = record?.id || "";
  form.elements.planId.value = record?.planId || "plan_pro";
  form.elements.status.value = record?.status || "granted";
  form.elements.startsAt.value = localDateTime(record?.startsAt || new Date());
  form.elements.endsAt.value = localDateTime(record?.endsAt || new Date(Date.now() + 30 * 86400_000));
  renderEntitlements(user.id);
}

function renderEntitlements(userId) {
  elements.entitlementList.replaceChildren();
  const rows = state.entitlements.filter((item) => item.userId === userId);
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "loading-text";
    empty.textContent = "该用户没有特殊授权";
    elements.entitlementList.append(empty);
    return;
  }
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "admin-record-item";
    const label = document.createElement("span");
    label.textContent = `${row.featureKey} · ${row.allowed ? "允许" : "禁止"}`;
    const remove = document.createElement("button");
    remove.className = "button danger small";
    remove.type = "button";
    remove.textContent = "删除";
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await apiJson(`/admin/entitlements/${row.id}`, { method: "DELETE" });
        await loadData();
      } catch (error) {
        setFeedback(error.message || "删除授权失败", true);
        remove.disabled = false;
      }
    });
    item.append(label, remove);
    elements.entitlementList.append(item);
  }
}

function fillPlanForm() {
  const form = elements.planForm;
  const plan = state.plans.find((item) => item.id === form.elements.id.value);
  form.elements.slug.value = plan?.slug || "";
  form.elements.name.value = plan?.name || "";
  form.elements.description.value = plan?.description || "";
  form.elements.rank.value = plan?.rank ?? 100;
  form.elements.active.checked = plan?.active !== false;
}

function fillFeatureForm() {
  const form = elements.featureForm;
  const feature = state.features.find((item) => item.id === form.elements.id.value);
  form.elements.key.value = feature?.key || "";
  form.elements.name.value = feature?.name || "";
  form.elements.description.value = feature?.description || "";
  form.elements.defaultAccess.value = feature?.defaultAccess || "plan";
  form.elements.active.checked = feature?.active !== false;
}

function fillPlanFeatureForm() {
  const form = elements.planFeatureForm;
  const record = state.planFeatures.find(
    (item) => item.planId === form.elements.planId.value && item.featureKey === form.elements.featureKey.value,
  );
  form.elements.enabled.checked = record?.enabled === true;
  form.elements.quotaLimit.value = record?.quotaLimit ?? "";
  form.elements.quotaPeriod.value = record?.quotaPeriod || "monthly";
}

function renderWechat() {
  elements.wechatRows.replaceChildren();
  if (!appConfig.wechatEnabled) {
    const row = elements.wechatRows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.textContent = "微信公众号绑定功能尚未启用";
    return;
  }
  if (!state.wechat.length) {
    const row = elements.wechatRows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.textContent = "暂无公众号绑定记录";
    return;
  }
  for (const account of state.wechat) {
    const row = elements.wechatRows.insertRow();
    for (const value of [
      account.userEmail || account.userId,
      account.displayName,
      account.maskedAppId,
      account.status === "active" ? "正常" : "异常",
      account.isDefault ? "是" : "否",
      account.lastVerifiedAt ? formatDateTime(account.lastVerifiedAt) : "未验证",
    ]) row.insertCell().textContent = value;
  }
}

function renderSelectors() {
  optionList(elements.userSelect, state.users, "id", (user) => `${user.email}${user.isSuperAdmin ? " · 站点所有者" : ""}`);
  for (const select of [elements.membershipForm.elements.planId, elements.planFeatureForm.elements.planId]) {
    optionList(select, state.plans.filter((plan) => plan.active !== false), "id", (plan) => plan.name);
  }
  for (const select of [elements.entitlementForm.elements.featureKey, elements.planFeatureForm.elements.featureKey]) {
    optionList(select, state.features.filter((feature) => feature.active !== false), "key", (feature) => `${feature.name} (${feature.key})`);
  }
  optionList(elements.planForm.elements.id, state.plans, "id", (plan) => plan.name, { label: "新建", value: "" });
  optionList(elements.featureForm.elements.id, state.features, "id", (feature) => `${feature.name} (${feature.key})`, { label: "新建", value: "" });
  renderSelectedUser();
  fillPlanForm();
  fillFeatureForm();
  fillPlanFeatureForm();
  renderWechat();
}

async function loadData() {
  setFeedback("正在读取管理数据...");
  try {
    const requests = [
      apiJson("/admin/users"),
      apiJson("/admin/membership-plans"),
      apiJson("/admin/features"),
      apiJson("/admin/plan-features"),
      apiJson("/admin/memberships"),
      apiJson("/admin/entitlements"),
      appConfig.wechatEnabled ? apiJson("/admin/wechat-accounts") : Promise.resolve({ items: [] }),
    ];
    const [users, plans, features, planFeatures, memberships, entitlements, wechat] = await Promise.all(requests);
    Object.assign(state, {
      users: users.items,
      plans: plans.items,
      features: features.items,
      planFeatures: planFeatures.items,
      memberships: memberships.items,
      entitlements: entitlements.items,
      wechat: wechat.items,
    });
    renderSelectors();
    setFeedback("");
  } catch (error) {
    setFeedback(error.message || "管理数据读取失败", true);
  }
}

async function loadAudit() {
  elements.auditList.textContent = "正在读取审计日志...";
  try {
    const payload = await apiJson("/admin/audit-logs?limit=200");
    elements.auditList.replaceChildren();
    for (const log of payload.items) {
      const item = document.createElement("div");
      item.className = "audit-item";
      const title = document.createElement("strong");
      title.textContent = log.action;
      const meta = document.createElement("p");
      meta.textContent = `${formatDateTime(log.createdAt)} · ${log.outcome}`;
      const detail = document.createElement("code");
      detail.textContent = JSON.stringify(log.metadata || {});
      item.append(title, meta, detail);
      elements.auditList.append(item);
    }
  } catch (error) {
    elements.auditList.textContent = error.message || "审计日志读取失败";
  }
}

elements.tabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-admin-view]");
  if (!button) return;
  const view = button.dataset.adminView;
  for (const tab of elements.tabs.querySelectorAll("[data-admin-view]")) tab.setAttribute("aria-selected", String(tab === button));
  for (const panel of document.querySelectorAll("[data-admin-panel]")) panel.hidden = panel.dataset.adminPanel !== view;
  if (view === "audit") loadAudit();
});

elements.userSelect.addEventListener("change", renderSelectedUser);
elements.refresh.addEventListener("click", loadData);
elements.refreshAudit.addEventListener("click", loadAudit);
elements.planForm.elements.id.addEventListener("change", fillPlanForm);
elements.featureForm.elements.id.addEventListener("change", fillFeatureForm);
elements.planFeatureForm.elements.planId.addEventListener("change", fillPlanFeatureForm);
elements.planFeatureForm.elements.featureKey.addEventListener("change", fillPlanFeatureForm);

elements.userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = selectedUser();
  if (!user || user.isSuperAdmin) return;
  setBusy(elements.userForm, true);
  try {
    await apiJson(`/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ status: elements.userForm.elements.status.value, role: elements.userForm.elements.role.value, emailVerified: elements.userForm.elements.emailVerified.checked }) });
    await loadData();
    setFeedback("账号状态已保存");
  } catch (error) { setFeedback(error.message || "账号保存失败", true); }
  finally {
    setBusy(elements.userForm, false);
    if (selectedUser()?.isSuperAdmin) {
      elements.userForm.elements.status.disabled = true;
      elements.userForm.elements.role.disabled = true;
      elements.userForm.elements.emailVerified.disabled = true;
    }
  }
});

elements.membershipForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = selectedUser();
  if (!user) return;
  const form = elements.membershipForm;
  const id = form.elements.membershipId.value;
  setBusy(form, true);
  try {
    await apiJson(id ? `/admin/memberships/${id}` : "/admin/memberships", { method: id ? "PATCH" : "POST", body: JSON.stringify({ userId: user.id, planId: form.elements.planId.value, status: form.elements.status.value, startsAt: isoOrNull(form.elements.startsAt.value), endsAt: form.elements.status.value === "lifetime" ? null : isoOrNull(form.elements.endsAt.value) }) });
    await loadData(); setFeedback("会员记录已保存");
  } catch (error) { setFeedback(error.message || "会员记录保存失败", true); }
  finally { setBusy(form, false); }
});

elements.entitlementForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = selectedUser(); const form = elements.entitlementForm; if (!user) return;
  const quota = form.elements.quotaLimit.value;
  setBusy(form, true);
  try {
    await apiJson("/admin/entitlements", { method: "POST", body: JSON.stringify({ userId: user.id, featureKey: form.elements.featureKey.value, allowed: form.elements.allowed.value === "true", quotaLimit: quota === "" ? null : Number(quota), quotaPeriod: quota === "" ? null : form.elements.quotaPeriod.value }) });
    form.elements.quotaLimit.value = ""; await loadData(); setFeedback("特殊授权已添加");
  } catch (error) { setFeedback(error.message || "授权失败", true); }
  finally { setBusy(form, false); }
});

elements.planForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const form = elements.planForm; const id = form.elements.id.value; setBusy(form, true);
  try {
    await apiJson(id ? `/admin/membership-plans/${id}` : "/admin/membership-plans", { method: id ? "PATCH" : "POST", body: JSON.stringify({ slug: form.elements.slug.value, name: form.elements.name.value, description: form.elements.description.value, rank: Number(form.elements.rank.value), active: form.elements.active.checked }) });
    await loadData(); setFeedback("套餐已保存");
  } catch (error) { setFeedback(error.message || "套餐保存失败", true); }
  finally { setBusy(form, false); }
});

elements.featureForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const form = elements.featureForm; const id = form.elements.id.value; setBusy(form, true);
  try {
    await apiJson(id ? `/admin/features/${id}` : "/admin/features", { method: id ? "PATCH" : "POST", body: JSON.stringify({ key: form.elements.key.value, name: form.elements.name.value, description: form.elements.description.value, defaultAccess: form.elements.defaultAccess.value, active: form.elements.active.checked }) });
    await loadData(); setFeedback("功能定义已保存");
  } catch (error) { setFeedback(error.message || "功能保存失败", true); }
  finally { setBusy(form, false); }
});

elements.planFeatureForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const form = elements.planFeatureForm; const quota = form.elements.quotaLimit.value; setBusy(form, true);
  try {
    await apiJson(`/admin/plans/${form.elements.planId.value}/features/${form.elements.featureKey.value}`, { method: "PUT", body: JSON.stringify({ enabled: form.elements.enabled.checked, quotaLimit: quota === "" ? null : Number(quota), quotaPeriod: quota === "" ? null : form.elements.quotaPeriod.value }) });
    await loadData(); setFeedback("套餐功能已保存");
  } catch (error) { setFeedback(error.message || "套餐功能保存失败", true); }
  finally { setBusy(form, false); }
});

async function start() {
  try {
    const payload = await apiJson("/auth/me");
    if (!payload.user?.isAdmin) {
      showAccessState("无权访问管理后台", "请先使用管理员账号登录编辑器。", true);
      return;
    }
    elements.identity.textContent = `${payload.user.email}${payload.user.isSuperAdmin ? " · 站点所有者" : " · 管理员"}`;
    elements.access.hidden = true;
    elements.workspace.hidden = false;
    await loadData();
  } catch (error) {
    showAccessState("后台加载失败", error.message || "请稍后重试");
  }
}

start();
