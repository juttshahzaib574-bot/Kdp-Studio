import { state, setState, subscribe } from "../../state.js?v=48";
import {
  GRID_PATTERNS,
  computeGridDimensions,
  isCellInGridSilhouette,
  isCellInFrameMargin,
  CORNER_TRIM_CORNERS,
  CORNER_TRIM_SHAPES,
  CORNER_TRIM_SIZE_MIN_PERCENT,
  CORNER_TRIM_SIZE_MAX_PERCENT,
  FRAME_MARGIN_OPTIONS,
} from "../../modules/gridPatternEngine.js?v=48";
import { recommendFont, recommendTextTint } from "../../modules/typographyEngine.js?v=48";
import { applyPreset, clampBorderWeight } from "../../modules/borderStyleEngine.js?v=48";
import { CORNER_RADIUS_MIN_PERCENT, CORNER_RADIUS_MAX_PERCENT } from "../../modules/cornerRadiusEngine.js?v=48";
import { getSizesForSelection, buildCombinedPalette } from "../../modules/colorKeyEngine.js?v=48";
import { getTrimSizeById } from "../../modules/canvasEngine.js?v=48";
import { computeCanvasDimensions } from "../../modules/bleedEngine.js?v=48";
import { computeSafeZone } from "../../modules/safeZoneEngine.js?v=48";
import { normalizeComposition, computeLayout } from "../../modules/layoutCompositionEngine.js?v=48";
import { resolveEffectiveGrid } from "../../modules/resolutionScalingEngine.js?v=48";
import { PAGE_BACKGROUND_MODES } from "../../modules/bookThemeEngine.js?v=48";

const el = {
  patternGrid: document.getElementById("grid-pattern-options"),
  cellSlider: document.getElementById("cell-size-slider"),
  cellInput: document.getElementById("cell-size-input"),
  typographyHint: document.getElementById("typography-hint"),
  presetSeamless: document.getElementById("preset-seamless"),
  presetMidnight: document.getElementById("preset-midnight"),
  pageBackgroundOptions: document.getElementById("page-background-options"),
  borderSlider: document.getElementById("border-weight-slider"),
  borderInput: document.getElementById("border-weight-input"),
  tintSlider: document.getElementById("grid-tint-slider"),
  tintInput: document.getElementById("grid-tint-input"),
  numberTintSlider: document.getElementById("number-tint-slider"),
  numberTintInput: document.getElementById("number-tint-input"),
  radiusSlider: document.getElementById("corner-radius-slider"),
  radiusInput: document.getElementById("corner-radius-input"),
  cornerTrimPicker: document.getElementById("corner-trim-picker"),
  cornerTrimShapeOptions: document.getElementById("corner-trim-shape-options"),
  cornerTrimSizeSlider: document.getElementById("corner-trim-size-slider"),
  cornerTrimSizeInput: document.getElementById("corner-trim-size-input"),
  cornerTrimDetailGroup: document.getElementById("corner-trim-detail-group"),
  cornerTrimSizeGroup: document.getElementById("corner-trim-size-group"),
  frameMarginOptions: document.getElementById("frame-margin-options"),
  statGridDims: document.getElementById("stat-grid-dims"),
  statCellCount: document.getElementById("stat-cell-count"),
  statOutPx: document.getElementById("stat-out-px"),
};

export function initGridBorderPanel() {
  renderPatternOptions();
  renderPageBackgroundOptions();
  renderCornerTrimPicker();
  renderCornerTrimShapeOptions();
  renderFrameMarginOptions();
  bindCellSize();
  bindPresets();
  bindBorderWeight();
  bindGridTint();
  bindNumberTint();
  bindCornerRadius();
  bindCornerTrimSize();

  subscribe(render);
  render(state);
}

function renderFrameMarginOptions() {
  el.frameMarginOptions.innerHTML = "";
  FRAME_MARGIN_OPTIONS.forEach((option) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.marginId = String(option.id);
    btn.innerHTML = `<strong>${option.label}</strong><span class="size-note">${option.note}</span>`;
    btn.addEventListener("click", () => setState({ gridFrameMarginCells: option.id }));
    el.frameMarginOptions.appendChild(btn);
  });
}

function renderCornerTrimPicker() {
  el.cornerTrimPicker.innerHTML = "";
  CORNER_TRIM_CORNERS.forEach((corner) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "corner-trim-btn";
    btn.dataset.corner = corner.id;
    btn.title = corner.label;
    btn.textContent = corner.glyph;
    btn.addEventListener("click", () => {
      const active = state.gridCornerTrimCorners.includes(corner.id);
      const next = active ? state.gridCornerTrimCorners.filter((id) => id !== corner.id) : [...state.gridCornerTrimCorners, corner.id];
      setState({ gridCornerTrimCorners: next });
    });
    el.cornerTrimPicker.appendChild(btn);
  });
}

function renderCornerTrimShapeOptions() {
  el.cornerTrimShapeOptions.innerHTML = "";
  CORNER_TRIM_SHAPES.forEach((shape) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.shapeId = shape.id;
    btn.innerHTML = `<strong>${shape.label}</strong><span class="size-note">${shape.note}</span>`;
    btn.addEventListener("click", () => setState({ gridCornerTrimShape: shape.id }));
    el.cornerTrimShapeOptions.appendChild(btn);
  });
}

