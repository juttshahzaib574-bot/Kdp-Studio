// Module: Stacked Live Preview Gallery + The 3-Second Looping Interface
import { state, subscribe } from "../../state.js";
import { getTrimSizeById } from "../../modules/canvasEngine.js";
import { computeCanvasDimensions } from "../../modules/bleedEngine.js";
import { computeSafeZone } from "../../modules/safeZoneEngine.js";
import { getSizesForSelection, buildCombinedPalette } from "../../modules/colorKeyEngine.js";
import { getPlaceholderSource, loadImageSource, drawSourceToCanvas, renderMosaicPreview } from "../mosaicRenderer.js";
import { createLoopController } from "../../modules/previewLoopEngine.js";

const el = {
  printCanvas: document.getElementById("preview-canvas-print"),
  solvedCanvas: document.getElementById("preview-canvas-solved"),
  loopToggle: document.getElementById("preview-loop-toggle"),
  loopState: document.getElementById("preview-loop-state"),
};

let printStage;
let solvedStage;
let loopController;
let cachedSourceCanvas = null;
let cachedSourceKey = null;

export function initPreviewGalleryPanel() {
  printStage = el.printCanvas.closest(".canvas-stage");
  solvedStage = el.solvedCanvas.closest(".canvas-stage");

  loopController = createLoopController({
    intervalMs: 3000,
    onChange: (loopStateValue) => {
      printStage.classList.toggle("emphasized", loopStateValue === "print");
      solvedStage.classList.toggle("emphasized", loopStateValue === "solved");
      el.loopState.textContent = loopStateValue === "print" ? "Emphasizing: Print Asset" : "Emphasizing: Solved State";
    },
  });

  el.loopToggle.addEventListener("change", () => {
    if (el.loopToggle.checked) {
      loopController.start();
    } else {
      loopController.stop();
      printStage.classList.remove("emphasized");
      solvedStage.classList.remove("emphasized");
      el.loopState.textContent = "";
    }
  });

  subscribe(render);
  render(state);
}

async function render(current) {
  const sourceCanvas = await resolveSourceCanvas(current);

  const trimSize = getTrimSizeById(current.trimSizeId);
  const canvasDims = computeCanvasDimensions(trimSize, current.dpi, current.bleedEnabled);
  const safeZone = computeSafeZone(trimSize, current.pageSide);
  const sizes = getSizesForSelection(current.colorSetOptionId, current.colorSetCustomPair);
  const palette = buildCombinedPalette(sizes, current.colorBrand);

  const baseOpts = {
    trimSize,
    dpi: current.dpi,
    bleedEnabled: current.bleedEnabled,
    canvasDims,
    safeZone,
    pageSide: current.pageSide,
    gridPattern: current.gridPattern,
    cellSizeMm: current.cellSizeMm,
    borderWeightPt: current.borderWeightPt,
    gridTintPercent: current.gridTintPercent,
    cornerRadiusPercent: current.cornerRadiusPercent,
    palette,
    sourceCanvas,
  };

  renderMosaicPreview(el.printCanvas, { ...baseOpts, mode: "print" });
  renderMosaicPreview(el.solvedCanvas, { ...baseOpts, mode: "solved" });
}

async function resolveSourceCanvas(current) {
  const activeItem = current.batchItems.find((item) => item.id === current.activeBatchItemId);
  const key = activeItem ? activeItem.objectUrl : "placeholder";

  if (cachedSourceCanvas && cachedSourceKey === key) return cachedSourceCanvas;

  if (!activeItem) {
    cachedSourceCanvas = getPlaceholderSource();
    cachedSourceKey = key;
    return cachedSourceCanvas;
  }

  try {
    const img = await loadImageSource(activeItem.objectUrl);
    cachedSourceCanvas = drawSourceToCanvas(img);
    cachedSourceKey = key;
  } catch {
    cachedSourceCanvas = getPlaceholderSource();
    cachedSourceKey = "placeholder";
  }

  return cachedSourceCanvas;
}
