// Module: Stacked Live Preview Gallery + Live Preview Carousel
import { state, setState, subscribe } from "../../state.js?v=43";
import { getTrimSizeById } from "../../modules/canvasEngine.js?v=43";
import { computeCanvasDimensions } from "../../modules/bleedEngine.js?v=43";
import { computeSafeZone } from "../../modules/safeZoneEngine.js?v=43";
import { getSizesForSelection, buildCombinedPalette } from "../../modules/colorKeyEngine.js?v=43";
import { resolveEffectiveGrid } from "../../modules/resolutionScalingEngine.js?v=43";
import { BORDER_PRESETS } from "../../modules/borderStyleEngine.js?v=43";
import { normalizeComposition } from "../../modules/layoutCompositionEngine.js?v=43";
import { getPlaceholderSource, loadImageSource, drawSourceToCanvas, renderMosaicPreview } from "../mosaicRenderer.js?v=43";
import { createCarouselController } from "../../modules/previewLoopEngine.js?v=43";
import { downloadActiveItemPng, downloadActiveItemPdf } from "../pdfExport.js?v=43";
import { isContentPageBlack } from "../../modules/bookThemeEngine.js?v=43";
import { applySourceSmoothing } from "../../modules/sourceSmoothingEngine.js?v=43";
import { applyPosterize } from "../../modules/posterizeEngine.js?v=43";

const el = {
  printCanvas: document.getElementById("preview-canvas-print"),
  solvedCanvas: document.getElementById("preview-canvas-solved"),
  printPlaceholder: document.getElementById("preview-placeholder-print"),
  solvedPlaceholder: document.getElementById("preview-placeholder-solved"),
  loopToggle: document.getElementById("preview-loop-toggle"),
  carouselDot: document.getElementById("preview-carousel-dot"),
  prevBtn: document.getElementById("preview-prev-btn"),
  nextBtn: document.getElementById("preview-next-btn"),
  carouselLabel: document.getElementById("preview-carousel-label"),
  downloadPrintPng: document.getElementById("download-print-png"),
  downloadPrintPdf: document.getElementById("download-print-pdf"),
  downloadSolvedPng: document.getElementById("download-solved-png"),
  downloadSolvedPdf: document.getElementById("download-solved-pdf"),
  sourcePreviewOriginal: document.getElementById("source-preview-original"),
  sourcePreviewOriginalPlaceholder: document.getElementById("source-preview-original-placeholder"),
  sourcePreviewProcessed: document.getElementById("source-preview-processed"),
  sourcePreviewProcessedPlaceholder: document.getElementById("source-preview-processed-placeholder"),
  sourcePreviewProcessedCaption: document.getElementById("source-preview-processed-caption"),
  nativeGridWarning: document.getElementById("native-grid-warning"),
};

let carouselController;
let cachedRawCanvas = null;
let cachedRawKey = null;
// Auto-regenerates on every relevant state change (upload, settings, layout edits) — no
// manual "Generate" step. A short debounce coalesces a burst of changes (e.g. dragging a
// slider) into one render instead of quantizing the grid on every intermediate tick.
let debounceTimer = null;
const DEBOUNCE_MS = 180;

export function initPreviewGalleryPanel() {
  carouselController = createCarouselController({
    intervalMs: 3000,
    onTick: () => advanceActiveItem(1),
  });

  el.loopToggle.addEventListener("change", () => {
    setState({ previewLoopEnabled: el.loopToggle.checked });
  });

  el.prevBtn.addEventListener("click", () => {
    advanceActiveItem(-1);
    if (state.previewLoopEnabled) carouselController.restart();
  });
  el.nextBtn.addEventListener("click", () => {
    advanceActiveItem(1);
    if (state.previewLoopEnabled) carouselController.restart();
  });

  wireDownloadButton(el.downloadPrintPng, () => downloadActiveItemPng(state, "print"));
  wireDownloadButton(el.downloadPrintPdf, () => downloadActiveItemPdf(state, "print"));
  wireDownloadButton(el.downloadSolvedPng, () => downloadActiveItemPng(state, "solved"));
  wireDownloadButton(el.downloadSolvedPdf, () => downloadActiveItemPdf(state, "solved"));

  el.loopToggle.checked = state.previewLoopEnabled;

  subscribe((current) => {
    syncCarouselTimer(current);
    scheduleRender(current);
  });
  syncCarouselTimer(state);
  render(state);
}

