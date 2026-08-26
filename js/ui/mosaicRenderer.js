// Draws the actual mosaic grid content — shape, typography, border, corner radius,
// and quantized color. Two entry points share the same per-cell drawing code:
//   - renderMosaicPreview: a zoomed on-screen detail crop at a fixed 300 "detail PPI"
//     so real point sizes/line weights stay proportionally accurate while remaining
//     legible on screen (used by the Stacked Live Preview Gallery).
//   - renderFullMosaicGrid: the entire safe-zone grid at the real chosen print DPI,
//     used to generate the actual page image embedded into the exported PDF.

import { computeFrameGeometry, drawFrame } from "./preview.js?v=15";
import { computeGridDimensions, cellCenterIn, cellPolygonIn, mmToIn, isCellInGridSilhouette } from "../modules/gridPatternEngine.js?v=15";
import { recommendFont, recommendTextTint, adjustForBorderWeight, centerOffsetIn, letterSpacingForLabel } from "../modules/typographyEngine.js?v=15";
import { gridColorFromTint } from "../modules/borderStyleEngine.js?v=15";
import { cornerRadiusIn, isFullCircle } from "../modules/cornerRadiusEngine.js?v=15";
import { nearestPaletteColor, rgbToLab } from "../modules/shadeQuantizationEngine.js?v=15";
import { computeLayout, LAYOUT_ELEMENTS } from "../modules/layoutCompositionEngine.js?v=15";

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

  // Edge-preserving smoothing, not a plain blur: a plain gaussian/box blur softens
  // real silhouette edges right along with noise, which is backwards for this job.
  // A bilateral filter only averages a pixel with neighbors that are BOTH spatially
  // close AND already similar in color, so a hard boundary (black outline against a
  // gold fill) stays hard, while fine same-region texture (anti-aliasing, a thin
  // shading stroke a pixel or two wide) gets smoothed into its surrounding dominant
  // color instead of surviving as an inconsistent fragment. This is the standard
  // preprocessing step in "cartoonization" pipelines (bilateral filter → color
  // quantization → edge detection) for exactly this reason.
  const imageData = ctx.getImageData(0, 0, c.width, c.height);
  ctx.putImageData(bilateralFilter(imageData), 0, 0);
  return c;
}

// radius 2 (5x5 taps), sigmaSpace 2, sigmaColor 30: smooths within roughly a
// palette-swatch's worth of color difference, preserves anything bigger (a real
// edge between two genuinely different colors).
function bilateralFilter(imageData, radius = 2, sigmaSpace = 2, sigmaColor = 30) {
  const { data: src, width: w, height: h } = imageData;
  const out = new Uint8ClampedArray(src.length);

  const spatialWeights = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      spatialWeights.push(Math.exp(-(dx * dx + dy * dy) / (2 * sigmaSpace * sigmaSpace)));
    }
  }
  const colorWeightLUT = new Float32Array(766); // max possible |dr|+|dg|+|db| is 255*3
  for (let d = 0; d < colorWeightLUT.length; d += 1) {
    colorWeightLUT[d] = Math.exp(-(d * d) / (2 * sigmaColor * sigmaColor));
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ci = (y * w + x) * 4;
      const cr = src[ci];
      const cg = src[ci + 1];
      const cb = src[ci + 2];
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let wSum = 0;
      let tapIndex = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx += 1, tapIndex += 1) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          const ni = (ny * w + nx) * 4;
          const nr = src[ni];
          const ng = src[ni + 1];
          const nb = src[ni + 2];
          const colorDist = Math.abs(nr - cr) + Math.abs(ng - cg) + Math.abs(nb - cb);
          const weight = spatialWeights[tapIndex] * colorWeightLUT[colorDist];
          rSum += nr * weight;
          gSum += ng * weight;
          bSum += nb * weight;
          wSum += weight;
        }
      }
      out[ci] = rSum / wSum;
      out[ci + 1] = gSum / wSum;
      out[ci + 2] = bSum / wSum;
      out[ci + 3] = src[ci + 3];
    }
  }

  return new ImageData(out, w, h);
}

