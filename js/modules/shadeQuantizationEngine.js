// Module: LAB / Delta-E Color Quantization
// Every sampled cell color is snapped to the single closest entry in the active
// palette by true perceptual distance (CIE76 Delta E in CIELAB space), never by raw
// RGB distance. RGB distance treats R/G/B as equally salient to the eye and gets hue
// wrong often enough to snap a golden-brown pixel onto an unrelated teal or violet
// swatch instead of the correct tan/brown one — LAB separates lightness from color
// and models human vision, so "closest number" actually means "closest-looking".
//
// Forced Nearest Neighbor: every palette entry is checked and the lowest-Delta-E one
// wins, full stop — no entry is ever skipped, and no cell is ever left null, blank,
// or unmapped.

// sRGB (0-255 per channel) -> CIE XYZ (D65) -> CIELAB.
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

const REF_WHITE_X = 0.95047; // CIE standard illuminant D65
const REF_WHITE_Y = 1.0;
const REF_WHITE_Z = 1.08883;

function labF(t) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

// Hot-loop variant: plain (r,g,b) numbers in, [l,a,b] array out — no intermediate
// object allocation on either side. The mosaic engine's k-means clustering and
// per-cell majority vote (mosaicRenderer.js) call this hundreds of thousands of times
// per render (once per sub-pixel), so avoiding an {r,g,b}/{x,y,z} wrapper object per
// call meaningfully cuts GC pressure there; rgbToLab below is the same math for the
// much colder call sites (a few dozen palette swatches per render).
export function rgbToLabTriple(r, g, b) {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;
  const fx = labF(x / REF_WHITE_X);
  const fy = labF(y / REF_WHITE_Y);
  const fz = labF(z / REF_WHITE_Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function rgbToLab({ r, g, b }) {
  const [l, a, bb] = rgbToLabTriple(r, g, b);
  return { l, a, b: bb };
}

function linearToSrgb(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

function labFInverse(t) {
  const t3 = t * t * t;
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
}

// Inverse of rgbToLabTriple — needed when a computed LAB value (e.g. a k-means
// centroid, which is an average of LAB sub-pixels and has no single original RGB
// pixel to fall back on) has to become an actual displayable/printable color.
export function labTripleToRgb(l, a, b) {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = REF_WHITE_X * labFInverse(fx);
  const y = REF_WHITE_Y * labFInverse(fy);
  const z = REF_WHITE_Z * labFInverse(fz);
  const rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const gl = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
}

// CIE76 Delta E: Euclidean distance between two LAB colors.
export function deltaE(labA, labB) {
  const dl = labA.l - labB.l;
  const da = labA.a - labB.a;
  const db = labA.b - labB.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

export function colorDistance(rgbA, rgbB) {
  return deltaE(rgbToLab(rgbA), rgbToLab(rgbB));
}

// A palette swatch's LAB value never changes, but gets looked up once per sampled
// cell — up to several thousand per page — so it's memoized on the swatch itself
// instead of re-converted from scratch on every single comparison.
function paletteLab(entry) {
  if (!entry._lab) entry._lab = rgbToLab(entry.rgb);
  return entry._lab;
}

export function nearestPaletteColor(rgb, palette) {
  if (!palette || palette.length === 0) {
    throw new Error("nearestPaletteColor: palette is empty — nothing to snap to.");
  }
  const lab = rgbToLab(rgb);
  let bestIndex = 0;
  let bestDist = Infinity;
  palette.forEach((entry, index) => {
    const dist = deltaE(lab, paletteLab(entry));
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = index;
    }
  });
  return bestIndex;
}
