import { state, setState, subscribe } from "../../state.js?v=42";
import { MAX_BATCH_SIZE, addToBatch, removeFromBatch, updateItemSettings } from "../../modules/batchEngine.js?v=42";
import { reorder, computePagination, statusBadges } from "../../modules/storyboardEngine.js?v=42";
import { computeSolutionPageCount } from "../../modules/solutionGenerationEngine.js?v=42";
import { GRID_PATTERNS, CORNER_TRIM_CORNERS, CORNER_TRIM_SHAPES, CORNER_TRIM_SIZE_MIN_PERCENT, CORNER_TRIM_SIZE_MAX_PERCENT } from "../../modules/gridPatternEngine.js?v=42";
import { BORDER_PRESETS } from "../../modules/borderStyleEngine.js?v=42";
import { computeFrontMatterPageCount } from "../../modules/frontBackMatterEngine.js?v=42";
import { SOURCE_SMOOTHING_OPTIONS } from "../../modules/sourceSmoothingEngine.js?v=42";
import { POSTERIZE_LEVEL_MIN, POSTERIZE_LEVEL_MAX } from "../../modules/posterizeEngine.js?v=42";

const CORNER_RADIUS_CHOICES = [0, 25, 50, 75, 100];
const COLOR_SET_CHOICES = [12, 24, 36];

// Bulk-apply presets for Cell Shape Sequence: assigns every queued image a gridPattern
// override by cycling this list in storyboard order (index % pattern.length) — "one
// image square, then honeycomb, then square again" is exactly index % 2 on
// ["square", "hexagon"]; the 3-shape rotation is the same idea with one more entry.
const CELL_SHAPE_SEQUENCES = [
  { id: "square-honeycomb", label: "Square ↔ Honeycomb", note: "Alternates every image: square, honeycomb, square, honeycomb…", pattern: ["square", "hexagon"] },
  { id: "square-honeycomb-diamond", label: "Square → Honeycomb → Diamond", note: "Rotates every image through all three, then repeats.", pattern: ["square", "hexagon", "diamond"] },
];

const el = {
  fileInput: document.getElementById("batch-file-input"),
  countHint: document.getElementById("batch-count-hint"),
  grid: document.getElementById("storyboard-grid"),
  perPageSelect: document.getElementById("solution-per-page-select"),
  summaryHint: document.getElementById("solution-summary-hint"),
  cellShapeSequenceOptions: document.getElementById("cell-shape-sequence-options"),
  randomizeColorSetsBtn: document.getElementById("randomize-color-sets-btn"),
  sourceSmoothingOptions: document.getElementById("source-smoothing-options"),
  posterizeSlider: document.getElementById("posterize-slider"),
  posterizeInput: document.getElementById("posterize-input"),
  posterizeHint: document.getElementById("posterize-hint"),
};

// Manual mouse-based drag (not native HTML5 draggable, and not Pointer Events +
// setPointerCapture either): native drag-and-drop needs the browser to open its own
// internal drag session from a real OS gesture, which synthetic/automated input can't
// reliably trigger; pointer capture, in turn, was observed emitting a spurious
// pointercancel under CDP-simulated input, ending the gesture right after it starts.
// Plain mousemove/mouseup listened on `document` sidesteps both — it tracks the whole
// gesture regardless of what element the cursor is over, and the reorder only commits
// once on release, so the mid-drag DOM never gets rebuilt out from under it.
let dragState = null; // { fromId, hoverId }

export function initBatchStoryboardPanel() {
  el.fileInput.addEventListener("change", handleFileInput);
  el.perPageSelect.addEventListener("change", () => setState({ solutionThumbsPerPage: Number(el.perPageSelect.value) }));
  renderCellShapeSequenceOptions();
  renderSourceSmoothingOptions();
  bindPosterizeLevels();
  el.randomizeColorSetsBtn.addEventListener("click", randomizeColorSetsForEveryImage);

  subscribe(render);
  render(state);
}