// A true line-art outline stroke is dark AND essentially colorless (near-neutral
// black/gray), which is what actually distinguishes it from a dark but SATURATED
// palette color — lightness alone can't tell them apart. Navy Blue (#000080) is
// darker (LAB L≈13) than Charcoal Black (#36454F, L≈28), but it's a real, intended
// color; the difference is chroma (√(a²+b²)): Navy Blue's is ≈80, Charcoal
// Black's is ≈9. Every genuinely dark-and-saturated entry in the Universal 36 sits
// well clear of these thresholds (checked directly: Dark Walnut L≈22/chroma≈22,
// Deep Violet L≈21/chroma≈74, Forest Green L≈51/chroma≈67), so this only ever
// catches pixels that are actually near-black-and-neutral.
const OUTLINE_LIGHTNESS_MAX = 20;
const OUTLINE_CHROMA_MAX = 12;

function isOutlinePixel(rgb) {
  const lab = rgbToLab(rgb);
  const chroma = Math.hypot(lab.a, lab.b);
  return lab.l < OUTLINE_LIGHTNESS_MAX && chroma < OUTLINE_CHROMA_MAX;
}

// The single darkest entry in the active palette (always resolves to true black —
// every set size includes one) — every pixel isOutlinePixel flags gets forced onto
// this ONE index directly, skipping the normal all-palette vote entirely. Without
// this, a near-black pixel competing normally could split votes between this and
// a second near-black entry (e.g. Jet Black vs Charcoal Black), fragmenting what
// should read as one continuous, unified outline into two different numbers
// zig-zagging along the same line.
function darkestPaletteIndex(palette) {
  let bestIndex = 0;
  let bestL = Infinity;
  palette.forEach((entry, index) => {
    const l = rgbToLab(entry.rgb).l;
    if (l < bestL) {
      bestL = l;
      bestIndex = index;
    }
  });
  return bestIndex;
}

// True background is a fact about the SOURCE image, not something to infer through
// per-cell color voting — a cell outside the subject's silhouette is not "the color
// closest to white in the palette", it's blank paper. Flood-fill from the canvas's
// own outer border through connected near-white pixels (the standard "magic wand
// from the edges" every real background-removal/pattern-generator tool uses, with a
// tolerance for anti-aliased near-white edges); anything the fill reaches is real
// background, everything else is the subject, however light its own colors are.
// This is what actually stops a stray gray/navy cell from floating in open space
// outside the silhouette — that cell is never handed to the palette vote at all.
const BACKGROUND_LIGHTNESS_MIN = 92;
const BACKGROUND_CHROMA_MAX = 8;
export const BACKGROUND_CELL = -1;

function computeBackgroundMask(imageData, w, h) {
  const mask = new Uint8Array(w * h);
  const isNearWhite = (i) => {
    const lab = rgbToLab({ r: imageData[i], g: imageData[i + 1], b: imageData[i + 2] });
    return lab.l > BACKGROUND_LIGHTNESS_MIN && Math.hypot(lab.a, lab.b) < BACKGROUND_CHROMA_MAX;
  };

  const stack = [];
  const seed = (x, y) => {
    const p = y * w + x;
    if (mask[p]) return;
    if (!isNearWhite(p * 4)) return;
    mask[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x += 1) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    seed(0, y);
    seed(w - 1, y);
  }

  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    const y = Math.floor(p / w);
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }

  return mask;
}

