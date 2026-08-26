// Section 4: Color Key Standards for Mosaic Color-by-Number Books
import { PALETTE_12, PALETTE_24, PALETTE_36, BRANDS } from "./data/colorPalettes.js?v=6";
import { approximateHexForName, hexToRgb } from "./data/colorNameHex.js?v=6";

export { BRANDS };

// The 5 selectable color-set configurations described in the blueprint.
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

export function getPaletteForSize(size, brandId) {
  if (size === 12) {
    return PALETTE_12.map((entry) => ({ family: entry.family, name: entry[brandId] }));
  }
  if (size === 24) {
    return PALETTE_24.flatMap((entry) => (entry[brandId] || []).map((name) => ({ family: entry.family, name })));
  }
  if (size === 36) {
    const brandData = PALETTE_36[brandId] || {};
    return Object.entries(brandData).flatMap(([family, names]) => names.map((name) => ({ family, name })));
  }
  throw new Error(`Unsupported color set size: ${size}`);
}

export function buildSwatchList(size, brandId) {
  return getPaletteForSize(size, brandId).map((entry) => {
    const hex = approximateHexForName(entry.name);
    return { ...entry, hex, rgb: hexToRgb(hex) };
  });
}

// De-duplicated union across every selected set size — the target palette used by the
// quantization engine when a book includes more than one color-set option.
export function buildCombinedPalette(sizes, brandId) {
  const seen = new Set();
  const combined = [];
  sizes.forEach((size) => {
    buildSwatchList(size, brandId).forEach((swatch) => {
      const key = swatch.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(swatch);
      }
    });
  });
  return combined;
}
