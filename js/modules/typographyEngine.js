// Module: Smart Text Formatting & Alignment
// Section 3 font-by-cell-size spec, plus the dynamic scaling/contrast/kerning rules
// from the "Advanced Mosaic Grid & Layout Generator" blueprint section.

// Above the 4.0mm "sweet spot" floor, cell size keeps climbing (the Cell Size slider
// goes up to 6.0mm, and Adaptive Resolution's cell-enlargement priority can push it
// past that) but until now every one of those larger cells got the exact same ~5pt
// number as a 4.0mm cell — the extra room went unused instead of letting the number
// read as a bold, confident fill the way premium tools do at generous cell sizes.
// These four tiers continue the same +0.5pt-per-0.5mm cadence the tiers below 4.0mm
// already use, so the whole table scales smoothly from 3.0mm up through 6.0mm+.
export const FONT_RULES = [
  { minCellMm: 6.0, ptMin: 6.5, ptMax: 7.0, weight: "Regular", risk: "sweet-spot" },
  { minCellMm: 5.5, ptMin: 6.0, ptMax: 6.5, weight: "Regular", risk: "sweet-spot" },
  { minCellMm: 5.0, ptMin: 5.5, ptMax: 6.0, weight: "Regular", risk: "sweet-spot" },
  { minCellMm: 4.5, ptMin: 5.0, ptMax: 5.5, weight: "Regular", risk: "sweet-spot" },
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

// Number ink tint — its own independent creator control (Number Tint, separate from
// Grid Line Tint so faint lines can pair with dark numbers or vice versa), bumped up
// to a 60% legibility floor in the microscopic 3mm risk zone so the KDP printer lays
// down enough ink dots to stay visible (or 20% otherwise, matching Section 3's
// "20-30% standard"). Numbers stay dark at every tint level, including a 100% Grid
// Line Tint (Midnight/Blackout): per the blueprint's Midnight/Blackout Cell &
// Background Standard, the black in that edition is the canvas background behind
// white cells — never an inversion of the number color to white.
export function recommendTextTint(cellSizeMm, numberTintPercent) {
  const legibilityFloorPercent = cellSizeMm < 3.5 ? 60 : 20;
  const percentBlack = Math.max(numberTintPercent, legibilityFloorPercent);
  return { percentBlack, color: `gray-${percentBlack}` };
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
