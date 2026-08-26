// Module: Font Library
// A curated set of fonts a creator can assign per composition element (Title, Subtitle,
// Instruction, Color Key), spanning bold/display, elegant, and serious/professional
// styles. Every font is licensed under the SIL Open Font License 1.1 — completely free
// for commercial use, with no attribution requirement and no restriction that could ever
// cause a KDP print-review rejection (see js/vendor/fonts/OFL-LICENSE.md for the full
// license text and per-font copyright). Files are bundled locally under js/vendor/fonts/
// — no Google Fonts CDN call, consistent with the app's zero-API architecture — and get
// embedded (subset) directly into the exported PDF via pdf-lib + fontkit, satisfying
// KDP's "every font must be embedded" print requirement.

export const FONT_CATEGORIES = [
  { id: "display", label: "Bold & Display" },
  { id: "elegant", label: "Elegant" },
  { id: "serious", label: "Serious & Professional" },
];

export const SYSTEM_FONT_ID = "system";

export const FONT_LIBRARY = [
  {
    id: "bungee",
    label: "Bungee",
    family: "KDP Bungee",
    category: "display",
    file: "Bungee-Regular.ttf",
    note: "Ultra-bold, condensed, square-sans with sharp corners — retro arcade/game-title energy.",
  },
  {
    id: "press-start-2p",
    label: "Press Start 2P",
    family: "KDP Press Start 2P",
    category: "display",
    file: "PressStart2P-Regular.ttf",
    note: "True 8-bit pixel type — classic console/RPG nostalgia. Best for short titles only.",
  },
  {
    id: "anton",
    label: "Anton",
    family: "KDP Anton",
    category: "display",
    file: "Anton-Regular.ttf",
    note: "Bold, condensed headline sans — big, loud, and easy to read at a glance.",
  },
  {
    id: "archivo-black",
    label: "Archivo Black",
    family: "KDP Archivo Black",
    category: "display",
    file: "ArchivoBlack-Regular.ttf",
    note: "Heavy, square, no-nonsense bold sans.",
  },
  {
    id: "poppins-bold",
    label: "Poppins Bold",
    family: "KDP Poppins Bold",
    category: "display",
    file: "Poppins-Bold.ttf",
    note: "Modern geometric bold — clean, friendly, and very legible.",
  },
  {
    id: "oswald",
    label: "Oswald",
    family: "KDP Oswald",
    category: "display",
    file: "Oswald-Variable.ttf",
    note: "Condensed, clean modern sans — a lighter-touch bold alternative.",
  },
  {
    id: "inter",
    label: "Inter",
    family: "KDP Inter",
    category: "serious",
    file: "Inter-Variable.ttf",
    note: "Highly readable modern sans — a strong pick for instruction/body text.",
  },
  {
    id: "playfair-display",
    label: "Playfair Display",
    family: "KDP Playfair Display",
    category: "elegant",
    file: "PlayfairDisplay-Variable.ttf",
    note: "High-contrast elegant serif — classic book-title feel.",
  },
  {
    id: "cormorant-garamond",
    label: "Cormorant Garamond",
    family: "KDP Cormorant Garamond",
    category: "elegant",
    file: "CormorantGaramond-Regular.ttf",
    note: "Refined, delicate elegant serif.",
  },
  {
    id: "alex-brush",
    label: "Alex Brush",
    family: "KDP Alex Brush",
    category: "elegant",
    file: "AlexBrush-Regular.ttf",
    note: "Flowing script — elegant, but keep it to short titles for legibility.",
  },
  {
    id: "pt-serif",
    label: "PT Serif",
    family: "KDP PT Serif",
    category: "serious",
    file: "PTSerif-Regular.ttf",
    note: "Serious, highly readable book serif.",
  },
  {
    id: "libre-baskerville",
    label: "Libre Baskerville",
    family: "KDP Libre Baskerville",
    category: "serious",
    file: "LibreBaskerville-Variable.ttf",
    note: "Classic, serious book serif — a timeless Baskerville built for print.",
  },
];

export function getFontById(fontId) {
  return FONT_LIBRARY.find((f) => f.id === fontId) ?? null;
}

// Site-root-relative so it resolves the same regardless of which module fetches it —
// fetch()/CSS url() both resolve against the page location, not the importing file.
export function fontAssetUrl(font) {
  return `js/vendor/fonts/${font.file}`;
}
