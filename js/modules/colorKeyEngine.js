// Section 4: Color Key Standards for Mosaic Color-by-Number Books
import { UNIVERSAL_PALETTE_36 } from "./data/universalPalette.js?v=45";

// The 5 selectable color-COUNT configurations described in the blueprint. There is
// only one color source now (see universalPalette.js) — every hex value is exact and
// hardcoded, never brand-guessed — these options only control how many of its 36
// colors a given page is allowed to use.
export const COLOR_SET_OPTIONS = [
  { id: "set-12", label: "12-Color Set", sizes: [12] },
  { id: "set-24", label: "24-Color Set", sizes: [24] },
  { id: "set-36", label: "36-Color Set", sizes: [36] },
  { id: "set-all", label: "All 3 Sets (12, 24 & 36)", sizes: [12, 24, 36] },
  { id: "set-custom-pair", label: "Choose Any 2 Sets", sizes: null },
];

export function getSizesForSelection(optionId, customPair = [12, 24]) {
  const option = COLOR_SET_OPTIONS.find((o) => o.id === optionId);
  if (!option) throw new Error(`Unknown color set option: ${optionId}`);
  return option.sizes ?? customPair;
}

// Fixed, hand-picked 12- and 24-color subsets of the Universal 36 — chosen once to
// span the full hue wheel plus neutrals at every size, not "the first N ids" (which
// would have skewed a 12-color page toward whatever happened to be listed first).
// 12 ⊂ 24 ⊂ 36 deliberately, so stepping a page up in complexity only adds colors,
// never swaps one out from under a page that's already been colored against it.
const SET_12_IDS = new Set([1, 7, 9, 11, 13, 17, 19, 21, 24, 26, 33, 36]);
const SET_24_IDS = new Set([1, 3, 6, 7, 9, 10, 11, 13, 14, 15, 16, 17, 19, 20, 21, 24, 25, 26, 29, 30, 32, 33, 34, 36]);

export function getPaletteForSize(size) {
  if (size === 12) return UNIVERSAL_PALETTE_36.filter((c) => SET_12_IDS.has(c.id));
  if (size === 24) return UNIVERSAL_PALETTE_36.filter((c) => SET_24_IDS.has(c.id));
  if (size === 36) return UNIVERSAL_PALETTE_36;
  throw new Error(`Unsupported color set size: ${size}`);
}

export function buildSwatchList(size) {
  return getPaletteForSize(size);
}

// De-duplicated union across every selected set size — the target palette used by the
// quantization engine when a book includes more than one color-set option.
export function buildCombinedPalette(sizes) {
  const seen = new Set();
  const combined = [];
  sizes.forEach((size) => {
    buildSwatchList(size).forEach((swatch) => {
      if (!seen.has(swatch.id)) {
        seen.add(swatch.id);
        combined.push(swatch);
      }
    });
  });
  return combined;
}

// Custom Color-to-Number Order: the printed number for a color has always come purely
// from its position in the palette array handed to the quantization engine (see
// mosaicRenderer.js's computeQuantization — the first surviving palette position becomes
// "1", the next becomes "2", and so on) — the SAME fixed order for every image using
// that palette, book-wide. This reorders that array per image, so a creator can decide
// e.g. Black prints as "1" on one puzzle and "2" on another, entirely independent of the
// book's default numbering. `customOrder` is an array of swatch ids in the desired
// display order; any palette entries it doesn't mention (a stale override after the
// book's color set changed, say) keep their original relative order, appended at the
// end, so a color already colored-in under some number never silently vanishes.
export function applyCustomColorOrder(palette, customOrder) {
  if (!customOrder || !customOrder.length) return palette;
  const byId = new Map(palette.map((swatch) => [swatch.id, swatch]));
  const seen = new Set();
  const ordered = [];
  customOrder.forEach((id) => {
    const swatch = byId.get(id);
    if (swatch && !seen.has(id)) {
      ordered.push(swatch);
      seen.add(id);
    }
  });
  palette.forEach((swatch) => {
    if (!seen.has(swatch.id)) ordered.push(swatch);
  });
  return ordered;
}
