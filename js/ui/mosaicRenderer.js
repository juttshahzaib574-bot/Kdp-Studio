// Draws the actual mosaic grid content — shape, typography, border, corner radius,
// and quantized color. Two entry points share the same per-cell drawing code:
//   - renderMosaicPreview: a zoomed on-screen detail crop at a fixed 300 "detail PPI"
//     so real point sizes/line weights stay proportionally accurate while remaining
//     legible on screen (used by the Stacked Live Preview Gallery).
//   - renderFullMosaicGrid: the entire safe-zone grid at the real chosen print DPI,
//     used to generate the actual page image embedded into the exported PDF.

import { computeFrameGeometry, drawFrame } from "./preview.js?v=20";
import { computeGridDimensions, cellCenterIn, cellPolygonIn, mmToIn, isCellInGridSilhouette } from "../modules/gridPatternEngine.js?v=20";
import { recommendFont, recommendTextTint, adjustForBorderWeight, centerOffsetIn, letterSpacingForLabel } from "../modules/typographyEngine.js?v=20";
import { gridColorFromTint } from "../modules/borderStyleEngine.js?v=20";
import { cornerRadiusIn, isFullCircle } from "../modules/cornerRadiusEngine.js?v=20";
import { nearestPaletteColor } from "../modules/shadeQuantizationEngine.js?v=20";
import { computeLayout, LAYOUT_ELEMENTS } from "../modules/layoutCompositionEngine.js?v=20";
import { toGrayscaleHex } from "../modules/bookThemeEngine.js?v=20";

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
// aspect-ratio fit against the grid's own shape happens later, in quantizeGridCells.
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

// ---- Mosaic color engine ----
// A direct, faithful port of a working reference paint-by-number generator's actual
// technique, replacing every part of the previous fixed-palette engine: sample the
// source at 8x8 sub-pixels per cell with NO smoothing (sharp source pixels stay
// sharp all the way through), find true outline cells by comparing each cell's own
// brightness against its neighbors, run K-means clustering restricted to non-outline
// pixels to DISCOVER the image's own actual colors (not snap to any fixed/generic
// palette), merge near-duplicate discovered clusters, then assign every non-outline
// cell to whichever discovered color the majority of its sub-pixels are closest to.

function mulberry32(seed) {
  return function rand() {
    let a = (seed |= 0);
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgbDistance = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

// Crop to the grid's own aspect ratio (never a stretch), then downscale directly to
// cols*8 x rows*8 with NEAREST-NEIGHBOR (no smoothing) — matches the reference tool
// exactly, keeping every source pixel sharp all the way to the per-cell sample.
function sampleGridCellsNearestNeighbor(sourceCanvas, cols, rows, targetAspect) {
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

  const S = 8;
  const sampleW = cols * S;
  const sampleH = rows * S;
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleW;
  sampleCanvas.height = sampleH;
  const sctx = sampleCanvas.getContext("2d");
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, sampleW, sampleH);
  const data = sctx.getImageData(0, 0, sampleW, sampleH).data;

  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const px = [];
      for (let y = 0; y < S; y += 1) {
        for (let x = 0; x < S; x += 1) {
          const i = ((row * S + y) * sampleW + (col * S + x)) * 4;
          px.push([data[i], data[i + 1], data[i + 2]]);
        }
      }
      cells.push(px);
    }
  }
  return cells;
}

// A cell is a true outline stroke if it's darker than its brightest neighbor by a
// real margin AND dark overall — spatial context, not an absolute color threshold.
function detectOutlineCells(cells, cols, rows) {
  const edges = new Array(cols * rows).fill(false);
  const lums = cells.map((px) => {
    let sum = 0;
    for (let i = 0; i < px.length; i += 1) {
      const p = px[i];
      sum += 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    }
    return sum / px.length;
  });
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = row * cols + col;
      let jump = 0;
      if (row > 0) jump = Math.max(jump, Math.abs(lums[i] - lums[i - cols]));
      if (row < rows - 1) jump = Math.max(jump, Math.abs(lums[i] - lums[i + cols]));
      if (col > 0) jump = Math.max(jump, Math.abs(lums[i] - lums[i - 1]));
      if (col < cols - 1) jump = Math.max(jump, Math.abs(lums[i] - lums[i + 1]));
      if (jump > 40 && lums[i] < 100) edges[i] = true;
    }
  }
  return edges;
}

