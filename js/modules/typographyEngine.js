// Module: Smart Text Formatting & Alignment
// Section 3 font-by-cell-size spec, plus the dynamic scaling/contrast/kerning rules
// from the "Advanced Mosaic Grid & Layout Generator" blueprint section.

export const FONT_RULES = [
  { minCellMm: 4.0, ptMin: 4.5, ptMax: 5.0, weight: "Regular", risk: "sweet-spot" },
  { minCellMm: 3.5, ptMin: 3.5, ptMax: 4.0, weight: "Light or Regular", risk: "advanced-detail" },
  { minCellMm: 3.0, ptMin: 3.0, ptMax: 3.5, weight: "Light / Thin", risk: "extreme" },
];

const BELOW_MINIMUM_RULE = { minCellMm: 0, ptMin: 2.5, ptMax: 3.0, weight: "Thin", risk: "below-minimum" };

// The Double-Digit Trap: a cell with more than 9 colors needs double-digit labels,
// which forces the lighter/condensed end of the size range so they fit the cell walls.
export function recommendFont(cellSizeMm, colorCount) {
  const rule = FONT_RULES.find((r) => cellSizeMm >= r.minCellMm) ?? BELOW_MINIMUM_RULE;
  const isDoubleDigit = colorCount > 9;

  return {
    sizePt: isDoubleDigit ? rule.ptMin : rule.ptMax,
    weight: rule.weight,
    preferLightWeight: isDoubleDigit,
    risk: rule.risk,
    isDoubleDigitRisk: isDoubleDigit && rule.risk === "extreme",
  };
}

// Grid-line/number ink tint: 20-30% standard, bumped to 60% black in the microscopic
// 3mm/Light-font risk zone so the KDP printer lays enough ink dots to stay legible.
// Blackout mode inverts to stark white for visibility against a 100% black background.
export function recommendTextTint(cellSizeMm, blackoutMode) {
  if (blackoutMode) return { percentBlack: 0, color: "white" };
  if (cellSizeMm < 3.5) return { percentBlack: 60, color: "dark-gray-60" };
  return { percentBlack: 30, color: "gray-30" };
}

// Dynamic Typography Syncing: as border weight grows and encroaches on the interior
// cell space, drop the font half a point so it never clips into the border line.
export function adjustForBorderWeight(basePt, borderWeightPt, cellSizeMm) {
  const cellSizePt = cellSizeMm * 2.834; // 1mm ≈ 2.834pt
  const encroachmentThreshold = cellSizePt * 0.12;
  return borderWeightPt > encroachmentThreshold ? Math.max(2.5, basePt - 0.5) : basePt;
}

// Geometric Center Calibration: hexagons/diamonds have a slightly different optical
// center than their bounding box; nudge the label a hair to compensate.
export function centerOffsetIn(patternId, cellSizeIn) {
  if (patternId === "hexagon") return { dx: 0, dy: cellSizeIn * 0.02 };
  if (patternId === "diamond") return { dx: 0, dy: -cellSizeIn * 0.03 };
  return { dx: 0, dy: 0 };
}

// Character Width Adjustment: condense letter-spacing for double-digit labels so they
// don't collide with the cell walls, while single digits/letters rest naturally.
export function letterSpacingForLabel(label) {
  return String(label).length >= 2 ? -0.4 : 0;
}
