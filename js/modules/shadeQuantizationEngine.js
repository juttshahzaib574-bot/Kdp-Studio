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

function rgbToXyz({ r, g, b }) {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  return {
    x: rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    y: rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175,
    z: rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041,
  };
}

const REF_WHITE = { x: 0.95047, y: 1.0, z: 1.08883 }; // CIE standard illuminant D65

function xyzToLab({ x, y, z }) {
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / REF_WHITE.x);
  const fy = f(y / REF_WHITE.y);
  const fz = f(z / REF_WHITE.z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function rgbToLab(rgb) {
  return xyzToLab(rgbToXyz(rgb));
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

// One strict-nearest-neighbor palette index per sampled cell color. Deliberately NOT
// reassigning a cell to its 2nd-closest match just because an earlier cell already
// claimed the true nearest one — a color-by-number page is supposed to have many
// cells share the same number; that reassignment used to shove every cell after the
// first one that wanted a given color onto a progressively worse, sometimes visually
// unrelated, palette entry.
export function assignDistinctShades(cellColors, palette) {
  return cellColors.map((rgb) => nearestPaletteColor(rgb, palette));
}