// Granular Shade Separation starts here, not in the quantizer: this is a cover-crop
// (center-crop to the grid's own aspect ratio, never a stretch) plus a small per-cell
// supersample — so a single outline-stroke or anti-aliased edge pixel can no longer
// hijack an entire cell's color.
//
// Each of the 16 sub-samples is snapped to the palette INDIVIDUALLY, then the cell
// takes whichever palette color the most sub-samples voted for — never the average
// RGB of the raw sub-samples. Averaging raw pixels across a hard edge (a black
// outline against a gold fill, or an outline against white background) produces a
// blended gray/tan that doesn't actually exist anywhere in the source artwork; that
// blend then gets quantized like it was real data, which is what was showing up as
// a muddy gray halo traced around every silhouette instead of a crisp line. Voting
// among already-quantized colors means the result is always a real palette color a
// majority of the cell's own pixels actually are — never an invented in-between one.
function quantizeGridCells(sourceCanvas, cols, rows, targetAspect, palette) {
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
  const backgroundMask = computeBackgroundMask(imageData, sw, sh);
  const SUPERSAMPLE = 4; // 4x4 sub-samples voted per cell
  const votes = new Int32Array(palette.length);
  const assignments = [];
  const outlineIndex = darkestPaletteIndex(palette);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      votes.fill(0);
      let backgroundVotes = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const u = (col + (sx + 0.5) / SUPERSAMPLE) / cols;
          const v = (row + (sy + 0.5) / SUPERSAMPLE) / rows;
          const x = Math.max(0, Math.min(sw - 1, Math.round(cropX + u * cropW)));
          const y = Math.max(0, Math.min(sh - 1, Math.round(cropY + v * cropH)));
          if (backgroundMask[y * sw + x]) {
            backgroundVotes += 1;
            continue;
          }
          const i = (y * sw + x) * 4;
          const rgb = { r: imageData[i], g: imageData[i + 1], b: imageData[i + 2] };
          const idx = isOutlinePixel(rgb) ? outlineIndex : nearestPaletteColor(rgb, palette);
          votes[idx] += 1;
        }
      }
      let bestIndex = BACKGROUND_CELL;
      let bestCount = backgroundVotes;
      for (let i = 0; i < votes.length; i += 1) {
        if (votes[i] > bestCount) {
          bestCount = votes[i];
          bestIndex = i;
        }
      }
      assignments.push(bestIndex);
    }
  }

  return mergeSmallRegions(assignments, cols, rows);
}

// A cell-by-cell "majority vote" (above) removes invented blend colors, but it does
// nothing about a single cell — or a small handful of them — landing on a real,
// correctly-nearest palette color that still isn't what the region around it is.
// That's confetti: a fleck of "Amber Gold" alone inside a big field of "Golden
// Yellow", each individually a valid closest-match, together reading as muddy
// noise instead of one bold, printable block. Every professional paint-by-number /
// cross-stitch generator runs a region-merging cleanup pass for exactly this reason
// (the open-source paintbynumbersgenerator calls it facet removal; commercial
// converters expose it as a "Min Area" setting) — find every contiguous same-color
// region, and any region smaller than MIN_REGION_CELLS gets absorbed into whichever
// neighboring region borders it the most, smallest region first.
const MIN_REGION_CELLS = 2;