function bindPosterizeLevels() {
  el.posterizeSlider.addEventListener("input", () => setState({ posterizeLevels: Number(el.posterizeSlider.value) }));
  el.posterizeInput.addEventListener("change", () => setState({ posterizeLevels: clampPosterizeLevels(Number(el.posterizeInput.value)) }));
}

function clampPosterizeLevels(n) {
  if (!Number.isFinite(n) || n < POSTERIZE_LEVEL_MIN) return 0;
  return Math.min(POSTERIZE_LEVEL_MAX, n);
}

function renderCellShapeSequenceOptions() {
  el.cellShapeSequenceOptions.innerHTML = "";
  CELL_SHAPE_SEQUENCES.forEach((seq) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.innerHTML = `<strong>${seq.label}</strong><span class="size-note">${seq.note}</span>`;
    btn.addEventListener("click", () => applyCellShapeSequence(seq));
    el.cellShapeSequenceOptions.appendChild(btn);
  });
}

function renderSourceSmoothingOptions() {
  el.sourceSmoothingOptions.innerHTML = "";
  SOURCE_SMOOTHING_OPTIONS.forEach((option) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.smoothingId = option.id;
    btn.innerHTML = `<strong>${option.label}</strong><span class="size-note">${option.note}</span>`;
    btn.addEventListener("click", () => setState({ sourceSmoothing: option.id }));
    el.sourceSmoothingOptions.appendChild(btn);
  });
}

// A one-shot bulk apply, not a persisted "mode" — same pattern as the Border Style
// presets (Seamless Realism / Midnight Marker): it sets each image's own gridPattern
// override right now, in current storyboard order, and every image stays individually
// adjustable afterward via its own ⚙ drawer.
function applyCellShapeSequence(seq) {
  const batch = state.batchItems.map((item, index) => ({
    ...item,
    settings: { ...item.settings, gridPattern: seq.pattern[index % seq.pattern.length] },
  }));
  setState({ batchItems: batch });
}

function randomizeColorSetsForEveryImage() {
  const batch = state.batchItems.map((item) => ({
    ...item,
    settings: { ...item.settings, colorSetOverride: COLOR_SET_CHOICES[Math.floor(Math.random() * COLOR_SET_CHOICES.length)] },
  }));
  setState({ batchItems: batch });
}

function handleFileInput() {
  const { accepted, rejectedCount, batch } = addToBatch(state.batchItems, el.fileInput.files);
  setState({ batchItems: batch, activeBatchItemId: state.activeBatchItemId ?? accepted[0]?.id ?? null });
  el.fileInput.value = "";

  if (rejectedCount > 0) {
    el.countHint.textContent = `${rejectedCount} file(s) rejected — the ${MAX_BATCH_SIZE}-image batch limit is full.`;
  }
}

function render(current) {
  const paginated = computePagination(current.batchItems, computeFrontMatterPageCount(current.disabledFrontBackMatterPages, current.batchItems.length > 0));

  el.grid.innerHTML = "";
  if (paginated.length === 0) {
    el.grid.innerHTML = '<p class="storyboard-empty">No artwork queued yet. Upload images to build the storyboard.</p>';
  }

  paginated.forEach((item, index) => {
    el.grid.appendChild(buildItemCell(item, index, current));
    if (current.expandedSettingsItemId === item.id) {
      el.grid.appendChild(buildSettingsDrawer(item, current));
    }
  });

  el.sourceSmoothingOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.smoothingId === current.sourceSmoothing);
  });

  if (Number(el.posterizeSlider.value) !== current.posterizeLevels) el.posterizeSlider.value = String(current.posterizeLevels);
  if (Number(el.posterizeInput.value) !== current.posterizeLevels) el.posterizeInput.value = String(current.posterizeLevels);
  el.posterizeHint.textContent =
    current.posterizeLevels === 0
      ? "0 = Off. Collapses each color channel to a small number of flat steps before quantization — turns a smooth photo gradient into clean bands, the same effect as a Posterize filter in Photoshop/GIMP. Runs after Source Smoothing above. Lower = bolder/flatter, higher = subtler."
      : `${current.posterizeLevels} levels per channel — ${current.posterizeLevels <= 3 ? "bold, flat" : current.posterizeLevels <= 5 ? "moderate" : "subtle"} banding. Runs after Source Smoothing above.`;

  el.countHint.textContent = `${current.batchItems.length} / ${MAX_BATCH_SIZE} images queued.`;
  el.perPageSelect.value = String(current.solutionThumbsPerPage);

  const pageCount = computeSolutionPageCount(current.batchItems.length, current.solutionThumbsPerPage);
  el.summaryHint.textContent =
    current.batchItems.length === 0
      ? "Solutions generate automatically once artwork is queued."
      : `${pageCount} back-matter solution page(s) at ${current.solutionThumbsPerPage} thumbnails each — auto-synced to storyboard order.`;
}

