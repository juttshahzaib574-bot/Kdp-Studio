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
  gridCornerTrim: false,

  // Dual-Page Layout & Key Migration + Adaptive Resolution & Cell Scaling
  layoutMode: "unified", // mirror of globalComposition.colorKey placement (grid=unified/blank=expanded)
  resolutionPriority: "cell-enlargement",

  // Universal Layout Control & Element Positioning
  layoutScope: "global", // "global" (one composition for all pages) | "page-specific"
  globalComposition: null, // null → defaultComposition(); set by the Layout Composer

  // Section 4: Color Key Standards
  colorSetOptionId: "set-24",
  colorSetCustomPair: [12, 24],

  // Color key flow direction: "horizontal" (fill each row, wrap to a new row) |
  // "vertical" (fill each column, wrap to a new column) — see colorKeyLayoutEngine.js.
  colorKeyOrientation: "horizontal",

  // Black Book: whole-book page-background control — independent of the grid tint/
  // border sliders. "all-white" | "all-black" | "grid-black" | "key-black" (see
  // modules/bookThemeEngine.js for exactly what each id paints).
  pageBackgroundMode: "all-white",

  // Color Edition: "color" | "black-white" — a real KDP print-cost choice, so it's its
  // own explicit switch rather than following any other setting.
  bookColorMode: "color",

  // High-Capacity Batch Engine + Drag-and-Drop Storyboard Dashboard
  batchItems: [],
  activeBatchItemId: null,
  expandedSettingsItemId: null,

  // Automated Solution Generation Engine
  solutionThumbsPerPage: 4,

  // Front & Back Matter Asset Gallery + Custom Asset Upload
  assetGallery: {},
  activeAssetByCategory: {}, // bucketId -> assetId ("in use" pick when a bucket holds several)
  customAlbums: [], // [{id, name}] — user-created organizational folders, no PDF role

  // 3-Second Looping Interface / Stacked Live Preview Gallery
  previewLoopEnabled: false,

  // Unified Export Pipeline (book metadata for the generated front matter)
  bookTitle: "Untitled Mystery Mosaic Book",
  bookSubtitle: "A Mosaic Color-by-Number Puzzle Book",
  bookAuthor: "",
  bookIsbn: "", // optional — KDP assigns a free one automatically if left blank

  // Back matter: "About the Artist" + "Series Promo" (blank = page is skipped)
  authorBio: "",
  seriesPromoText: "",

  // Selective Front & Back Matter: ids of pages EXCLUDED from the export (see
  // modules/frontBackMatterEngine.js) — everything defaults to included.
  disabledFrontBackMatterPages: [],

  // Custom page order — defaults match the pages' natural/catalog order in
  // modules/frontBackMatterEngine.js. Reordering an id here shifts every page after
  // it, exactly like reordering the storyboard.
  frontMatterOrder: ["title-page", "copyright-page", "belongs-to-page", "color-test-page", "instructions-page", "master-palette-page"],
  backMatterOrder: ["solutions", "extra-color-test-pages", "about-artist-page", "review-request-page", "series-promo-page"],
};

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
