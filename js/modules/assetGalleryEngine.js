// Module: The Front & Back Matter Asset Gallery + Custom Asset Upload & Permanent Storage Library

const STORAGE_KEY = "kdp-studio:asset-gallery";

export const ASSET_CATEGORIES = [
  { id: "title-page", label: "Title Page" },
  { id: "copyright-page", label: "Copyright Page" },
  { id: "belongs-to-page", label: '"Belongs To" Page' },
  { id: "color-test-page", label: "Color Test Page" },
  { id: "master-palette-page", label: "Master Palette Guide" },
  { id: "back-page-background", label: "Back Page Background (Blackout / Marker-Safe)" },
];

// Zero-API: "permanent" storage means this browser's localStorage — there is no server.
export function loadGallery() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persist(gallery) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gallery));
}

export function saveAsset(gallery, categoryId, asset) {
  const next = { ...gallery, [categoryId]: [...(gallery[categoryId] ?? []), asset] };
  persist(next);
  return next;
}

export function removeAsset(gallery, categoryId, assetId) {
  const next = { ...gallery, [categoryId]: (gallery[categoryId] ?? []).filter((a) => a.id !== assetId) };
  persist(next);
  return next;
}

// Format Auto-Check: a custom upload must match the active canvas's pixel dimensions
// (within a small tolerance) for its selected bleed/no-bleed print tolerance.
export function checkFormatCompliance(assetPx, expectedCanvasDims) {
  const toleranceRatio = 0.01;
  const withinTolerance = (a, b) => Math.abs(a - b) <= b * toleranceRatio;

  const widthOk = withinTolerance(assetPx.widthPx, expectedCanvasDims.widthPx);
  const heightOk = withinTolerance(assetPx.heightPx, expectedCanvasDims.heightPx);

  return {
    ok: widthOk && heightOk,
    expectedPx: { width: expectedCanvasDims.widthPx, height: expectedCanvasDims.heightPx },
    actualPx: { width: assetPx.widthPx, height: assetPx.heightPx },
    message:
      widthOk && heightOk
        ? "Matches the active canvas size and bleed setting."
        : `Expected ${expectedCanvasDims.widthPx}×${expectedCanvasDims.heightPx}px, got ${assetPx.widthPx}×${assetPx.heightPx}px.`,
  };
}
