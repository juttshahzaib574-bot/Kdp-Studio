// Module 2: Print-Ready Bleed Architecture
// Implements KDP's interior-bleed spec: a full-bleed paperback page gets
// 0.125" added to the outer trim edge and 0.125" added to each of the top
// and bottom edges. The inner (spine/gutter) edge never receives bleed —
// it is bound into the book, not trimmed.

export const KDP_BLEED_IN = 0.125;

// bleedEnabled = false returns the raw trim size (No-Bleed Override).
export function computeCanvasDimensions(trimSize, dpi, bleedEnabled) {
  const widthIn = trimSize.widthIn + (bleedEnabled ? KDP_BLEED_IN : 0);
  const heightIn = trimSize.heightIn + (bleedEnabled ? KDP_BLEED_IN * 2 : 0);

  return {
    widthIn,
    heightIn,
    widthPx: Math.round(widthIn * dpi),
    heightPx: Math.round(heightIn * dpi),
    bleedIn: bleedEnabled ? KDP_BLEED_IN : 0,
  };
}

// True when the user has opted out of KDP's mandatory bleed while a page
// still needs to reach the trim edge (e.g. a blackout background) — the
// exact condition Amazon's automated review is likely to reject.
export function needsRiskWarning(bleedEnabled, edgeToEdgeAsset) {
  return !bleedEnabled && edgeToEdgeAsset;
}
