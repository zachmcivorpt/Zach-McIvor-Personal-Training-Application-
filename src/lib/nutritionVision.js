// Simulated photo-to-macro estimation. Real food-photo recognition needs a
// vision model (e.g. Claude vision) running on a backend — this static site
// has nowhere safe to hold an API key, so this returns a plausible,
// clearly-editable estimate instead of pretending to have really "looked"
// at the photo. Swap this module out for a real API call once there's a
// backend to call it from; nothing else in the UI needs to change.

const PRESETS = [
  {
    name: "Grilled Chicken & Rice Bowl",
    ingredients: [
      { name: "Grilled chicken breast", cals: 231, protein: 43, carbs: 0, fat: 5 },
      { name: "White rice", cals: 205, protein: 4, carbs: 45, fat: 0 },
      { name: "Steamed broccoli", cals: 31, protein: 3, carbs: 6, fat: 0 },
    ],
  },
  {
    name: "Salmon, Sweet Potato & Greens",
    ingredients: [
      { name: "Baked salmon", cals: 280, protein: 39, carbs: 0, fat: 13 },
      { name: "Roasted sweet potato", cals: 112, protein: 2, carbs: 26, fat: 0 },
      { name: "Mixed greens", cals: 20, protein: 1, carbs: 4, fat: 0 },
    ],
  },
  {
    name: "Beef Stir Fry",
    ingredients: [
      { name: "Lean beef strips", cals: 250, protein: 32, carbs: 0, fat: 12 },
      { name: "Stir-fry vegetables", cals: 70, protein: 3, carbs: 12, fat: 1 },
      { name: "Egg noodles", cals: 190, protein: 7, carbs: 38, fat: 2 },
    ],
  },
  {
    name: "Overnight Oats & Berries",
    ingredients: [
      { name: "Rolled oats", cals: 158, protein: 6, carbs: 27, fat: 3 },
      { name: "Greek yogurt", cals: 100, protein: 17, carbs: 6, fat: 0 },
      { name: "Mixed berries", cals: 45, protein: 1, carbs: 11, fat: 0 },
    ],
  },
  {
    name: "Turkey Sandwich & Side Salad",
    ingredients: [
      { name: "Turkey breast, 2 slices bread", cals: 320, protein: 28, carbs: 34, fat: 8 },
      { name: "Side salad", cals: 60, protein: 2, carbs: 8, fat: 2 },
    ],
  },
  {
    name: "Protein Smoothie Bowl",
    ingredients: [
      { name: "Protein powder", cals: 120, protein: 24, carbs: 3, fat: 1 },
      { name: "Banana", cals: 105, protein: 1, carbs: 27, fat: 0 },
      { name: "Granola topping", cals: 140, protein: 3, carbs: 20, fat: 5 },
    ],
  },
  {
    name: "Steak, Potatoes & Asparagus",
    ingredients: [
      { name: "Sirloin steak", cals: 290, protein: 36, carbs: 0, fat: 15 },
      { name: "Roasted potatoes", cals: 160, protein: 3, carbs: 30, fat: 3 },
      { name: "Grilled asparagus", cals: 27, protein: 3, carbs: 5, fat: 0 },
    ],
  },
  {
    name: "Veggie Omelette & Toast",
    ingredients: [
      { name: "3-egg omelette with vegetables", cals: 260, protein: 19, carbs: 6, fat: 18 },
      { name: "Whole grain toast", cals: 90, protein: 4, carbs: 15, fat: 1 },
    ],
  },
];

function sumMacros(ingredients) {
  return ingredients.reduce(
    (acc, i) => ({
      cals: acc.cals + i.cals,
      protein: acc.protein + i.protein,
      carbs: acc.carbs + i.carbs,
      fat: acc.fat + i.fat,
    }),
    { cals: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Resolves after a short delay to feel like real analysis. Same photo
// (by name+size) tends to land on the same estimate, like real recognition
// would be consistent — but this is heuristic, not actual image understanding.
export function estimateMealFromPhoto(file) {
  return new Promise((resolve) => {
    const seed = hashSeed(`${file.name}_${file.size}_${file.lastModified}`);
    const preset = PRESETS[seed % PRESETS.length];
    setTimeout(() => {
      const ingredients = preset.ingredients.map((i) => ({ ...i, id: `ing_${Math.random().toString(36).slice(2, 8)}` }));
      resolve({ name: preset.name, ingredients, ...sumMacros(ingredients) });
    }, 1400);
  });
}