// Moves activeBatchItemId forward/back through the queued batch, wrapping around —
// mirrors the reference carousel's showPreview(curPrev ± 1) modulo-clamp.
function advanceActiveItem(step) {
  const items = state.batchItems;
  if (items.length === 0) return;
  const idx = items.findIndex((item) => item.id === state.activeBatchItemId);
  const nextIndex = (((idx === -1 ? 0 : idx) + step) % items.length + items.length) % items.length;
  setState({ activeBatchItemId: items[nextIndex].id });
}

// Auto-advance only ever runs with the toggle on AND more than one puzzle queued —
// matching the reference's `readyList().length>1` gate for startLoop().
function syncCarouselTimer(current) {
  const shouldRun = current.previewLoopEnabled && current.batchItems.length > 1;
  if (shouldRun) carouselController.start();
  else carouselController.stop();
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
    return {
      gridPattern: current.gridPattern,
      borderWeightPt: current.borderWeightPt,
      gridTintPercent: current.gridTintPercent,
      cornerRadiusPercent: current.cornerRadiusPercent,
      palette: globalPalette,
      cornerTrimCorners: current.gridCornerTrimCorners,
      cornerTrimShape: current.gridCornerTrimShape,
      cornerTrimSizePercent: current.gridCornerTrimSizePercent,
      nativeGrid: null,
    };
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
  const cornerTrimCorners = activeItem.settings.cornerTrimCorners ?? current.gridCornerTrimCorners;
  const cornerTrimShape = activeItem.settings.cornerTrimShape ?? current.gridCornerTrimShape;
  const cornerTrimSizePercent = activeItem.settings.cornerTrimSizePercent ?? current.gridCornerTrimSizePercent;
  const nativeGrid =
    activeItem.settings.nativeGridCols && activeItem.settings.nativeGridRows
      ? { cols: activeItem.settings.nativeGridCols, rows: activeItem.settings.nativeGridRows }
      : null;

  return { gridPattern, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette, cornerTrimCorners, cornerTrimShape, cornerTrimSizePercent, nativeGrid };
}

