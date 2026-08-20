import { isSafeImageSrc, sanitizeEditorHtml } from "./sanitizer.js?v=2.1.3-src-placeholder-fix";
import { escapeHtml, readFileAsDataUrl, showToast } from "./utils.js";

function buildImageHtml({ src, alt = "", width = "100%", center = true }) {
  const safeWidth = String(width || "100%").replace(/[^\d.%pxrememvwvh]/gi, "").slice(0, 20) || "100%";
  const safeAlt = escapeHtml(alt);
  const style = [
    `width: ${safeWidth}`,
    "max-width: 100%",
    "height: auto",
    center ? "display: block" : "display: inline-block",
    center ? "margin-left: auto" : "",
    center ? "margin-right: auto" : "",
  ]
    .filter(Boolean)
    .join("; ");
  return sanitizeEditorHtml(`<section style="margin: 18px 0; text-align: ${center ? "center" : "left"};"><img src="${escapeHtml(src)}" alt="${safeAlt}" title="${safeAlt}" style="${style}" data-width="${safeWidth}">${safeAlt ? `<p style="margin: 8px 0 0; color: #888888; font-size: 13px; text-align: center;">${safeAlt}</p>` : ""}</section>`);
}

function insertImage(editorController, elements, src) {
  if (!isSafeImageSrc(src)) {
    showToast("图片地址只支持 http、https、Data URL 或 blob", "未插入");
    return;
  }
  editorController.insertHtmlAtSelection(
    buildImageHtml({
      src,
      alt: elements.imageAltInput.value.trim(),
      width: elements.imageWidthInput.value.trim() || "100%",
      center: elements.imageCenterToggle.checked,
    }),
  );
  showToast(src.startsWith("data:") ? "图片已插入，Data URL 会增加草稿体积" : "图片已插入");
}

export function deleteSelectedImage(editorController, doc = document) {
  editorController.ensureVisualMode();
  const activeWindow = doc.defaultView || window;
  const selection = activeWindow.getSelection?.();
  const node = selection?.anchorNode;
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  const markedImage = doc.querySelector?.('img[data-editor-selected="true"]');
  const image = element?.closest?.("img") || doc.activeElement?.closest?.("img") || (markedImage?.isConnected === false ? null : markedImage);
  if (!image) return false;
  editorController.recordHistorySnapshot?.();
  const wrapper = image.closest?.("section");
  (wrapper || image).remove();
  editorController.commitDomChange?.();
  return true;
}

export function bindImageTools(elements, editorController) {
  const editor = elements.editor;

  editor.addEventListener("click", (event) => {
    for (const image of editor.querySelectorAll('img[data-editor-selected="true"]')) {
      image.removeAttribute("data-editor-selected");
    }
    const image = event.target.closest?.("img");
    if (image && editor.contains(image)) {
      image.setAttribute("data-editor-selected", "true");
    }
  });

  elements.insertImageUrlBtn.addEventListener("click", () => {
    insertImage(editorController, elements, elements.imageUrlInput.value.trim());
    elements.imageUrlInput.value = "";
  });
  elements.chooseImageBtn.addEventListener("click", () => elements.imageFileInput.click());
  elements.imageFileInput.addEventListener("change", async () => {
    const file = elements.imageFileInput.files[0];
    elements.imageFileInput.value = "";
    if (!file) return;
    try {
      insertImage(editorController, elements, await readFileAsDataUrl(file));
    } catch (error) {
      showToast(error.message, "图片未插入");
    }
  });
  elements.deleteImageBtn.addEventListener("click", () => {
    if (!deleteSelectedImage(editorController)) {
      showToast("请先选中图片", "未删除");
      return;
    }
    showToast("图片已删除");
  });

  editor.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  editor.addEventListener("drop", async (event) => {
    const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    try {
      insertImage(editorController, elements, await readFileAsDataUrl(file));
    } catch (error) {
      showToast(error.message, "图片未插入");
    }
  });
  editor.addEventListener("paste", async (event) => {
    const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    try {
      insertImage(editorController, elements, await readFileAsDataUrl(file));
    } catch (error) {
      showToast(error.message, "图片未插入");
    }
  });
}
