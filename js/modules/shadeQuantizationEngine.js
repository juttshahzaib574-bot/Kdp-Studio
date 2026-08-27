// Module: LAB / CIEDE2000 Color Quantization
// Every sampled cell color is snapped to the single closest entry in the active
// palette by CIEDE2000 Delta E in CIELAB space — the gold-standard perceptual
// color-difference formula, not the simpler CIE76. CIE76 (plain Euclidean in LAB)
// over-weights blue differences, under-weights chroma in saturated colors, and
// misjudges lightness in darks; CIEDE2000 corrects all three with weighting
// functions plus a rotation term for the blue region specifically.
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

// CIEDE2000 Delta E: the gold-standard perceptual color-difference formula (CIE
// Technical Report 142-2001). Corrects CIE76's known weaknesses — blue-region
// exaggeration, chroma under-weighting in saturated colors, lightness misjudgment
// in darks — via lightness/chroma/hue weighting functions plus a rotation term
// that fixes the problematic blue region specifically.
// kL = kC = kH = 1 (standard D65 / 2-degree observer viewing conditions).
const DEG = Math.PI / 180;
const POW25_7 = 6103515625; // 25^7

export function deltaE2000(labA, labB) {
  const L1 = labA.l, a1 = labA.a, b1 = labA.b;
  const L2 = labB.l, a2 = labB.a, b2 = labB.b;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab = (C1 + C2) / 2;
  const Cab7 = Cab ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + POW25_7)));

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = Math.atan2(b1, a1p) / DEG;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) / DEG;
  if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const C1pC2p = C1p * C2p;

  let dhp;
  if (C1pC2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1pC2p) * Math.sin((dhp / 2) * DEG);

  const Lp = (L1 + L2) / 2;
  const Cp = (C1p + C2p) / 2;

  let hp;
  if (C1pC2p === 0) {
    hp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hp = (h1p + h2p + 360) / 2;
  } else {
    hp = (h1p + h2p - 360) / 2;
  }

  const T = 1
    - 0.17 * Math.cos((hp - 30) * DEG)
    + 0.24 * Math.cos(2 * hp * DEG)
    + 0.32 * Math.cos((3 * hp + 6) * DEG)
    - 0.20 * Math.cos((4 * hp - 63) * DEG);

  const Lpm50sq = (Lp - 50) ** 2;
  const SL = 1 + 0.015 * Lpm50sq / Math.sqrt(20 + Lpm50sq);
  const SC = 1 + 0.045 * Cp;
  const SH = 1 + 0.015 * Cp * T;

  const Cp7 = Cp ** 7;
  const RC = 2 * Math.sqrt(Cp7 / (Cp7 + POW25_7));
  const hpShift = (hp - 275) / 25;
  const dTheta = 30 * Math.exp(-(hpShift * hpShift));
  const RT = -Math.sin(2 * dTheta * DEG) * RC;

  const LpSL = dLp / SL;
  const CpSC = dCp / SC;
  const HpSH = dHp / SH;
  return Math.sqrt(LpSL * LpSL + CpSC * CpSC + HpSH * HpSH + RT * CpSC * HpSH);
}

// Array-form variant for call sites that store LAB as [L,a,b] triples.
export function deltaE2000Triple(labA, labB) {
  return deltaE2000({ l: labA[0], a: labA[1], b: labA[2] }, { l: labB[0], a: labB[1], b: labB[2] });
}

export function colorDistance(rgbA, rgbB) {
  return deltaE2000(rgbToLab(rgbA), rgbToLab(rgbB));
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
    const dist = deltaE2000(lab, paletteLab(entry));
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function nearestPaletteColorLAB(lab, palette) {
  if (!palette || palette.length === 0) {
    throw new Error("nearestPaletteColorLAB: palette is empty — nothing to snap to.");
  }
  let bestIndex = 0;
  let bestDist = Infinity;
  palette.forEach((entry, index) => {
    const dist = deltaE2000(lab, paletteLab(entry));
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = index;
    }
  });
  return bestIndex;
}
