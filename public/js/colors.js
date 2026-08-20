export function normalizeHexColor(value, fallback = "#000000") {
  const match = String(value || "").trim().match(/^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  if (!match) return fallback;
  return `#${match[1].toLowerCase()}${(match[2] || "").toLowerCase()}`;
}

function isValidHexColor(value) {
  return /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(String(value || "").trim());
}

export function colorInputValue(value, fallback = "#000000") {
  const normalized = normalizeHexColor(value, fallback);
  return normalized.slice(0, 7);
}

function alphaPart(value) {
  const normalized = normalizeHexColor(value, "");
  return normalized.length === 9 ? normalized.slice(7) : "";
}

function mergePickerColorWithAlpha(rgbColor, currentCode) {
  const rgb = colorInputValue(rgbColor);
  const alpha = alphaPart(currentCode);
  return `${rgb}${alpha}`;
}

export function bindHexColorInput({ colorInput, codeInput, initialValue, onApply, invalidMessage, showToast }) {
  const start = normalizeHexColor(initialValue || codeInput.value || colorInput.value, colorInput.value || "#000000");
  colorInput.value = colorInputValue(start);
  codeInput.value = start;

  function applyFromCode() {
    if (!isValidHexColor(codeInput.value)) {
      codeInput.value = normalizeHexColor(colorInput.value, colorInput.value);
      codeInput.classList.add("invalid");
      showToast?.(invalidMessage || "请输入 #RRGGBB 或 #RRGGBBAA 色值", "颜色未更新");
      return;
    }
    const color = normalizeHexColor(codeInput.value);
    codeInput.classList.remove("invalid");
    codeInput.value = color;
    colorInput.value = colorInputValue(color);
    onApply?.(color);
  }

  colorInput.addEventListener("input", () => {
    const color = mergePickerColorWithAlpha(colorInput.value, codeInput.value);
    codeInput.value = color;
    codeInput.classList.remove("invalid");
    onApply?.(color);
  });

  codeInput.addEventListener("change", applyFromCode);
  codeInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyFromCode();
  });
  codeInput.addEventListener("focus", () => codeInput.select());
  codeInput.addEventListener("click", () => codeInput.select());

  return {
    set(color) {
      const normalized = normalizeHexColor(color, codeInput.value);
      colorInput.value = colorInputValue(normalized);
      codeInput.value = normalized;
      codeInput.classList.remove("invalid");
    },
    get() {
      return normalizeHexColor(codeInput.value, colorInput.value);
    },
  };
}
