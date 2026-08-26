// Module: Selective Front & Back Matter — Per-Page Include/Exclude Control
// Every generated front/back-matter page can be individually excluded from the exported
// PDF without losing anything about how it's configured — excluding a page just skips it
// (and its facing blank page) during export; re-checking it brings it right back exactly
// as it was, since nothing about the page itself is ever deleted, only its inclusion flag.
// State stores only the DISABLED ids (an exclusion list) — every page defaults to
// included, matching "I already have all the pages" as the natural starting point.

// Order matches exactly how pdfExport.js emits these pages. Front matter is listed
// separately because disabling one of THEM shifts every downstream page number — see
// computeFrontMatterPageCount, which storyboardEngine.js's pagination math depends on.
export const FRONT_MATTER_PAGES = [
  { id: "title-page", label: "Title Page" },
  { id: "copyright-page", label: "Copyright Page" },
  { id: "belongs-to-page", label: '"Belongs To" Page' },
  { id: "color-test-page", label: "Color Test Page" },
  { id: "instructions-page", label: "Instructions Page" },
  { id: "master-palette-page", label: "Master Palette Guide" },
];

export const BACK_MATTER_PAGES = [
  { id: "solutions", label: "Solutions" },
  { id: "extra-color-test-pages", label: "Extra Color Test Pages" },
  { id: "about-artist-page", label: "About the Artist Page" },
  { id: "review-request-page", label: "Review Request Page" },
  { id: "series-promo-page", label: "Series Promo Page" },
];

export function isPageEnabled(disabledPageIds, pageId) {
  return !disabledPageIds.includes(pageId);
}

export function togglePage(disabledPageIds, pageId) {
  return disabledPageIds.includes(pageId) ? disabledPageIds.filter((id) => id !== pageId) : [...disabledPageIds, pageId];
}

// Front matter is always emitted as content+blank-facing pairs (2 pages) per enabled
// item — this replaces the old fixed FRONT_MATTER_INTERIOR_PAGES constant so the
// storyboard's displayed page numbers, and the real export, always agree on exactly
// where the puzzle interior begins.
export function computeFrontMatterPageCount(disabledPageIds) {
  const enabledCount = FRONT_MATTER_PAGES.filter((p) => isPageEnabled(disabledPageIds, p.id)).length;
  return enabledCount * 2;
}
