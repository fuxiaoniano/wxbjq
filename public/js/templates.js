import { apiJson } from "./api.js";
import { canUseServerStorage } from "./config.js";
import { builtInTemplateCategoryOrder, builtInTemplates } from "./built-in-templates.js";
import { sanitizeEditorHtml } from "./sanitizer.js?v=2.1.3-src-placeholder-fix";
import { bindHexColorInput, colorInputValue, normalizeHexColor } from "./colors.js";
import { debounce, createId, escapeHtml, readLocalJson, showToast, writeLocalJson } from "./utils.js";

const LOCAL_TEMPLATES_KEY = "wechat-editor-custom-templates-v1";
const THEME_KEY = "wechat-editor-theme-v1";
const TEMPLATE_RENDER_BATCH_SIZE = 12;
const TEMPLATE_PREVIEW_CACHE_LIMIT = 120;
const TEMPLATE_CATEGORY_FALLBACK = "正文模板";
const TEMPLATE_CATEGORY_ALIASES = new Map([
  ["标题模板", "标题模板"],
  ["标题开篇模板", "标题模板"],
  ["基础模板", "正文模板"],
  ["正文模板", "正文模板"],
  ["内容结构模板", "正文模板"],
  ["流程列表模板", "正文模板"],
  ["重点强调模板", "正文模板"],
  ["收尾提示模板", "引导模板"],
  ["引导模板", "引导模板"],
]);

const THEMES = {
  "default-red": "#d92d20",
  "brand-red": "#c1121f",
  "fresh-green": "#16a34a",
  "business-blue": "#2563eb",
  "black-gold": "#b8872b",
};

