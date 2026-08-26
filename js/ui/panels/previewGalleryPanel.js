// Module: Stacked Live Preview Gallery + The 3-Second Looping Interface
import { state, subscribe } from "../../state.js?v=18";
import { getTrimSizeById } from "../../modules/canvasEngine.js?v=18";
import { computeCanvasDimensions } from "../../modules/bleedEngine.js?v=18";
import { computeSafeZone } from "../../modules/safeZoneEngine.js?v=18";
import { getSizesForSelection, buildCombinedPalette } from "../../modules/colorKeyEngine.js?v=18";
import { resolveEffectiveGrid } from "../../modules/resolutionScalingEngine.js?v=18";
import { BORDER_PRESETS } from "../../modules/borderStyleEngine.js?v=18";
import { normalizeComposition } from "../../modules/layoutCompositionEngine.js?v=18";
import { getPlaceholderSource, loadImageSource, drawSourceToCanvas, renderMosaicPreview } from "../mosaicRenderer.js?v=18";
import { createLoopController } from "../../modules/previewLoopEngine.js?v=18";
import { downloadActiveItemPng, downloadActiveItemPdf } from "../pdfExport.js?v=18";

const el = {
  printCanvas: document.getElementById("preview-canvas-print"),
  solvedCanvas: document.getElementById("preview-canvas-solved"),
  printPlaceholder: document.getElementById("preview-placeholder-print"),
  solvedPlaceholder: document.getElementById("preview-placeholder-solved"),
  loopToggle: document.getElementById("preview-loop-toggle"),
  loopState: document.getElementById("preview-loop-state"),
  downloadPrintPng: document.getElementById("download-print-png"),
  downloadPrintPdf: document.getElementById("download-print-pdf"),
  downloadSolvedPng: document.getElementById("download-solved-png"),
  downloadSolvedPdf: document.getElementById("download-solved-pdf"),
};

let printStage;
let solvedStage;
let loopController;
let cachedSourceCanvas = null;
let cachedSourceKey = null;
// Auto-regenerates on every relevant state change (upload, settings, layout edits) — no
// manual "Generate" step. A short debounce coalesces a burst of changes (e.g. dragging a
// slider) into one render instead of quantizing the grid on every intermediate tick.
let debounceTimer = null;
const DEBOUNCE_MS = 180;

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

  wireDownloadButton(el.downloadPrintPng, () => downloadActiveItemPng(state, "print"));
  wireDownloadButton(el.downloadPrintPdf, () => downloadActiveItemPdf(state, "print"));
  wireDownloadButton(el.downloadSolvedPng, () => downloadActiveItemPng(state, "solved"));
  wireDownloadButton(el.downloadSolvedPdf, () => downloadActiveItemPdf(state, "solved"));

  subscribe(scheduleRender);
  render(state);
}

function scheduleRender(current) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => render(current), DEBOUNCE_MS);
}

// Full-resolution PNG/PDF generation can take a moment for large trims at high DPI —
// disable the button and show progress so a click always gets visible feedback instead
// of looking like nothing happened (this was the user's original "can't even generate"
// complaint elsewhere in the app).
function wireDownloadButton(button, action) {
  if (!button) return;
  const originalLabel = button.textContent;
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Generating…";
    try {
      await action();
    } catch (err) {
      button.textContent = "Failed — retry";
      setTimeout(() => {
        button.textContent = originalLabel;
      }, 2000);
      return;
    } finally {
      button.disabled = false;
    }
    button.textContent = originalLabel;
  });
}

// Mirrors pdfExport.js's resolveItemEffectiveSettings so the preview of the active
// image is a true 1:1 match for what that image will actually export as.
function resolveActiveSettings(current, globalPalette) {
  const activeItem = current.batchItems.find((item) => item.id === current.activeBatchItemId);
  if (!activeItem) {
    return { gridPattern: current.gridPattern, borderWeightPt: current.borderWeightPt, gridTintPercent: current.gridTintPercent, cornerRadiusPercent: current.cornerRadiusPercent, palette: globalPalette };
  }

  const gridPattern = activeItem.settings.gridPattern ?? current.gridPattern;
  let borderWeightPt = current.borderWeightPt;
  let gridTintPercent = current.gridTintPercent;
  if (activeItem.settings.borderPreset) {
    const preset = BORDER_PRESETS[activeItem.settings.borderPreset];
    borderWeightPt = preset.borderPt;
    gridTintPercent = preset.gridTintPercent;
  }
  const cornerRadiusPercent = activeItem.settings.cornerRadiusPercent ?? current.cornerRadiusPercent;
  const palette = activeItem.settings.colorSetOverride ? buildCombinedPalette([activeItem.settings.colorSetOverride]) : globalPalette;

  return { gridPattern, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette };
}

// Renders automatically for whatever's currently active — no manual step. With nothing
// queued yet, the placeholder stays up and canvases stay hidden.
async function render(current) {
  const activeItem = current.batchItems.find((item) => item.id === current.activeBatchItemId);
  if (!activeItem) {
    el.printCanvas.hidden = true;
    el.solvedCanvas.hidden = true;
    el.printPlaceholder.hidden = false;
    el.solvedPlaceholder.hidden = false;
    return;
  }

  const sourceCanvas = await resolveSourceCanvas(current);

  const trimSize = getTrimSizeById(current.trimSizeId);
  const canvasDims = computeCanvasDimensions(trimSize, current.dpi, current.bleedEnabled);
  const safeZone = computeSafeZone(trimSize, current.pageSide);
  const sizes = getSizesForSelection(current.colorSetOptionId, current.colorSetCustomPair);
  const globalPalette = buildCombinedPalette(sizes);
  const effective = resolveActiveSettings(current, globalPalette);
  const composition = current.layoutScope === "page-specific" && activeItem.settings.composition
    ? normalizeComposition(activeItem.settings.composition)
    : normalizeComposition(current.globalComposition);
  const { cellSizeMm: effectiveCellSizeMm, gridOverride } = resolveEffectiveGrid(safeZone, current.cellSizeMm, effective.gridPattern, composition, current.resolutionPriority);

  const baseOpts = {
    trimSize,
    dpi: current.dpi,
    bleedEnabled: current.bleedEnabled,
    canvasDims,
    safeZone,
    pageSide: current.pageSide,
    composition,
    gridPattern: effective.gridPattern,
    cellSizeMm: effectiveCellSizeMm,
    gridOverride,
    borderWeightPt: effective.borderWeightPt,
    gridTintPercent: effective.gridTintPercent,
    cornerRadiusPercent: effective.cornerRadiusPercent,
    palette: effective.palette,
    sourceCanvas,
    gridCornerTrim: current.gridCornerTrim,
  };

  renderMosaicPreview(el.printCanvas, { ...baseOpts, mode: "print" });
  renderMosaicPreview(el.solvedCanvas, { ...baseOpts, mode: "solved" });

  el.printCanvas.hidden = false;
  el.solvedCanvas.hidden = false;
  el.printPlaceholder.hidden = true;
  el.solvedPlaceholder.hidden = true;
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