function mergeSmallRegions(assignments, cols, rows) {
  const total = cols * rows;
  const regionId = new Int32Array(total).fill(-1);
  const regions = []; // { colorIndex, cells: number[] } | null once absorbed

  const gridNeighborsOf = (cellIndex) => {
    const r = Math.floor(cellIndex / cols);
    const c = cellIndex % cols;
    const out = [];
    if (r > 0) out.push(cellIndex - cols);
    if (r < rows - 1) out.push(cellIndex + cols);
    if (c > 0) out.push(cellIndex - 1);
    if (c < cols - 1) out.push(cellIndex + 1);
    return out;
  };

  // Connected-component labeling: flood-fill every maximal group of orthogonally
  // touching cells that already share the same palette index.
  for (let start = 0; start < total; start += 1) {
    if (regionId[start] !== -1) continue;
    const color = assignments[start];
    const id = regions.length;
    const cells = [start];
    regionId[start] = id;
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      gridNeighborsOf(cur).forEach((n) => {
        if (regionId[n] === -1 && assignments[n] === color) {
          regionId[n] = id;
          cells.push(n);
          stack.push(n);
        }
      });
    }
    regions.push({ colorIndex: color, cells });
  }

  // Smallest region first, mirroring how these tools describe the process ("smallest
  // cells are merged with their respective largest neighbour until only N are left").
  const order = regions.map((_, id) => id).sort((a, b) => regions[a].cells.length - regions[b].cells.length);

  order.forEach((id) => {
    const region = regions[id];
    if (!region || region.cells.length >= MIN_REGION_CELLS) return;

    const neighborIds = new Set();
    region.cells.forEach((cellIndex) => {
      gridNeighborsOf(cellIndex).forEach((n) => {
        if (regionId[n] !== id) neighborIds.add(regionId[n]);
      });
    });
    if (neighborIds.size === 0) return; // the whole grid is one region — nothing to merge into

    let bestId = null;
    let bestSize = -1;
    neighborIds.forEach((nid) => {
      const size = regions[nid].cells.length;
      if (size > bestSize) {
        bestSize = size;
        bestId = nid;
      }
    });

    const target = regions[bestId];
    region.cells.forEach((cellIndex) => {
      regionId[cellIndex] = bestId;
      target.cells.push(cellIndex);
    });
    regions[id] = null;
  });

  const cleaned = new Array(total);
  for (let i = 0; i < total; i += 1) {
    cleaned[i] = regions[regionId[i]].colorIndex;
  }
  return cleaned;
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

  const assignments = quantizeGridCells(sourceCanvas, fullGrid.cols, fullGrid.rows, gridZone.widthIn / gridZone.heightIn, palette);

  // Below this cell size a number is unreadable anyway, so cells fall back to a flat
  // fillRect (see drawCell's lowDetail branch) — keeps a dense grid's live preview
  // responsive on every state change instead of stalling on thousands of glyph draws.
  const lowDetail = cellSizePx < 4;

  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, originY, regionWpx, regionHpx);
  ctx.clip();

  // The real page background, not just a loading placeholder: background cells (see
  // quantizeGridCells) are now genuinely skipped rather than drawn, so this fill is
  // what actually shows through the silhouette's negative space — it has to match
  // renderFullMosaicGrid's real export background or the preview would show a dark
  // void around the subject that the real PDF never has. Solved mode always reads
  // as a normal finished page (white), matching the real export; print mode goes
  // rich black only in Blackout mode, same as the export.
  ctx.fillStyle = mode === "solved" ? "#ffffff" : style.blackoutMode ? "#000000" : "#f5f3ee";
  ctx.fillRect(originX, originY, regionWpx, regionHpx);

  let index = 0;
  for (let row = 0; row < fullGrid.rows; row += 1) {
    for (let col = 0; col < fullGrid.cols; col += 1) {
      if (gridCornerTrim && !isCellInGridSilhouette(col, row, fullGrid.cols, fullGrid.rows)) {
        index += 1;
        continue;
      }
      // A cell the background flood-fill claimed (see quantizeGridCells) is blank
      // paper outside the subject's silhouette — not a color, so nothing gets drawn
      // for it at all, same as a corner-trimmed cell.
      if (assignments[index] === BACKGROUND_CELL) {
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

  // True K:100% solid Rich Black canvas background per the Midnight/Blackout standard.
  // This is also what shows through wherever a background cell is skipped (see
  // quantizeGridCells/BACKGROUND_CELL) — white here, so the trimmed-to-silhouette
  // negative space around the subject reads as ordinary blank page, not a void.
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
  const assignments = quantizeGridCells(sourceCanvas, fullGrid.cols, fullGrid.rows, gridZone.widthIn / gridZone.heightIn, palette);

  let index = 0;
  for (let row = 0; row < fullGrid.rows; row += 1) {
    for (let col = 0; col < fullGrid.cols; col += 1) {
      if (gridCornerTrim && !isCellInGridSilhouette(col, row, fullGrid.cols, fullGrid.rows)) {
        index += 1;
        continue;
      }
      if (assignments[index] === BACKGROUND_CELL) {
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
