// Module: Drag-and-Drop Storyboard Dashboard

// Fluid Reordering: move one item from one index to another, immutably.
export function reorder(items, fromIndex, toIndex) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

// Automated Pagination Syncing: puzzle pages are odd-page-only (right-hand pages),
// with the corresponding back page on the intervening even page — reordering instantly
// recalculates every downstream page number.
export function computePagination(items, frontMatterPageCount) {
  const firstPuzzlePage = frontMatterPageCount % 2 === 0 ? frontMatterPageCount + 1 : frontMatterPageCount + 2;

  return items.map((item, index) => {
    const puzzlePage = firstPuzzlePage + index * 2;
    return { ...item, puzzlePage, backPage: puzzlePage + 1 };
  });
}

// Thumbnail Status Indicators: derive quick-glance badges from an item's granular overrides.
export function statusBadges(item, globalDefaults) {
  const badges = [item.settings.gridPattern ?? globalDefaults.gridPattern];
  if ((item.settings.borderPreset ?? globalDefaults.borderPreset) === "midnight-marker") badges.push("midnight-mode");
  if (item.settings.colorSetOverride) badges.push("custom-palette");
  return badges;
}
