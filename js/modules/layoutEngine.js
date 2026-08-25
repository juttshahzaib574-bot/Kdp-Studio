// Module: Dual-Page Layout & Key Migration Engine

export const LAYOUT_MODES = [
  {
    id: "unified",
    label: "Unified Layout (Standard)",
    note: 'Grid, title, and color key together on one right-hand page. Ideal for simpler 12-color designs or 8.25" pocket books.',
  },
  {
    id: "expanded",
    label: "Expanded Canvas Layout",
    note: "100% of the right-hand page is the coloring grid; title, instructions, and Master Palette migrate to the facing left-hand page.",
  },
];

export function getLayoutModeById(id) {
  const found = LAYOUT_MODES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown layout mode: ${id}`);
  return found;
}

// Heuristic recommendation only — the creator can always override.
export function recommendLayoutMode(trimSize, colorCount) {
  const isPocketSize = trimSize.widthIn <= 8.25 && trimSize.heightIn <= 8.25;
  return isPocketSize || colorCount <= 12 ? "unified" : "expanded";
}

// Smart Integration: when the key migrates onto a custom-background even page, its
// swatches/text need high-contrast styling to stay legible over the artwork.
export function migratedKeyStyle(hasCustomBackground) {
  return hasCustomBackground
    ? { textColor: "white", swatchBorder: "white" }
    : { textColor: "dark-gray", swatchBorder: "dark-gray" };
}
