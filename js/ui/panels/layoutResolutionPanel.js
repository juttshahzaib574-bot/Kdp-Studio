import { state, setState, subscribe } from "../../state.js";
import { LAYOUT_MODES } from "../../modules/layoutEngine.js";
import { SCALING_PRIORITIES, isAdaptiveScalingUnlocked, computeAdaptiveGrid } from "../../modules/resolutionScalingEngine.js";
import { getTrimSizeById } from "../../modules/canvasEngine.js";
import { computeSafeZone } from "../../modules/safeZoneEngine.js";
import { computeGridDimensions } from "../../modules/gridPatternEngine.js";
import { getSizesForSelection, buildCombinedPalette } from "../../modules/colorKeyEngine.js";
import { recommendFont } from "../../modules/typographyEngine.js";

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
    btn.addEventListener("click", () => setState({ layoutMode: mode.id }));
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
  el.layoutOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.modeId === current.layoutMode);
  });

  const unlocked = isAdaptiveScalingUnlocked(current.layoutMode);
  el.resolutionOptions.querySelectorAll(".option-item").forEach((btn) => {
    btn.classList.toggle("active", unlocked && btn.dataset.priorityId === current.resolutionPriority);
    btn.disabled = !unlocked;
  });
  el.lockNote.textContent = unlocked ? "(unlocked)" : "(unlocks in Expanded Canvas Layout)";

  if (!unlocked) {
    el.readout.textContent = "Switch to Expanded Canvas Layout to migrate the color key off-page and unlock cell scaling.";
    return;
  }

  const trimSize = getTrimSizeById(current.trimSizeId);
  const safeZone = computeSafeZone(trimSize, current.pageSide);
  const baseGrid = computeGridDimensions(safeZone.widthIn, safeZone.heightIn, current.cellSizeMm, current.gridPattern);
  baseGrid.widthIn = safeZone.widthIn;
  baseGrid.heightIn = safeZone.heightIn;

  // Expanded layout frees the key's footprint back into the grid — approximated here
  // as an extra 20% of safe-zone height becoming available to the puzzle canvas.
  const extraHeightIn = safeZone.heightIn * 0.2;
  const adaptiveGrid = computeAdaptiveGrid(baseGrid, 0, extraHeightIn, current.gridPattern, current.resolutionPriority);

  const sizes = getSizesForSelection(current.colorSetOptionId, current.colorSetCustomPair);
  const colorCount = buildCombinedPalette(sizes, current.colorBrand).length;
  const font = recommendFont(adaptiveGrid.cellSizeMm, colorCount);

  el.readout.textContent = `${adaptiveGrid.cols}×${adaptiveGrid.rows} grid @ ${adaptiveGrid.cellSizeMm.toFixed(2)}mm cells → ${font.sizePt}pt ${font.weight} (recalibrated automatically).`;
}
