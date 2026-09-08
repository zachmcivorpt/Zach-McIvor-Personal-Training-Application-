// Builds a consolidated weekly shopping list from a meal plan's days —
// sums every ingredient's quantity across all meals assigned that week
// (an ingredient used in 3 different meals that week counts 3x), then
// expresses each food in a shopping-friendly unit: a whole count for
// foods with a countable unit (eggs, bread slices, bagels — see
// customUnit in foodDatabase.js), otherwise a rounded-up weight/volume.
// It's computed live from the plan on every read, not stored — so it's
// automatically current the moment a coach creates or edits a plan,
// with nothing to regenerate by hand.
import { FOOD_DATABASE } from "./foodDatabase";

const byId = Object.fromEntries(FOOD_DATABASE.map((f) => [f.id, f]));

const CATEGORY_BY_PREFIX = {
  m: "Meat & Poultry",
  f: "Seafood",
  d: "Dairy & Eggs",
  g: "Grains & Bread",
  v: "Fruit & Veg",
  r: "Fruit & Veg",
  n: "Pantry & Nuts",
  l: "Pantry & Nuts",
  p: "Pantry & Nuts",
  t: "Treats & Snacks",
};
export const CATEGORY_ORDER = [
  "Meat & Poultry",
  "Seafood",
  "Dairy & Eggs",
  "Fruit & Veg",
  "Grains & Bread",
  "Pantry & Nuts",
  "Treats & Snacks",
  "Other",
];

function categoryFor(foodId) {
  return CATEGORY_BY_PREFIX[foodId[0]] || "Other";
}

// Rounds a total UP to a "nice" shopping quantity rather than showing an
// exact-but-awkward number like 1050g — the step gets coarser as the
// total grows, similar to how pack sizes step up in a real supermarket.
function niceStep(total) {
  if (total < 250) return 25;
  if (total < 500) return 50;
  if (total < 1000) return 100;
  if (total < 2000) return 250;
  return 500;
}
function roundUpTo(value, step) {
  return Math.ceil(value / step) * step;
}

function formatWeight(grams) {
  const rounded = roundUpTo(grams, niceStep(grams));
  return rounded >= 1000 ? `${(rounded / 1000).toFixed(rounded % 1000 === 0 ? 0 : 1)}kg` : `${rounded}g`;
}
function formatVolume(ml) {
  const rounded = roundUpTo(ml, niceStep(ml));
  return rounded >= 1000 ? `${(rounded / 1000).toFixed(rounded % 1000 === 0 ? 0 : 1)}L` : `${rounded}ml`;
}

export function buildShoppingList(weekDays, mealsById) {
  const totals = new Map(); // baseFoodId -> grams
  const unnamed = new Map(); // exact ingredient name -> count (no baseFoodId to aggregate by)

  (weekDays || []).forEach((day) => {
    Object.values(day.meals || {}).forEach((mealIds) => {
      (mealIds || []).forEach((mealId) => {
        const meal = mealsById[mealId];
        if (!meal) return;
        (meal.ingredients || []).forEach((ing) => {
          if (ing.baseFoodId && ing.grams) {
            totals.set(ing.baseFoodId, (totals.get(ing.baseFoodId) || 0) + ing.grams);
          } else if (ing.name) {
            unnamed.set(ing.name, (unnamed.get(ing.name) || 0) + 1);
          }
        });
      });
    });
  });

  const items = [];
  totals.forEach((grams, foodId) => {
    const food = byId[foodId];
    if (!food) return;
    let qtyLabel;
    if (food.customUnit) {
      const count = Math.max(1, Math.ceil(grams / food.customUnit.grams));
      qtyLabel = `${count} ${count === 1 ? food.customUnit.label : food.customUnit.pluralLabel || `${food.customUnit.label}s`}`;
    } else if (food.units?.includes("ml")) {
      qtyLabel = formatVolume(grams);
    } else {
      qtyLabel = formatWeight(grams);
    }
    items.push({ id: foodId, name: food.name, qtyLabel, category: categoryFor(foodId) });
  });
  unnamed.forEach((count, name) => {
    items.push({ id: name, name, qtyLabel: count > 1 ? `x${count}` : "", category: "Other" });
  });

  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

// A plan's days may predate the week-structure and have no explicit
// weekIndex — fall back to grouping them into blocks of 7 by position,
// same convention used everywhere else a plan's weeks are computed.
export function weeksCountOf(days) {
  if (!days?.length) return 1;
  return Math.max(...days.map((d, i) => d.weekIndex ?? Math.floor(i / 7))) + 1;
}

export function currentWeekIndex(startDate, weeksCount) {
  if (!startDate) return 0;
  const diffDays = Math.floor((Date.now() - new Date(startDate + "T00:00:00").getTime()) / 86400000);
  return Math.max(0, Math.min(weeksCount - 1, Math.floor(diffDays / 7)));
}

export function daysInWeek(days, weekIndex) {
  return (days || []).filter((d, i) => (d.weekIndex ?? Math.floor(i / 7)) === weekIndex);
}
