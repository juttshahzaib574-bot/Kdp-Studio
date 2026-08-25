// Section 4: Color Key Standards for Mosaic Color-by-Number Books
// Official brand color-name mappings for the three standard set sizes, transcribed
// from the blueprint's verified Crayola / Mr. Pen / Castle Arts tables.

export const BRANDS = [
  { id: "crayola", label: "Crayola" },
  { id: "mrPen", label: "Mr. Pen" },
  { id: "castleArts", label: "Castle Arts" },
];

// 12-Pencil Base Set (Core Palette)
export const PALETTE_12 = [
  { family: "Red", crayola: "Red", mrPen: "Red", castleArts: "Crimson / Red" },
  { family: "Orange", crayola: "Orange", mrPen: "Orange", castleArts: "Orange" },
  { family: "Yellow", crayola: "Yellow", mrPen: "Yellow", castleArts: "Lemon Yellow / Yellow" },
  { family: "Green", crayola: "Green", mrPen: "Green", castleArts: "Grass Green / Green" },
  { family: "Light Green", crayola: "Yellow-Green", mrPen: "Light Green", castleArts: "Lime Green" },
  { family: "Blue", crayola: "Blue", mrPen: "Blue", castleArts: "Deep Blue" },
  { family: "Sky Blue", crayola: "Sky Blue", mrPen: "Light Blue", castleArts: "Sky Blue / Light Blue" },
  { family: "Purple", crayola: "Violet (Purple)", mrPen: "Purple", castleArts: "Violet" },
  { family: "Brown", crayola: "Brown", mrPen: "Brown", castleArts: "Dark Brown" },
  { family: "Black", crayola: "Black", mrPen: "Black", castleArts: "Black" },
  { family: "White", crayola: "White", mrPen: "White", castleArts: "White" },
  { family: "Pink/Other", crayola: "Red-Orange", mrPen: "Pink", castleArts: "Soft Pink / Salmon" },
];

// 24-Pencil Expanded Set (Best-Seller Sweet Spot)
export const PALETTE_24 = [
  { family: "Reds / Pinks", crayola: ["Red", "Scarlet", "Magenta"], mrPen: ["Red", "Crimson", "Pink"], castleArts: ["Red", "Crimson", "Deep Red", "Coral"] },
  { family: "Oranges", crayola: ["Orange", "Red-Orange", "Yellow-Orange"], mrPen: ["Orange", "Peach"], castleArts: ["Orange", "Vermilion", "Peach"] },
  { family: "Yellows", crayola: ["Yellow", "Golden Yellow"], mrPen: ["Yellow", "Gold"], castleArts: ["Yellow", "Lemon Yellow", "Ochre"] },
  { family: "Greens", crayola: ["Green", "Yellow-Green", "Jade"], mrPen: ["Green", "Light Green", "Olive"], castleArts: ["Emerald", "Sap Green", "Lime", "Olive"] },
  { family: "Blues", crayola: ["Blue", "Sky Blue", "Aqua-Green"], mrPen: ["Blue", "Light Blue", "Turquoise"], castleArts: ["Ultramarine", "Sky Blue", "Turquoise"] },
  { family: "Purples", crayola: ["Violet"], mrPen: ["Purple", "Violet"], castleArts: ["Violet", "Purple", "Orchid"] },
  { family: "Earth Tones", crayola: ["Brown", "Light Brown", "Peach", "Tan"], mrPen: ["Brown", "Raw Sienna", "Burnt Sienna"], castleArts: ["Vandyke Brown", "Sienna", "Terracotta"] },
  { family: "Neutrals", crayola: ["Black", "Gray", "White"], mrPen: ["Black", "Dark Gray", "White"], castleArts: ["Black", "Cool Gray", "White"] },
];

// 36-Pencil Intricate Set (Advanced Adult Puzzles)
export const PALETTE_36 = {
  crayola: {
    "Reds & Pinks": ["Red", "Scarlet", "Raspberry", "Magenta", "Pink", "Salmon"],
    "Oranges & Yellows": ["Orange", "Red-Orange", "Yellow-Orange", "Yellow", "Golden Yellow", "Light Yellow"],
    "Greens": ["Green", "Yellow-Green", "Pine Green", "Lime Green", "Jade Green", "Olive Green"],
    "Blues": ["Blue", "Sky Blue", "Light Blue", "Aqua-Green", "Turquoise", "Navy Blue"],
    "Purples": ["Violet", "Orchid", "Plum", "Lavender"],
    "Neutrals & Earth": ["Brown", "Light Brown", "Mahogany", "Tan", "Peach", "Harvest Gold", "Gray", "Cool Gray", "Black", "White"],
  },
  castleArts: {
    "Reds & Pinks": ["Cadmium Red", "Crimson", "Carmine", "Rose Pink", "Madder Lake"],
    "Oranges & Yellows": ["Orange", "Tangerine", "Lemon Yellow", "Cadmium Yellow", "Naples Yellow", "Yellow Ochre"],
    "Greens": ["Emerald Green", "Grass Green", "Moss Green", "Sage Green", "Olive Green", "Lime Green"],
    "Blues": ["Cobalt Blue", "Ultramarine", "Cerulean", "Sky Blue", "Indigo", "Prussian Blue"],
    "Purples": ["Violet", "Imperial Purple", "Mauve", "Lavender"],
    "Neutrals & Earth": ["Burnt Sienna", "Raw Umber", "Terracotta", "Chocolate", "Venetian Red", "Cool Gray", "Warm Gray", "Black", "White"],
  },
  mrPen: {
    "Reds & Pinks": ["Red", "Dark Red", "Hot Pink", "Soft Pink", "Rose", "Coral"],
    "Oranges & Yellows": ["Orange", "Light Orange", "Yellow", "Golden Yellow", "Cream", "Peach"],
    "Greens": ["Dark Green", "Kelly Green", "Mint Green", "Lime Green", "Olive", "Sage"],
    "Blues": ["Navy Blue", "Royal Blue", "Sky Blue", "Baby Blue", "Turquoise", "Teal"],
    "Purples": ["Deep Purple", "Lilac", "Lavender", "Violet"],
    "Neutrals & Earth": ["Dark Brown", "Medium Brown", "Tan", "Brick Red", "Charcoal", "Slate Gray", "Black", "White"],
  },
};
