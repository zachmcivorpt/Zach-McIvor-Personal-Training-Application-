// Shared "how well does this meal fit that calorie/macro target" scoring,
// used by both the coach's Meal Plan Builder (Auto-Build) and the
// client's own "swap this meal" picker, so both sides rank alternatives
// the same way. Lower fitScore is a better fit; matchPct turns it into a
// friendly 0-100 badge. This is a deterministic best-fit match against
// the Meal Library — not a generative AI call.
export function fitScore(meal, target) {
  if (!target || !target.calories) return 0;
  const dCals = Math.abs((meal.cals || 0) - target.calories) / target.calories;
  const dProtein = Math.abs((meal.protein || 0) - target.protein) / Math.max(target.protein, 1);
  const dCarbs = Math.abs((meal.carbs || 0) - target.carbs) / Math.max(target.carbs, 1);
  const dFat = Math.abs((meal.fat || 0) - target.fat) / Math.max(target.fat, 1);
  return dCals * 2 + dProtein * 1.5 + dCarbs + dFat;
}

export function matchPct(score) {
  return Math.max(0, Math.min(100, Math.round(100 - score * 35)));
}

export function bestMatches(meals, target, n = meals.length) {
  return [...meals]
    .map((meal) => ({ meal, score: fitScore(meal, target) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, n);
}

// A meal library built around a handful of "protein + carb + veg"
// templates (lean beef mince, pork loin, chicken, ...) tends to have many
// near-duplicate entries sharing almost identical macros — so a plain
// closest-macro-first ranking for a small "pick one of these" list (the
// client's own meal-swap picker) comes back as eight variations of
// basically the same dish instead of eight genuinely different options.
// Caps how many results can share the same leading ingredient/protein
// (the part of the name before "&"/"with", e.g. "Lean Beef Mince"),
// walking the same closest-match-first ordering as bestMatches but
// skipping over-represented themes once the cap's hit — still surfaces
// the single closest match for each theme, just stops it from crowding
// out everything else.
export function diverseBestMatches(meals, target, n = meals.length, perThemeCap = 1) {
  const ranked = [...meals].map((meal) => ({ meal, score: fitScore(meal, target) })).sort((a, b) => a.score - b.score);
  const themeCounts = new Map();
  const result = [];
  const leftovers = [];
  for (const entry of ranked) {
    const theme = mealTheme(entry.meal.name);
    const count = themeCounts.get(theme) || 0;
    if (count < perThemeCap) {
      themeCounts.set(theme, count + 1);
      result.push(entry);
      if (result.length >= n) return result;
    } else {
      leftovers.push(entry);
    }
  }
  // Not enough distinct themes to fill n at the cap — top up with the
  // next-best matches regardless of theme rather than showing fewer than
  // asked for.
  return result.concat(leftovers.slice(0, n - result.length));
}

function mealTheme(name) {
  return (name || "")
    .split(/\s+&\s+|\s+with\s+/i)[0]
    .trim()
    .toLowerCase();
}

// A meal with no mealTypes tag is eligible for any slot (backward
// compatible fallback for meals created before tagging existed).
export function eligibleForSlot(meal, slot) {
  const types = meal.mealTypes || [];
  return types.length === 0 || types.includes(slot);
}
