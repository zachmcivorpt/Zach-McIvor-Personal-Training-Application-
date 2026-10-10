// Pulled out of nutritionAiHelp (index.js) so the validation itself is
// covered by an automated test rather than only trusted by reading it —
// this file has no Firebase/Anthropic dependencies, so it's testable as
// plain Node/Vitest.
//
// A model-generated "contents" breakdown (e.g. "Big Mac Meal" = burger +
// fries + Coke) is only ever trustworthy if its own items genuinely add
// up to the parent suggestion's totals — the model is explicitly asked to
// do that addition itself in the system prompt, but an LLM's arithmetic
// isn't guaranteed, and a mismatched breakdown shown next to a confident
// parent total would be actively misleading (a client could log just the
// parent and reasonably expect it to equal the sum of what the app itself
// showed as "what's in it"). Checked here rather than trusted — any item
// missing a name, or the sum drifting from the parent by more than a few
// calories/grams (rounding slack, not silently wrong math), drops the
// whole breakdown. The parent suggestion itself is never rejected over
// this — only the (optional, supplementary) breakdown is.
function validatedContents(rawContents, parent) {
  if (!Array.isArray(rawContents) || rawContents.length === 0) return undefined;
  const items = rawContents
    .filter((c) => c && typeof c.name === "string")
    .map((c) => ({
      name: c.name,
      calories: Math.round(Number(c.calories)) || 0,
      protein: Math.round(Number(c.protein)) || 0,
      carbs: Math.round(Number(c.carbs)) || 0,
      fat: Math.round(Number(c.fat)) || 0,
    }));
  if (items.length === 0) return undefined;
  const totals = items.reduce(
    (acc, c) => ({
      calories: acc.calories + c.calories,
      protein: acc.protein + c.protein,
      carbs: acc.carbs + c.carbs,
      fat: acc.fat + c.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  // A few calories/grams of slack for rounding each item individually
  // (e.g. three items each rounded to the nearest whole gram can land a
  // gram or two off a parent that was rounded as one number) — anything
  // beyond that is a genuine arithmetic miss, not rounding noise.
  const reconciles =
    Math.abs(totals.calories - parent.calories) <= Math.max(5, parent.calories * 0.03) &&
    Math.abs(totals.protein - parent.protein) <= 3 &&
    Math.abs(totals.carbs - parent.carbs) <= 3 &&
    Math.abs(totals.fat - parent.fat) <= 3;
  return reconciles ? items : undefined;
}

// Maps + validates a raw model response's "suggestions" array into the
// shape actually returned to the client — shared by nutritionAiHelp
// (index.js) and this file's own tests, so the test exercises the exact
// same logic the live function runs, not a second hand-rolled copy that
// could drift out of sync with it.
function buildSuggestions(rawSuggestions) {
  if (!Array.isArray(rawSuggestions)) return [];
  return rawSuggestions
    .filter((s) => s && typeof s.name === "string")
    .slice(0, 3)
    .map((s) => {
      const suggestion = {
        name: s.name,
        calories: Math.round(Number(s.calories)) || 0,
        protein: Math.round(Number(s.protein)) || 0,
        carbs: Math.round(Number(s.carbs)) || 0,
        fat: Math.round(Number(s.fat)) || 0,
      };
      const contents = validatedContents(s.contents, suggestion);
      return contents ? { ...suggestion, contents } : suggestion;
    });
}

module.exports = { validatedContents, buildSuggestions };
