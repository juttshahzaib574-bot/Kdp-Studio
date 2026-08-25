// Section 3 spec: keep numbers/critical content 0.25" inside trim,
// and 0.5" from the gutter (inner/spine) edge for spine-side safety.

export const SAFE_ZONE_TRIM_IN = 0.25;
export const SAFE_ZONE_GUTTER_IN = 0.5;

// pageSide: 'right' (odd page — gutter on the left) or 'left' (even page — gutter on the right)
export function computeSafeZone(trimSize, pageSide = "right") {
  const gutterOnLeft = pageSide === "right";
  const left = gutterOnLeft ? SAFE_ZONE_GUTTER_IN : SAFE_ZONE_TRIM_IN;
  const right = gutterOnLeft ? SAFE_ZONE_TRIM_IN : SAFE_ZONE_GUTTER_IN;

  return {
    top: SAFE_ZONE_TRIM_IN,
    bottom: SAFE_ZONE_TRIM_IN,
    left,
    right,
    widthIn: trimSize.widthIn - left - right,
    heightIn: trimSize.heightIn - SAFE_ZONE_TRIM_IN * 2,
  };
}
