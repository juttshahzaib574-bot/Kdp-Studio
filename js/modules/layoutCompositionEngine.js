// Module: Universal Layout Control & Element Positioning
// Generalizes the old two-mode (Unified/Expanded) key placement into a full
// composition: every structural element (title, subtitle, instruction, color key) is
// an independent layer that can sit in a top/bottom/left/right band on the puzzle
// (grid) page, be offloaded onto the facing blank page, or be turned off. The grid
// region is whatever rectangle is left after the on-grid element bands are reserved —
// which IS the "Real-Time Cell Recalculation" the blueprint describes: drag the color
// key onto the grid and the grid shrinks; push it to the blank page and the grid
// reclaims the space.

import { KEY_STRIP_HEIGHT_RATIO } from "./layoutEngine.js?v=24";

export const LAYOUT_ELEMENT_IDS = ["title", "subtitle", "instruction", "colorKey"];

export const LAYOUT_ELEMENTS = [
  { id: "title", label: "Title", isText: true, defaultText: "" },
  { id: "subtitle", label: "Subtitle", isText: true, defaultText: "" },
  { id: "instruction", label: "Instruction", isText: true, defaultText: "Match each number to its color, then fill the cell." },
  { id: "colorKey", label: "Color Key", isText: false },
];

export const LAYOUT_TARGETS = [
  { id: "grid", label: "Puzzle Page" },
  { id: "blank", label: "Blank Facing Page" },
  { id: "off", label: "Hidden" },
];

export const LAYOUT_ZONES = ["top", "bottom", "left", "right"];

// A side-band color key claims this fraction of safe-zone WIDTH; a top/bottom key claims
// KEY_STRIP_HEIGHT_RATIO of safe-zone HEIGHT (shared with the adaptive-scaling math so
// the freed space when the key is offloaded stays physically exact).
export const KEY_SIDE_WIDTH_RATIO = 0.28;

// Fixed band footprints (inches) for the text elements.
const TEXT_BAND_HEIGHT_IN = { title: 0.55, subtitle: 0.35, instruction: 0.7 };
const TEXT_SIDE_WIDTH_IN = 1.6;

// Blank-page fine positioning for text elements: `anchor` picks which edge `offsetIn`
// measures from (top edge, page vertical center, or bottom edge), so "a little above
// center" is just anchor: "center", offsetIn: -0.4. Only meaningful for target: "blank" —
// on-grid placement stays the existing top/bottom/left/right zone-band system, since
// that page has too little spare room for free positioning to make sense.
export function defaultComposition() {
  return {
    // Backward-compatible default === the old "Unified" layout: only the color key is
    // shown, embedded in a bottom strip on the puzzle page. Text elements are off, so a
    // book that never touches the composer exports exactly as it did before this module.
    title: { enabled: false, target: "grid", zone: "top", align: "center", text: "", anchor: "top", offsetIn: 0 },
    subtitle: { enabled: false, target: "grid", zone: "top", align: "center", text: "", anchor: "top", offsetIn: 0 },
    instruction: { enabled: false, target: "grid", zone: "bottom", align: "start", text: LAYOUT_ELEMENTS[2].defaultText, anchor: "top", offsetIn: 0 },
    colorKey: { enabled: true, target: "grid", zone: "bottom", align: "center" },
  };
}

export function normalizeComposition(composition) {
  const base = defaultComposition();
  if (!composition) return base;
  const out = {};
  for (const id of LAYOUT_ELEMENT_IDS) {
    out[id] = { ...base[id], ...(composition[id] || {}) };
  }
  return out;
}

// Maps the legacy Unified/Expanded toggle onto a composition's color-key placement,
// preserving whatever the text elements are already doing.
export function withColorKeyTarget(composition, layoutMode) {
  const comp = normalizeComposition(composition);
  return {
    ...comp,
    colorKey: {
      ...comp.colorKey,
      enabled: true,
      target: layoutMode === "expanded" ? "blank" : "grid",
      zone: layoutMode === "expanded" ? comp.colorKey.zone : "bottom",
    },
  };
}

// The color key is "off the primary canvas" (adaptive scaling unlocks) whenever it is
// enabled but not placed on the grid page.
export function isColorKeyOffloaded(composition) {
  const comp = normalizeComposition(composition);
  return comp.colorKey.enabled && comp.colorKey.target !== "grid";
}

export function layoutModeFromComposition(composition) {
  return isColorKeyOffloaded(composition) ? "expanded" : "unified";
}

