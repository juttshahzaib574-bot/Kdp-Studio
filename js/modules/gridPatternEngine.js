// Module: Dynamic Grid Pattern Selector
// Pure shape geometry for the four selectable mosaic grid frameworks.

const MM_PER_INCH = 25.4;

export const GRID_PATTERNS = [
  { id: "square", label: "Standard Square", note: "The classic, traditional mosaic layout." },
  { id: "hexagon", label: "Hexagon (Honeycomb)", note: "Smooth, interlocking cells that eliminate sharp corners and hide grid rigidity." },
  { id: "diamond", label: "Diamond", note: "Creates an argyle / isometric visual effect for a stylized final image." },
  { id: "dot-matrix", label: "Dot Matrix", note: "Corner dots instead of hard borders — minimalist, trace-friendly, blends seamlessly." },
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

  // "square" and "dot-matrix" share the same underlying grid.
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
