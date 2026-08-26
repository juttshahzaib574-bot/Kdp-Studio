// Module: Book-Wide Page Background ("Black Book") & Color Edition Control
// Two independent, explicit book-wide choices — deliberately kept separate from the
// grid tint/border sliders (those still only control grid LINE darkness, never a
// page's background) and from each other, so a creator can combine them freely.

// ---- Page Background ("Black Book") ----
// Every page in the exported book pairs a "content" page (a puzzle's grid page, or a
// generated front/back-matter page like the title or instructions page) with an
// immediately facing "blank/complementary" page (a puzzle's key page, or a front/back-
// matter page's blank facing page). This picks which side of every one of those pairs,
// if any, is solid black vs. paper white.
export const PAGE_BACKGROUND_MODES = [
  { id: "all-white", label: "All White", note: "Every page in the book is standard paper white." },
  { id: "all-black", label: "All Black", note: "Every page in the book — front matter through back matter — is solid black." },
  { id: "grid-black", label: "Content Black / Facing White", note: "Every content page (puzzle grids, title, instructions, etc.) is black; every facing page stays white." },
  { id: "key-black", label: "Facing Black / Content White", note: "Every facing/blank page is black; every content page stays white." },
];

export function isContentPageBlack(pageBackgroundMode) {
  return pageBackgroundMode === "all-black" || pageBackgroundMode === "grid-black";
}

export function isFacingPageBlack(pageBackgroundMode) {
  return pageBackgroundMode === "all-black" || pageBackgroundMode === "key-black";
}

// ---- Color Edition ----
// A real KDP print-cost choice, not a cosmetic one — a Black & White interior prints far
// cheaper per page than a color interior, but even one page using real color ink can push
// the whole book onto color pricing. So this never follows any other setting (grid tint,
// page background, etc.) — it's its own explicit switch, and every place that would
// otherwise paint a real palette color checks it first.
export const BOOK_COLOR_MODES = [
  { id: "color", label: "Full Color", note: "Color keys show filled color swatches; solved/solution pages print in full color." },
  { id: "black-white", label: "Black & White", note: "No page anywhere uses color ink — color keys show numbered black boxes, solved/solution pages render in grayscale instead of filled color." },
];

export function isBlackWhiteEdition(bookColorMode) {
  return bookColorMode === "black-white";
}

// Perceptual luminance grayscale — used wherever a Black & White edition needs to show
// relative tone/value (a solved preview, a decorative swatch row) without spending color ink.
export function toGrayscaleRgb({ r, g, b }) {
  const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return { r: l, g: l, b: l };
}

export function toGrayscaleHex(rgbColor) {
  const { r } = toGrayscaleRgb(rgbColor);
  const hex = r.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}
