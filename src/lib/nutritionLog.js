// Shared helpers for a client's logged nutrition days (nutritionLogs docs)
// and the food entries inside them — used by the client's Nutrition tab
// and the coach's views of it so both read a day the same way.

// "Food logged" means at least one item in some meal. Tapping +250ml of
// water alone still creates that day's nutritionLogs doc, so the doc
// merely existing doesn't mean the client tracked their food that day —
// counting it did (a water-only day scored as a missed calorie target).
export function hasFoodLogged(day) {
  return !!day && !!day.meals && Object.values(day.meals).some((items) => Array.isArray(items) && items.length > 0);
}

// A logged entry's name carries its amount ("Chicken Breast (150g)",
// "Eggs, whole (2 eggs)") — scaleFood/scaleFoodByUnit append it. The food
// itself is the part before that trailing amount.
const AMOUNT_SUFFIX_RE = /\s*\((\d+(\.\d+)?\s*[^()]*)\)\s*$/;
export function baseFoodName(entry) {
  if (!entry) return "";
  if (entry.src?.name) return entry.src.name;
  const name = entry.name || "";
  if (entry.unitId || entry.grams != null) return name.replace(AMOUNT_SUFFIX_RE, "").trim() || name;
  return name;
}

// The amount part of an entry's name ("150g", "2 eggs", "0.5 serving"),
// or "" for an entry logged as a whole (a saved meal, a Fuel IQ pick).
export function entryAmountLabel(entry) {
  if (!entry) return "";
  if (entry.servings != null && entry.servings !== 1) return `${entry.servings} × serving`;
  const m = (entry.name || "").match(AMOUNT_SUFFIX_RE);
  return entry.unitId || entry.grams != null ? (m ? m[1] : "") : "";
}

// Identity used to group the same food across days, regardless of the
// amount it was logged at.
export function foodKey(entry) {
  return (entry.baseFoodId || baseFoodName(entry)).toString().toLowerCase();
}

// The foods a client actually eats, most-logged first — not just the last
// ten distinct names. Grouped by the food itself (so 150g and 200g of
// chicken are one row, not two), counted over the last `days` days, ties
// broken by whichever was logged most recently. Each row keeps the most
// recent entry, so re-logging repeats the amount last used.
export function buildFrequentFoods(days, { limit = 30, windowDays = 60, today = new Date() } = {}) {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  const rows = new Map();
  const sorted = [...(days || [])].filter((d) => d?.date && d.date >= cutoffKey).sort((a, b) => b.date.localeCompare(a.date));
  sorted.forEach((day) => {
    Object.values(day.meals || {}).forEach((items) => {
      (items || []).forEach((item) => {
        if (!item?.name) return;
        const key = foodKey(item);
        const row = rows.get(key);
        if (row) row.count += 1;
        else rows.set(key, { key, name: baseFoodName(item), entry: item, lastDate: day.date, count: 1 });
      });
    });
  });
  return [...rows.values()].sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate)).slice(0, limit);
}

// The pieces of a database food an entry needs to be re-opened later at a
// different amount (unitsFor/scaleFoodByUnit read exactly these), stored
// on each new entry as `src`. Older entries without it fall back to
// entrySourceFood's rebuild below.
const SRC_FIELDS = ["id", "name", "brand", "cals", "protein", "carbs", "fat", "per", "defaultQty", "liquid", "customUnit", "units", "fromBarcode", "fromAFCD", "verificationLevel"];
const MICRO_KEYS = ["satFat", "transFat", "fiber", "sugar", "sodium", "potassium", "calcium", "iron", "cholesterol", "vitaminC"];
export function sourceSnapshot(food) {
  if (!food) return null;
  const src = {};
  [...SRC_FIELDS, ...MICRO_KEYS].forEach((k) => {
    if (food[k] !== undefined && food[k] !== null) src[k] = food[k];
  });
  return src;
}

// The food to re-open an entry against, plus the amount it was logged at:
// `{ food, unitId, qty }`. Prefers the snapshot stored on the entry, then
// the same food still in the library, then (an entry with a known gram
// weight) the entry itself as "this much per that many grams". Anything
// else — a saved meal, a Fuel IQ pick — can only be scaled as a whole, so
// it comes back as a servings-only food (1 serving = what was logged).
export function entrySourceFood(entry, libraryById) {
  if (!entry) return null;
  if (entry.src && entry.src.cals != null) {
    return { food: entry.src, unitId: entry.unitId || null, qty: entry.unitQty ?? entry.grams ?? null };
  }
  const lib = entry.baseFoodId && libraryById ? libraryById[entry.baseFoodId] : null;
  if (lib) return { food: lib, unitId: entry.unitId || null, qty: entry.unitQty ?? entry.grams ?? null };
  if (entry.grams > 0) {
    const food = { id: entry.baseFoodId || entry.id, name: baseFoodName(entry), cals: entry.cals, protein: entry.protein, carbs: entry.carbs, fat: entry.fat, per: entry.grams, defaultQty: entry.grams };
    MICRO_KEYS.forEach((k) => {
      if (entry[k] != null) food[k] = entry[k];
    });
    return { food, unitId: null, qty: entry.grams };
  }
  const servings = entry.servings || 1;
  const base = { id: entry.baseFoodId || entry.id, name: baseFoodName(entry), servingOnly: true };
  ["cals", "protein", "carbs", "fat", ...MICRO_KEYS].forEach((k) => {
    if (entry[k] != null) base[k] = k === "cals" ? Math.round(entry[k] / servings) : Math.round((entry[k] / servings) * 10) / 10;
  });
  if (entry.photoUrl) base.photoUrl = entry.photoUrl;
  return { food: base, unitId: "serving", qty: servings };
}

// Scales a servings-only food (see entrySourceFood) to `servings` of it.
export function scaleServings(food, servings) {
  const q = Math.max(0, Number(servings) || 0);
  const out = { id: food.id, baseFoodId: food.id, name: food.name, servings: q, servingOnly: true };
  ["cals", "protein", "carbs", "fat", ...MICRO_KEYS].forEach((k) => {
    if (food[k] != null) out[k] = k === "cals" ? Math.round(food[k] * q) : Math.round(food[k] * q * 10) / 10;
  });
  if (food.photoUrl) out.photoUrl = food.photoUrl;
  return out;
}
