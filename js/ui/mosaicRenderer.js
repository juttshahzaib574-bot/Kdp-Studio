// Draws the actual mosaic grid content — shape, typography, border, corner radius,
// and quantized color. Two entry points share the same per-cell drawing code:
//   - renderMosaicPreview: a zoomed on-screen detail crop at a fixed 300 "detail PPI"
//     so real point sizes/line weights stay proportionally accurate while remaining
//     legible on screen (used by the Stacked Live Preview Gallery).
//   - renderFullMosaicGrid: the entire safe-zone grid at the real chosen print DPI,
//     used to generate the actual page image embedded into the exported PDF.

import { computeFrameGeometry, drawFrame } from "./preview.js";
import { computeGridDimensions, cellCenterIn, cellPolygonIn, mmToIn } from "../modules/gridPatternEngine.js";
import { recommendFont, recommendTextTint, adjustForBorderWeight, centerOffsetIn, letterSpacingForLabel } from "../modules/typographyEngine.js";
import { gridColorFromTint } from "../modules/borderStyleEngine.js";
import { cornerRadiusIn, isFullCircle } from "../modules/cornerRadiusEngine.js";
import { assignDistinctShades } from "../modules/shadeQuantizationEngine.js";
import { splitSafeZoneForKey } from "../modules/layoutEngine.js";

const DETAIL_PPI = 300;
const PT_TO_IN = 1 / 72;

let placeholderCanvas = null;

// Used whenever no source photo has been uploaded yet, so the preview always has
// varied color to quantize instead of sitting empty.
export function getPlaceholderSource() {
  if (placeholderCanvas) return placeholderCanvas;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  const bands = ["#e63946", "#f4a261", "#e9c46a", "#2a9d8f", "#264653", "#8ecae6", "#bde0fe", "#cdb4db"];
  const bandH = c.height / bands.length;
  bands.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * bandH, c.width, bandH);
  });
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 130);
  grad.addColorStop(0, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  placeholderCanvas = c;
  return c;
}

export function loadImageSource(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function drawSourceToCanvas(source, size = 256) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  c.getContext("2d").drawImage(source, 0, 0, size, size);
  return c;
}

function sampleFromImageData(imageData, u, v) {
  const x = Math.max(0, Math.min(imageData.width - 1, Math.floor(u * imageData.width)));
  const y = Math.max(0, Math.min(imageData.height - 1, Math.floor(v * imageData.height)));
  const i = (y * imageData.width + x) * 4;
  return { r: imageData.data[i], g: imageData.data[i + 1], b: imageData.data[i + 2] };
}

function polygonToPx(points, centerPx, scalePxPerIn) {
  return points.map((p) => ({ x: centerPx.x + p.x * scalePxPerIn, y: centerPx.y + p.y * scalePxPerIn }));
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const addV = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const scaleV = (a, s) => ({ x: a.x * s, y: a.y * s });
const len = (a) => Math.hypot(a.x, a.y);
const normalize = (a) => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};

// Generic corner-rounding for any convex polygon: at each vertex, pull back toward
// both neighbors by the radius and join with a quadratic curve through the vertex.
function roundedPolygonPath(ctx, points, radiusPx) {
  const n = points.length;
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const curr = points[i];
    const next = points[(i + 1) % n];
    const prev = points[(i - 1 + n) % n];
    const toPrev = normalize(sub(prev, curr));
    const toNext = normalize(sub(next, curr));
    const r = Math.min(radiusPx, len(sub(next, curr)) / 2, len(sub(prev, curr)) / 2);
    const p1 = addV(curr, scaleV(toPrev, r));
    const p2 = addV(curr, scaleV(toNext, r));
    if (i === 0) ctx.moveTo(p1.x, p1.y);
    else ctx.lineTo(p1.x, p1.y);
    ctx.quadraticCurveTo(curr.x, curr.y, p2.x, p2.y);
  }
  ctx.closePath();
}

// Resolves the actual grid to render. When gridOverride is set (cell-enlargement
// mode — see resolutionScalingEngine.js's resolveEffectiveGrid for why), it pins
// cols/rows explicitly instead of re-deriving them from cellSizeMm + area, which for
// that mode can silently produce a different cell count than intended.
function resolveGrid(gridZone, cellSizeMm, gridPattern, gridOverride) {
  if (gridOverride) {
    return { cols: gridOverride.cols, rows: gridOverride.rows, cellSizeIn: mmToIn(cellSizeMm) };
  }
  return computeGridDimensions(gridZone.widthIn, gridZone.heightIn, cellSizeMm, gridPattern);
}