// Renders automatically for whatever's currently active — no manual step. With nothing
// queued yet, the placeholder stays up and canvases stay hidden.
async function render(current) {
  updateCarouselNav(current);

  const activeItem = current.batchItems.find((item) => item.id === current.activeBatchItemId);
  if (!activeItem) {
    el.printCanvas.hidden = true;
    el.solvedCanvas.hidden = true;
    el.printPlaceholder.hidden = false;
    el.solvedPlaceholder.hidden = false;
    el.sourcePreviewOriginal.hidden = true;
    el.sourcePreviewProcessed.hidden = true;
    el.sourcePreviewOriginalPlaceholder.hidden = false;
    el.sourcePreviewProcessedPlaceholder.hidden = false;
    return;
  }

  const smoothingMode = activeItem.settings.sourceSmoothing ?? current.sourceSmoothing;
  const posterizeLevels = activeItem.settings.posterizeLevels ?? current.posterizeLevels;
  const rawSourceCanvas = await resolveRawSourceCanvas(current);
  const sourceCanvas = applyPosterize(applySourceSmoothing(rawSourceCanvas, smoothingMode), posterizeLevels);

  drawFitted(el.sourcePreviewOriginal, rawSourceCanvas);
  drawFitted(el.sourcePreviewProcessed, sourceCanvas);
  el.sourcePreviewOriginal.hidden = false;
  el.sourcePreviewProcessed.hidden = false;
  el.sourcePreviewOriginalPlaceholder.hidden = true;
  el.sourcePreviewProcessedPlaceholder.hidden = true;
  el.sourcePreviewProcessedCaption.textContent =
    smoothingMode === "off" && posterizeLevels === 0 ? "No changes applied — tune the controls above" : "After Smoothing + Posterize";

  const trimSize = getTrimSizeById(current.trimSizeId);
  const canvasDims = computeCanvasDimensions(trimSize, current.dpi, current.bleedEnabled);
  const safeZone = computeSafeZone(trimSize, current.pageSide);
  const sizes = getSizesForSelection(current.colorSetOptionId, current.colorSetCustomPair);
  const globalPalette = buildCombinedPalette(sizes);
  const effective = resolveActiveSettings(current, globalPalette);
  const composition = current.layoutScope === "page-specific" && activeItem.settings.composition
    ? normalizeComposition(activeItem.settings.composition)
    : normalizeComposition(current.globalComposition);
  const { cellSizeMm: effectiveCellSizeMm, gridOverride, nativeGridWarning } = resolveEffectiveGrid(
    safeZone,
    current.cellSizeMm,
    effective.gridPattern,
    composition,
    current.resolutionPriority,
    effective.nativeGrid
  );
  if (el.nativeGridWarning) {
    el.nativeGridWarning.textContent = nativeGridWarning ?? "";
    el.nativeGridWarning.hidden = !nativeGridWarning;
  }

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
    numberTintPercent: current.numberTintPercent,
    cornerRadiusPercent: effective.cornerRadiusPercent,
    palette: effective.palette,
    sourceCanvas,
    cornerTrimCorners: effective.cornerTrimCorners,
    cornerTrimShape: effective.cornerTrimShape,
    cornerTrimSizePercent: effective.cornerTrimSizePercent,
    frameMarginCells: current.gridFrameMarginCells,
    blankColorIds: current.blankColorIds,
    gridPageBlack: isContentPageBlack(current.pageBackgroundMode),
    // Deliberately NOT threading the Black & White book edition through here: this
    // Solved State panel exists to show the creator the artwork's TRUE colors as a
    // proofing/reference aid, independent of whatever the printed book's own color
    // policy is — it never itself becomes a page in the exported interior PDF (unlike
    // the Solutions back-matter thumbnails, which do respect the edition).
  };

  renderMosaicPreview(el.printCanvas, { ...baseOpts, mode: "print" });
  renderMosaicPreview(el.solvedCanvas, { ...baseOpts, mode: "solved" });

  el.printCanvas.hidden = false;
  el.solvedCanvas.hidden = false;
  el.printPlaceholder.hidden = true;
  el.solvedPlaceholder.hidden = true;
}

// Puzzle N of M label + prev/next disabled state + the auto-cycling dot indicator.
function updateCarouselNav(current) {
  const items = current.batchItems;
  const idx = items.findIndex((item) => item.id === current.activeBatchItemId);

  el.prevBtn.disabled = items.length === 0;
  el.nextBtn.disabled = items.length === 0;
  el.carouselLabel.textContent = items.length === 0 ? "—" : `Puzzle ${idx === -1 ? 1 : idx + 1} of ${items.length}`;
  el.carouselDot.classList.toggle("on", current.previewLoopEnabled && items.length > 1);
}

// Caches only the RAW drawn source (keyed purely by image identity) — Source
// Smoothing and Posterize are applied on top of this every render via their own
// single-slot memos (sourceSmoothingEngine.js / posterizeEngine.js), so switching
// either setting never re-decodes or re-draws the image itself, only re-filters it.
async function resolveRawSourceCanvas(current) {
  const activeItem = current.batchItems.find((item) => item.id === current.activeBatchItemId);
  const key = activeItem ? activeItem.objectUrl : "placeholder";

  if (cachedRawCanvas && cachedRawKey === key) return cachedRawCanvas;

  if (!activeItem) {
    cachedRawCanvas = getPlaceholderSource();
    cachedRawKey = key;
    return cachedRawCanvas;
  }

  try {
    const img = await loadImageSource(activeItem.objectUrl);
    cachedRawCanvas = drawSourceToCanvas(img);
    cachedRawKey = key;
  } catch {
    cachedRawCanvas = getPlaceholderSource();
    cachedRawKey = "placeholder";
  }

  return cachedRawCanvas;
}

// Scales `source` (a canvas or image) to fit inside `canvas`'s own pixel dimensions,
// preserving aspect ratio and centering it — a simple letterbox, not a crop, so the
// before/after preview always shows the whole frame the quantizer will actually see.
function drawFitted(canvas, source) {
  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  const sw = source.width;
  const sh = source.height;
  const scale = Math.min(cw / sw, ch / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(source, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
}
