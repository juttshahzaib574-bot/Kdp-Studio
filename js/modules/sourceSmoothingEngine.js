// Module: Source Image Smoothing (pre-quantization denoise)
// Optional, off by default. Runs a small edge-preserving MEDIAN filter over the
// source image before it's ever sampled for color quantization — removes photo
// grain/sensor noise that would otherwise split one flat region's 64 per-cell
// sub-pixel votes across two or three near-identical palette colors, especially at
// larger cell sizes (5-6mm) where each cell samples a bigger, noisier patch of the
// source. A MEDIAN filter is used deliberately, not a blur: it clips small outlier
// pixels while keeping real edges between regions sharp, unlike a Gaussian/box blur,
// which would soften the very boundaries the outline-detection step depends on.

export const SOURCE_SMOOTHING_OPTIONS = [
  { id: "off", label: "Off", note: "Uses the uploaded image exactly as-is — best for already-clean flat-color art." },
  { id: "light", label: "Light Denoise", note: "A small 3×3 median pass — removes typical photo grain, keeps edges sharp." },
  { id: "strong", label: "Strong Denoise", note: "A wider 5×5 median pass for busy/high-noise photos, at some cost to fine texture." },
];

const RADIUS_BY_MODE = { light: 1, strong: 2 };

// Single-slot memo, same pattern as mosaicRenderer.js's quantizationCache — a source
// image's smoothed version never changes for a given (canvas, mode) pair, and this is
// re-requested on every render tick (even ones unrelated to the image or this setting),
// so without it the filter would needlessly re-run every time a slider moves.
let smoothingCache = null;

export function applySourceSmoothing(sourceCanvas, mode) {
  if (!mode || mode === "off" || !RADIUS_BY_MODE[mode]) return sourceCanvas;

  if (smoothingCache && smoothingCache.sourceCanvas === sourceCanvas && smoothingCache.mode === mode) {
    return smoothingCache.result;
  }

  const result = medianFilter(sourceCanvas, RADIUS_BY_MODE[mode]);
  smoothingCache = { sourceCanvas, mode, result };
  return result;
}

// In-place insertion sort of the first `n` entries — fast for the tiny windows here
// (9 or 25 elements), no allocation, and simpler than a real selection algorithm for
// values this small.
function insertionSort(arr, n) {
  for (let i = 1; i < n; i += 1) {
    const v = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > v) {
      arr[j + 1] = arr[j];
      j -= 1;
    }
    arr[j + 1] = v;
  }
}

function medianFilter(sourceCanvas, radius) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const src = sourceCanvas.getContext("2d").getImageData(0, 0, w, h).data;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  const dst = outCtx.createImageData(w, h);
  const dstData = dst.data;

  const windowSize = (radius * 2 + 1) ** 2;
  const medianIndex = windowSize >> 1;
  const rWin = new Uint8ClampedArray(windowSize);
  const gWin = new Uint8ClampedArray(windowSize);
  const bWin = new Uint8ClampedArray(windowSize);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let n = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        const rowOffset = sy * w;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sx = Math.min(w - 1, Math.max(0, x + dx));
          const i = (rowOffset + sx) * 4;
          rWin[n] = src[i];
          gWin[n] = src[i + 1];
          bWin[n] = src[i + 2];
          n += 1;
        }
      }
      insertionSort(rWin, n);
      insertionSort(gWin, n);
      insertionSort(bWin, n);

      const di = (y * w + x) * 4;
      dstData[di] = rWin[medianIndex];
      dstData[di + 1] = gWin[medianIndex];
      dstData[di + 2] = bWin[medianIndex];
      dstData[di + 3] = 255;
    }
  }

  outCtx.putImageData(dst, 0, 0);
  return out;
}
