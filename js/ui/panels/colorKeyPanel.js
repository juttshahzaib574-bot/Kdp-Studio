import { state, setState, subscribe } from "../../state.js?v=45";
import { COLOR_SET_OPTIONS, getSizesForSelection, buildCombinedPalette } from "../../modules/colorKeyEngine.js?v=45";
import { BOOK_COLOR_MODES } from "../../modules/bookThemeEngine.js?v=45";
import { COLOR_KEY_ORIENTATIONS, MAX_ENTRIES_PER_LINE } from "../../modules/colorKeyLayoutEngine.js?v=45";

const PAIR_CHOICES = [
  { id: "12-24", sizes: [12, 24], label: "12 & 24" },
  { id: "12-36", sizes: [12, 36], label: "12 & 36" },
  { id: "24-36", sizes: [24, 36], label: "24 & 36" },
];

const el = {
  bookColorModeOptions: document.getElementById("book-color-mode-options"),
  bookColorModeHint: document.getElementById("book-color-mode-hint"),
  setSelect: document.getElementById("color-set-select"),
  customPairGroup: document.getElementById("custom-pair-group"),
  customPairOptions: document.getElementById("custom-pair-options"),
  orientationOptions: document.getElementById("color-key-orientation-options"),
  entriesPerLineInput: document.getElementById("color-key-entries-per-line"),
  entriesPerLineLabel: document.getElementById("color-key-entries-per-line-axis"),
  swatchList: document.getElementById("color-swatch-list"),
  blankColorOptions: document.getElementById("blank-color-options"),
};

export function initColorKeyPanel() {
  renderBookColorModeOptions();
  renderSetOptions();
  renderPairOptions();
  renderOrientationOptions();

  el.setSelect.addEventListener("change", () => setState({ colorSetOptionId: el.setSelect.value }));
  el.entriesPerLineInput.addEventListener("change", () => {
    const raw = el.entriesPerLineInput.value.trim();
    const n = raw ? Math.max(1, Math.min(MAX_ENTRIES_PER_LINE, Math.round(Number(raw)))) : null;
    setState({ colorKeyEntriesPerLine: Number.isFinite(n) ? n : null });
  });

  subscribe(render);
  render(state);
}

function renderOrientationOptions() {
  el.orientationOptions.innerHTML = "";
  COLOR_KEY_ORIENTATIONS.forEach((orientation) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.orientationId = orientation.id;
    btn.innerHTML = `<strong>${orientation.label}</strong><span class="size-note">${orientation.note}</span>`;
    btn.addEventListener("click", () => setState({ colorKeyOrientation: orientation.id }));
    el.orientationOptions.appendChild(btn);
  });
}

function renderBookColorModeOptions() {
  el.bookColorModeOptions.innerHTML = "";
  BOOK_COLOR_MODES.forEach((mode) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.modeId = mode.id;
    btn.textContent = mode.label;
    btn.addEventListener("click", () => setState({ bookColorMode: mode.id }));
    el.bookColorModeOptions.appendChild(btn);
  });
}

function renderSetOptions() {
  el.setSelect.innerHTML = COLOR_SET_OPTIONS.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
}

function renderPairOptions() {
  el.customPairOptions.innerHTML = "";
  PAIR_CHOICES.forEach((pair) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.pairId = pair.id;
    btn.textContent = pair.label;
    btn.addEventListener("click", () => setState({ colorSetCustomPair: pair.sizes }));
    el.customPairOptions.appendChild(btn);
  });
}

function render(current) {
  el.bookColorModeOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.modeId === current.bookColorMode);
  });
  const activeColorMode = BOOK_COLOR_MODES.find((m) => m.id === current.bookColorMode);
  el.bookColorModeHint.textContent = activeColorMode?.note ?? "";

  el.setSelect.value = current.colorSetOptionId;
  el.customPairGroup.hidden = current.colorSetOptionId !== "set-custom-pair";

  el.customPairOptions.querySelectorAll(".option-item").forEach((btn) => {
    const pair = PAIR_CHOICES.find((p) => p.id === btn.dataset.pairId);
    const isActive = JSON.stringify(pair.sizes) === JSON.stringify(current.colorSetCustomPair);
    btn.classList.toggle("active", isActive);
  });

  el.orientationOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.orientationId === current.colorKeyOrientation);
  });

  el.entriesPerLineLabel.textContent = current.colorKeyOrientation === "vertical" ? "Column" : "Row";
  if (document.activeElement !== el.entriesPerLineInput) {
    el.entriesPerLineInput.value = current.colorKeyEntriesPerLine ?? "";
  }

  const sizes = getSizesForSelection(current.colorSetOptionId, current.colorSetCustomPair);
  const palette = buildCombinedPalette(sizes);

  el.swatchList.innerHTML = palette
    .map(
      (swatch) => `
        <div class="swatch-item">
          <span class="swatch-chip" style="background:${swatch.hex}"></span>
          <span class="swatch-name">${swatch.name}</span>
        </div>`
    )
    .join("");

  renderBlankColorOptions(current, palette);
}

// Rebuilt every render (not just init) because the eligible color list changes
// whenever the Color Set selection changes — no color is picked by default, and
// this list is the only source of truth for which ones the creator has chosen.
function renderBlankColorOptions(current, palette) {
  el.blankColorOptions.innerHTML = "";
  palette.forEach((swatch) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item swatch-toggle";
    btn.dataset.colorId = String(swatch.id);
    const isActive = current.blankColorIds.includes(swatch.id);
    btn.classList.toggle("active", isActive);
    btn.innerHTML = `<span class="swatch-chip" style="background:${swatch.hex}"></span><strong>${swatch.name}</strong>`;
    btn.addEventListener("click", () => {
      const next = isActive ? current.blankColorIds.filter((id) => id !== swatch.id) : [...current.blankColorIds, swatch.id];
      setState({ blankColorIds: next });
    });
    el.blankColorOptions.appendChild(btn);
  });
}
