// Draws the actual mosaic grid content — shape, typography, border, corner radius,
// and quantized color — into the safe zone of a page frame. Renders a zoomed detail
// crop (not the whole page) at a fixed 300 "detail PPI" so real point sizes/line
// weights stay proportionally accurate while remaining legible on screen — exactly the
// close-up view described by the blueprint's live preview modules for "dialing in
// dense grids... ensuring microscopic numbers and thin borders remain crisp."

import { computeFrameGeometry, drawFrame } from "./preview.js";
import { computeGridDimensions, cellCenterIn, cellPolygonIn } from "../modules/gridPatternEngine.js";
import { recommendFont, recommendTextTint, centerOffsetIn, letterSpacingForLabel } from "../modules/typographyEngine.js";
import { gridColorFromTint } from "../modules/borderStyleEngine.js";
import { cornerRadiusIn, isFullCircle } from "../modules/cornerRadiusEngine.js";
import { assignDistinctShades } from "../modules/shadeQuantizationEngine.js";

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

export function renderMosaicPreview(canvas, opts) {
  const {
    mode, // 'print' | 'solved'
    trimSize, dpi, bleedEnabled, canvasDims, safeZone, pageSide,
    gridPattern, cellSizeMm, borderWeightPt, gridTintPercent, cornerRadiusPercent,
    palette, sourceCanvas,
  } = opts;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const geometry = computeFrameGeometry(canvas.width, canvas.height, { trimSize, bleedEnabled, canvasDims, safeZone, pageSide });
  drawFrame(ctx, geometry, { trimSize, dpi, bleedEnabled, showLabels: false });

  const fullGrid = computeGridDimensions(safeZone.widthIn, safeZone.heightIn, cellSizeMm, gridPattern);
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
  const blackoutMode = gridTintPercent >= 100;

  const font = recommendFont(cellSizeMm, palette.length);
  const textTint = recommendTextTint(cellSizeMm, blackoutMode);
  const fontPx = Math.max(6, font.sizePt * PT_TO_IN * DETAIL_PPI);
  const fontWeight = font.weight.includes("Thin") ? 200 : font.weight.includes("Light") ? 300 : 500;
  const borderPx = Math.max(0.5, borderWeightPt * PT_TO_IN * DETAIL_PPI);
  const strokeColor = gridColorFromTint(gridTintPercent);
  const radiusPx = cornerRadiusIn(cornerRadiusPercent, fullGrid.cellSizeIn) * DETAIL_PPI;

  const cropWidthPx = colsVisible * cellSizePx;
  const cropHeightPx = rowsVisible * cellSizePx;
  const originX = canvas.width / 2 - cropWidthPx / 2;
  const originY = canvas.height / 2 - cropHeightPx / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, originY, cropWidthPx, cropHeightPx);
  ctx.clip();

  ctx.fillStyle = mode === "solved" ? "#111318" : blackoutMode ? "#141414" : "#f5f3ee";
  ctx.fillRect(originX, originY, cropWidthPx, cropHeightPx);

  cells.forEach((cell, index) => {
    const { col, row } = cell;
    const localCenterIn = cellCenterIn(gridPattern, col - colStart, row - rowStart, fullGrid.cellSizeIn);
    const centerPx = { x: originX + localCenterIn.x * DETAIL_PPI, y: originY + localCenterIn.y * DETAIL_PPI };
    const points = cellPolygonIn(gridPattern, fullGrid.cellSizeIn);
    const pxPoints = polygonToPx(points, centerPx, DETAIL_PPI);
    const paletteIndex = assignments[index];
    const swatch = palette[paletteIndex];

    if (isFullCircle(cornerRadiusPercent)) {
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, cellSizePx / 2, 0, Math.PI * 2);
    } else {
      roundedPolygonPath(ctx, pxPoints, radiusPx);
    }

    if (mode === "solved") {
      ctx.fillStyle = swatch.hex;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      return;
    }

    ctx.fillStyle = blackoutMode ? "#141414" : "#fdfcf9";
    ctx.fill();

    if (gridPattern !== "dot-matrix") {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = borderPx;
      ctx.stroke();
    } else {
      pxPoints.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(0.8, borderPx * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
      });
    }

    const offset = centerOffsetIn(gridPattern, fullGrid.cellSizeIn);
    const labelX = centerPx.x + offset.dx * DETAIL_PPI;
    const labelY = centerPx.y + offset.dy * DETAIL_PPI;
    const label = String(paletteIndex + 1);

    ctx.font = `${fontWeight} ${fontPx}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = `${letterSpacingForLabel(label)}px`;
    ctx.fillStyle = textTint.color === "white" ? "#f5f5f5" : `rgba(0,0,0,${textTint.percentBlack / 100})`;
    ctx.fillText(label, labelX, labelY);
    ctx.letterSpacing = "0px";
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

  return { fullGrid, colsVisible, rowsVisible, font, borderPx };
}