function bindCornerTrimSize() {
  el.cornerTrimSizeSlider.addEventListener("input", () => setState({ gridCornerTrimSizePercent: Number(el.cornerTrimSizeSlider.value) }));
  el.cornerTrimSizeInput.addEventListener("change", () => setState({ gridCornerTrimSizePercent: clampCornerTrimSize(Number(el.cornerTrimSizeInput.value)) }));
}

function clampCornerTrimSize(pct) {
  return Math.min(CORNER_TRIM_SIZE_MAX_PERCENT, Math.max(CORNER_TRIM_SIZE_MIN_PERCENT, Number.isFinite(pct) ? pct : 12));
}

function renderPageBackgroundOptions() {
  el.pageBackgroundOptions.innerHTML = "";
  PAGE_BACKGROUND_MODES.forEach((mode) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.modeId = mode.id;
    btn.innerHTML = `<strong>${mode.label}</strong><span class="size-note">${mode.note}</span>`;
    btn.addEventListener("click", () => setState({ pageBackgroundMode: mode.id }));
    el.pageBackgroundOptions.appendChild(btn);
  });
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

function bindNumberTint() {
  el.numberTintSlider.addEventListener("input", () => setState({ numberTintPercent: Number(el.numberTintSlider.value) }));
  el.numberTintInput.addEventListener("change", () => setState({ numberTintPercent: clampTint(Number(el.numberTintInput.value)) }));
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

  el.pageBackgroundOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.modeId === current.pageBackgroundMode);
  });

  syncPair(el.cellSlider, el.cellInput, current.cellSizeMm);
  syncPair(el.borderSlider, el.borderInput, current.borderWeightPt);
  syncPair(el.tintSlider, el.tintInput, current.gridTintPercent);
  syncPair(el.numberTintSlider, el.numberTintInput, current.numberTintPercent);
  syncPair(el.radiusSlider, el.radiusInput, current.cornerRadiusPercent);
  syncPair(el.cornerTrimSizeSlider, el.cornerTrimSizeInput, current.gridCornerTrimSizePercent);

  el.cornerTrimPicker.querySelectorAll(".corner-trim-btn").forEach((btn) => {
    btn.classList.toggle("active", current.gridCornerTrimCorners.includes(btn.dataset.corner));
  });
  el.cornerTrimShapeOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.shapeId === current.gridCornerTrimShape);
  });
  const trimActive = current.gridCornerTrimCorners.length > 0;
  el.cornerTrimDetailGroup.hidden = !trimActive;
  el.cornerTrimSizeGroup.hidden = !trimActive;

  el.frameMarginOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.marginId) === current.gridFrameMarginCells);
  });

  renderLiveStats(current);

  const sizes = getSizesForSelection(current.colorSetOptionId, current.colorSetCustomPair);
  const colorCount = buildCombinedPalette(sizes).length;
  const font = recommendFont(current.cellSizeMm, colorCount);
  const tint = recommendTextTint(current.cellSizeMm, current.numberTintPercent);

  // Grid tint only ever controls the darkness of the grid LINES — cells always stay
  // white and the page background is its own separate choice (Black Book, above).
  el.typographyHint.textContent = `${current.cellSizeMm.toFixed(1)}mm cell → ${font.sizePt}pt ${font.weight}${
    font.isDoubleDigitRisk ? " — extreme risk zone, double-digit numbers may collide" : ""
  }. Number tint: ${tint.percentBlack}% black (cells always stay white; the page background is controlled separately by Black Book, above).`;
}

// Cheap, arithmetic-only stat readout (no quantization pass) — safe to recompute on
// every slider tick, unlike the Live Preview Gallery's actual render.
function renderLiveStats(current) {
  const trimSize = getTrimSizeById(current.trimSizeId);
  const canvasDims = computeCanvasDimensions(trimSize, current.dpi, current.bleedEnabled);
  const safeZone = computeSafeZone(trimSize, current.pageSide);
  const composition = normalizeComposition(current.globalComposition);
  const layout = computeLayout(safeZone, composition);
  const { cellSizeMm: effCellSizeMm, gridOverride } = resolveEffectiveGrid(safeZone, current.cellSizeMm, current.gridPattern, composition, current.resolutionPriority);
  const grid = gridOverride
    ? { cols: gridOverride.cols, rows: gridOverride.rows }
    : computeGridDimensions(layout.gridZone.widthIn, layout.gridZone.heightIn, effCellSizeMm, current.gridPattern);

  const trimmed = current.gridCornerTrimCorners.length > 0 || current.gridFrameMarginCells > 0
    ? countDrawnCells(grid.cols, grid.rows, current.gridCornerTrimCorners, current.gridCornerTrimShape, current.gridCornerTrimSizePercent, current.gridFrameMarginCells)
    : grid.cols * grid.rows;

  el.statGridDims.textContent = `${grid.cols} × ${grid.rows}`;
  el.statCellCount.textContent = trimmed.toLocaleString();
  el.statOutPx.textContent = `${canvasDims.widthPx} × ${canvasDims.heightPx}`;
}

// Mirrors mosaicRenderer.js's per-cell skip condition exactly (corner trim OR frame
// margin excludes a cell) so this stat always matches what actually gets drawn.
function countDrawnCells(cols, rows, corners, shape, sizePercent, marginCells) {
  let count = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (isCellInGridSilhouette(col, row, cols, rows, corners, shape, sizePercent) && !isCellInFrameMargin(col, row, cols, rows, marginCells)) count += 1;
    }
  }
  return count;
}

function syncPair(slider, input, value) {
  if (Number(slider.value) !== value) slider.value = String(value);
  if (Number(input.value) !== value) input.value = String(value);
}