function buildItemCell(item, index, current) {
  const cell = document.createElement("div");
  cell.className = "storyboard-item";
  cell.dataset.itemId = item.id;

  const badges = statusBadges(item, { gridPattern: current.gridPattern, borderPreset: null });

  cell.innerHTML = `
    <img src="${item.objectUrl}" alt="${item.name}" />
    <span class="page-badge">p.${item.puzzlePage}</span>
    <button type="button" class="remove-btn" title="Remove">×</button>
    <button type="button" class="settings-btn" title="Per-image overrides">⚙</button>
    <span class="shape-badge" title="${badges.join(" · ")}">${badges.join(" · ")}</span>
  `;

  const removeBtn = cell.querySelector(".remove-btn");
  removeBtn.addEventListener("mousedown", (e) => e.stopPropagation());
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const batch = removeFromBatch(state.batchItems, item.id);
    setState({ batchItems: batch, activeBatchItemId: batch[0]?.id ?? null });
  });

  const settingsBtn = cell.querySelector(".settings-btn");
  settingsBtn.addEventListener("mousedown", (e) => e.stopPropagation());
  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setState({ expandedSettingsItemId: current.expandedSettingsItemId === item.id ? null : item.id });
  });

  cell.addEventListener("click", () => setState({ activeBatchItemId: item.id }));
  cell.addEventListener("mousedown", (e) => startDrag(e, cell, item.id));

  if (item.id === current.activeBatchItemId) cell.style.outline = "2px solid var(--accent)";
  if (item.id === current.expandedSettingsItemId) cell.classList.add("settings-open");

  return cell;
}

