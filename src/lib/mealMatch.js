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

// A meal with no mealTypes tag is eligible for any slot (backward
// compatible fallback for meals created before tagging existed).
export function eligibleForSlot(meal, slot) {
  const types = meal.mealTypes || [];
  return types.length === 0 || types.includes(slot);
}
