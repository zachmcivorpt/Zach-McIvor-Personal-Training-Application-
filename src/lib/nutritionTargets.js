// Per-client nutrition targets. Stored on the client's user doc as
// { calories, proteinPct, carbsPct, fatPct } (percentages always sum to
// 100) — grams are derived from calories + percentage using standard
// macro energy values (protein/carbs = 4 kcal/g, fat = 9 kcal/g).
export const DEFAULT_NUTRITION_TARGETS = { calories: 2200, proteinPct: 29, carbsPct: 44, fatPct: 27 };
export const DEFAULT_WATER_TARGET = 3.0;

export function macroGrams(calories, pct, kcalPerGram) {
  return Math.round((calories * (pct / 100)) / kcalPerGram);
}

// Expands stored {calories, proteinPct, carbsPct, fatPct} into the
// {calories, protein, carbs, fat, water} gram-based shape the rest of the
// app already expects.
export function resolveNutritionTargets(stored) {
  const t = { ...DEFAULT_NUTRITION_TARGETS, ...(stored || {}) };
  return {
    calories: t.calories,
    protein: macroGrams(t.calories, t.proteinPct, 4),
    carbs: macroGrams(t.calories, t.carbsPct, 4),
    fat: macroGrams(t.calories, t.fatPct, 9),
    water: DEFAULT_WATER_TARGET,
    proteinPct: t.proteinPct,
    carbsPct: t.carbsPct,
    fatPct: t.fatPct,
  };
}

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