function buildSettingsDrawer(item, current) {
  const drawer = document.createElement("div");
  drawer.className = "item-settings-drawer";

  const backgroundAssets = current.assetGallery["back-page-background"] ?? [];

  drawer.innerHTML = `
    <div class="drawer-field">
      <label>Grid Pattern</label>
      <select data-key="gridPattern">
        <option value="">Inherit (${current.gridPattern})</option>
        ${GRID_PATTERNS.map((p) => `<option value="${p.id}">${p.label}</option>`).join("")}
      </select>
    </div>
    <div class="drawer-field">
      <label>Border Preset</label>
      <select data-key="borderPreset">
        <option value="">Inherit (custom sliders)</option>
        ${Object.entries(BORDER_PRESETS).map(([id, preset]) => `<option value="${id}">${preset.label}</option>`).join("")}
      </select>
    </div>
    <div class="drawer-field">
      <label>Corner Radius</label>
      <select data-key="cornerRadiusPercent">
        <option value="">Inherit (${current.cornerRadiusPercent}%)</option>
        ${CORNER_RADIUS_CHOICES.map((v) => `<option value="${v}">${v}%</option>`).join("")}
      </select>
    </div>
    <div class="drawer-field">
      <label>Color Set</label>
      <select data-key="colorSetOverride">
        <option value="">Inherit (book default)</option>
        ${COLOR_SET_CHOICES.map((v) => `<option value="${v}">${v}-Color</option>`).join("")}
      </select>
    </div>
    <div class="drawer-field">
      <label>Back Page Background</label>
      <select data-key="backBackgroundAssetId">
        <option value="">Inherit (global default)</option>
        ${backgroundAssets.map((a) => `<option value="${a.id}">${a.name}</option>`).join("")}
      </select>
    </div>
    <div class="drawer-field">
      <label>Source Smoothing</label>
      <select data-key="sourceSmoothing">
        <option value="">Inherit (${SOURCE_SMOOTHING_OPTIONS.find((o) => o.id === current.sourceSmoothing)?.label ?? "Off"})</option>
        ${SOURCE_SMOOTHING_OPTIONS.map((o) => `<option value="${o.id}">${o.label}</option>`).join("")}
      </select>
    </div>
    <div class="drawer-field">
      <label>Posterize Levels</label>
      <select data-key="posterizeLevels">
        <option value="">Inherit (${current.posterizeLevels === 0 ? "Off" : `${current.posterizeLevels} Levels`})</option>
        <option value="0">Off</option>
        ${Array.from({ length: POSTERIZE_LEVEL_MAX - POSTERIZE_LEVEL_MIN + 1 }, (_, i) => i + POSTERIZE_LEVEL_MIN)
          .map((n) => `<option value="${n}">${n} Levels</option>`)
          .join("")}
      </select>
    </div>
    <div class="drawer-field corner-trim-drawer-field">
      <label>Grid Corner Trim</label>
      <label class="drawer-toggle-label">
        <input type="checkbox" data-role="corner-trim-override-toggle" />
        Override for this image
      </label>
      <div class="corner-trim-drawer-detail" data-role="corner-trim-detail" hidden>
        <div class="corner-trim-picker corner-trim-picker-mini" data-role="item-corner-picker"></div>
        <select data-role="item-corner-shape">
          ${CORNER_TRIM_SHAPES.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}
        </select>
        <div class="dpi-control">
          <input type="range" data-role="item-corner-size-slider" min="${CORNER_TRIM_SIZE_MIN_PERCENT}" max="${CORNER_TRIM_SIZE_MAX_PERCENT}" step="1" />
          <input type="number" data-role="item-corner-size-input" min="${CORNER_TRIM_SIZE_MIN_PERCENT}" max="${CORNER_TRIM_SIZE_MAX_PERCENT}" step="1" />
        </div>
      </div>
    </div>
    <button type="button" class="btn btn-secondary drawer-close">Done</button>
  `;

  drawer.querySelectorAll("select[data-key]").forEach((select) => {
    const key = select.dataset.key;
    const currentValue = item.settings[key];
    select.value = currentValue === null || currentValue === undefined ? "" : String(currentValue);

    select.addEventListener("change", () => {
      const raw = select.value;
      let value = raw === "" ? null : raw;
      if (key === "cornerRadiusPercent" || key === "colorSetOverride" || key === "posterizeLevels") {
        value = raw === "" ? null : Number(raw);
      }
      const batch = updateItemSettings(state.batchItems, item.id, { [key]: value });
      setState({ batchItems: batch });
    });
  });

  wireCornerTrimDrawerField(drawer, item, current);

  drawer.querySelector(".drawer-close").addEventListener("click", () => setState({ expandedSettingsItemId: null }));

  return drawer;
}

