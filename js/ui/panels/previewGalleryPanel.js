// Module: Stacked Live Preview Gallery + The 3-Second Looping Interface
import { state, subscribe } from "../../state.js";
import { getTrimSizeById } from "../../modules/canvasEngine.js";
import { computeCanvasDimensions } from "../../modules/bleedEngine.js";
import { computeSafeZone } from "../../modules/safeZoneEngine.js";
import { getSizesForSelection, buildCombinedPalette } from "../../modules/colorKeyEngine.js";
import { resolveEffectiveGrid } from "../../modules/resolutionScalingEngine.js";
import { BORDER_PRESETS } from "../../modules/borderStyleEngine.js";
import { normalizeComposition } from "../../modules/layoutCompositionEngine.js";
import { getPlaceholderSource, loadImageSource, drawSourceToCanvas, renderMosaicPreview } from "../mosaicRenderer.js";
import { createLoopController } from "../../modules/previewLoopEngine.js";
import { downloadActiveItemPng, downloadActiveItemPdf } from "../pdfExport.js";

const el = {
  printCanvas: document.getElementById("preview-canvas-print"),
  solvedCanvas: document.getElementById("preview-canvas-solved"),
  printPlaceholder: document.getElementById("preview-placeholder-print"),
  solvedPlaceholder: document.getElementById("preview-placeholder-solved"),
  loopToggle: document.getElementById("preview-loop-toggle"),
  loopState: document.getElementById("preview-loop-state"),
  generateBtn: document.getElementById("generate-preview-btn"),
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
// The heavy quantize-and-draw pass only runs on an explicit Generate click, or when the
// active storyboard image changes (a deliberate "show me this one" action) — never on a
// slider drag. This mirrors the reference tool's own workflow (stats update live, the
// actual render is gated behind its own "Generate All" button) and avoids re-quantizing
// a dense grid on every keystroke while a setting is being dragged.
let lastRenderedItemKey = undefined;
let hasGeneratedOnce = false;

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

  el.generateBtn.addEventListener("click", () => runGenerate(state));

  wireDownloadButton(el.downloadPrintPng, () => downloadActiveItemPng(state, "print"));
  wireDownloadButton(el.downloadPrintPdf, () => downloadActiveItemPdf(state, "print"));
  wireDownloadButton(el.downloadSolvedPng, () => downloadActiveItemPng(state, "solved"));
  wireDownloadButton(el.downloadSolvedPdf, () => downloadActiveItemPdf(state, "solved"));

  subscribe(onStateChange);
  onStateChange(state);
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
  const palette = activeItem.settings.colorSetOverride ? buildCombinedPalette([activeItem.settings.colorSetOverride], current.colorBrand) : globalPalette;

  return { gridPattern, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette };
}

// Fires on every state change but is cheap: it only decides WHETHER to (re)generate,
// it never draws. A settings tweak (slider, dropdown, layout edit) leaves the last
// generated result on screen untouched — only picking a different storyboard image
// triggers an automatic regenerate, since that's a navigation action, not a tweak.
// With nothing queued yet, Generate stays disabled and the placeholder stays put —
// no auto-render of the decorative gradient stand-in on a cold page load.
function onStateChange(current) {
  const activeItem = current.batchItems.find((item) => item.id === current.activeBatchItemId);
  el.generateBtn.disabled = !activeItem;
  if (!activeItem) return;

  const key = activeItem.objectUrl;
  if (key === lastRenderedItemKey) return;
  lastRenderedItemKey = key;
  runGenerate(current);
}

async function runGenerate(current) {
  el.generateBtn.disabled = true;
  el.generateBtn.textContent = "⏳ Generating…";

  try {
    const sourceCanvas = await resolveSourceCanvas(current);

    const trimSize = getTrimSizeById(current.trimSizeId);
    const canvasDims = computeCanvasDimensions(trimSize, current.dpi, current.bleedEnabled);
    const safeZone = computeSafeZone(trimSize, current.pageSide);
    const sizes = getSizesForSelection(current.colorSetOptionId, current.colorSetCustomPair);
    const globalPalette = buildCombinedPalette(sizes, current.colorBrand);
    const effective = resolveActiveSettings(current, globalPalette);
    const activeItem = current.batchItems.find((item) => item.id === current.activeBatchItemId);
    const composition = current.layoutScope === "page-specific" && activeItem?.settings.composition
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
    };

    // Yield a frame so the "Generating…" label actually paints before the (possibly
    // dense) quantize-and-draw pass blocks the main thread.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    renderMosaicPreview(el.printCanvas, { ...baseOpts, mode: "print" });
    renderMosaicPreview(el.solvedCanvas, { ...baseOpts, mode: "solved" });

    hasGeneratedOnce = true;
    el.printCanvas.hidden = false;
    el.solvedCanvas.hidden = false;
    el.printPlaceholder.hidden = true;
    el.solvedPlaceholder.hidden = true;
  } finally {
    el.generateBtn.disabled = !state.batchItems.some((item) => item.id === state.activeBatchItemId);
    el.generateBtn.textContent = hasGeneratedOnce ? "✨ Regenerate Preview" : "✨ Generate Preview";
  }
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
