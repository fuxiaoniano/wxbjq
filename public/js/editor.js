import { sanitizeEditorHtml, isHtmlEmpty } from "./sanitizer.js?v=2.2.0";
import { restoreEditorSelection, saveEditorSelection } from "./selection.js";
import { showToast } from "./utils.js";

const HISTORY_LIMIT = 100;

export function createEditorController(elements, hooks = {}) {
  const { editor, sourceEditor, sourceModeBtn, phoneFrame } = elements;
  const modeBadge = elements.modeBadge || elements.editorModeBadge;
  let sourceMode = false;
  let undoStack = [];
  let redoStack = [];
  let applyingHistory = false;
  let lastKnownHtml = "";

  function normalizeHtml(html) {
    return sanitizeEditorHtml(html || "");
  }

  function notifyChange() {
    hooks.onChange?.();
  }

  function getHtml() {
    return normalizeHtml(sourceMode ? sourceEditor.value : editor.innerHTML);
  }

  function getRawHtml() {
    return sourceMode ? sourceEditor.value : editor.innerHTML;
  }

  function setHtml(html, options = {}) {
    const clean = normalizeHtml(html);
    const previous = getHtml();
    if (!options.silent && !options.skipHistory && clean !== previous) {
      recordHistorySnapshot(previous);
    }
    editor.innerHTML = clean;
    sourceEditor.value = clean;
    lastKnownHtml = clean;
    if (!options.silent) notifyChange();
  }

  function pushHistory(stack, html) {
    const clean = normalizeHtml(html);
    if (stack[stack.length - 1] === clean) return;
    stack.push(clean);
    if (stack.length > HISTORY_LIMIT) stack.shift();
  }

  function recordHistorySnapshot(html = getHtml()) {
    if (applyingHistory) return;
    pushHistory(undoStack, html);
    redoStack = [];
  }

  function trackInputChange(previous, current) {
    if (!applyingHistory && current !== previous) {
      pushHistory(undoStack, previous);
      redoStack = [];
    }
    lastKnownHtml = current;
  }

  function commitDomChange(options = {}) {
    const clean = getHtml();
    if (!sourceMode && clean !== editor.innerHTML) editor.innerHTML = clean;
    if (!sourceMode) sourceEditor.value = clean;
    lastKnownHtml = clean;
    if (!options.silent) notifyChange();
    return clean;
  }

  function focusEditor() {
    if (sourceMode) sourceEditor.focus();
    else editor.focus();
  }

  function isEmpty() {
    return isHtmlEmpty(getRawHtml());
  }

  function toggleSourceMode(force) {
    const next = typeof force === "boolean" ? force : !sourceMode;
    if (next === sourceMode) return sourceMode;
    sourceMode = next;
    phoneFrame.classList.toggle("source-active", sourceMode);
    sourceModeBtn.setAttribute("aria-pressed", String(sourceMode));
    sourceModeBtn.textContent = sourceMode ? "返回编辑" : "编辑源码";
    if (modeBadge) modeBadge.textContent = sourceMode ? "源码" : "富文本";
    if (sourceMode) {
      sourceEditor.value = sanitizeEditorHtml(editor.innerHTML);
      sourceEditor.focus();
      showToast("已进入 HTML 源码模式");
    } else {
      setHtml(sourceEditor.value, { silent: true, skipHistory: true });
      editor.focus();
      saveEditorSelection();
      notifyChange();
      showToast("已返回可视化编辑");
    }
    return sourceMode;
  }

  function ensureVisualMode() {
    if (sourceMode) toggleSourceMode(false);
    editor.focus();
    restoreEditorSelection();
  }

  function currentTopLevelBlock(range, mode = "after") {
    if (!range) return null;
    let node = range.startContainer;
    if (node === editor) {
      const children = [...editor.childNodes].filter((child) => child.nodeType === Node.ELEMENT_NODE || child.textContent.trim());
      if (!children.length) return null;
      const offset = Math.min(Math.max(range.startOffset, 0), children.length - 1);
      if (mode === "before") return children[offset] || children[0];
      return children[Math.max(0, Math.min(range.startOffset - 1, children.length - 1))] || children[children.length - 1];
    }
    if (!editor.contains(node)) return null;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node.parentNode !== editor) node = node.parentNode;
    return node && node.parentNode === editor ? node : null;
  }

  function placeCaretAfter(node) {
    if (!node || !node.parentNode) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.setEndAfter(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function scrollInsertedNodeIntoView(node) {
    const target = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!target?.scrollIntoView) return;
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }

  function insertRelativeToCurrentBlock(clean, mode) {
    const selection = window.getSelection();
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    const anchor = currentTopLevelBlock(range, mode);
    const fragmentRange = range || document.createRange();
    const fragment = fragmentRange.createContextualFragment(clean);
    const firstNode = fragment.firstChild;
    const lastNode = fragment.lastChild;
    if (!anchor) {
      editor.appendChild(fragment);
      if (lastNode) placeCaretAfter(lastNode);
      else moveCaretToEnd();
      return firstNode;
    }
    if (mode === "before") editor.insertBefore(fragment, anchor);
    else editor.insertBefore(fragment, anchor.nextSibling);
    if (lastNode) placeCaretAfter(lastNode);
    return firstNode;
  }

  function insertHtmlAtSelection(html, mode = "cursor", options = {}) {
    const clean = normalizeHtml(html);
    if (!clean) return false;
    const previous = getHtml();

    if (sourceMode) {
      recordHistorySnapshot(previous);
      const source = sourceEditor.value;
      const start = sourceEditor.selectionStart ?? source.length;
      const end = sourceEditor.selectionEnd ?? start;
      const prefix = start > 0 && source[start - 1] !== "\n" ? "\n" : "";
      const suffix = source[end] && source[end] !== "\n" ? "\n" : "";
      const inserted = `${prefix}${clean}${suffix}`;
      const next = normalizeHtml(`${source.slice(0, start)}${inserted}${source.slice(end)}`);
      sourceEditor.value = next;
      editor.innerHTML = next;
      lastKnownHtml = next;
      const caret = Math.min(start + inserted.length, sourceEditor.value.length);
      sourceEditor.focus();
      sourceEditor.setSelectionRange(caret, caret);
      notifyChange();
      return true;
    }

    recordHistorySnapshot(previous);
    ensureVisualMode();
    let insertedNode = null;

    if (mode === "before" || mode === "after") {
      insertedNode = insertRelativeToCurrentBlock(clean, mode);
    } else if (mode === "append") {
      const range = document.createRange();
      const fragment = range.createContextualFragment(clean);
      insertedNode = fragment.firstChild;
      const lastNode = fragment.lastChild;
      editor.appendChild(fragment);
      if (lastNode) placeCaretAfter(lastNode);
      else moveCaretToEnd();
    } else {
      const selection = window.getSelection();
      if (!selection.rangeCount) {
        const range = document.createRange();
        const fragment = range.createContextualFragment(clean);
        insertedNode = fragment.firstChild;
        const lastNode = fragment.lastChild;
        editor.appendChild(fragment);
        if (lastNode) placeCaretAfter(lastNode);
        else moveCaretToEnd();
      } else {
        const range = selection.getRangeAt(0);
        if (mode === "replace" || !range.collapsed) range.deleteContents();
        const fragment = range.createContextualFragment(clean);
        insertedNode = fragment.firstChild;
        const lastNode = fragment.lastChild;
        range.insertNode(fragment);
        if (lastNode) {
          range.setStartAfter(lastNode);
          range.setEndAfter(lastNode);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
    if (options.scrollToInserted) scrollInsertedNodeIntoView(insertedNode);
    commitDomChange({ silent: true });
    if (options.scrollToInserted) {
      window.requestAnimationFrame?.(() => scrollInsertedNodeIntoView(insertedNode));
    }
    saveEditorSelection();
    notifyChange();
    return true;
  }

  function moveCaretToEnd() {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    saveEditorSelection();
  }

  function clear() {
    const previous = getHtml();
    if (previous) recordHistorySnapshot(previous);
    editor.innerHTML = "";
    sourceEditor.value = "";
    lastKnownHtml = "";
    moveCaretToEnd();
    notifyChange();
  }

  function applyHistorySnapshot(html) {
    applyingHistory = true;
    setHtml(html, { silent: true, skipHistory: true });
    applyingHistory = false;
    if (sourceMode) {
      sourceEditor.focus();
      const end = sourceEditor.value.length;
      sourceEditor.setSelectionRange(end, end);
    } else {
      editor.focus();
      moveCaretToEnd();
    }
    notifyChange();
  }

  function undo() {
    const current = getHtml();
    while (undoStack.length && undoStack[undoStack.length - 1] === current) {
      undoStack.pop();
    }
    const previous = undoStack.pop();
    if (previous === undefined) {
      showToast("没有可撤销的内容", "撤销");
      return false;
    }
    pushHistory(redoStack, current);
    applyHistorySnapshot(previous);
    showToast("已撤销");
    return true;
  }

  function redo() {
    const current = getHtml();
    const next = redoStack.pop();
    if (next === undefined) {
      showToast("没有可重做的内容", "重做");
      return false;
    }
    pushHistory(undoStack, current);
    applyHistorySnapshot(next);
    showToast("已重做");
    return true;
  }

  function handleBeforeInput() {
    recordHistorySnapshot(getHtml());
  }

  function handleHistoryShortcut(event) {
    const isModifierPressed = event.ctrlKey || event.metaKey;
    if (!isModifierPressed) return;
    const key = event.key.toLowerCase();
    if (key === "z" && event.shiftKey) {
      event.preventDefault();
      redo();
      return;
    }
    if (key === "z") {
      event.preventDefault();
      undo();
      return;
    }
    if (key === "y") {
      event.preventDefault();
      redo();
    }
  }

  editor.addEventListener("beforeinput", handleBeforeInput);
  sourceEditor.addEventListener("beforeinput", handleBeforeInput);
  editor.addEventListener("keydown", handleHistoryShortcut);
  sourceEditor.addEventListener("keydown", handleHistoryShortcut);
  editor.addEventListener("input", () => {
    if (sourceMode) return;
    const previous = lastKnownHtml;
    const clean = normalizeHtml(editor.innerHTML);
    if (clean !== editor.innerHTML) editor.innerHTML = clean;
    sourceEditor.value = clean;
    trackInputChange(previous, clean);
    notifyChange();
  });
  sourceEditor.addEventListener("input", () => {
    trackInputChange(lastKnownHtml, normalizeHtml(sourceEditor.value));
    notifyChange();
  });
  editor.addEventListener("paste", (event) => {
    const html = event.clipboardData?.getData("text/html");
    const text = event.clipboardData?.getData("text/plain");
    if (!html) return;
    event.preventDefault();
    insertHtmlAtSelection(html || text);
  });

  return {
    get sourceMode() {
      return sourceMode;
    },
    getHtml,
    getRawHtml,
    setHtml,
    recordHistorySnapshot,
    commitDomChange,
    focusEditor,
    isEmpty,
    toggleSourceMode,
    ensureVisualMode,
    insertHtmlAtSelection,
    moveCaretToEnd,
    clear,
    undo,
    redo,
  };
}