// Shared typography/border/radius derivation used by both renderers, so the on-screen
// preview and the exported PDF page always agree on point sizes and weights.
function computeCellStyle({ cellSizeMm, cellSizeIn, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette, ppi }) {
  const blackoutMode = gridTintPercent >= 100;
  const baseFont = recommendFont(cellSizeMm, palette.length);
  // Dynamic Typography Syncing: a thick border encroaching on the cell interior drops
  // the font half a point so the glyph never clips into the line.
  const sizePt = adjustForBorderWeight(baseFont.sizePt, borderWeightPt, cellSizeMm);
  const font = { ...baseFont, sizePt };
  const textTint = recommendTextTint(cellSizeMm, blackoutMode);

  return {
    blackoutMode,
    font,
    textTint,
    fontPx: Math.max(6, font.sizePt * PT_TO_IN * ppi),
    fontWeight: font.weight.includes("Thin") ? 200 : font.weight.includes("Light") ? 300 : 500,
    borderPx: Math.max(0.5, borderWeightPt * PT_TO_IN * ppi),
    strokeColor: gridColorFromTint(gridTintPercent),
    radiusPx: cornerRadiusIn(cornerRadiusPercent, cellSizeIn) * ppi,
  };
}

// Draws one cell (shape + fill + border/dots + number label) at centerPx, ppi px/inch.
function drawCell(ctx, { centerPx, cellSizeIn, cellSizePx, ppi, gridPattern, mode, paletteIndex, palette, style, cornerRadiusPercent }) {
  const points = cellPolygonIn(gridPattern, cellSizeIn);
  const pxPoints = polygonToPx(points, centerPx, ppi);
  const swatch = palette[paletteIndex];

  if (isFullCircle(cornerRadiusPercent)) {
    ctx.beginPath();
    ctx.arc(centerPx.x, centerPx.y, cellSizePx / 2, 0, Math.PI * 2);
  } else {
    roundedPolygonPath(ctx, pxPoints, style.radiusPx);
  }

  if (mode === "solved") {
    ctx.fillStyle = swatch.hex;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    return;
  }

  ctx.fillStyle = style.blackoutMode ? "#141414" : "#fdfcf9";
  ctx.fill();

  if (gridPattern !== "dot-matrix") {
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = style.borderPx;
    ctx.stroke();
  } else {
    pxPoints.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(0.8, style.borderPx * 0.6), 0, Math.PI * 2);
      ctx.fillStyle = style.strokeColor;
      ctx.fill();
    });
  }

  const offset = centerOffsetIn(gridPattern, cellSizeIn);
  const labelX = centerPx.x + offset.dx * ppi;
  const labelY = centerPx.y + offset.dy * ppi;
  const label = String(paletteIndex + 1);

  ctx.font = `${style.fontWeight} ${style.fontPx}px -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${letterSpacingForLabel(label)}px`;
  ctx.fillStyle = style.textTint.color === "white" ? "#f5f5f5" : `rgba(0,0,0,${style.textTint.percentBlack / 100})`;
  ctx.fillText(label, labelX, labelY);
  ctx.letterSpacing = "0px";
}

export function renderMosaicPreview(canvas, opts) {
  const {
    mode, // 'print' | 'solved'
    trimSize, dpi, bleedEnabled, canvasDims, safeZone, pageSide, layoutMode = "unified",
    gridPattern, cellSizeMm, gridOverride = null, borderWeightPt, gridTintPercent, cornerRadiusPercent,
    palette, sourceCanvas,
  } = opts;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const geometry = computeFrameGeometry(canvas.width, canvas.height, { trimSize, bleedEnabled, canvasDims, safeZone, pageSide });
  drawFrame(ctx, geometry, { trimSize, dpi, bleedEnabled, showLabels: false });

  // Unified layout reserves a key strip at the bottom of the safe zone (drawn by the
  // PDF exporter, not here — see mosaicRenderer.js header comment); the grid itself
  // only ever occupies gridZone, so cell density here matches the real exported page.
  const { gridZone } = splitSafeZoneForKey(safeZone, layoutMode);
  const fullGrid = resolveGrid(gridZone, cellSizeMm, gridPattern, gridOverride);
  const cellSizePx = fullGrid.cellSizeIn * DETAIL_PPI;
  const colsVisible = Math.max(3, Math.min(fullGrid.cols, Math.floor(geometry.safeW / cellSizePx) || 3));
  const rowsVisible = Math.max(3, Math.min(fullGrid.rows, Math.floor(geometry.safeH / cellSizePx) || 3));
  const colStart = Math.floor((fullGrid.cols - colsVisible) / 2);
  const rowStart = Math.floor((fullGrid.rows - rowsVisible) / 2);

  const sourceCtx = sourceCanvas.getContext("2d");
  const sourceImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  const cells = [];
  for (let row = rowStart; row < rowStart + rowsVisible; row += 1) {
    for (let col = colStart; col < colStart + colsVisible; col += 1) {
      const u = fullGrid.cols > 1 ? col / (fullGrid.cols - 1) : 0.5;
      const v = fullGrid.rows > 1 ? row / (fullGrid.rows - 1) : 0.5;
      cells.push({ col, row, color: sampleFromImageData(sourceImageData, u, v) });
    }
  }

  const assignments = assignDistinctShades(cells.map((c) => c.color), palette);
  const style = computeCellStyle({ cellSizeMm, cellSizeIn: fullGrid.cellSizeIn, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette, ppi: DETAIL_PPI });

  const cropWidthPx = colsVisible * cellSizePx;
  const cropHeightPx = rowsVisible * cellSizePx;
  const originX = canvas.width / 2 - cropWidthPx / 2;
  const originY = canvas.height / 2 - cropHeightPx / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, originY, cropWidthPx, cropHeightPx);
  ctx.clip();

  ctx.fillStyle = mode === "solved" ? "#111318" : style.blackoutMode ? "#141414" : "#f5f3ee";
  ctx.fillRect(originX, originY, cropWidthPx, cropHeightPx);

  cells.forEach((cell, index) => {
    const localCenterIn = cellCenterIn(gridPattern, cell.col - colStart, cell.row - rowStart, fullGrid.cellSizeIn);
    const centerPx = { x: originX + localCenterIn.x * DETAIL_PPI, y: originY + localCenterIn.y * DETAIL_PPI };
    drawCell(ctx, {
      centerPx, cellSizeIn: fullGrid.cellSizeIn, cellSizePx, ppi: DETAIL_PPI, gridPattern, mode,
      paletteIndex: assignments[index], palette, style, cornerRadiusPercent,
    });
  });

  ctx.restore();

  ctx.fillStyle = "#9aa1af";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(
    `Detail crop: ${colsVisible}×${rowsVisible} of ${fullGrid.cols}×${fullGrid.rows} cells @ ${cellSizeMm.toFixed(1)}mm`,
    12,
    canvas.height - 12
  );

  return { fullGrid, colsVisible, rowsVisible, font: style.font, borderPx: style.borderPx };
}