// K-means++-seeded clustering (fixed seed — deterministic, so the print and solved
// renders of the same puzzle always discover the identical palette) with Lloyd
// iteration, restricted to whatever pixel data the caller hands in (non-outline only).
function kmeansSeeded(data, k, iters) {
  const n = data.length;
  if (!n) return { cents: [] };
  const clusterCount = Math.min(k, n);
  const rnd = mulberry32(4242);
  const cents = [[...data[Math.floor(rnd() * n)]]];
  for (let c = 1; c < clusterCount; c += 1) {
    const distSq = new Float32Array(n);
    let total = 0;
    for (let i = 0; i < n; i += 1) {
      const di = data[i];
      let minDist = Infinity;
      for (let ci = 0; ci < cents.length; ci += 1) {
        const ct = cents[ci];
        const d = (di[0] - ct[0]) ** 2 + (di[1] - ct[1]) ** 2 + (di[2] - ct[2]) ** 2;
        if (d < minDist) minDist = d;
      }
      distSq[i] = minDist;
      total += minDist;
    }
    let r = rnd() * total;
    let chosen = 0;
    for (let i = 0; i < n; i += 1) {
      r -= distSq[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    cents.push([...data[chosen]]);
  }

  const labels = new Uint16Array(n);
  for (let iter = 0; iter < iters; iter += 1) {
    let changed = false;
    for (let i = 0; i < n; i += 1) {
      let minDist = Infinity;
      let best = 0;
      for (let c = 0; c < cents.length; c += 1) {
        const d = (data[i][0] - cents[c][0]) ** 2 + (data[i][1] - cents[c][1]) ** 2 + (data[i][2] - cents[c][2]) ** 2;
        if (d < minDist) {
          minDist = d;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
    }
    const sums = Array.from({ length: cents.length }, () => [0, 0, 0]);
    const counts = new Uint32Array(cents.length);
    for (let i = 0; i < n; i += 1) {
      const l = labels[i];
      counts[l] += 1;
      sums[l][0] += data[i][0];
      sums[l][1] += data[i][1];
      sums[l][2] += data[i][2];
    }
    for (let c = 0; c < cents.length; c += 1) {
      if (counts[c]) cents[c] = [sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]];
    }
    if (!changed) break;
  }
  return { cents };
}

// Every render pass calls this twice with byte-identical arguments — once to draw
// the "print" (numbered) page, once for the "solved" (filled) page — since both are
// just two different renderings of the exact same discovered colors. Without this
// cache the whole k-means/edge-detection pipeline (the most expensive part of a
// render by far) ran twice per pass for an identical result, which is what made
// every option change visibly freeze the UI. A single-slot cache is enough: it only
// needs to catch that immediately-adjacent duplicate call, and any real change to
// the source image, grid, or palette naturally misses and recomputes.
let quantizationCache = null;

function quantizeGridCells(sourceCanvas, cols, rows, targetAspect, palette) {
  if (
    quantizationCache &&
    quantizationCache.sourceCanvas === sourceCanvas &&
    quantizationCache.cols === cols &&
    quantizationCache.rows === rows &&
    quantizationCache.targetAspect === targetAspect &&
    quantizationCache.palette === palette
  ) {
    return quantizationCache.result;
  }

  const result = computeQuantization(sourceCanvas, cols, rows, targetAspect, palette);
  quantizationCache = { sourceCanvas, cols, rows, targetAspect, palette, result };
  return result;
}

// The actual quantization pass: crop+sample, detect outline cells, cluster the rest
// into `colorCount - 1` discovered colors (plus outline = colorCount total), merge
// near-duplicate clusters, label every cell, and pick each cluster's final displayed
// color (a real, dominant, actually-present color when one clearly wins — never an
// invented average). Returns per-cell palette indices AND the discovered legend
// itself, since — unlike a fixed palette — this palette is different every time and
// the caller needs it to draw a matching color key.
function computeQuantization(sourceCanvas, cols, rows, targetAspect, palette) {
  const colorCount = palette.length;
  const cells = sampleGridCellsNearestNeighbor(sourceCanvas, cols, rows, targetAspect);
  const edges = detectOutlineCells(cells, cols, rows);

  const cellMode = cells.map((px) => {
    const counts = new Map();
    for (let i = 0; i < px.length; i += 1) {
      const p = px[i];
      const key = ((p[0] >> 3) << 10) | ((p[1] >> 3) << 5) | (p[2] >> 3);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let bestKey = 0;
    let bestCount = 0;
    counts.forEach((count, key) => {
      if (count > bestCount) {
        bestCount = count;
        bestKey = key;
      }
    });
    return [((bestKey >> 10) & 31) * 8 + 4, ((bestKey >> 5) & 31) * 8 + 4, (bestKey & 31) * 8 + 4];
  });

  const nonEdgePixels = [];
  for (let i = 0; i < cells.length; i += 1) {
    if (edges[i]) continue;
    const px = cells[i];
    for (let j = 0; j < px.length; j += 1) nonEdgePixels.push(px[j]);
  }

  const { cents } = kmeansSeeded(nonEdgePixels, Math.min(Math.max(1, colorCount - 1), nonEdgePixels.length), 20);

  let merged = true;
  while (merged && cents.length > 2) {
    merged = false;
    let bj = 1;
    let bestDist = Infinity;
    for (let a = 0; a < cents.length; a += 1) {
      for (let b = a + 1; b < cents.length; b += 1) {
        const d = rgbDistance(cents[a], cents[b]);
        if (d < bestDist) {
          bestDist = d;
          bj = b;
        }
      }
    }
    if (bestDist < 45) {
      cents.splice(bj, 1);
      merged = true;
    }
  }

  // Outline (label 0) is the default for any sub-pixel not clearly closer to a real
  // cluster than it already is to pure black, so ambiguous dark pixels bias toward
  // the unified outline instead of an arbitrary nearby cluster. This is the hottest
  // loop in the whole engine (cells × 64 sub-pixels × cluster count), so it's written
  // with plain indexed loops and squared distance (no sqrt, no per-iteration closures)
  // rather than the more idiomatic .forEach — the closure/callback dispatch and the
  // sqrt call are both pure overhead here, since only the nearest-cluster ordering
  // matters and squared distance orders identically to true Euclidean distance. This
  // also keeps the comparison unit-consistent with `minDist`'s squared-magnitude start.
  const cellLabels = new Array(cols * rows);
  for (let i = 0; i < cells.length; i += 1) {
    if (edges[i]) {
      cellLabels[i] = 0;
      continue;
    }
    const px = cells[i];
    const votes = new Array(cents.length + 1).fill(0);
    for (let s = 0; s < px.length; s += 1) {
      const p = px[s];
      let minDist = p[0] ** 2 + p[1] ** 2 + p[2] ** 2;
      let best = 0;
      for (let ci = 0; ci < cents.length; ci += 1) {
        const c = cents[ci];
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < minDist) {
          minDist = d;
          best = ci + 1;
        }
      }
      votes[best] += 1;
    }
    let maxVotes = 0;
    let bestLabel = 0;
    for (let v = 0; v < votes.length; v += 1) {
      if (votes[v] > maxVotes) {
        maxVotes = votes[v];
        bestLabel = v;
      }
    }
    cellLabels[i] = bestLabel;
  }

  const finalColors = [[0, 0, 0]];
  const keptIndexes = [0];
  for (let c = 0; c < cents.length; c += 1) {
    const counts = new Map();
    let total = 0;
    for (let i = 0; i < cells.length; i += 1) {
      if (cellLabels[i] === c + 1) {
        total += 1;
        const mode = cellMode[i];
        const key = ((mode[0] >> 2) << 12) | ((mode[1] >> 2) << 6) | (mode[2] >> 2);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    if (!total) continue;
    let bestKey = 0;
    let bestCount = 0;
    counts.forEach((count, key) => {
      if (count > bestCount) {
        bestCount = count;
        bestKey = key;
      }
    });
    finalColors.push(
      bestCount / total > 0.4
        ? [((bestKey >> 12) & 63) * 4 + 2, ((bestKey >> 6) & 63) * 4 + 2, (bestKey & 63) * 4 + 2]
        : cents[c].map((v) => Math.round(v))
    );
    keptIndexes.push(c + 1);
  }

  const remap = new Map();
  keptIndexes.forEach((oldIndex, newIndex) => remap.set(oldIndex, newIndex));
  const remappedLabels = cellLabels.map((l) => remap.get(l) ?? 0);

  // The K-means/edge-detection above decides WHICH pixels group together and how
  // much real detail survives — that's the technique being reused. What each group
  // is actually CALLED and PRINTED comes only from our own fixed Universal palette:
  // every discovered color (including the outline black) gets snapped to its nearest
  // entry by true perceptual distance (LAB Delta E), never left as a raw discovered
  // RGB or a generic reference name. Two discovered clusters that snap to the SAME
  // palette entry are merged onto one shared legend slot — the same real color never
  // gets printed under two different numbers.
  const paletteIndexForColor = finalColors.map((color) => nearestPaletteColor({ r: color[0], g: color[1], b: color[2] }, palette));
  const uniquePaletteIndexes = [...new Set(paletteIndexForColor)].sort((a, b) => a - b);
  const legendSlotForPaletteIndex = new Map(uniquePaletteIndexes.map((paletteIndex, slot) => [paletteIndex, slot]));

  const assignments = remappedLabels.map((clusterSlot) => legendSlotForPaletteIndex.get(paletteIndexForColor[clusterSlot]));

  const legend = uniquePaletteIndexes.map((paletteIndex) => {
    const entry = palette[paletteIndex];
    return { hex: entry.hex, rgb: entry.rgb, name: entry.name };
  });

  return { assignments, legend };
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
// `pageBlack` is an explicit flag resolved by the caller from the Black Book page-
// background setting (see modules/bookThemeEngine.js) — never inferred from grid tint,
// which only ever controls grid LINE darkness.
function computeCellStyle({ cellSizeMm, cellSizeIn, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette, ppi, pageBlack = false }) {
  const baseFont = recommendFont(cellSizeMm, palette.length);
  // Dynamic Typography Syncing: a thick border encroaching on the cell interior drops
  // the font half a point so the glyph never clips into the line.
  const sizePt = adjustForBorderWeight(baseFont.sizePt, borderWeightPt, cellSizeMm);
  const font = { ...baseFont, sizePt };
  const textTint = recommendTextTint(cellSizeMm, gridTintPercent);

  return {
    blackoutMode: pageBlack,
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
function drawCell(ctx, { centerPx, cellSizeIn, cellSizePx, ppi, gridPattern, mode, paletteIndex, palette, style, cornerRadiusPercent, lowDetail = false, blackWhiteEdition = false }) {
  const swatch = palette[paletteIndex];
  // Black & White edition: nothing anywhere in the book spends real color ink, so the
  // "solved" fill (the only place a cell ever shows a real color) substitutes each
  // color's own grayscale luminance instead — still visually distinguishable, no ink cost.
  const solvedFill = blackWhiteEdition ? toGrayscaleHex(swatch.rgb) : swatch.hex;

  if (lowDetail) {
    const half = cellSizePx / 2;
    ctx.fillStyle = mode === "solved" ? solvedFill : "#fdfcf9";
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
    ctx.fillStyle = solvedFill;
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
    palette, sourceCanvas, gridCornerTrim = false, gridPageBlack = false, blackWhiteEdition = false,
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
  const style = computeCellStyle({ cellSizeMm, cellSizeIn: fullGrid.cellSizeIn, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette, ppi, pageBlack: gridPageBlack });

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

  const { assignments, legend } = quantizeGridCells(sourceCanvas, fullGrid.cols, fullGrid.rows, gridZone.widthIn / gridZone.heightIn, palette);

  // Below this cell size a number is unreadable anyway, so cells fall back to a flat
  // fillRect (see drawCell's lowDetail branch) — keeps a dense grid's live preview
  // responsive on every state change instead of stalling on thousands of glyph draws.
  const lowDetail = cellSizePx < 4;

  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, originY, regionWpx, regionHpx);
  ctx.clip();

  ctx.fillStyle = mode === "solved" ? "#ffffff" : style.blackoutMode ? "#000000" : "#f5f3ee";
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
        paletteIndex: assignments[index], palette: legend, style, cornerRadiusPercent, lowDetail, blackWhiteEdition,
      });
      index += 1;
    }
  }

  ctx.restore();

  ctx.fillStyle = "#9aa1af";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Full page: ${fullGrid.cols}×${fullGrid.rows} cells @ ${cellSizeMm.toFixed(1)}mm`, 12, canvas.height - 12);

  return { fullGrid, font: style.font, borderPx: style.borderPx, legend };
}

// Renders the ENTIRE safe-zone grid onto `canvas` at the real chosen print DPI —
// this is the actual page content embedded into the exported PDF, not a preview.
// `canvas` must already be sized to canvasDims.widthPx x canvasDims.heightPx.
export function renderFullMosaicGrid(canvas, opts) {
  const {
    mode, // 'print' | 'solved'
    dpi, canvasDims, safeZone, pageSide, composition,
    gridPattern, cellSizeMm, gridOverride = null, borderWeightPt, gridTintPercent, cornerRadiusPercent,
    palette, sourceCanvas, gridCornerTrim = false, gridPageBlack = false, blackWhiteEdition = false,
  } = opts;

  const ctx = canvas.getContext("2d");
  const layout = computeLayout(safeZone, composition);
  const gridZone = layout.gridZone;
  const fullGrid = resolveGrid(gridZone, cellSizeMm, gridPattern, gridOverride);
  const style = computeCellStyle({ cellSizeMm, cellSizeIn: fullGrid.cellSizeIn, borderWeightPt, gridTintPercent, cornerRadiusPercent, palette, ppi: dpi, pageBlack: gridPageBlack });

  // True K:100% solid Rich Black canvas background per the Midnight/Blackout standard.
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
  const { assignments, legend } = quantizeGridCells(sourceCanvas, fullGrid.cols, fullGrid.rows, gridZone.widthIn / gridZone.heightIn, palette);

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
        paletteIndex: assignments[index], palette: legend, style, cornerRadiusPercent, blackWhiteEdition,
      });
      index += 1;
    }
  }

  return { fullGrid, gridZone, layout, legend };
}
