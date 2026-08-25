// Central, dependency-free state store shared across all modules.
// Zero-API architecture: state lives only in memory/localStorage — never sent to a server.

const listeners = new Set();

export const state = {
  // Module 1 + Print-Ready Bleed Architecture
  trimSizeId: "square-8.5",
  dpi: 300,
  bleedEnabled: true,
  edgeToEdgeAsset: false,
  riskAcknowledged: false,

  // Section 3 + Dynamic Grid Pattern / Border / Corner / Typography
  pageSide: "right",
  gridPattern: "square",
  cellSizeMm: 4.0,
  borderWeightPt: 0.9,
  gridTintPercent: 35,
  cornerRadiusPercent: 0,

  // Dual-Page Layout & Key Migration + Adaptive Resolution & Cell Scaling
  layoutMode: "unified",
  resolutionPriority: "cell-enlargement",

  // Section 4: Color Key Standards
  colorSetOptionId: "set-24",
  colorSetCustomPair: [12, 24],
  colorBrand: "crayola",

  // High-Capacity Batch Engine + Drag-and-Drop Storyboard Dashboard
  batchItems: [],
  activeBatchItemId: null,

  // Automated Solution Generation Engine
  solutionThumbsPerPage: 4,

  // Front & Back Matter Asset Gallery + Custom Asset Upload
  assetGallery: {},
  activeAssetCategory: "back-page-background",

  // 3-Second Looping Interface / Stacked Live Preview Gallery
  previewLoopEnabled: false,

  // Unified Export Pipeline (book metadata for the generated front matter)
  bookTitle: "Untitled Mystery Mosaic Book",
  bookSubtitle: "A Mosaic Color-by-Number Puzzle Book",
  bookAuthor: "",
};

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
