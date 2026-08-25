// Module: Granular Shade Separation
// Snaps sampled cell colors onto the active color-key palette while actively preserving
// the source artwork's internal contrast, instead of letting nearby shades collapse flat.

export function colorDistance(a, b) {
  // Simplified perceptual weighting (human eyes are more sensitive to green).
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

export function nearestPaletteColor(rgb, palette, excludeIndexes = new Set()) {
  let best = null;
  let bestDist = Infinity;
  palette.forEach((entry, index) => {
    if (excludeIndexes.has(index)) return;
    const dist = colorDistance(rgb, entry.rgb);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
}

// Distinct Shade Allocation: when two visually distinct source colors would otherwise
// collapse onto the same palette entry, route the second one to its next-best unused
// entry so the finished mosaic keeps their contrast instead of going muddy.
export function assignDistinctShades(cellColors, palette) {
  const DISTINCT_THRESHOLD = 40; // colorDistance above which two sources read as "clearly different"
  const usedBy = new Map(); // paletteIndex -> first cellIndex assigned to it
  const assignments = [];

  cellColors.forEach((rgb, cellIndex) => {
    const primaryIndex = nearestPaletteColor(rgb, palette);

    if (!usedBy.has(primaryIndex)) {
      usedBy.set(primaryIndex, cellIndex);
      assignments.push(primaryIndex);
      return;
    }

    const existingColor = cellColors[usedBy.get(primaryIndex)];
    const distinctFromExisting = colorDistance(rgb, existingColor) > DISTINCT_THRESHOLD;

    if (distinctFromExisting) {
      const alt = nearestPaletteColor(rgb, palette, new Set([primaryIndex]));
      if (alt !== null) {
        if (!usedBy.has(alt)) usedBy.set(alt, cellIndex);
        assignments.push(alt);
        return;
      }
    }

    assignments.push(primaryIndex);
  });

  return assignments; // array of palette indexes, one per cell
}
