// Module: Corner Radius (Border Rounding) Control

export const CORNER_RADIUS_MIN_PERCENT = 0;
export const CORNER_RADIUS_MAX_PERCENT = 100;

// 0% = sharp corners (traditional realism). 50% = "pillowed" softening for marker-bleed
// control. 100% = the shape collapses into a full circle.
export function cornerRadiusIn(percent, cellSizeIn) {
  const clamped = Math.min(CORNER_RADIUS_MAX_PERCENT, Math.max(CORNER_RADIUS_MIN_PERCENT, percent));
  return (clamped / 100) * (cellSizeIn / 2);
}

export function isFullCircle(percent) {
  return percent >= 100;
}
