// Module: Automated Solution Generation Engine

export const THUMBNAILS_PER_PAGE_OPTIONS = [4, 6];

export function computeSolutionPageCount(itemCount, perPage) {
  return Math.max(0, Math.ceil(itemCount / perPage));
}

// Auto-Syncing: solution pages are derived straight from the current storyboard order,
// so reordering the storyboard automatically reshuffles the solutions too.
export function buildSolutionPages(items, perPage) {
  const pages = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push({
      pageIndex: pages.length,
      thumbnails: items.slice(i, i + perPage).map((item) => ({
        itemId: item.id,
        objectUrl: item.objectUrl,
        puzzlePage: item.puzzlePage,
      })),
    });
  }
  return pages;
}
