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

// ---- Custom page order ----
// State stores a permutation of ids per section (frontMatterOrder / backMatterOrder).
// reconcileOrder defends against a stored order going stale — an id the catalog no
// longer has is dropped, and any catalog id missing from the stored order (e.g. a
// page type added after the order was saved) is appended — so a page can never
// silently vanish from the reorder list or the export.
function reconcileOrder(storedOrder, catalog) {
  const catalogIds = catalog.map((p) => p.id);
  const kept = storedOrder.filter((id) => catalogIds.includes(id));
  const missing = catalogIds.filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}

// Returns the catalog entries (full {id, label} objects) in the creator's current
// order — this is what both the reorder UI and pdfExport.js's emission loop iterate.
export function orderedFrontMatterPages(frontMatterOrder) {
  return reconcileOrder(frontMatterOrder, FRONT_MATTER_PAGES).map((id) => FRONT_MATTER_PAGES.find((p) => p.id === id));
}

export function orderedBackMatterPages(backMatterOrder) {
  return reconcileOrder(backMatterOrder, BACK_MATTER_PAGES).map((id) => BACK_MATTER_PAGES.find((p) => p.id === id));
}

// Moves one id one slot earlier (direction -1) or later (direction +1) within an
// already-reconciled order array — e.g. pushing Instructions into position 2 shifts
// Copyright (and everything after it) down by exactly one slot, nothing else changes.
export function reorderPage(orderedIds, pageId, direction) {
  const index = orderedIds.indexOf(pageId);
  const targetIndex = index + direction;
  if (index === -1 || targetIndex < 0 || targetIndex >= orderedIds.length) return orderedIds;
  const next = [...orderedIds];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

// Front matter is emitted as content+blank-facing pairs (2 pages) per enabled item —
// this replaces the old fixed FRONT_MATTER_INTERIOR_PAGES constant so the storyboard's
// displayed page numbers, and the real export, always agree on exactly where the
// puzzle interior begins. EXCEPT: when there's a puzzle to follow, the very last
// enabled front-matter page skips its own blank — that slot becomes the first
// puzzle's key page directly instead of an extra parity-filler page (see
// pdfExport.js) — so front matter is exactly one page shorter in that case.
export function computeFrontMatterPageCount(disabledPageIds, hasPuzzles) {
  const enabledCount = FRONT_MATTER_PAGES.filter((p) => isPageEnabled(disabledPageIds, p.id)).length;
  if (enabledCount === 0) return 0;
  return hasPuzzles ? enabledCount * 2 - 1 : enabledCount * 2;
}
