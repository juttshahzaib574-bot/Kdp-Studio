// Module: The Universal Color Palette
// The tool's single, exact source of truth for every color used to label and paint
// mosaic color-by-number pages — every hex value here is a real, exact code, never
// an approximated or brand-guessed one. Delta E quantization (shadeQuantizationEngine.js)
// is only as good as what it's measuring distance to; a heuristic "close enough" hex
// guess for a brand's pencil name was the other half of why sampled pixels used to
// snap onto unrelated-looking colors.

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

const RAW = [
  { id: 1, name: "Pure White", hex: "#FFFFFF" },
  { id: 2, name: "Ivory Cream", hex: "#FFFDD0" },
  { id: 3, name: "Warm Gray", hex: "#D3D3D3" },
  { id: 4, name: "Cool Gray", hex: "#A9A9A9" },
  { id: 5, name: "Slate Gray", hex: "#708090" },
  { id: 6, name: "Charcoal Black", hex: "#36454F" },
  { id: 7, name: "Jet Black", hex: "#000000" },
  { id: 8, name: "Lemon Yellow", hex: "#FFF700" },
  { id: 9, name: "Golden Yellow", hex: "#FFD700" },
  { id: 10, name: "Amber Gold", hex: "#FFBF00" },
  { id: 11, name: "Warm Peach", hex: "#FFDAB9" },
  { id: 12, name: "Desert Sand", hex: "#EDC9AF" },
  { id: 13, name: "Tan Brown", hex: "#D2B48C" },
  { id: 14, name: "Chocolate Brown", hex: "#7B3F00" },
  { id: 15, name: "Dark Walnut", hex: "#4A2E18" },
  { id: 16, name: "Pastel Pink", hex: "#FFB6C1" },
  { id: 17, name: "Rose Pink", hex: "#FF69B4" },
  { id: 18, name: "Coral Red", hex: "#FF7F50" },
  { id: 19, name: "Cherry Red", hex: "#E32636" },
  { id: 20, name: "Crimson Red", hex: "#DC143C" },
  { id: 21, name: "Burnt Orange", hex: "#CC5500" },
  { id: 22, name: "Rust Orange", hex: "#B7410E" },
  { id: 23, name: "Lavender Purple", hex: "#E6E6FA" },
  { id: 24, name: "Royal Purple", hex: "#7851A9" },
  { id: 25, name: "Deep Violet", hex: "#4B0082" },
  { id: 26, name: "Sky Blue", hex: "#87CEEB" },
  { id: 27, name: "Baby Blue", hex: "#89CFF0" },
  { id: 28, name: "Cyan Blue", hex: "#00FFFF" },
  { id: 29, name: "Cobalt Blue", hex: "#0047AB" },
  { id: 30, name: "Navy Blue", hex: "#000080" },
  { id: 31, name: "Mint Green", hex: "#98FF98" },
  { id: 32, name: "Lime Green", hex: "#32CD32" },
  { id: 33, name: "Grass Green", hex: "#7CFC00" },
  { id: 34, name: "Forest Green", hex: "#228B22" },
  { id: 35, name: "Olive Green", hex: "#556B2F" },
  { id: 36, name: "Teal Turquoise", hex: "#008080" },
  { id: 37, name: "Camel", hex: "#C19A6B" },
  { id: 38, name: "Copper Brown", hex: "#B87333" },
  { id: 39, name: "Sienna", hex: "#A0522D" },
  { id: 40, name: "Steel Blue", hex: "#4682B4" },
  { id: 41, name: "Taupe", hex: "#8B7D6B" },
];

export const UNIVERSAL_PALETTE_36 = RAW.map((entry) => ({ ...entry, rgb: hexToRgb(entry.hex) }));
