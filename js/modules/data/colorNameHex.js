// Approximate on-screen hex swatches for colored-pencil brand names. These are
// deliberately keyword + modifier based, not calibrated Pantone/brand color matches —
// good enough for a color-key preview swatch, not for physical print proofing.

const KEYWORD_HSL = [
  ["sky blue", { h: 200, s: 70, l: 60 }],
  ["baby blue", { h: 200, s: 60, l: 75 }],
  ["light blue", { h: 205, s: 65, l: 68 }],
  ["royal blue", { h: 230, s: 70, l: 45 }],
  ["navy blue", { h: 225, s: 60, l: 28 }],
  ["deep blue", { h: 220, s: 70, l: 35 }],
  ["cobalt blue", { h: 215, s: 75, l: 40 }],
  ["prussian blue", { h: 210, s: 65, l: 25 }],
  ["ultramarine", { h: 235, s: 70, l: 45 }],
  ["cerulean", { h: 195, s: 70, l: 50 }],
  ["turquoise", { h: 174, s: 65, l: 45 }],
  ["teal", { h: 180, s: 60, l: 35 }],
  ["indigo", { h: 250, s: 55, l: 35 }],
  ["aqua-green", { h: 165, s: 60, l: 50 }],
  ["aqua", { h: 175, s: 65, l: 55 }],
  ["blue", { h: 220, s: 70, l: 50 }],

  ["grass green", { h: 110, s: 55, l: 40 }],
  ["lime green", { h: 90, s: 65, l: 50 }],
  ["light green", { h: 100, s: 55, l: 60 }],
  ["yellow-green", { h: 80, s: 60, l: 50 }],
  ["sap green", { h: 100, s: 45, l: 38 }],
  ["pine green", { h: 155, s: 45, l: 28 }],
  ["jade green", { h: 150, s: 45, l: 40 }],
  ["jade", { h: 150, s: 45, l: 45 }],
  ["emerald", { h: 140, s: 60, l: 38 }],
  ["moss green", { h: 85, s: 35, l: 35 }],
  ["sage", { h: 95, s: 25, l: 55 }],
  ["kelly green", { h: 130, s: 55, l: 40 }],
  ["mint green", { h: 150, s: 45, l: 65 }],
  ["dark green", { h: 130, s: 45, l: 25 }],
  ["olive green", { h: 65, s: 40, l: 32 }],
  ["olive", { h: 65, s: 40, l: 35 }],
  ["green", { h: 120, s: 55, l: 40 }],

  ["golden yellow", { h: 45, s: 85, l: 55 }],
  ["lemon yellow", { h: 58, s: 90, l: 60 }],
  ["cadmium yellow", { h: 50, s: 90, l: 55 }],
  ["naples yellow", { h: 48, s: 65, l: 65 }],
  ["yellow ochre", { h: 42, s: 60, l: 45 }],
  ["light yellow", { h: 56, s: 85, l: 75 }],
  ["gold", { h: 45, s: 75, l: 50 }],
  ["cream", { h: 50, s: 55, l: 85 }],
  ["yellow", { h: 55, s: 90, l: 60 }],

  ["red-orange", { h: 15, s: 80, l: 55 }],
  ["yellow-orange", { h: 35, s: 85, l: 55 }],
  ["tangerine", { h: 28, s: 85, l: 55 }],
  ["vermilion", { h: 12, s: 80, l: 50 }],
  ["peach", { h: 24, s: 75, l: 78 }],
  ["light orange", { h: 30, s: 80, l: 65 }],
  ["orange", { h: 30, s: 85, l: 55 }],

  ["madder lake", { h: 350, s: 65, l: 42 }],
  ["crimson", { h: 350, s: 75, l: 45 }],
  ["scarlet", { h: 5, s: 80, l: 48 }],
  ["raspberry", { h: 340, s: 65, l: 45 }],
  ["magenta", { h: 320, s: 70, l: 50 }],
  ["carmine", { h: 355, s: 75, l: 40 }],
  ["cadmium red", { h: 5, s: 80, l: 48 }],
  ["hot pink", { h: 330, s: 80, l: 60 }],
  ["soft pink", { h: 335, s: 55, l: 80 }],
  ["rose pink", { h: 340, s: 60, l: 72 }],
  ["deep red", { h: 355, s: 70, l: 35 }],
  ["dark red", { h: 355, s: 65, l: 32 }],
  ["brick red", { h: 8, s: 55, l: 40 }],
  ["venetian red", { h: 8, s: 55, l: 42 }],
  ["pink", { h: 330, s: 55, l: 78 }],
  ["salmon", { h: 6, s: 70, l: 72 }],
  ["coral", { h: 16, s: 75, l: 65 }],
  ["rose", { h: 345, s: 55, l: 65 }],
  ["red", { h: 0, s: 75, l: 48 }],

  ["imperial purple", { h: 280, s: 55, l: 35 }],
  ["deep purple", { h: 275, s: 50, l: 32 }],
  ["orchid", { h: 300, s: 50, l: 60 }],
  ["mauve", { h: 300, s: 30, l: 60 }],
  ["plum", { h: 290, s: 40, l: 35 }],
  ["lilac", { h: 275, s: 45, l: 75 }],
  ["lavender", { h: 260, s: 45, l: 78 }],
  ["violet", { h: 270, s: 55, l: 50 }],
  ["purple", { h: 280, s: 50, l: 42 }],

  ["vandyke brown", { h: 20, s: 45, l: 22 }],
  ["dark brown", { h: 22, s: 45, l: 25 }],
  ["medium brown", { h: 26, s: 45, l: 32 }],
  ["light brown", { h: 30, s: 45, l: 45 }],
  ["raw sienna", { h: 24, s: 55, l: 38 }],
  ["burnt sienna", { h: 15, s: 55, l: 35 }],
  ["raw umber", { h: 28, s: 40, l: 28 }],
  ["mahogany", { h: 12, s: 45, l: 28 }],
  ["chocolate", { h: 20, s: 45, l: 25 }],
  ["terracotta", { h: 12, s: 50, l: 45 }],
  ["harvest gold", { h: 42, s: 60, l: 45 }],
  ["tan", { h: 35, s: 40, l: 60 }],
  ["brown", { h: 25, s: 45, l: 32 }],

  ["cool gray", { h: 210, s: 8, l: 65 }],
  ["warm gray", { h: 30, s: 10, l: 60 }],
  ["slate gray", { h: 210, s: 12, l: 45 }],
  ["dark gray", { h: 0, s: 0, l: 30 }],
  ["charcoal", { h: 220, s: 8, l: 20 }],
  ["gray", { h: 0, s: 0, l: 55 }],

  ["black", { h: 0, s: 0, l: 8 }],
  ["white", { h: 0, s: 0, l: 97 }],
];

function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function approximateHexForName(name) {
  const lower = name.toLowerCase();
  const match = KEYWORD_HSL.find(([phrase]) => lower.includes(phrase));
  const phrase = match ? match[0] : "";
  let { h, s, l } = match ? match[1] : { h: 0, s: 0, l: 50 };

  const alreadyEncodesLight = /light|pale|pastel|baby|cream/.test(phrase);
  const alreadyEncodesDark = /dark|deep|burnt|navy|charcoal/.test(phrase);

  if (/\b(light|pale|pastel|soft)\b/.test(lower) && !alreadyEncodesLight) {
    l = Math.min(90, l + 12);
  }
  if (/\b(deep|dark|burnt)\b/.test(lower) && !alreadyEncodesDark) {
    l = Math.max(15, l - 15);
  }

  return hslToHex(h, s, l);
}

export function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
