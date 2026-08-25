// Module 7: Adaptive Resolution & Cell Scaling Engine
import { computeGridDimensions, inToMm } from "./gridPatternEngine.js";

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
