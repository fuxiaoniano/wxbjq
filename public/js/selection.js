let savedRange = null;
let editorElement = null;

export function initSelection(editor) {
  editorElement = editor;
  document.addEventListener("selectionchange", saveEditorSelection);
  ["mouseup", "keyup", "input", "focus"].forEach((eventName) => {
    editor.addEventListener(eventName, saveEditorSelection);
  });
}

export function isSelectionInsideEditor(range = null) {
  if (!editorElement) return false;
  const selection = window.getSelection();
  const activeRange = range || (selection && selection.rangeCount ? selection.getRangeAt(0) : null);
  if (!activeRange) return false;
  return editorElement.contains(activeRange.commonAncestorContainer);
}

export function saveEditorSelection() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!isSelectionInsideEditor(range)) return;
  savedRange = range.cloneRange();
}

export function restoreEditorSelection() {
  if (!savedRange || !editorElement || !isSelectionInsideEditor(savedRange)) {
    if (editorElement) {
      const range = document.createRange();
      range.selectNodeContents(editorElement);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      savedRange = range.cloneRange();
      return true;
    }
    return false;
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedRange);
  return true;
}

export function getSavedTextSelection() {
  if (!savedRange || !editorElement || !isSelectionInsideEditor(savedRange)) return null;
  const before = document.createRange();
  before.selectNodeContents(editorElement);
  before.setEnd(savedRange.startContainer, savedRange.startOffset);
  const start = before.toString().length;
  return {
    start,
    end: start + savedRange.toString().length,
  };
}

export function restoreTextSelection(textSelection) {
  if (!editorElement || !textSelection || textSelection.end <= textSelection.start) return false;
  const walker = document.createTreeWalker(editorElement, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0;
  let startSet = false;
  let endSet = false;
  let node = walker.nextNode();

  while (node) {
    const nextOffset = offset + node.nodeValue.length;
    if (!startSet && textSelection.start <= nextOffset) {
      range.setStart(node, Math.max(0, textSelection.start - offset));
      startSet = true;
    }
    if (!endSet && textSelection.end <= nextOffset) {
      range.setEnd(node, Math.max(0, textSelection.end - offset));
      endSet = true;
      break;
    }
    offset = nextOffset;
    node = walker.nextNode();
  }

  if (!startSet || !endSet) return false;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  savedRange = range.cloneRange();
  return true;
}
