// Split out of foodDatabase.js so AppContext.jsx can statically import
// sanitizeFoodUnits() (needed synchronously inside createFood/updateFood)
// without also pulling in the full 2075-entry FOOD_DATABASE array — that
// array is deliberately dynamically imported elsewhere (see
// AppContext.jsx's importBuiltInFoods) to keep it out of the main bundle;
// a static import of anything from foodDatabase.js itself would have
// defeated that code-splitting. foodDatabase.js re-exports UNIT_DEFS from
// here so every other existing import site (unitsFor, scaleFood, tests,
// etc.) is unaffected.

// Standard weight/volume unit conversions (approximated at water density for
// volume units — the same simplification virtually every food-tracking app
// uses). A food's `units` field lists extra units to offer ON TOP OF the
// ones automatically inferred (see unitsFor in foodDatabase.js); `customUnit`
// adds one food-specific "piece" unit (1 egg, 1 slice, 1 banana...). The base
// unit (grams or ml) is always available.
export const UNIT_DEFS = {
  g: { id: "g", label: "g", grams: 1 },
  ml: { id: "ml", label: "ml", grams: 1 },
  tbsp: { id: "tbsp", label: "tbsp", grams: 15 },
  tsp: { id: "tsp", label: "tsp", grams: 5 },
  cup: { id: "cup", label: "cup", pluralLabel: "cups", grams: 240 },
  oz: { id: "oz", label: "oz", grams: 28.35 },
  lb: { id: "lb", label: "lb", grams: 453.59 },
  kg: { id: "kg", label: "kg", grams: 1000 },
  pat: { id: "pat", label: "pat", grams: 5 },
  stick: { id: "stick", label: "stick", pluralLabel: "sticks", grams: 113 },
};

// Units never allowed on an individual food-logging serving, even if a
// barcode import, an AI suggestion, or a hand-typed `units` list tries to
// add one: any imperial unit, plus kg (a bulk/wholesale unit, not a single
// serving — see foodDatabase.js's autoUnitIds comment). Checked by
// name-or-id, since an external source (e.g. Open Food Facts) could
// plausibly spell one out as "ounce"/"pound" rather than the internal
// "oz"/"lb" id.
const FORBIDDEN_UNIT_IDS = new Set(["oz", "lb", "lbs", "ounce", "ounces", "pound", "pounds", "kg", "kilogram", "kilograms"]);

// The one gate every food-creation/edit path goes through before it's
// saved — a custom food (coach-added or a client's Quick Add), a
// barcode-imported product, or any future AI-suggested food — whether
// that's a full new document (createFood) or a partial edit (updateFood).
// Strips anything that would violate the metric-only requirement or that
// can't be trusted as a real conversion factor, WITHOUT inventing a
// replacement value — per the "never invent serving weights" rule, an
// invalid figure for a field that WAS supplied is clamped to the safe
// metric fallback (100g/ml, or dropping the unit/customUnit entirely)
// rather than guessed; a field that wasn't supplied at all is left
// untouched, so this is safe to run on a partial update too. Never
// throws — a food that fails every optional check still saves with its
// core name/macros intact.
export function sanitizeFoodUnits(data) {
  const out = { ...data };

  // `per`/`defaultQty`, when supplied, must be real positive numbers
  // (grams or ml) — an invalid/zero/negative value falls back to the
  // standard 100g/ml base rather than saving a food that can never be
  // scaled correctly (a division by zero or a negative factor in
  // scaleFood()).
  if (out.per !== undefined) {
    const per = Number(out.per);
    out.per = Number.isFinite(per) && per > 0 ? per : 100;
  }
  if (out.defaultQty !== undefined) {
    const defaultQty = Number(out.defaultQty);
    out.defaultQty = Number.isFinite(defaultQty) && defaultQty > 0 ? defaultQty : out.per || 100;
  }

  // Hand-curated/imported extra units: drop anything imperial, kg, or not
  // a real entry in UNIT_DEFS at all (an unrecognized id from a future
  // external source would otherwise silently fail to resolve later, or
  // worse, collide with a real id if UNIT_DEFS ever grows one with the
  // same name).
  if (Array.isArray(out.units)) {
    out.units = out.units.filter((id) => typeof id === "string" && UNIT_DEFS[id] && !FORBIDDEN_UNIT_IDS.has(id.toLowerCase()));
  }

  // A food's own "piece" unit (1 egg, 1 slice, 1 scoop) must carry a real,
  // verified positive gram weight — never invented. Missing/zero/negative
  // is dropped entirely rather than guessed, leaving the food to fall
  // back on its base g/ml unit only, exactly as the "never invent serving
  // weights or conversions" requirement calls for.
  if (out.customUnit) {
    const grams = Number(out.customUnit.grams);
    if (!Number.isFinite(grams) || grams <= 0 || !out.customUnit.label) {
      delete out.customUnit;
    }
  }

  return out;
}