// Renders the ENTIRE safe-zone grid onto `canvas` at the real chosen print DPI —
// this is the actual page content embedded into the exported PDF, not a preview.
// `canvas` must already be sized to canvasDims.widthPx x canvasDims.heightPx.
export function renderFullMosaicGrid(canvas, opts) {
  const {
    mode, // 'print' | 'solved'
    dpi, canvasDims, safeZone, pageSide, layoutMode = "unified",
    gridPattern, cellSizeMm, gridOverride = null, borderWeightPt, gridTintPercent, cornerRadiusPercent,
    palette, sourceCanvas,
  } = opts;

  const ctx = canvas.getContext("2d");
  const { gridZone, keyStripHeightIn } = splitSafeZoneForKey(safeZone, layoutMode);
  const fullGrid = resolveGrid(gridZone, cellSizeMm, gridPattern, gridOverride);
  const style = computeCellStyle({ cellSizeMm, cellSizeIn: fullGrid.cellSizeIn, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette, ppi: dpi });

  ctx.fillStyle = mode === "solved" ? "#ffffff" : style.blackoutMode ? "#141414" : "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Trim sits flush to whichever edge is the spine; bleed is only added to the
  // outer edge + top/bottom (see bleedEngine), so this mirrors that placement.
  const trimXIn = pageSide === "right" ? 0 : canvasDims.bleedIn;
  const trimYIn = canvasDims.bleedIn;
  const safeXIn = trimXIn + gridZone.left;
  const safeYIn = trimYIn + gridZone.top;
  const originXPx = safeXIn * dpi;
  const originYPx = safeYIn * dpi;

  const sourceCtx = sourceCanvas.getContext("2d");
  const sourceImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  const cellSizePx = fullGrid.cellSizeIn * dpi;
  const colors = [];
  for (let row = 0; row < fullGrid.rows; row += 1) {
    for (let col = 0; col < fullGrid.cols; col += 1) {
      const u = fullGrid.cols > 1 ? col / (fullGrid.cols - 1) : 0.5;
      const v = fullGrid.rows > 1 ? row / (fullGrid.rows - 1) : 0.5;
      colors.push(sampleFromImageData(sourceImageData, u, v));
    }
  }
  const assignments = assignDistinctShades(colors, palette);

  let index = 0;
  for (let row = 0; row < fullGrid.rows; row += 1) {
    for (let col = 0; col < fullGrid.cols; col += 1) {
      const localCenterIn = cellCenterIn(gridPattern, col, row, fullGrid.cellSizeIn);
      const centerPx = { x: originXPx + localCenterIn.x * dpi, y: originYPx + localCenterIn.y * dpi };
      drawCell(ctx, {
        centerPx, cellSizeIn: fullGrid.cellSizeIn, cellSizePx, ppi: dpi, gridPattern, mode,
        paletteIndex: assignments[index], palette, style, cornerRadiusPercent,
      });
      index += 1;
    }
  }

  return { fullGrid, gridZone, keyStripHeightIn };
}
