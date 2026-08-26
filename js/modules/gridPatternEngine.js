// Module: Dynamic Grid Pattern Selector
// Pure shape geometry for the four selectable mosaic grid frameworks.

const MM_PER_INCH = 25.4;

export const GRID_PATTERNS = [
  { id: "square", label: "Standard Square", note: "The classic, traditional mosaic layout." },
  { id: "hexagon", label: "Hexagon (Honeycomb)", note: "Smooth, interlocking cells that eliminate sharp corners and hide grid rigidity." },
  { id: "diamond", label: "Diamond", note: "Creates an argyle / isometric visual effect for a stylized final image." },
  { id: "dot-matrix", label: "Dot Matrix", note: "Corner dots instead of hard borders — minimalist, trace-friendly, blends seamlessly." },
  { id: "circle", label: "Circle", note: "Solid punched-circle cells, like a classic dot-art color-by-number sheet." },
];

export function getGridPatternById(id) {
  const found = GRID_PATTERNS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown grid pattern: ${id}`);
  return found;
}

export function mmToIn(mm) {
  return mm / MM_PER_INCH;
}

export function inToMm(inch) {
  return inch * MM_PER_INCH;
}

// How many cells of a given pattern/size fit inside a safe-zone area.
export function computeGridDimensions(safeZoneWidthIn, safeZoneHeightIn, cellSizeMm, patternId) {
  const cellSizeIn = mmToIn(cellSizeMm);

  if (patternId === "hexagon") {
    // Pointy-top hex packing: horizontal step = cell width, vertical step = 0.75 * cell height.
    const cols = Math.max(1, Math.floor(safeZoneWidthIn / cellSizeIn - 0.5));
    const rows = Math.max(1, Math.floor(safeZoneHeightIn / (cellSizeIn * 0.75)));
    return { cols, rows, cellSizeIn };
  }

  if (patternId === "diamond") {
    // Diamonds are squares rotated 45°; their bounding footprint is cellSize * sqrt(2).
    const footprint = cellSizeIn * Math.SQRT2;
    const cols = Math.max(1, Math.floor(safeZoneWidthIn / footprint));
    const rows = Math.max(1, Math.floor(safeZoneHeightIn / footprint));
    return { cols, rows, cellSizeIn };
  }

  // "square", "dot-matrix" and "circle" share the same underlying grid.
  const cols = Math.max(1, Math.floor(safeZoneWidthIn / cellSizeIn));
  const rows = Math.max(1, Math.floor(safeZoneHeightIn / cellSizeIn));
  return { cols, rows, cellSizeIn };
}

// Center point of a cell (in inches, relative to the grid's own top-left origin).
export function cellCenterIn(patternId, col, row, cellSizeIn) {
  if (patternId === "hexagon") {
    const xStep = cellSizeIn;
    const yStep = cellSizeIn * 0.75;
    const xOffset = row % 2 === 1 ? xStep / 2 : 0;
    return { x: col * xStep + xOffset + xStep / 2, y: row * yStep + cellSizeIn / 2 };
  }

  if (patternId === "diamond") {
    const step = cellSizeIn * Math.SQRT2;
    return { x: col * step + step / 2, y: row * step + step / 2 };
  }

  return { x: col * cellSizeIn + cellSizeIn / 2, y: row * cellSizeIn + cellSizeIn / 2 };
}

// Grid Silhouette Trim: cuts cells from a chosen subset of the four grid corners so a
// dense grid reads as a deliberately shaped sheet instead of one continuous, perfectly-
// repeating rectangle. Complete control over WHICH corners (any combination of the 4,
// not just all-or-nothing), HOW MUCH (size, as a % of the grid's shorter side), and
// WHAT SHAPE the cut takes. Off by default (empty corner list) — opt-in per Section 3's
// grid setup.
export const CORNER_TRIM_CORNERS = [
  { id: "top-left", label: "Top-Left", glyph: "◤" },
  { id: "top-right", label: "Top-Right", glyph: "◥" },
  { id: "bottom-left", label: "Bottom-Left", glyph: "◣" },
  { id: "bottom-right", label: "Bottom-Right", glyph: "◢" },
];

export const CORNER_TRIM_SHAPES = [
  { id: "rounded", label: "Rounded", note: "A smooth quarter-circle arc." },
  { id: "diagonal", label: "Diagonal", note: "A straight 45° chamfer cut." },
  { id: "notch", label: "Notch", note: "A hard, blocky square cutout." },
];

export const CORNER_TRIM_SIZE_MIN_PERCENT = 4;
export const CORNER_TRIM_SIZE_MAX_PERCENT = 30;
export const CORNER_TRIM_SIZE_DEFAULT_PERCENT = 12;

export function cornerTrimRadiusCells(cols, rows, sizePercent = CORNER_TRIM_SIZE_DEFAULT_PERCENT) {
  return Math.max(1, Math.round(Math.min(cols, rows) * (sizePercent / 100)));
}

// corners: array of CORNER_TRIM_CORNERS ids to actually cut — any subset, including
// just one, or all four. shape: which of CORNER_TRIM_SHAPES to cut with.
export function isCellInGridSilhouette(col, row, cols, rows, corners = [], shape = "rounded", sizePercent = CORNER_TRIM_SIZE_DEFAULT_PERCENT) {
  if (!corners || corners.length === 0) return true;
  const r = cornerTrimRadiusCells(cols, rows, sizePercent);
  if (r <= 0) return true;

  const isTop = row < r;
  const isBottom = row >= rows - r;
  const isLeft = col < r;
  const isRight = col >= cols - r;

  const cornerId = isTop && isLeft ? "top-left" : isTop && isRight ? "top-right" : isBottom && isLeft ? "bottom-left" : isBottom && isRight ? "bottom-right" : null;
  if (!cornerId || !corners.includes(cornerId)) return true; // outside every active corner box

  // Local coordinates: 0 = the cell touching the true page corner, r-1 = the cell
  // furthest into the box (closest to the grid's interior) — shared by all 3 shapes.
  const localCol = isLeft ? col : cols - 1 - col;
  const localRow = isTop ? row : rows - 1 - row;

  if (shape === "notch") return false; // the entire r×r box is cut — a hard square notch
  if (shape === "diagonal") return localCol + localRow >= r - 1; // straight 45° chamfer

  // rounded (default): quarter-circle arc, pivoted at the box's innermost cell.
  const d = r - 1;
  const dx = localCol - d;
  const dy = localRow - d;
  return dx * dx + dy * dy <= d * d;
}

// Polygon points (relative to the cell center, in inches) used to draw/clip a cell.
export function cellPolygonIn(patternId, cellSizeIn) {
  const half = cellSizeIn / 2;

  if (patternId === "hexagon") {
    const points = [];
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 180) * (60 * i - 90);
      points.push({ x: half * Math.cos(angle), y: half * Math.sin(angle) });
    }
    return points;
  }

  if (patternId === "diamond") {
    return [
      { x: 0, y: -half },
      { x: half, y: 0 },
      { x: 0, y: half },
      { x: -half, y: 0 },
    ];
  }

  // square + dot-matrix share the square outline; dot-matrix only renders its corners.
  return [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ];
}
