// Draws the actual mosaic grid content — shape, typography, border, corner radius,
// and quantized color. Two entry points share the same per-cell drawing code:
//   - renderMosaicPreview: a zoomed on-screen detail crop at a fixed 300 "detail PPI"
//     so real point sizes/line weights stay proportionally accurate while remaining
//     legible on screen (used by the Stacked Live Preview Gallery).
//   - renderFullMosaicGrid: the entire safe-zone grid at the real chosen print DPI,
//     used to generate the actual page image embedded into the exported PDF.

import { computeFrameGeometry, drawFrame } from "./preview.js?v=10";
import { computeGridDimensions, cellCenterIn, cellPolygonIn, mmToIn, isCellInGridSilhouette } from "../modules/gridPatternEngine.js?v=10";
import { recommendFont, recommendTextTint, adjustForBorderWeight, centerOffsetIn, letterSpacingForLabel } from "../modules/typographyEngine.js?v=10";
import { gridColorFromTint } from "../modules/borderStyleEngine.js?v=10";
import { cornerRadiusIn, isFullCircle } from "../modules/cornerRadiusEngine.js?v=10";
import { assignDistinctShades } from "../modules/shadeQuantizationEngine.js?v=10";
import { computeLayout, LAYOUT_ELEMENTS } from "../modules/layoutCompositionEngine.js?v=10";

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

