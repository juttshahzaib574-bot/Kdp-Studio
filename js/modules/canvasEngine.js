// Module 1: Canvas Dimension & Resolution Engine
// Pure functions only — no DOM access — so the math can be reused by the
// preview renderer, the future PDF assembler, and unit tests alike.

export const TRIM_SIZES = [
  {
    id: "square-8.5",
    label: '8.5" × 8.5"',
    sublabel: "Square — Industry Standard",
    widthIn: 8.5,
    heightIn: 8.5,
    note: "Best for square pixel art and modern mosaic grids.",
  },
  {
    id: "letter-8.5x11",
    label: '8.5" × 11"',
    sublabel: "Letter — Maximum Real Estate",
    widthIn: 8.5,
    heightIn: 11,
    note: "Best for vertical layouts or complex portraits.",
  },
  {
    id: "square-8.25",
    label: '8.25" × 8.25"',
    sublabel: "Small Square",
    widthIn: 8.25,
    heightIn: 8.25,
    note: "Travel-sized or pocket mosaic puzzle books.",
  },
  {
    id: "portrait-8x10",
    label: '8" × 10"',
    sublabel: "Standard Portrait",
    widthIn: 8,
    heightIn: 10,
    note: "Alternative portrait layout, slightly wider than Letter.",
  },
];

export const DPI_MIN = 300;
export const DPI_MAX = 600;
export const DPI_DEFAULT = 300;

export function getTrimSizeById(id) {
  const found = TRIM_SIZES.find((size) => size.id === id);
  if (!found) {
    throw new Error(`Unknown trim size id: ${id}`);
  }
  return found;
}

export function clampDpi(dpi) {
  const value = Number.isFinite(dpi) ? dpi : DPI_DEFAULT;
  return Math.min(DPI_MAX, Math.max(DPI_MIN, Math.round(value)));
}

// Raw trim-size pixel dimensions at a given DPI, with no bleed applied.
export function computeTrimPixels(trimSize, dpi) {
  return {
    widthPx: Math.round(trimSize.widthIn * dpi),
    heightPx: Math.round(trimSize.heightIn * dpi),
  };
}
