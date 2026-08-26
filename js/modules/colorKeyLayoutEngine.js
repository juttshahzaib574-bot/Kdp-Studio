// Pure layout math for a numbered color-key legend (number + swatch + name), shared
// between the PDF's vector-drawn key (js/ui/pdfExport.js) so both the embedded
// Unified-layout strip and the Expanded-layout migrated key page agree on how many
// columns/rows fit a given area — and on which direction the creator has chosen:
//   - "horizontal": fill each row left-to-right, wrap down to a new row once a row
//     is full ("more than one row if I go horizontally").
//   - "vertical": fill each column top-to-bottom, wrap right to a new column once a
//     column is full ("create columns if needed because of too many colors").
//
// Both directions produce a STRICT uniform grid — every entry the same width and the
// same height — rather than a packed/variable layout, so the spacing between any two
// consecutive numbers is always identical (1→2 exactly equals 2→3, etc.) in both the
// primary flow direction and the wrap direction.

const DEFAULT_ENTRY_WIDTH_IN = 0.95;
const DEFAULT_ENTRY_HEIGHT_IN = 0.2;

export const COLOR_KEY_ORIENTATIONS = [
  { id: "horizontal", label: "Horizontal", note: "Fills left-to-right, wraps to a new row." },
  { id: "vertical", label: "Vertical", note: "Fills top-to-bottom, wraps to a new column." },
];

export function computeKeyGridLayout(paletteLength, areaWidthIn, areaHeightIn, entryWidthMinIn = DEFAULT_ENTRY_WIDTH_IN, entryHeightMaxIn = DEFAULT_ENTRY_HEIGHT_IN, orientation = "horizontal") {
  if (orientation === "vertical") {
    const rows = Math.max(1, Math.floor(areaHeightIn / entryHeightMaxIn));
    const cols = Math.max(1, Math.ceil(paletteLength / rows));
    return {
      cols,
      rows,
      entryWidthIn: Math.min(entryWidthMinIn, areaWidthIn / cols),
      entryHeightIn: areaHeightIn / rows,
      orientation,
    };
  }

  const cols = Math.max(1, Math.floor(areaWidthIn / entryWidthMinIn));
  const rows = Math.max(1, Math.ceil(paletteLength / cols));
  return {
    cols,
    rows,
    entryWidthIn: areaWidthIn / cols,
    entryHeightIn: Math.min(entryHeightMaxIn, areaHeightIn / rows),
    orientation,
  };
}

// Maps a palette index to its (col, row) grid position for the given flow direction —
// shared by every entry-drawing routine so the wrap logic lives in exactly one place.
export function keyEntryPosition(index, cols, rows, orientation) {
  return orientation === "vertical" ? { col: Math.floor(index / rows), row: index % rows } : { col: index % cols, row: Math.floor(index / cols) };
}
