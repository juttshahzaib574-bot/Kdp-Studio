// Module: Source Image Posterize (pre-quantization level reduction)
// Optional, off by default. Collapses each RGB channel down to a small number of
// discrete steps before the source is ever sampled for color quantization — turns a
// smooth gradient (sky, skin tone, shading) into a handful of flat color bands, the
// same effect a "Posterize" filter in Photoshop/GIMP produces. This is what most
// professional color-by-number sellers actually do to a photo before it becomes a
// puzzle: simplify it into flat regions with a filter first, rather than relying on
// the quantizer alone to guess where one region ends and the next begins.

export const POSTERIZE_LEVEL_MIN = 2;
export const POSTERIZE_LEVEL_MAX = 8;

// Single-slot memo, same pattern as sourceSmoothingEngine.js's cache — re-requested on
// every render tick (even ones unrelated to this setting), so without it the filter
// would needlessly re-run every time an unrelated slider moves.
let posterizeCache = null;

export function applyPosterize(sourceCanvas, levels) {
  if (!levels || levels < POSTERIZE_LEVEL_MIN) return sourceCanvas;
  const clamped = Math.min(POSTERIZE_LEVEL_MAX, Math.max(POSTERIZE_LEVEL_MIN, levels));

  if (posterizeCache && posterizeCache.sourceCanvas === sourceCanvas && posterizeCache.levels === clamped) {
    return posterizeCache.result;
  }

  const result = posterize(sourceCanvas, clamped);
  posterizeCache = { sourceCanvas, levels: clamped, result };
  return result;
}

function posterize(sourceCanvas, levels) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const data = sourceCanvas.getContext("2d").getImageData(0, 0, w, h).data;

  // A 256-entry lookup table beats recomputing the same round/round math per pixel —
  // there are only 256 possible input values per channel regardless of image size.
  const step = 255 / (levels - 1);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v += 1) {
    lut[v] = Math.round(Math.round(v / step) * step);
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  const dst = outCtx.createImageData(w, h);
  const dstData = dst.data;

  for (let i = 0; i < data.length; i += 4) {
    dstData[i] = lut[data[i]];
    dstData[i + 1] = lut[data[i + 1]];
    dstData[i + 2] = lut[data[i + 2]];
    dstData[i + 3] = 255;
  }

  outCtx.putImageData(dst, 0, 0);
  return out;
}
