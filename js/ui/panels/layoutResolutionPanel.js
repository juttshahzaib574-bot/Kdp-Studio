import { state, setState, subscribe } from "../../state.js?v=4";
import { LAYOUT_MODES } from "../../modules/layoutEngine.js?v=4";
import { SCALING_PRIORITIES, isAdaptiveScalingUnlocked, resolveEffectiveGrid } from "../../modules/resolutionScalingEngine.js?v=4";
import { getTrimSizeById } from "../../modules/canvasEngine.js?v=4";
import { computeSafeZone } from "../../modules/safeZoneEngine.js?v=4";
import { computeGridDimensions } from "../../modules/gridPatternEngine.js?v=4";
import { getSizesForSelection, buildCombinedPalette } from "../../modules/colorKeyEngine.js?v=4";
import { recommendFont } from "../../modules/typographyEngine.js?v=4";
import { withColorKeyTarget, normalizeComposition, layoutModeFromComposition, isColorKeyOffloaded } from "../../modules/layoutCompositionEngine.js?v=4";

const el = {
  layoutOptions: document.getElementById("layout-mode-options"),
  resolutionOptions: document.getElementById("resolution-priority-options"),
  lockNote: document.getElementById("adaptive-lock-note"),
  readout: document.getElementById("adaptive-readout"),
};

export function initLayoutResolutionPanel() {
  renderLayoutOptions();
  renderResolutionOptions();

  subscribe(render);
  render(state);
}

function renderLayoutOptions() {
  el.layoutOptions.innerHTML = "";
  LAYOUT_MODES.forEach((mode) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.modeId = mode.id;
    btn.innerHTML = `<strong>${mode.label}</strong><span class="size-note">${mode.note}</span>`;
    // The Unified/Expanded quick toggle is a shortcut for the color key's placement in
    // the composition (grid bottom strip vs. offloaded to the blank page). It writes both
    // layoutMode (mirror) and the global composition, which the Layout Composer refines.
    btn.addEventListener("click", () =>
      setState({ layoutMode: mode.id, globalComposition: withColorKeyTarget(state.globalComposition, mode.id) })
    );
    el.layoutOptions.appendChild(btn);
  });
}

function renderResolutionOptions() {
  el.resolutionOptions.innerHTML = "";
  SCALING_PRIORITIES.forEach((priority) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-item";
    btn.dataset.priorityId = priority.id;
    btn.innerHTML = `<strong>${priority.label}</strong><span class="size-note">${priority.note}</span>`;
    btn.addEventListener("click", () => setState({ resolutionPriority: priority.id }));
    el.resolutionOptions.appendChild(btn);
  });
}

function render(current) {
  const composition = normalizeComposition(current.globalComposition);
  const effectiveMode = layoutModeFromComposition(composition);
  el.layoutOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.modeId === effectiveMode);
  });

  const unlocked = isColorKeyOffloaded(composition);
  el.resolutionOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", unlocked && btn.dataset.priorityId === current.resolutionPriority);
    btn.disabled = !unlocked;
  });
  el.lockNote.textContent = unlocked ? "(unlocked — applied to every exported puzzle page)" : "(unlocks when the color key is off the grid page)";

  if (!unlocked) {
    el.readout.textContent = "Move the color key off the puzzle page (Expanded Canvas Layout, or via the Layout Composer) to unlock cell scaling. While it sits on the grid the key is embedded directly on the puzzle page.";
    return;
  }

  const trimSize = getTrimSizeById(current.trimSizeId);
  const safeZone = computeSafeZone(trimSize, current.pageSide);
  const { cellSizeMm: effectiveCellSizeMm, gridOverride } = resolveEffectiveGrid(safeZone, current.cellSizeMm, current.gridPattern, composition, current.resolutionPriority);
  const grid = gridOverride ?? computeGridDimensions(safeZone.widthIn, safeZone.heightIn, effectiveCellSizeMm, current.gridPattern);

  const sizes = getSizesForSelection(current.colorSetOptionId, current.colorSetCustomPair);
  const colorCount = buildCombinedPalette(sizes, current.colorBrand).length;
  const font = recommendFont(effectiveCellSizeMm, colorCount);

  el.readout.textContent = `${grid.cols}×${grid.rows} grid @ ${effectiveCellSizeMm.toFixed(2)}mm cells (base ${current.cellSizeMm.toFixed(1)}mm) → ${font.sizePt}pt ${font.weight}. This is exactly what the exported PDF will render.`;
}