function hexToRgb(hex) {
  const match = String(hex || "").match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!match) return { r: 217, g: 45, b: 32 };
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((item) => item.toString(16).padStart(2, "0")).join("")}`;
}

function mixColor(hex, targetHex, weight) {
  const source = hexToRgb(hex);
  const target = hexToRgb(targetHex);
  return rgbToHex({
    r: Math.round(source.r * (1 - weight) + target.r * weight),
    g: Math.round(source.g * (1 - weight) + target.g * weight),
    b: Math.round(source.b * (1 - weight) + target.b * weight),
  });
}

function normalizeColor(value, fallback = THEMES["default-red"]) {
  return normalizeHexColor(value, fallback);
}

function colorTokens(color) {
  const primaryColor = normalizeColor(color);
  return {
    primaryColor,
    primarySoft: mixColor(primaryColor, "#ffffff", 0.9),
    primaryBorder: mixColor(primaryColor, "#ffffff", 0.58),
    primaryLight: mixColor(primaryColor, "#ffffff", 0.35),
    primaryDark: mixColor(primaryColor, "#000000", 0.32),
  };
}

function renderTemplateHtml(template, color) {
  const tokens = colorTokens(color);
  return sanitizeEditorHtml(
    String(template.html || "").replace(/\{\{(primaryColor|primarySoft|primaryBorder|primaryLight|primaryDark)\}\}/g, (_, key) => tokens[key]),
  );
}

function normalizeTemplate(template) {
  if (!template?.html) return null;
  return {
    ...template,
    id: String(template.id || createId("template")).replace(/[^\w-]/g, "") || createId("template"),
    name: String(template.name || "未命名模板").slice(0, 80),
    category: normalizeTemplateCategory(template.category, template),
    html: sanitizeEditorHtml(template.html),
    custom: Boolean(template.custom),
  };
}

function loadLocalTemplates() {
  const templates = Array.isArray(readLocalJson(LOCAL_TEMPLATES_KEY, [])) ? readLocalJson(LOCAL_TEMPLATES_KEY, []) : [];
  return templates.map((template) => normalizeTemplate({ ...template, custom: true })).filter(Boolean);
}

function saveLocalTemplates(templates) {
  return writeLocalJson(LOCAL_TEMPLATES_KEY, templates.map((template) => ({ ...template, custom: true })));
}

function loadTheme() {
  const saved = readLocalJson(THEME_KEY, null);
  return {
    name: saved?.name || "default-red",
    color: normalizeColor(saved?.color || THEMES["default-red"]),
  };
}

function saveTheme(name, color) {
  if (!writeLocalJson(THEME_KEY, { name, color })) {
    showToast("主题色未能写入浏览器存储", "主题保存失败");
  }
}

function normalizeTemplateCategory(value, template = {}) {
  const raw = String(value || "").trim();
  if (TEMPLATE_CATEGORY_ALIASES.has(raw)) return TEMPLATE_CATEGORY_ALIASES.get(raw);
  const probe = `${raw} ${template.id || ""} ${template.name || ""}`.toLowerCase();
  if (/标题|开篇|章节|title|cover|lead/.test(probe)) return "标题模板";
  if (/引导|关注|阅读原文|收尾|follow|guide|original|bottom/.test(probe)) return "引导模板";
  return TEMPLATE_CATEGORY_FALLBACK;
}

function scheduleTemplateWork(callback) {
  if ("requestIdleCallback" in window) {
    return {
      type: "idle",
      id: window.requestIdleCallback(callback, { timeout: 120 }),
    };
  }
  return {
    type: "timeout",
    id: window.setTimeout(callback, 16),
  };
}

function cancelTemplateWork(task) {
  if (!task) return;
  if (task.type === "idle" && "cancelIdleCallback" in window) window.cancelIdleCallback(task.id);
  if (task.type === "timeout") window.clearTimeout(task.id);
}

function templateCategoryRank(template) {
  const index = builtInTemplateCategoryOrder.indexOf(template.category || "");
  return index < 0 ? builtInTemplateCategoryOrder.length : index;
}

function sortTemplatesForDisplay(templates) {
  return templates
    .map((template, index) => ({ template, index }))
    .sort((a, b) => templateCategoryRank(a.template) - templateCategoryRank(b.template) || a.index - b.index)
    .map((item) => item.template);
}

export function createTemplateManager(elements, editorController) {
  let serverTemplates = [];
  let localTemplates = loadLocalTemplates();
  let selectedTemplateId = "";
  let serverAvailable = canUseServerStorage();
  let query = "";
  let category = "all";
  let customOnly = false;
  let theme = loadTheme();
  const previewCache = new Map();
  let observer = null;
  let renderTask = null;
  let renderVersion = 0;
  let templateCache = null;
  let templateById = null;

  function invalidateTemplateCache() {
    templateCache = null;
    templateById = null;
  }

  function applyThemeUi() {
    elements.themeSelect.value = theme.name in THEMES ? theme.name : "custom";
    elements.themeColorInput.value = colorInputValue(theme.color);
    elements.themeColorCodeInput.value = theme.color;
    document.documentElement.style.setProperty("--template-color", theme.color);
    document.documentElement.style.setProperty("--template-soft", colorTokens(theme.color).primarySoft);
    document.documentElement.style.setProperty("--template-border", colorTokens(theme.color).primaryBorder);
    document.documentElement.style.setProperty("--template-light", colorTokens(theme.color).primaryLight);
    document.documentElement.style.setProperty("--template-dark", colorTokens(theme.color).primaryDark);
  }

  function allTemplates() {
    if (!templateCache) {
      templateCache = [
        ...builtInTemplates.map((template) => ({
          ...template,
          category: normalizeTemplateCategory(template.category, template),
          source: "builtin",
          custom: false,
        })),
        ...serverTemplates.map((template) => ({ ...template, source: "server", custom: true })),
        ...localTemplates.map((template) => ({ ...template, source: "browser", custom: true })),
      ];
    }
    return templateCache;
  }

  function findTemplate(id) {
    if (!templateById) {
      templateById = new Map(allTemplates().map((template) => [template.id, template]));
    }
    return templateById.get(id) || null;
  }

  function filteredTemplates() {
    const keyword = query.trim().toLowerCase();
    return sortTemplatesForDisplay(allTemplates().filter((template) => {
      if (customOnly && !template.custom) return false;
      if (category !== "all" && template.category !== category) return false;
      if (!keyword) return true;
      return `${template.name} ${template.category}`.toLowerCase().includes(keyword);
    }));
  }

  function renderCategoryOptions() {
    const categories = [...new Set(allTemplates().map((template) => template.category || "未分类"))].sort();
    const orderedCategories = [
      ...builtInTemplateCategoryOrder.filter((item) => categories.includes(item)),
      ...categories.filter((item) => !builtInTemplateCategoryOrder.includes(item)),
    ];
    elements.templateCategoryFilter.innerHTML = '<option value="all">全部分类</option>';
    for (const item of orderedCategories) {
      const option = document.createElement("option");
      option.value = item;
      option.textContent = item;
      elements.templateCategoryFilter.appendChild(option);
    }
    elements.templateCategoryFilter.value = category;
  }

  function renderPreview(preview, template) {
    preview.innerHTML = `<div class="template-preview-content">${getRenderedTemplate(template)}</div>`;
  }

  function createTemplateCard(template) {
    const card = document.createElement("article");
    card.className = `template-item${template.id === selectedTemplateId ? " active" : ""}`;
    card.tabIndex = 0;
    card.dataset.templateId = template.id;
    card.innerHTML = `
      <div class="template-item-head">
        <h3>${escapeHtml(template.name)}</h3>
        <span>${escapeHtml(template.source === "builtin" ? "内置" : "自定义")}</span>
      </div>
      <div class="template-preview" data-template-id="${escapeHtml(template.id)}"></div>
      <div class="template-item-foot">
        <span>${escapeHtml(template.category || "未分类")}</span>
      </div>
    `;
    const preview = card.querySelector(".template-preview");
    if (observer) observer.observe(preview);
    else renderPreview(preview, template);
    return card;
  }

  function cancelTemplateRender() {
    renderVersion += 1;
    cancelTemplateWork(renderTask);
    renderTask = null;
  }

  function renderTemplateList() {
    cancelTemplateRender();
    const templates = filteredTemplates();
    const currentVersion = renderVersion;
    elements.templateCount.textContent = `${templates.length} 个模板`;
    elements.templateList.innerHTML = "";
    renderCategoryOptions();
    if (observer) observer.disconnect();
    observer = "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const preview = entry.target;
            const id = preview.dataset.templateId;
            const template = findTemplate(id);
            if (template) renderPreview(preview, template);
            observer.unobserve(preview);
          }
        }, { root: elements.templateList, rootMargin: "80px" })
      : null;

    if (!templates.length) {
      elements.templateList.innerHTML = '<p class="template-empty">没有匹配的模板</p>';
      return;
    }

    let index = 0;
    const renderNextBatch = () => {
      if (currentVersion !== renderVersion) return;
      const fragment = document.createDocumentFragment();
      const end = Math.min(index + TEMPLATE_RENDER_BATCH_SIZE, templates.length);
      for (; index < end; index += 1) {
        fragment.appendChild(createTemplateCard(templates[index]));
      }
      elements.templateList.appendChild(fragment);
      if (index < templates.length) {
        renderTask = scheduleTemplateWork(renderNextBatch);
      } else {
        renderTask = null;
      }
    };

    renderNextBatch();
  }

  function getRenderedTemplate(template) {
    const cacheKey = `${theme.color}:${template.id}:${template.html}`;
    if (!previewCache.has(cacheKey)) {
      if (previewCache.size >= TEMPLATE_PREVIEW_CACHE_LIMIT) {
        previewCache.delete(previewCache.keys().next().value);
      }
      previewCache.set(cacheKey, renderTemplateHtml(template, theme.color));
    }
    return previewCache.get(cacheKey);
  }

  async function loadServerTemplates() {
    if (!serverAvailable) return;
    try {
      serverTemplates = (await apiJson("/system-templates")).map((template) => normalizeTemplate({ ...template, custom: true })).filter(Boolean);
      invalidateTemplateCache();
    } catch (error) {
      serverAvailable = false;
      serverTemplates = [];
      invalidateTemplateCache();
    }
  }

  async function saveTemplate() {
    const name = elements.templateNameInput.value.trim();
    const categoryValue = normalizeTemplateCategory(elements.templateCategoryInput.value, { name });
    const rawHtml = elements.templateHtmlInput.value.trim();
    if (!name) {
      showToast("请输入模板名称", "未保存");
      elements.templateNameInput.focus();
      return;
    }
    if (!rawHtml) {
      showToast("请粘贴 HTML 模板", "未保存");
      elements.templateHtmlInput.focus();
      return;
    }
    const result = sanitizeEditorHtml(rawHtml, { returnReport: true });
    elements.templateCleanReport.textContent = `删除危险标签 ${result.report.removedTags} 个，删除危险属性 ${result.report.removedAttributes} 个，删除不兼容 CSS ${result.report.removedCss} 条，最终 ${result.report.finalHtmlBytes} B`;
    if (!result.html) {
      showToast("清洗后模板为空", "未保存");
      return;
    }
    const template = normalizeTemplate({
      id: createId("template"),
      name,
      category: categoryValue,
      html: result.html,
      custom: true,
      createdAt: new Date().toISOString(),
    });

    if (serverAvailable) {
      try {
        const saved = normalizeTemplate({ ...(await apiJson("/system-templates", { method: "POST", body: JSON.stringify(template) })), custom: true });
        serverTemplates.push(saved);
        invalidateTemplateCache();
      } catch (error) {
        if (error.code !== "SERVER_STORAGE_DISABLED") throw error;
        serverAvailable = false;
        localTemplates.unshift(template);
        if (!saveLocalTemplates(localTemplates)) {
          throw new Error("浏览器存储写入失败，模板未保存");
        }
        invalidateTemplateCache();
      }
    } else {
      localTemplates.unshift(template);
      if (!saveLocalTemplates(localTemplates)) {
        throw new Error("浏览器存储写入失败，模板未保存");
      }
      invalidateTemplateCache();
    }

    selectedTemplateId = template.id;
    elements.templateNameInput.value = "";
    elements.templateHtmlInput.value = "";
    renderTemplateList();
    showToast("模板已保存", serverAvailable ? "文件已保存" : "浏览器已保存");
  }

  async function deleteSelectedTemplate() {
    const template = findTemplate(selectedTemplateId);
    if (!template) {
      showToast("请先选择一个模板");
      return;
    }
    if (!template.custom) {
      showToast("内置模板不能删除", "未删除");
      return;
    }
    const ok = window.confirm(`确认删除模板「${template.name}」吗？`);
    if (!ok) return;
    if (template.source === "server" && serverAvailable) {
      await apiJson(`/system-templates/${encodeURIComponent(template.id)}`, { method: "DELETE" });
      serverTemplates = serverTemplates.filter((item) => item.id !== template.id);
      invalidateTemplateCache();
    } else {
      localTemplates = localTemplates.filter((item) => item.id !== template.id);
      if (!saveLocalTemplates(localTemplates)) {
        throw new Error("浏览器存储写入失败，模板未删除");
      }
      invalidateTemplateCache();
    }
    selectedTemplateId = "";
    renderTemplateList();
    showToast("模板已删除");
  }

  function insertTemplate(template = findTemplate(selectedTemplateId)) {
    if (!template) {
      showToast("请先选择一个模板");
      return;
    }
    const mode = elements.templateInsertMode.value || "after";
    editorController.insertHtmlAtSelection(getRenderedTemplate(template), mode, { scrollToInserted: true });
    showToast(`模板已插入：${template.name}`);
  }

  function updateArticleTheme() {
    const colors = Object.values(THEMES).flatMap((color) => Object.values(colorTokens(color)));
    let html = editorController.getHtml();
    for (const oldColor of colors) {
      html = html.split(oldColor).join(theme.color);
    }
    editorController.setHtml(html);
    showToast("正文主题色已更新");
  }

  function selectTemplateCard(card) {
    selectedTemplateId = card.dataset.templateId || "";
    for (const item of elements.templateList.querySelectorAll(".template-item.active")) {
      item.classList.remove("active");
    }
    card.classList.add("active");
  }

  function bindEvents() {
    const themeColorBinding = bindHexColorInput({
      colorInput: elements.themeColorInput,
      codeInput: elements.themeColorCodeInput,
      initialValue: theme.color,
      invalidMessage: "请输入 #RRGGBB 或 #RRGGBBAA 主题色",
      showToast,
      onApply: (color) => {
        theme = { name: "custom", color: normalizeColor(color) };
        saveTheme(theme.name, theme.color);
        previewCache.clear();
        applyThemeUi();
        renderTemplateList();
      },
    });

    elements.templateSearchInput.addEventListener("input", debounce(() => {
      query = elements.templateSearchInput.value;
      renderTemplateList();
    }, 180));
    elements.templateCategoryFilter.addEventListener("change", () => {
      category = elements.templateCategoryFilter.value;
      renderTemplateList();
    });
    elements.customOnlyToggle.addEventListener("change", () => {
      customOnly = elements.customOnlyToggle.checked;
      renderTemplateList();
    });
    elements.themeSelect.addEventListener("change", () => {
      const name = elements.themeSelect.value;
      theme = { name, color: name === "custom" ? themeColorBinding.get() : THEMES[name] };
      saveTheme(theme.name, theme.color);
      previewCache.clear();
      applyThemeUi();
      renderTemplateList();
    });
    elements.templateList.addEventListener("click", (event) => {
      const card = event.target.closest(".template-item");
      if (!card) return;
      selectTemplateCard(card);
      insertTemplate();
    });
    elements.templateList.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest(".template-item");
      if (!card) return;
      event.preventDefault();
      selectTemplateCard(card);
      insertTemplate();
    });
    elements.insertTemplateBtn.addEventListener("click", () => insertTemplate());
    elements.deleteTemplateBtn.addEventListener("click", () => {
      deleteSelectedTemplate().catch((error) => showToast(error.message || "模板删除失败", "删除失败"));
    });
    elements.saveTemplateBtn.addEventListener("click", () => {
      saveTemplate().catch((error) => showToast(error.message || "模板保存失败", "保存失败"));
    });
    elements.updateArticleThemeBtn.addEventListener("click", updateArticleTheme);
  }

  async function init() {
    applyThemeUi();
    await loadServerTemplates();
    bindEvents();
    renderTemplateList();
  }

  return {
    init,
    allTemplates,
    loadLocalTemplates,
    get serverTemplates() {
      return serverTemplates;
    },
  };
}