// Draws the source at its OWN aspect ratio (capped to maxSize on the long edge) — never
// force-stretched to a square. Force-stretching here used to warp every photo before it
// even reached the grid (a portrait dog squashed into a square, then re-stretched onto a
// wide grid), which is a real cause of "wrong-looking" color-by-number results. The real
// aspect-ratio fit against the grid's own shape happens later, in sampleGridColors.
export function drawSourceToCanvas(source, maxSize = 512) {
  const naturalW = source.naturalWidth || source.width;
  const naturalH = source.naturalHeight || source.height;
  const aspect = naturalW / naturalH || 1;
  const w = aspect >= 1 ? maxSize : Math.round(maxSize * aspect);
  const h = aspect >= 1 ? Math.round(maxSize / aspect) : maxSize;
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext("2d");
  // Flatten transparency onto a solid white matte before any pixel is ever sampled —
  // an un-composited transparent pixel's RGB channels are meaningless (browsers store
  // whatever they want under alpha=0, often black), and without this step those
  // meaningless values get quantized exactly like real image data, scattering random
  // unrelated palette colors across every soft/anti-aliased edge of a cutout-style
  // source image. White matches the book page itself, so it also reads correctly as
  // "no ink here" wherever a transparent background genuinely should stay blank.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

// Granular Shade Separation starts here, not in the quantizer: this is a cover-crop
// (center-crop to the grid's own aspect ratio, never a stretch) plus a small per-cell
// supersampled average — so a single outline-stroke or anti-aliased edge pixel can no
// longer hijack an entire cell's color, and each cell reads as the region's true average.
function sampleGridColors(sourceCanvas, cols, rows, targetAspect) {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const sourceAspect = sw / sh;

  let cropW, cropH, cropX, cropY;
  if (sourceAspect > targetAspect) {
    cropH = sh;
    cropW = sh * targetAspect;
    cropX = (sw - cropW) / 2;
    cropY = 0;
  } else {
    cropW = sw;
    cropH = sw / targetAspect;
    cropX = 0;
    cropY = (sh - cropH) / 2;
  }

  const imageData = sourceCanvas.getContext("2d").getImageData(0, 0, sw, sh).data;
  const SUPERSAMPLE = 4; // 4x4 sub-samples averaged per cell
  const colors = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const u = (col + (sx + 0.5) / SUPERSAMPLE) / cols;
          const v = (row + (sy + 0.5) / SUPERSAMPLE) / rows;
          const x = Math.max(0, Math.min(sw - 1, Math.round(cropX + u * cropW)));
          const y = Math.max(0, Math.min(sh - 1, Math.round(cropY + v * cropH)));
          const i = (y * sw + x) * 4;
          rSum += imageData[i];
          gSum += imageData[i + 1];
          bSum += imageData[i + 2];
        }
      }
      const n = SUPERSAMPLE * SUPERSAMPLE;
      colors.push({ r: Math.round(rSum / n), g: Math.round(gSum / n), b: Math.round(bSum / n) });
    }
  }

  return colors;
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
  const textTint = recommendTextTint(cellSizeMm, gridTintPercent);

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
// `lowDetail` skips the polygon path, stroke and number entirely in favor of one flat
// fillRect — used when a full-page preview packs cells too small to read a number
// anyway, so the whole grid still renders responsively instead of just a zoomed crop.
function drawCell(ctx, { centerPx, cellSizeIn, cellSizePx, ppi, gridPattern, mode, paletteIndex, palette, style, cornerRadiusPercent, lowDetail = false }) {
  const swatch = palette[paletteIndex];

  if (lowDetail) {
    const half = cellSizePx / 2;
    ctx.fillStyle = mode === "solved" ? swatch.hex : "#fdfcf9";
    ctx.fillRect(centerPx.x - half, centerPx.y - half, cellSizePx, cellSizePx);
    return;
  }

  const points = cellPolygonIn(gridPattern, cellSizeIn);
  const pxPoints = polygonToPx(points, centerPx, ppi);

  // The "Circle" grid pattern always punches a full circle per cell, independent of the
  // Corner Radius slider (which still governs rounding for square/diamond/hexagon).
  if (gridPattern === "circle" || isFullCircle(cornerRadiusPercent)) {
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

  // Midnight/Blackout Cell & Background Standard: cells are always clean white/light
  // shapes — the 100% black lives in the canvas background behind them (see the
  // background fill in renderMosaicPreview/renderFullMosaicGrid), never in the cell fill.
  ctx.fillStyle = "#fdfcf9";
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
  // Numbers stay dark against the white cell at every tint level — including
  // Midnight/Blackout, where the black is the background, not the number color.
  ctx.fillStyle = `rgba(0,0,0,${style.textTint.percentBlack / 100})`;
  ctx.fillText(label, labelX, labelY);
  ctx.letterSpacing = "0px";
}

const ELEMENT_LABELS = Object.fromEntries(LAYOUT_ELEMENTS.map((e) => [e.id, e.label]));

// Draws the composition's reserved element bands as labeled translucent overlays on the
// preview frame, so a creator sees where the title / subtitle / instruction / color key
// sit and how much space they take from the grid.
function drawPlacementBoxes(ctx, geometry, safeZone, placements, blackoutMode) {
  placements.forEach(({ id, rect }) => {
    const x = geometry.safeX + rect.xIn * geometry.scale;
    const y = geometry.safeY + rect.yIn * geometry.scale;
    const w = rect.wIn * geometry.scale;
    const h = rect.hIn * geometry.scale;
    ctx.save();
    ctx.fillStyle = id === "colorKey" ? "rgba(91,140,255,0.18)" : "rgba(58,209,154,0.16)";
    ctx.strokeStyle = id === "colorKey" ? "rgba(91,140,255,0.75)" : "rgba(58,209,154,0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = blackoutMode ? "#e7e9ee" : "#334";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (h > 12 && w > 30) ctx.fillText(ELEMENT_LABELS[id] ?? id, x + w / 2, y + Math.min(h / 2, 10));
    ctx.restore();
  });
}

export function renderMosaicPreview(canvas, opts) {
  const {
    mode, // 'print' | 'solved'
    trimSize, dpi, bleedEnabled, canvasDims, safeZone, pageSide, composition,
    gridPattern, cellSizeMm, gridOverride = null, borderWeightPt, gridTintPercent, cornerRadiusPercent,
    palette, sourceCanvas, gridCornerTrim = false,
  } = opts;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const geometry = computeFrameGeometry(canvas.width, canvas.height, { trimSize, bleedEnabled, canvasDims, safeZone, pageSide });
  drawFrame(ctx, geometry, { trimSize, dpi, bleedEnabled, showLabels: false });

  // The grid only ever occupies the region left after the composition's element bands
  // are reserved, so cell density here matches the real exported page. The reserved
  // element bands are drawn as labeled overlays so the layout composition is visible.
  const layout = computeLayout(safeZone, composition);
  const gridZone = layout.gridZone;
  // Render the ENTIRE grid at whatever px/inch the on-screen canvas geometry already
  // works out to (geometry.scale) — this is a true whole-page thumbnail matching what
  // exportInteriorPdf will actually produce, not a zoomed-in fragment of a few cells.
  const ppi = geometry.scale;
  const fullGrid = resolveGrid(gridZone, cellSizeMm, gridPattern, gridOverride);
  const style = computeCellStyle({ cellSizeMm, cellSizeIn: fullGrid.cellSizeIn, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette, ppi });

  // Paint the trim box with the real page background (white, or rich black in
  // Blackout mode) before the element-band overlays — otherwise the app's dark UI
  // chrome shows through the reserved bands and swallows the placement labels.
  ctx.fillStyle = style.blackoutMode ? "#000000" : "#ffffff";
  ctx.fillRect(geometry.trimX, geometry.trimY, geometry.trimW, geometry.trimH);
  drawPlacementBoxes(ctx, geometry, safeZone, layout.gridPlacements, style.blackoutMode);

  const cellSizePx = fullGrid.cellSizeIn * ppi;
  const originX = geometry.trimX + gridZone.left * ppi;
  const originY = geometry.trimY + gridZone.top * ppi;
  const regionWpx = gridZone.widthIn * ppi;
  const regionHpx = gridZone.heightIn * ppi;

  const colors = sampleGridColors(sourceCanvas, fullGrid.cols, fullGrid.rows, gridZone.widthIn / gridZone.heightIn);
  const assignments = assignDistinctShades(colors, palette);

  // Below this cell size a number is unreadable anyway, so cells fall back to a flat
  // fillRect (see drawCell's lowDetail branch) — keeps a dense grid's live preview
  // responsive on every state change instead of stalling on thousands of glyph draws.
  const lowDetail = cellSizePx < 4;

  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, originY, regionWpx, regionHpx);
  ctx.clip();

  // Canvas background only — cells always render white regardless of this (see drawCell).
  // True K:100% rich black, per the Midnight/Blackout Cell & Background Standard.
  ctx.fillStyle = mode === "solved" ? "#111318" : style.blackoutMode ? "#000000" : "#f5f3ee";
  ctx.fillRect(originX, originY, regionWpx, regionHpx);

  let index = 0;
  for (let row = 0; row < fullGrid.rows; row += 1) {
    for (let col = 0; col < fullGrid.cols; col += 1) {
      if (gridCornerTrim && !isCellInGridSilhouette(col, row, fullGrid.cols, fullGrid.rows)) {
        index += 1;
        continue;
      }
      const localCenterIn = cellCenterIn(gridPattern, col, row, fullGrid.cellSizeIn);
      const centerPx = { x: originX + localCenterIn.x * ppi, y: originY + localCenterIn.y * ppi };
      drawCell(ctx, {
        centerPx, cellSizeIn: fullGrid.cellSizeIn, cellSizePx, ppi, gridPattern, mode,
        paletteIndex: assignments[index], palette, style, cornerRadiusPercent, lowDetail,
      });
      index += 1;
    }
  }

  ctx.restore();

  ctx.fillStyle = "#9aa1af";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Full page: ${fullGrid.cols}×${fullGrid.rows} cells @ ${cellSizeMm.toFixed(1)}mm`, 12, canvas.height - 12);

  return { fullGrid, font: style.font, borderPx: style.borderPx };
}

// Renders the ENTIRE safe-zone grid onto `canvas` at the real chosen print DPI —
// this is the actual page content embedded into the exported PDF, not a preview.
// `canvas` must already be sized to canvasDims.widthPx x canvasDims.heightPx.
export function renderFullMosaicGrid(canvas, opts) {
  const {
    mode, // 'print' | 'solved'
    dpi, canvasDims, safeZone, pageSide, composition,
    gridPattern, cellSizeMm, gridOverride = null, borderWeightPt, gridTintPercent, cornerRadiusPercent,
    palette, sourceCanvas, gridCornerTrim = false,
  } = opts;

  const ctx = canvas.getContext("2d");
  const layout = computeLayout(safeZone, composition);
  const gridZone = layout.gridZone;
  const fullGrid = resolveGrid(gridZone, cellSizeMm, gridPattern, gridOverride);
  const style = computeCellStyle({ cellSizeMm, cellSizeIn: fullGrid.cellSizeIn, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette, ppi: dpi });

  // True K:100% solid Rich Black canvas background per the Midnight/Blackout standard —
  // cells always render white regardless of this (see drawCell); this is the "outer
  // framework," not the puzzle panes.
  ctx.fillStyle = mode === "solved" ? "#ffffff" : style.blackoutMode ? "#000000" : "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Trim sits flush to whichever edge is the spine; bleed is only added to the
  // outer edge + top/bottom (see bleedEngine), so this mirrors that placement.
  const trimXIn = pageSide === "right" ? 0 : canvasDims.bleedIn;
  const trimYIn = canvasDims.bleedIn;
  const safeXIn = trimXIn + gridZone.left;
  const safeYIn = trimYIn + gridZone.top;
  const originXPx = safeXIn * dpi;
  const originYPx = safeYIn * dpi;

  const cellSizePx = fullGrid.cellSizeIn * dpi;
  const colors = sampleGridColors(sourceCanvas, fullGrid.cols, fullGrid.rows, gridZone.widthIn / gridZone.heightIn);
  const assignments = assignDistinctShades(colors, palette);

  let index = 0;
  for (let row = 0; row < fullGrid.rows; row += 1) {
    for (let col = 0; col < fullGrid.cols; col += 1) {
      if (gridCornerTrim && !isCellInGridSilhouette(col, row, fullGrid.cols, fullGrid.rows)) {
        index += 1;
        continue;
      }
      const localCenterIn = cellCenterIn(gridPattern, col, row, fullGrid.cellSizeIn);
      const centerPx = { x: originXPx + localCenterIn.x * dpi, y: originYPx + localCenterIn.y * dpi };
      drawCell(ctx, {
        centerPx, cellSizeIn: fullGrid.cellSizeIn, cellSizePx, ppi: dpi, gridPattern, mode,
        paletteIndex: assignments[index], palette, style, cornerRadiusPercent,
      });
      index += 1;
    }
  }

  return { fullGrid, gridZone, layout };
}
