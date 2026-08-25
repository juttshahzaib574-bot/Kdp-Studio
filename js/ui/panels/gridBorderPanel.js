import { state, setState, subscribe } from "../../state.js";
import { GRID_PATTERNS } from "../../modules/gridPatternEngine.js";
import { recommendFont, recommendTextTint } from "../../modules/typographyEngine.js";
import { applyPreset, clampBorderWeight } from "../../modules/borderStyleEngine.js";
import { CORNER_RADIUS_MIN_PERCENT, CORNER_RADIUS_MAX_PERCENT } from "../../modules/cornerRadiusEngine.js";
import { getSizesForSelection, buildCombinedPalette } from "../../modules/colorKeyEngine.js";

const el = {
  patternGrid: document.getElementById("grid-pattern-options"),
  cellSlider: document.getElementById("cell-size-slider"),
  cellInput: document.getElementById("cell-size-input"),
  typographyHint: document.getElementById("typography-hint"),
  presetSeamless: document.getElementById("preset-seamless"),
  presetMidnight: document.getElementById("preset-midnight"),
  borderSlider: document.getElementById("border-weight-slider"),
  borderInput: document.getElementById("border-weight-input"),
  tintSlider: document.getElementById("grid-tint-slider"),
  tintInput: document.getElementById("grid-tint-input"),
  radiusSlider: document.getElementById("corner-radius-slider"),
  radiusInput: document.getElementById("corner-radius-input"),
};

export function initGridBorderPanel() {
  renderPatternOptions();
  bindCellSize();
  bindPresets();
  bindBorderWeight();
  bindGridTint();
  bindCornerRadius();

  subscribe(render);
  render(state);
}

function renderPatternOptions() {
  el.patternGrid.innerHTML = "";
  GRID_PATTERNS.forEach((pattern) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pattern-option";
    btn.dataset.patternId = pattern.id;
    btn.innerHTML = `<strong>${pattern.label}</strong><span class="size-note">${pattern.note}</span>`;
    btn.addEventListener("click", () => setState({ gridPattern: pattern.id }));
    el.patternGrid.appendChild(btn);
  });
}

function bindCellSize() {
  el.cellSlider.addEventListener("input", () => setState({ cellSizeMm: Number(el.cellSlider.value) }));
  el.cellInput.addEventListener("change", () => setState({ cellSizeMm: clampCellSize(Number(el.cellInput.value)) }));
}

function clampCellSize(mm) {
  return Math.min(6.0, Math.max(2.5, Number.isFinite(mm) ? mm : 4.0));
}

function bindPresets() {
  el.presetSeamless.addEventListener("click", () => applyPresetById("seamless-realism"));
  el.presetMidnight.addEventListener("click", () => applyPresetById("midnight-marker"));
}

function applyPresetById(presetId) {
  const preset = applyPreset(presetId);
  setState({ borderWeightPt: preset.borderPt, gridTintPercent: preset.gridTintPercent });
}

function bindBorderWeight() {
  el.borderSlider.addEventListener("input", () => setState({ borderWeightPt: Number(el.borderSlider.value) }));
  el.borderInput.addEventListener("change", () => setState({ borderWeightPt: clampBorderWeight(Number(el.borderInput.value)) }));
}

function bindGridTint() {
  el.tintSlider.addEventListener("input", () => setState({ gridTintPercent: Number(el.tintSlider.value) }));
  el.tintInput.addEventListener("change", () => setState({ gridTintPercent: clampTint(Number(el.tintInput.value)) }));
}

function clampTint(pct) {
  return Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 35));
}

function bindCornerRadius() {
  el.radiusSlider.addEventListener("input", () => setState({ cornerRadiusPercent: Number(el.radiusSlider.value) }));
  el.radiusInput.addEventListener("change", () => setState({ cornerRadiusPercent: clampRadius(Number(el.radiusInput.value)) }));
}

function clampRadius(pct) {
  return Math.min(CORNER_RADIUS_MAX_PERCENT, Math.max(CORNER_RADIUS_MIN_PERCENT, Number.isFinite(pct) ? pct : 0));
}

function render(current) {
  el.patternGrid.querySelectorAll(".pattern-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.patternId === current.gridPattern);
  });

  syncPair(el.cellSlider, el.cellInput, current.cellSizeMm);
  syncPair(el.borderSlider, el.borderInput, current.borderWeightPt);
  syncPair(el.tintSlider, el.tintInput, current.gridTintPercent);
  syncPair(el.radiusSlider, el.radiusInput, current.cornerRadiusPercent);

  const sizes = getSizesForSelection(current.colorSetOptionId, current.colorSetCustomPair);
  const colorCount = buildCombinedPalette(sizes, current.colorBrand).length;
  const font = recommendFont(current.cellSizeMm, colorCount);
  const tint = recommendTextTint(current.cellSizeMm, current.gridTintPercent);

  el.typographyHint.textContent = `${current.cellSizeMm.toFixed(1)}mm cell → ${font.sizePt}pt ${font.weight}${
    font.isDoubleDigitRisk ? " — extreme risk zone, double-digit numbers may collide" : ""
  }. Number tint: ${tint.percentBlack}% black (cells stay white; ${
    current.gridTintPercent >= 100 ? "the canvas background goes rich black in Midnight/Blackout mode" : "background stays paper"
  }).`;
}

function syncPair(slider, input, value) {
  if (Number(slider.value) !== value) slider.value = String(value);
  if (Number(input.value) !== value) input.value = String(value);
}
