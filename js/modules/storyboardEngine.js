// Module: Drag-and-Drop Storyboard Dashboard

// The exported PDF's generated front matter is 6 content pages (Title, Copyright,
// Belongs-To, Color Test, Instructions, Master Palette), each followed by its single-
// sided blank facing page — 12 interior pages. Shared with pdfExport.js so the
// storyboard's displayed page numbers always match the real exported PDF.
export const FRONT_MATTER_INTERIOR_PAGES = 12;

// Fluid Reordering: move one item from one index to another, immutably.
export function reorder(items, fromIndex, toIndex) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

// Automated Pagination Syncing: each puzzle's color-key page is the even/left-hand
// page immediately followed by that SAME puzzle's odd/right-hand grid page, so opening
// the book to that spread always shows "key on the left, grid to paint on the right."
// Real book spreads only ever pair (even N, odd N+1) — never (odd N, even N+1) — so
// the key must PRECEDE its puzzle, not follow it. When the front matter ends on an
// even page (the normal case), pdfExport.js inserts one blank filler page to shift
// parity so the first key page lands on an even number; this mirrors that here.
export function computePagination(items, frontMatterPageCount) {
  const firstKeyPage = frontMatterPageCount % 2 === 0 ? frontMatterPageCount + 2 : frontMatterPageCount + 1;

  return items.map((item, index) => {
    const keyPage = firstKeyPage + index * 2;
    const puzzlePage = keyPage + 1;
    return { ...item, keyPage, puzzlePage };
  });
}

// Thumbnail Status Indicators: derive quick-glance badges from an item's granular overrides.
export function statusBadges(item, globalDefaults) {
  const badges = [item.settings.gridPattern ?? globalDefaults.gridPattern];
  if ((item.settings.borderPreset ?? globalDefaults.borderPreset) === "midnight-marker") badges.push("midnight-mode");
  if (item.settings.cornerRadiusPercent !== null && item.settings.cornerRadiusPercent !== undefined) badges.push("custom-radius");
  if (item.settings.colorSetOverride) badges.push("custom-palette");
  if (item.settings.backBackgroundAssetId) badges.push("custom-back");
  return badges;
}
