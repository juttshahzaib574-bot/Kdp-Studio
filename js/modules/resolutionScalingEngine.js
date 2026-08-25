// Module 7: Adaptive Resolution & Cell Scaling Engine
import { computeGridDimensions, inToMm } from "./gridPatternEngine.js";
import { splitSafeZoneForKey } from "./layoutEngine.js";

export const SCALING_PRIORITIES = [
  {
    id: "cell-enlargement",
    label: "Priority 1: Enhanced Accessibility (Cell Enlargement)",
    note: "Keeps the grid dimensions modest but expands each cell to fill the page — comfortable for seniors, beginners, and low-vision users.",
  },
  {
    id: "grid-expansion",
    label: "Priority 2: High-Fidelity Intricacy (Grid Expansion)",
    note: "Locks the cell size small and injects more cells into the freed canvas space — denser, more detailed artwork.",
  },
];

// Only unlocked once the color key has migrated off the primary canvas (Expanded layout).
export function isAdaptiveScalingUnlocked(layoutMode) {
  return layoutMode === "expanded";
}

// extraSafeZone*In: the extra safe-zone space freed up by migrating the key away.
export function computeAdaptiveGrid(baseGrid, extraSafeZoneWidthIn, extraSafeZoneHeightIn, patternId, priority) {
  const newWidthIn = baseGrid.widthIn + extraSafeZoneWidthIn;
  const newHeightIn = baseGrid.heightIn + extraSafeZoneHeightIn;

  if (priority === "cell-enlargement") {
    // Same cell COUNT, larger cell SIZE.
    const cellSizeIn = Math.min(newWidthIn / baseGrid.cols, newHeightIn / baseGrid.rows);
    return { cols: baseGrid.cols, rows: baseGrid.rows, cellSizeIn, cellSizeMm: inToMm(cellSizeIn) };
  }

  // grid-expansion: same cell SIZE, more cells injected into the freed space.
  const grid = computeGridDimensions(newWidthIn, newHeightIn, inToMm(baseGrid.cellSizeIn), patternId);
  return { ...grid, cellSizeMm: inToMm(grid.cellSizeIn) };
}

// Single entry point used by both the live preview and the PDF exporter, so the two
// always agree on what a page actually renders. Returns the input cellSizeMm unchanged
// (and no override) unless Expanded layout has genuinely freed space to redistribute:
// the baseline is what Unified layout's grid would have been (safe zone minus the key
// strip), and the "extra" space is exactly that strip's height — the two layouts are
// bound to the same KEY_STRIP_HEIGHT_RATIO, so this is real freed area, not a guess.
//
// gridOverride matters specifically for cell-enlargement: computeAdaptiveGrid picks the
// enlarged cell size as the MIN of the width- and height-constrained scale factors, so
// the non-binding dimension is left with slack. If a caller re-derives cols/rows later
// by independently flooring (fullAreaIn / cellSizeIn) — which is exactly what
// computeGridDimensions does — that slack silently adds extra rows/cols instead of
// bigger cells, contradicting "same cell count, just larger." Pinning cols/rows here
// closes that gap; grid-expansion needs no such pin, since its cols/rows already come
// from that same computeGridDimensions call over the same full area, so an independent
// recompute downstream reproduces it exactly (deterministic function, identical inputs).
export function resolveEffectiveGrid(safeZone, cellSizeMm, gridPattern, layoutMode, resolutionPriority) {
  if (!isAdaptiveScalingUnlocked(layoutMode)) {
    return { cellSizeMm, gridOverride: null };
  }

  const unifiedSplit = splitSafeZoneForKey(safeZone, "unified");
  const baseGrid = computeGridDimensions(unifiedSplit.gridZone.widthIn, unifiedSplit.gridZone.heightIn, cellSizeMm, gridPattern);
  baseGrid.widthIn = unifiedSplit.gridZone.widthIn;
  baseGrid.heightIn = unifiedSplit.gridZone.heightIn;

  const adaptive = computeAdaptiveGrid(baseGrid, 0, unifiedSplit.keyStripHeightIn, gridPattern, resolutionPriority);

  return {
    cellSizeMm: adaptive.cellSizeMm,
    gridOverride: resolutionPriority === "cell-enlargement" ? { cols: adaptive.cols, rows: adaptive.rows } : null,
  };
}
