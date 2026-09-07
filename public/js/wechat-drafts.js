import { apiJson } from "./api.js";
import { getCurrentUser } from "./auth.js";
import { requireFeature } from "./entitlements.js";
import { closeModal, htmlToPlainText, openModal, qs, readFileAsDataUrl, showToast } from "./utils.js";

function accountCard(account) {
  const label = document.createElement("label");
  label.className = `wechat-draft-account status-${account.status}`;
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "wechatDraftAccount";
  radio.value = account.id;
  radio.disabled = account.status !== "active";
  radio.checked = account.isDefault && !radio.disabled;
  const avatar = document.createElement("span");
  avatar.className = "wechat-account-avatar";
  if (account.avatarUrl) {
    const image = document.createElement("img");
    image.src = account.avatarUrl;
    image.alt = "";
    avatar.append(image);
  } else avatar.textContent = account.displayName.slice(0, 1);
  const text = document.createElement("span");
  text.className = "wechat-draft-account-copy";
  const title = document.createElement("strong");
  title.textContent = account.displayName;
  const detail = document.createElement("small");
  const permission = account.permissions?.draftApi === false ? "草稿权限不可用" : "草稿权限将在提交时验证";
  detail.textContent = `${account.maskedAppId} · ${account.status === "active" ? "连接正常" : "状态异常"} · ${permission}`;
  text.append(title, detail);
  if (account.isDefault) {
    const badge = document.createElement("span");
    badge.className = "status-pill";
    badge.textContent = "默认";
    text.append(badge);
  }
  label.append(radio, avatar, text);
  return label;
}

export function createIdempotencyKey(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return `draft-${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function initWechatDraftUI(authController, editorController, draftManager) {
  const ui = {
    entry: qs("#sendWechatDraftBtn"),
    modal: qs("#wechatDraftModal"),
    close: qs("#wechatDraftModalCloseBtn"),
    form: qs("#wechatDraftForm"),
    feedback: qs("#wechatDraftFeedback"),
    accounts: qs("#wechatDraftAccountList"),
    previewButton: qs("#previewWechatDraftBtn"),
    submitButton: qs("#submitWechatDraftBtn"),
    preview: qs("#wechatDraftPreview"),
    previewBody: qs("#wechatDraftPreviewBody"),
    checkStatus: qs("#wechatDraftCheckStatus"),
  };
  let coverDataUrl = "";
  let idempotencyKey = "";
  let articleVersion = "";

  function feedback(message, error = false) {
    ui.feedback.textContent = message || "";
    ui.feedback.hidden = !message;
    ui.feedback.classList.toggle("error", error);
  }

  function selectedAccountId() {
    return ui.accounts.querySelector("input[name='wechatDraftAccount']:checked")?.value || "";
  }

  function currentTitle() {
    const savedTitle = qs("#currentDraftTitle")?.textContent?.trim();
    if (savedTitle && savedTitle !== "未命名草稿") return savedTitle.slice(0, 32);
    return htmlToPlainText(editorController.getHtml()).replace(/\s+/g, " ").trim().slice(0, 32);
  }

  function payload() {
    const form = ui.form;
    return {
      accountId: selectedAccountId(),
      title: form.elements.title.value,
      author: form.elements.author.value,
      digest: form.elements.digest.value,
      content: editorController.getHtml(),
      contentSourceUrl: form.elements.contentSourceUrl.value,
      coverMediaId: form.elements.coverMediaId.value,
      coverImage: coverDataUrl || form.elements.coverImage.value,
      needOpenComment: form.elements.needOpenComment.checked,
      onlyFansCanComment: form.elements.onlyFansCanComment.checked,
      articleVersion,
    };
  }

  async function readCoverFile() {
    const file = ui.form.elements.coverFile.files[0];
    coverDataUrl = file ? await readFileAsDataUrl(file, 1024 * 1024) : "";
  }

  async function preview() {
    await readCoverFile();
    feedback("正在检查文章内容...");
    ui.previewButton.disabled = true;
    try {
      const result = await apiJson("/wechat/drafts/preview", { method: "POST", body: JSON.stringify(payload()) });
      ui.preview.hidden = false;
      ui.previewBody.innerHTML = result.content;
      ui.checkStatus.textContent = `${result.report.images} 张正文图片`;
      feedback("检查通过。提交时会把正文图片和封面上传到所选公众号。", false);
      return result;
    } catch (error) {
      ui.preview.hidden = true;
      feedback(error.message || "文章检查失败", true);
      throw error;
    } finally {
      ui.previewButton.disabled = false;
    }
  }

  async function pollOperation(operation) {
    let current = operation;
    for (let attempt = 0; current.status === "processing" && attempt < 30; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      current = await apiJson(`/wechat/drafts/${encodeURIComponent(current.id)}`);
    }
    return current;
  }

  async function submit(event) {
    event.preventDefault();
    ui.submitButton.disabled = true;
    ui.previewButton.disabled = true;
    feedback("正在处理图片并保存到微信公众号草稿箱，请不要重复点击...");
    try {
      await readCoverFile();
      if (!idempotencyKey) idempotencyKey = createIdempotencyKey();
      const result = await apiJson("/wechat/drafts", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload()),
      });
      const operation = await pollOperation(result.operation);
      if (operation.status !== "succeeded") {
        idempotencyKey = "";
        throw new Error(operation.errorMessage || "保存到公众号草稿箱失败");
      }
      feedback("已成功保存到公众号草稿箱。", false);
      showToast("已保存到微信公众号草稿箱", "保存成功");
      idempotencyKey = "";
    } catch (error) {
      if (error.status) idempotencyKey = "";
      feedback(error.message || "保存到公众号草稿箱失败", true);
    } finally {
      ui.submitButton.disabled = false;
      ui.previewButton.disabled = false;
    }
  }

  async function open() {
    if (!getCurrentUser()) {
      authController.openAuth("login", "请先登录后保存到公众号草稿箱");
      return;
    }
    const access = await requireFeature("wechat.draft.create");
    if (!access) return;
    feedback("");
    ui.preview.hidden = true;
    coverDataUrl = "";
    idempotencyKey = "";
    articleVersion = draftManager.currentDraftId || `editor-${Date.now()}`;
    ui.form.reset();
    ui.form.elements.title.value = currentTitle();
    const firstImage = qs("#editor")?.querySelector("img[src]")?.getAttribute("src") || "";
    if (firstImage) ui.form.elements.coverImage.value = firstImage;
    openModal(ui.modal);
    ui.accounts.replaceChildren();
    try {
      const response = await apiJson("/wechat/accounts");
      for (const account of response.items) ui.accounts.append(accountCard(account));
      const firstEnabled = ui.accounts.querySelector("input:not(:disabled)");
      if (!ui.accounts.querySelector("input:checked") && firstEnabled) firstEnabled.checked = true;
      if (!response.items.length) feedback("还没有绑定公众号，请先在“公众号”中完成绑定。", true);
    } catch (error) {
      feedback(error.message || "公众号列表读取失败", true);
    }
  }

  ui.entry.addEventListener("click", () => open().catch((error) => feedback(error.message, true)));
  ui.close.addEventListener("click", () => closeModal(ui.modal));
  ui.modal.addEventListener("click", (event) => { if (event.target === ui.modal) closeModal(ui.modal); });
  ui.previewButton.addEventListener("click", () => preview().catch(() => {}));
  ui.form.addEventListener("submit", submit);
  return { open };
}
