import { state, setState, subscribe } from "../../state.js?v=11";
import { MAX_BATCH_SIZE, addToBatch, removeFromBatch, updateItemSettings } from "../../modules/batchEngine.js?v=11";
import { reorder, computePagination, statusBadges, FRONT_MATTER_INTERIOR_PAGES } from "../../modules/storyboardEngine.js?v=11";
import { computeSolutionPageCount } from "../../modules/solutionGenerationEngine.js?v=11";
import { GRID_PATTERNS } from "../../modules/gridPatternEngine.js?v=11";
import { BORDER_PRESETS } from "../../modules/borderStyleEngine.js?v=11";

const CORNER_RADIUS_CHOICES = [0, 25, 50, 75, 100];
const COLOR_SET_CHOICES = [12, 24, 36];

const el = {
  fileInput: document.getElementById("batch-file-input"),
  countHint: document.getElementById("batch-count-hint"),
  grid: document.getElementById("storyboard-grid"),
  perPageSelect: document.getElementById("solution-per-page-select"),
  summaryHint: document.getElementById("solution-summary-hint"),
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

  subscribe(render);
  render(state);
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
  const paginated = computePagination(current.batchItems, FRONT_MATTER_INTERIOR_PAGES);

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
    <button type="button" class="btn btn-secondary drawer-close">Done</button>
  `;

  drawer.querySelectorAll("select[data-key]").forEach((select) => {
    const key = select.dataset.key;
    const currentValue = item.settings[key];
    select.value = currentValue === null || currentValue === undefined ? "" : String(currentValue);

    select.addEventListener("change", () => {
      const raw = select.value;
      let value = raw === "" ? null : raw;
      if (key === "cornerRadiusPercent" || key === "colorSetOverride") {
        value = raw === "" ? null : Number(raw);
      }
      const batch = updateItemSettings(state.batchItems, item.id, { [key]: value });
      setState({ batchItems: batch });
    });
  });

  drawer.querySelector(".drawer-close").addEventListener("click", () => setState({ expandedSettingsItemId: null }));

  return drawer;
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
