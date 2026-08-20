import { isSafeHref } from "./sanitizer.js?v=2.1.3-src-placeholder-fix";
import {
  getSavedTextSelection,
  restoreEditorSelection,
  restoreTextSelection,
  saveEditorSelection,
} from "./selection.js";
import { bindHexColorInput } from "./colors.js";
import { showToast } from "./utils.js";

function selectionHasText() {
  const selection = window.getSelection();
  return Boolean(selection && selection.rangeCount && selection.toString().trim());
}

function keepSelectedText(editorController, textSelection) {
  editorController.commitDomChange();
  editorController.focusEditor();
  if (!restoreTextSelection(textSelection)) restoreEditorSelection();
  saveEditorSelection();
}

function conflictingStyleProperties(property) {
  if (property === "background-color" || property === "background") {
    return new Set(["background-color", "background"]);
  }
  return new Set([property]);
}

export function removeConflictingInlineStyles(root, property) {
  const conflicts = conflictingStyleProperties(property);
  const elements = [];
  if (root.nodeType === Node.ELEMENT_NODE) elements.push(root);
  if (root.querySelectorAll) elements.push(...root.querySelectorAll("[style]"));

  for (const element of elements) {
    const declarations = String(element.getAttribute("style") || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((declaration) => {
        const index = declaration.indexOf(":");
        if (index <= 0) return false;
        return !conflicts.has(declaration.slice(0, index).trim().toLowerCase());
      });
    if (declarations.length) element.setAttribute("style", declarations.join("; "));
    else element.removeAttribute("style");
  }
}

function stylePropertyName(style) {
  return String(style || "").split(":")[0].trim().toLowerCase();
}

function applyInlineStyle(editorController, style, messages) {
  editorController.ensureVisualMode();
  restoreEditorSelection();
  const selection = window.getSelection();
  if (!selectionHasText() || !selection.rangeCount) {
    showToast(messages.missing, messages.status);
    return;
  }

  const textSelection = getSavedTextSelection();
  editorController.recordHistorySnapshot();
  const range = selection.getRangeAt(0);
  const property = stylePropertyName(style);
  const content = range.extractContents();
  if (property) removeConflictingInlineStyles(content, property);
  const span = document.createElement("span");
  span.setAttribute("style", style);
  span.appendChild(content);
  range.insertNode(span);
  range.selectNodeContents(span);
  selection.removeAllRanges();
  selection.addRange(range);
  saveEditorSelection();
  keepSelectedText(editorController, textSelection);
  showToast(messages.success);
}

function applyInlineColor(editorController, property, color) {
  applyInlineStyle(editorController, `${property}: ${color}`, {
    missing: property === "color" ? "请先选择需要调整文字色的文字" : "请先选择需要调整背景色的文字",
    status: "颜色未更新",
    success: property === "color" ? "文字色已更新" : "背景色已更新",
  });
}

function executeEditorCommand(editorController, command, value = null) {
  if (command === "undo") {
    editorController.undo();
    return;
  }

  if (command === "redo") {
    editorController.redo();
    return;
  }

  editorController.ensureVisualMode();
  restoreEditorSelection();

  if (command === "fontSize") {
    const size = /^\d{2}$/.test(String(value)) ? `${value}px` : "16px";
    applyInlineStyle(editorController, `font-size: ${size}`, {
      missing: "请先选择需要调整字号的文字",
      status: "字号未更新",
      success: "字号已更新",
    });
    return;
  }

  if (command === "insertHorizontalRule") {
    editorController.insertHtmlAtSelection(
      '<section style="margin: 24px 0; border-top: 1px solid #eeeeee; height: 1px;"><br></section>',
    );
    showToast("分割线已插入");
    return;
  }

  const textSelection = getSavedTextSelection();
  editorController.recordHistorySnapshot();
  document.execCommand(command, false, value);
  saveEditorSelection();
  keepSelectedText(editorController, textSelection);
  showToast("格式已更新");
}

export function insertLink(editorController, url) {
  const href = String(url || "").trim();
  if (!href) {
    showToast("请先输入链接地址");
    return false;
  }
  if (!isSafeHref(href)) {
    showToast("链接只支持 http、https 或 mailto", "链接未添加");
    return false;
  }
  editorController.ensureVisualMode();
  restoreEditorSelection();
  if (!selectionHasText()) {
    showToast("请先选择需要添加链接的文字", "链接未添加");
    return false;
  }
  const textSelection = getSavedTextSelection();
  editorController.recordHistorySnapshot();
  document.execCommand("createLink", false, href);
  const selection = window.getSelection();
  const anchor = selection?.anchorNode?.parentElement?.closest?.("a");
  if (anchor) {
    anchor.setAttribute("rel", "noopener noreferrer");
    if (anchor.getAttribute("target") === "_blank") {
      anchor.setAttribute("rel", "noopener noreferrer");
    }
  }
  keepSelectedText(editorController, textSelection);
  showToast("链接已添加");
  return true;
}

export function removeLink(editorController) {
  editorController.ensureVisualMode();
  restoreEditorSelection();
  const textSelection = getSavedTextSelection();
  editorController.recordHistorySnapshot();
  document.execCommand("unlink", false, null);
  keepSelectedText(editorController, textSelection);
  showToast("链接已删除");
}

export function bindToolbar(elements, editorController) {
  elements.toolbar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-command]");
    if (!button) return;
    executeEditorCommand(editorController, button.dataset.command);
  });

  elements.fontSizeSelect.addEventListener("change", () => {
    if (!elements.fontSizeSelect.value) return;
    executeEditorCommand(editorController, "fontSize", elements.fontSizeSelect.value);
    elements.fontSizeSelect.value = "";
  });

  bindHexColorInput({
    colorInput: elements.foreColor,
    codeInput: elements.colorCodeInput,
    initialValue: "#35c9a7",
    invalidMessage: "请输入 #RRGGBB 或 #RRGGBBAA 文字色",
    showToast,
    onApply: (color) => applyInlineColor(editorController, "color", color),
  });

  bindHexColorInput({
    colorInput: elements.backColor,
    codeInput: elements.backColorCodeInput,
    initialValue: "#fff1ef",
    invalidMessage: "请输入 #RRGGBB 或 #RRGGBBAA 背景色",
    showToast,
    onApply: (color) => applyInlineColor(editorController, "background-color", color),
  });
}
