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
// primary flow direction and the wrap direction. Entries always use their natural,
// comfortable size (only shrinking if the area truly can't fit them) rather than
// stretching to fill 100% of the available width/height — this is what leaves real
// slack for the key BLOCK to be left/center/right-aligned within its band (see
// pdfExport.js's keyBlockXOffsetPt) instead of always spanning edge-to-edge.

const DEFAULT_ENTRY_WIDTH_IN = 0.95;
const DEFAULT_ENTRY_HEIGHT_IN = 0.2;
export const MAX_ENTRIES_PER_LINE = 12;

export const COLOR_KEY_ORIENTATIONS = [
  { id: "horizontal", label: "Horizontal", note: "Fills left-to-right, wraps to a new row." },
  { id: "vertical", label: "Vertical", note: "Fills top-to-bottom, wraps to a new column." },
];

// maxPerLine: explicit "colors per row" (horizontal) / "colors per column" (vertical)
// cap — e.g. maxPerLine=3 horizontal means every row holds at most 3 colors before
// wrapping to a new row, maxPerLine=4 vertical means every column holds at most 4
// before wrapping to a new column. null/0/undefined = automatic (as many as
// comfortably fit the available space, the original default behavior).
export function computeKeyGridLayout(paletteLength, areaWidthIn, areaHeightIn, entryWidthIn = DEFAULT_ENTRY_WIDTH_IN, entryHeightIn = DEFAULT_ENTRY_HEIGHT_IN, orientation = "horizontal", maxPerLine = null) {
  const isVertical = orientation === "vertical";
  const autoLineCount = isVertical ? Math.max(1, Math.floor(areaHeightIn / entryHeightIn)) : Math.max(1, Math.floor(areaWidthIn / entryWidthIn));
  const lineCount = maxPerLine && maxPerLine > 0 ? Math.max(1, Math.min(MAX_ENTRIES_PER_LINE, Math.round(maxPerLine))) : autoLineCount;

  const rows = isVertical ? lineCount : Math.max(1, Math.ceil(paletteLength / lineCount));
  const cols = isVertical ? Math.max(1, Math.ceil(paletteLength / lineCount)) : lineCount;

  return {
    cols,
    rows,
    // min(natural, available-per-slot): uses the natural/comfortable size whenever
    // there's room, and only shrinks entries evenly if a user-requested per-line count
    // (or a very large auto-computed one) wouldn't otherwise fit.
    entryWidthIn: Math.min(entryWidthIn, areaWidthIn / cols),
    entryHeightIn: Math.min(entryHeightIn, areaHeightIn / rows),
    orientation,
  };
}

// Maps a palette index to its (col, row) grid position for the given flow direction —
// shared by every entry-drawing routine so the wrap logic lives in exactly one place.
export function keyEntryPosition(index, cols, rows, orientation) {
  return orientation === "vertical" ? { col: Math.floor(index / rows), row: index % rows } : { col: index % cols, row: Math.floor(index / cols) };
}
