// Section 4: Color Key Standards for Mosaic Color-by-Number Books
import { UNIVERSAL_PALETTE_36 } from "./data/universalPalette.js?v=49";

// The 5 selectable color-COUNT configurations. There is only one color source now
// (see universalPalette.js) — every hex value is exact and hardcoded, never brand-
// guessed — these options only control how many of its colors a given page uses.
export const COLOR_SET_OPTIONS = [
  { id: "set-12", label: "12-Color Set", sizes: [12] },
  { id: "set-24", label: "24-Color Set", sizes: [24] },
  { id: "set-36", label: "Full Palette (41 Colors)", sizes: [36] },
  { id: "set-all", label: "All 3 Sets (12, 24 & Full)", sizes: [12, 24, 36] },
  { id: "set-custom-pair", label: "Choose Any 2 Sets", sizes: null },
];

export function getSizesForSelection(optionId, customPair = [12, 24]) {
  const option = COLOR_SET_OPTIONS.find((o) => o.id === optionId);
  if (!option) throw new Error(`Unknown color set option: ${optionId}`);
  return option.sizes ?? customPair;
}

// Hand-picked subsets of the Universal Palette — chosen to span the full hue wheel
// plus neutrals at every size. 12 ⊂ 24 ⊂ full deliberately, so stepping a page up
// in complexity only adds colors, never swaps one from under an already-colored page.
// The 24-set prioritizes earth tones and mid-blues over near-duplicate hues (Crimson
// ≈ Cherry, Amber ≈ Gold, Lime ≈ Grass) so natural-photo subjects like animals and
// landscapes get faithful mid-range browns and a proper steel-blue instead of only
// jumping from sky-blue to cobalt.
const SET_12_IDS = new Set([1, 7, 9, 11, 13, 17, 19, 21, 24, 26, 33, 36]);
const SET_24_IDS = new Set([1, 3, 6, 7, 9, 11, 13, 14, 15, 16, 17, 19, 21, 24, 25, 26, 29, 30, 33, 34, 36, 38, 39, 40]);

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
