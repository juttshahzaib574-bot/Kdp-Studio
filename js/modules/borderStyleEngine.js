// Module: Border Thickness & Background Engine + The Border Weight & Style Controller

export const BORDER_PT_MIN = 0.5;
export const BORDER_PT_MAX = 6.0;

export const BORDER_PRESETS = {
  "seamless-realism": {
    label: "Seamless Realism",
    borderPt: 0.9,
    gridTintPercent: 35,
    textTint: "dark-gray",
    note: "Thin gray lines that disappear under colored pencils — a realistic, traditional puzzle.",
  },
  "midnight-marker": {
    label: "Midnight Marker",
    borderPt: 4.0,
    gridTintPercent: 100,
    textTint: "dark-gray",
    note: "100% black grid lines around crisp white cells — a bold, forgiving 'stained glass' marker-bleed buffer. Combine with the Black Book page-background control for a fully black page too.",
  },
};

export function clampBorderWeight(pt) {
  return Math.min(BORDER_PT_MAX, Math.max(BORDER_PT_MIN, pt));
}

export function applyPreset(presetId) {
  const preset = BORDER_PRESETS[presetId];
  if (!preset) throw new Error(`Unknown border preset: ${presetId}`);
  return { ...preset };
}

// Grid lines should never be pure black except in an intentional Blackout/Midnight mode.
export function gridColorFromTint(gridTintPercent) {
  if (gridTintPercent >= 100) return "rgba(0,0,0,1)";
  return `rgba(0,0,0,${(gridTintPercent / 100).toFixed(2)})`;
}

// Heavy borders (Midnight Marker range) signal the Blackout aesthetic — a 100% black
// canvas background behind crisp white cells, per the Midnight/Blackout Cell &
// Background Standard. Numbers stay dark; only the page background inverts.
export function isHeavyBorder(borderPt) {
  return borderPt >= 2.5;
}
