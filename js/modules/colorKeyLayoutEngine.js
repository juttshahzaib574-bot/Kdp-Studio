// Pure layout math for a numbered color-key legend (number + swatch + name), shared
// between the PDF's vector-drawn key (js/ui/pdfExport.js) so both the embedded
// Unified-layout strip and the Expanded-layout migrated key page agree on how many
// columns/rows fit a given area.

const DEFAULT_ENTRY_WIDTH_IN = 0.95;
const DEFAULT_ENTRY_HEIGHT_IN = 0.2;

export function computeKeyGridLayout(paletteLength, areaWidthIn, areaHeightIn, entryWidthMinIn = DEFAULT_ENTRY_WIDTH_IN, entryHeightMaxIn = DEFAULT_ENTRY_HEIGHT_IN) {
  const cols = Math.max(1, Math.floor(areaWidthIn / entryWidthMinIn));
  const rows = Math.max(1, Math.ceil(paletteLength / cols));
  const entryWidthIn = areaWidthIn / cols;
  const entryHeightIn = Math.min(entryHeightMaxIn, areaHeightIn / rows);

  return { cols, rows, entryWidthIn, entryHeightIn };
}