function bandThicknessIn(id, zone, safeZone) {
  const isSide = zone === "left" || zone === "right";
  if (id === "colorKey") {
    return isSide ? safeZone.widthIn * KEY_SIDE_WIDTH_RATIO : safeZone.heightIn * KEY_STRIP_HEIGHT_RATIO;
  }
  return isSide ? TEXT_SIDE_WIDTH_IN : (TEXT_BAND_HEIGHT_IN[id] ?? 0.4);
}

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// Given a safe zone and a composition, returns the grid's drawable region plus the
// pixel-independent placement rects (safe-zone-local, y-down inches) for every element
// on the grid page and every element offloaded to the blank page.
export function computeLayout(safeZone, composition) {
  const comp = normalizeComposition(composition);
  const onGrid = LAYOUT_ELEMENT_IDS.filter((id) => comp[id].enabled && comp[id].target === "grid");
  const onBlank = LAYOUT_ELEMENT_IDS.filter((id) => comp[id].enabled && comp[id].target === "blank");

  const byZone = { top: [], bottom: [], left: [], right: [] };
  onGrid.forEach((id) => byZone[comp[id].zone].push(id));

  // Top/bottom strips stack vertically (band = sum of heights); side bands stack within
  // the middle height and the band width = the widest member.
  const topBand = sum(byZone.top.map((id) => bandThicknessIn(id, "top", safeZone)));
  const bottomBand = sum(byZone.bottom.map((id) => bandThicknessIn(id, "bottom", safeZone)));
  const leftBand = byZone.left.length ? Math.max(...byZone.left.map((id) => bandThicknessIn(id, "left", safeZone))) : 0;
  const rightBand = byZone.right.length ? Math.max(...byZone.right.map((id) => bandThicknessIn(id, "right", safeZone))) : 0;

  const gridZone = {
    top: safeZone.top + topBand,
    bottom: safeZone.bottom + bottomBand,
    left: safeZone.left + leftBand,
    right: safeZone.right + rightBand,
    widthIn: Math.max(0.1, safeZone.widthIn - leftBand - rightBand),
    heightIn: Math.max(0.1, safeZone.heightIn - topBand - bottomBand),
  };

  const gridPlacements = [];
  let ty = 0;
  byZone.top.forEach((id) => {
    const hIn = bandThicknessIn(id, "top", safeZone);
    gridPlacements.push({ id, target: "grid", rect: { xIn: 0, yIn: ty, wIn: safeZone.widthIn, hIn: hIn } });
    ty += hIn;
  });
  let byy = safeZone.heightIn - bottomBand;
  byZone.bottom.forEach((id) => {
    const hIn = bandThicknessIn(id, "bottom", safeZone);
    gridPlacements.push({ id, target: "grid", rect: { xIn: 0, yIn: byy, wIn: safeZone.widthIn, hIn: hIn } });
    byy += hIn;
  });
  const midTop = topBand;
  const midH = safeZone.heightIn - topBand - bottomBand;
  byZone.left.forEach((id, i) => {
    const per = midH / byZone.left.length;
    gridPlacements.push({ id, target: "grid", rect: { xIn: 0, yIn: midTop + i * per, wIn: leftBand, hIn: per } });
  });
  byZone.right.forEach((id, i) => {
    const per = midH / byZone.right.length;
    gridPlacements.push({ id, target: "grid", rect: { xIn: safeZone.widthIn - rightBand, yIn: midTop + i * per, wIn: rightBand, hIn: per } });
  });

  // Blank facing page: text elements position independently via anchor + offsetIn (top
  // edge / page center / bottom edge, plus a fine nudge) instead of an automatic stack —
  // a creator places title, then nudges subtitle to sit just under it, entirely by hand.
  // The color key is the exception: it still auto-fills whatever vertical room is left
  // below the lowest-reaching text element, since its size depends on the palette.
  const blankPlacements = [];
  let lowestTextBottomIn = 0;
  onBlank.filter((id) => id !== "colorKey").forEach((id) => {
    const hIn = bandThicknessIn(id, "top", safeZone);
    const anchor = comp[id].anchor ?? "top";
    const offsetIn = comp[id].offsetIn ?? 0;
    let yIn;
    if (anchor === "center") yIn = safeZone.heightIn / 2 + offsetIn - hIn / 2;
    else if (anchor === "bottom") yIn = safeZone.heightIn - offsetIn - hIn;
    else yIn = offsetIn;
    yIn = Math.max(0, Math.min(safeZone.heightIn - hIn, yIn));
    blankPlacements.push({ id, target: "blank", rect: { xIn: 0, yIn, wIn: safeZone.widthIn, hIn } });
    lowestTextBottomIn = Math.max(lowestTextBottomIn, yIn + hIn);
  });
  if (onBlank.includes("colorKey")) {
    blankPlacements.push({ id: "colorKey", target: "blank", rect: { xIn: 0, yIn: lowestTextBottomIn, wIn: safeZone.widthIn, hIn: Math.max(0.5, safeZone.heightIn - lowestTextBottomIn) } });
  }

  return { gridZone, gridPlacements, blankPlacements };
}

// A short human-readable summary of what's placed where — used by the composer's live
// readout so a creator can audit the composition at a glance.
export function describeComposition(composition) {
  const comp = normalizeComposition(composition);
  return LAYOUT_ELEMENT_IDS.map((id) => {
    const el = comp[id];
    if (!el.enabled) return null;
    const label = LAYOUT_ELEMENTS.find((e) => e.id === id).label;
    if (el.target === "off") return null;
    if (el.target === "blank") return `${label} → blank page`;
    return `${label} → grid ${el.zone}`;
  }).filter(Boolean);
}
