// Per-client nutrition targets. Stored on the client's user doc as
// { calories, proteinPct, carbsPct, fatPct } (percentages always sum to
// 100) — grams are derived from calories + percentage using standard
// macro energy values (protein/carbs = 4 kcal/g, fat = 9 kcal/g).
export const DEFAULT_NUTRITION_TARGETS = { calories: 2200, proteinPct: 29, carbsPct: 44, fatPct: 27 };
export const DEFAULT_WATER_TARGET = 3.0;

export function macroGrams(calories, pct, kcalPerGram) {
  return Math.round((calories * (pct / 100)) / kcalPerGram);
}

// Rounding protein/carbs/fat grams independently (three separate
// Math.round calls) means protein*4 + carbs*4 + fat*9 doesn't reliably
// land back on the stated calorie target — e.g. the 2200 kcal default
// (29/44/27%) rounds to 160/242/66g, which is 2202 kcal, not 2200.
// Protein and fat are rounded first since those are the macros a client
// actually watches closely; carbs is then derived from whatever calories
// are left over, so the three gram figures always back-sum to within a
// couple of calories of the stated target — the best achievable with
// whole-gram values — instead of three independent roundings compounding.
export function macroGramsSet(calories, pcts) {
  const protein = macroGrams(calories, pcts.proteinPct ?? pcts.protein, 4);
  const fat = macroGrams(calories, pcts.fatPct ?? pcts.fat, 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat };
}

// Expands stored {calories, proteinPct, carbsPct, fatPct} into the
// {calories, protein, carbs, fat, water} gram-based shape the rest of the
// app already expects.
export function resolveNutritionTargets(stored) {
  const t = { ...DEFAULT_NUTRITION_TARGETS, ...(stored || {}) };
  const grams = macroGramsSet(t.calories, t);
  return {
    calories: t.calories,
    protein: grams.protein,
    carbs: grams.carbs,
    fat: grams.fat,
    water: DEFAULT_WATER_TARGET,
    proteinPct: t.proteinPct,
    carbsPct: t.carbsPct,
    fatPct: t.fatPct,
  };
}

// Micronutrient reference table — the FDA's general-adult Daily Values
// (the same %DV figures printed on every nutrition label), not anything
// personalized to a given client, so these are shown as a plain reference
// rather than a coached-toward "target". Trans fat has no DV at all
// (guidance is simply "as little as possible"), so it gets a note instead
// of a number. Shared by the client's own Nutrition Detail screen and the
// coach's client Nutrition tab so both read the exact same figures.
export const MICRO_DV_ROWS = [
  { key: "satFat", label: "Saturated Fat", unit: "g", dv: 20, kind: "limit" },
  { key: "transFat", label: "Trans Fat", unit: "g", dv: null, note: "as little as possible" },
  { key: "fiber", label: "Fiber", unit: "g", dv: 28, kind: "target" },
  { key: "sugar", label: "Sugar", unit: "g", dv: 50, kind: "limit" },
  { key: "sodium", label: "Sodium", unit: "mg", dv: 2300, kind: "limit" },
  { key: "potassium", label: "Potassium", unit: "mg", dv: 4700, kind: "target" },
  { key: "calcium", label: "Calcium", unit: "mg", dv: 1300, kind: "target" },
  { key: "iron", label: "Iron", unit: "mg", dv: 18, kind: "target" },
  { key: "cholesterol", label: "Cholesterol", unit: "mg", dv: 300, kind: "limit" },
  { key: "vitaminC", label: "Vitamin C", unit: "mg", dv: 90, kind: "target" },
];

// Adjusts one macro's percentage, redistributing the remainder across the
// other two proportionally so all three always sum to exactly 100.
export function adjustMacroPct(pcts, changedKey, rawValue) {
  const clamped = Math.max(0, Math.min(100, Math.round(rawValue)));
  const others = Object.keys(pcts).filter((k) => k !== changedKey);
  const remaining = 100 - clamped;
  const otherSum = others.reduce((a, k) => a + pcts[k], 0);
  const next = { ...pcts, [changedKey]: clamped };

  let allocated = 0;
  others.forEach((k, i) => {
    if (i === others.length - 1) {
      next[k] = Math.max(0, remaining - allocated);
      return;
    }
    const share = otherSum === 0 ? Math.round(remaining / others.length) : Math.round((pcts[k] / otherSum) * remaining);
    next[k] = share;
    allocated += share;
  });

  return next;
}