// The corner-trim override is 3 related fields at once (which corners, shape, size),
// gated behind one "Override for this image" checkbox — distinct enough from the
// generic single-select drawer fields above to wire up on its own. Unchecking always
// resets all three back to null (inherit the book-wide default), never leaves a stale
// half-set override behind.
function wireCornerTrimDrawerField(drawer, item, current) {
  const toggle = drawer.querySelector('[data-role="corner-trim-override-toggle"]');
  const detail = drawer.querySelector('[data-role="corner-trim-detail"]');
  const picker = drawer.querySelector('[data-role="item-corner-picker"]');
  const shapeSelect = drawer.querySelector('[data-role="item-corner-shape"]');
  const sizeSlider = drawer.querySelector('[data-role="item-corner-size-slider"]');
  const sizeInput = drawer.querySelector('[data-role="item-corner-size-input"]');

  const overriding = item.settings.cornerTrimCorners !== null;
  toggle.checked = overriding;
  detail.hidden = !overriding;

  const activeCorners = item.settings.cornerTrimCorners ?? [];
  const activeShape = item.settings.cornerTrimShape ?? current.gridCornerTrimShape;
  const activeSize = item.settings.cornerTrimSizePercent ?? current.gridCornerTrimSizePercent;

  picker.innerHTML = "";
  CORNER_TRIM_CORNERS.forEach((corner) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "corner-trim-btn";
    btn.dataset.corner = corner.id;
    btn.title = corner.label;
    btn.textContent = corner.glyph;
    btn.classList.toggle("active", activeCorners.includes(corner.id));
    btn.addEventListener("click", () => {
      const next = activeCorners.includes(corner.id) ? activeCorners.filter((id) => id !== corner.id) : [...activeCorners, corner.id];
      const batch = updateItemSettings(state.batchItems, item.id, { cornerTrimCorners: next });
      setState({ batchItems: batch });
    });
    picker.appendChild(btn);
  });

  shapeSelect.value = activeShape;
  shapeSelect.addEventListener("change", () => {
    const batch = updateItemSettings(state.batchItems, item.id, { cornerTrimShape: shapeSelect.value });
    setState({ batchItems: batch });
  });

  sizeSlider.value = String(activeSize);
  sizeInput.value = String(activeSize);
  const commitSize = (pct) => {
    const clamped = Math.min(CORNER_TRIM_SIZE_MAX_PERCENT, Math.max(CORNER_TRIM_SIZE_MIN_PERCENT, Number.isFinite(pct) ? pct : activeSize));
    const batch = updateItemSettings(state.batchItems, item.id, { cornerTrimSizePercent: clamped });
    setState({ batchItems: batch });
  };
  sizeSlider.addEventListener("input", () => commitSize(Number(sizeSlider.value)));
  sizeInput.addEventListener("change", () => commitSize(Number(sizeInput.value)));

  toggle.addEventListener("change", () => {
    const batch = updateItemSettings(state.batchItems, item.id, {
      cornerTrimCorners: toggle.checked ? [] : null,
      cornerTrimShape: toggle.checked ? current.gridCornerTrimShape : null,
      cornerTrimSizePercent: toggle.checked ? current.gridCornerTrimSizePercent : null,
    });
    setState({ batchItems: batch });
  });
}

function startDrag(e, cell, itemId) {
  if (e.button !== 0) return;
  e.preventDefault(); // stop native text/image drag or selection from hijacking the gesture
  dragState = { fromId: itemId, hoverId: null };
  cell.classList.add("dragging");

  document.addEventListener("mousemove", handleDragMove);
  document.addEventListener("mouseup", finishDrag, { once: true });
}

function handleDragMove(e) {
  if (!dragState) return;

  const hovered = document.elementFromPoint(e.clientX, e.clientY)?.closest(".storyboard-item");
  const hoverId = hovered && hovered.dataset.itemId !== dragState.fromId ? hovered.dataset.itemId : null;

  if (hoverId !== dragState.hoverId) {
    el.grid.querySelectorAll(".storyboard-item.drag-over").forEach((n) => n.classList.remove("drag-over"));
    if (hovered && hoverId) hovered.classList.add("drag-over");
    dragState.hoverId = hoverId;
  }
}

function finishDrag() {
  document.removeEventListener("mousemove", handleDragMove);
  el.grid.querySelectorAll(".storyboard-item.dragging, .storyboard-item.drag-over").forEach((n) => n.classList.remove("dragging", "drag-over"));

  const { fromId, hoverId } = dragState ?? {};
  dragState = null;
  if (!hoverId || hoverId === fromId) return;

  const fromIndex = state.batchItems.findIndex((item) => item.id === fromId);
  const toIndex = state.batchItems.findIndex((item) => item.id === hoverId);
  if (fromIndex === -1 || toIndex === -1) return;

  setState({ batchItems: reorder(state.batchItems, fromIndex, toIndex) });
}
