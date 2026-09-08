// One-off generator: builds 200 common Australian fitness-industry meals
// using the app's OWN Food Library (src/lib/foodDatabase.js) as the
// single source of truth for every ingredient's name and macros — no
// separately-invented ingredient data. Coles/Woolworths-style brand
// grounding is informational only (see BRAND_HINTS below); the actual
// stored ingredient is always the real food-library entry.
// Run with `node scripts/genAuFitnessMeals.mjs`, writes
// src/lib/fitnessMealsAU.js.
import fs from "fs";
import { FOOD_DATABASE } from "../src/lib/foodDatabase.js";

const byId = Object.fromEntries(FOOD_DATABASE.map((f) => [f.id, f]));
function food(id) {
  const f = byId[id];
  if (!f) throw new Error(`Missing food id ${id} in foodDatabase.js`);
  return f;
}

// Real, current Coles/Woolworths-style product names for context/labels
// only — the macros always come from the matching food-library entry
// above, never from this table.
const BRAND_HINTS = {
  m01: "Coles RSPCA Approved Chicken Breast Fillets",
  m02: "Coles RSPCA Approved Chicken Thigh Fillets Skinless",
  m05: "Woolworths Lean Beef Mince",
  m08: "Coles Australian Beef Sirloin Steak",
  m09: "Coles Pork Tenderloin",
  m32: "Woolworths Turkey Breast Mince",
  f01: "Coles Tasmanian Salmon Portions",
  f02: "John West Tuna Chunks in Springwater",
  f07: "Coles Cooked Prawns",
  d01: "Woolworths Free Range Eggs",
  d02: "Woolworths Egg Whites",
  d06: "Coles High Protein Greek Style Natural Yoghurt No Added Sugar",
  d08: "Coles Low Fat Creamed Cottage Cheese",
  p01: "Woolworths Macro Whey Protein Isolate Powder",
  g07: "Woolworths Australian Rolled Oats",
  g01: "SunRice Medium Grain White Rice",
  g02: "SunRice Brown Rice",
  g03: "SunRice Basmati Rice",
  g05: "Coles Quinoa",
  g15: "San Remo Wholemeal Pasta",
  g09: "Tip Top 9 Grain Bread",
  g13: "Coles Rice Cakes",
  v01: "Perfection Fresh Broccoli",
  v02: "Coles Baby Spinach",
  v16: "Coles Green Beans",
  v19: "Coles Asparagus",
  v61: "Coles Mixed Salad Leaves",
  v09: "Coles Zucchini",
  v13: "Coles Capsicum",
  v28: "Woolworths Hass Avocado",
  n01: "Coles Australian Almonds",
  n05: "Bega Peanut Butter Smooth",
  r01: "Coles Cavendish Bananas",
  r50: "Coles Mixed Berries Frozen",
  n08: "Coles Chia Seeds",
  d04: "Coles Skim Milk",
  d19: "Woolworths Unsweetened Almond Milk",
  n12: "Cobram Estate Extra Virgin Olive Oil",
  l03: "Coles Chickpeas",
  l04: "Coles Lentils",
};

function ingredientLine(id, grams) {
  const f = food(id);
  const scale = grams / f.per;
  const brand = BRAND_HINTS[id];
  return {
    name: `${f.name}${brand ? ` — ${brand}` : ""} (${grams}${f.units?.includes("ml") ? "ml" : "g"})`,
    cals: Math.round(f.cals * scale),
    protein: Math.round(f.protein * scale * 10) / 10,
    carbs: Math.round(f.carbs * scale * 10) / 10,
    fat: Math.round(f.fat * scale * 10) / 10,
  };
}

// mealTypes drives the Meal Plan Builder's Auto-Build engine — it only
// suggests a meal for a slot it's tagged for, so a breakfast dish never
// gets suggested for Dinner. Defaults to a full main (Lunch/Dinner);
// breakfastMeal()/snackMeal() below override it for those sections.
function meal(name, items, mealTypes = ["Lunch", "Dinner"]) {
  const ingredients = items.map(([id, grams]) => ingredientLine(id, grams));
  const totals = ingredients.reduce(
    (a, i) => ({ cals: a.cals + i.cals, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }),
    { cals: 0, protein: 0, carbs: 0, fat: 0 }
  );
  return {
    name,
    ingredients,
    mealTypes,
    cals: Math.round(totals.cals),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
  };
}
function breakfastMeal(name, items) {
  return meal(name, items, ["Breakfast"]);
}
function snackMeal(name, items) {
  return meal(name, items, ["Snacks"]);
}

const meals = [];

// ---- Protein + carb + veg combos (the bulk of a PT's meal library) ----
const proteins = [
  ["m01", "Chicken Breast", 150],
  ["m02", "Chicken Thigh", 150],
  ["m05", "Lean Beef Mince", 150],
  ["m08", "Sirloin Steak", 150],
  ["m09", "Pork Loin", 150],
  ["m32", "Turkey Mince", 150],
  ["f01", "Salmon", 150],
  ["f02", "Tuna", 120],
  ["f07", "Prawns", 150],
];
const carbs = [
  ["g02", "Brown Rice", 150],
  ["g01", "White Rice", 150],
  ["g03", "Basmati Rice", 150],
  ["v05", "Sweet Potato", 200],
  ["v06", "Potato", 200],
  ["g05", "Quinoa", 150],
  ["g15", "Wholemeal Pasta", 150],
];
const veggies = [
  ["v01", "Broccoli", 100],
  ["v02", "Spinach", 60],
  ["v16", "Green Beans", 100],
  ["v19", "Asparagus", 100],
  ["v61", "Side Salad", 60],
];

let combo = 0;
outer: for (const [pKey, pLabel, pGrams] of proteins) {
  for (const [cKey, cLabel, cGrams] of carbs) {
    for (const [vKey, vLabel, vGrams] of veggies) {
      combo++;
      if (combo % 2 !== 0) continue; // every 2nd combo keeps this varied but not exhaustive
      meals.push(meal(`${pLabel} & ${cLabel} with ${vLabel}`, [
        [pKey, pGrams],
        [cKey, cGrams],
        [vKey, vGrams],
        ["n12", 5],
      ]));
      if (meals.length >= 161) break outer;
    }
  }
}
// A handful with the zucchini+capsicum pairing specifically (two real
// food-library items, not a fabricated combined one).
for (const [pKey, pLabel, pGrams] of proteins.slice(0, 5)) {
  meals.push(meal(`${pLabel} Stir-Fry with Zucchini & Capsicum`, [
    [pKey, pGrams],
    ["g02", 150],
    ["v09", 60],
    ["v13", 60],
    ["n12", 8],
  ]));
}

// ---- Breakfasts ----
meals.push(
  breakfastMeal("Protein Oats with Banana", [["g07", 60], ["p01", 30], ["d04", 200], ["r01", 100]]),
  breakfastMeal("Protein Oats with Mixed Berries", [["g07", 60], ["p01", 30], ["d19", 200], ["r50", 80]]),
  breakfastMeal("Overnight Oats with Chia & Peanut Butter", [["g07", 50], ["n08", 15], ["n05", 20], ["d04", 180], ["d06", 100]]),
  breakfastMeal("Scrambled Eggs on Wholemeal Toast", [["d01", 150], ["g09", 60], ["v28", 50]]),
  breakfastMeal("Egg White Omelette with Spinach", [["d02", 200], ["d01", 55], ["v02", 40], ["n12", 5]]),
  breakfastMeal("Greek Yoghurt Bowl with Berries & Almonds", [["d06", 200], ["r50", 80], ["n01", 15]]),
  breakfastMeal("Cottage Cheese with Banana & Oats", [["d08", 150], ["r01", 100], ["g07", 30]]),
  breakfastMeal("Protein Pancakes", [["g07", 50], ["d01", 100], ["p01", 30], ["r01", 80], ["d04", 60]]),
  breakfastMeal("Egg Wholemeal Wrap", [["d01", 110], ["g09", 60]]),
  breakfastMeal("Smoked Salmon & Avocado on Toast", [["f01", 80], ["v28", 60], ["g09", 60]]),
  breakfastMeal("Chia Pudding with Almond Milk & Berries", [["n08", 30], ["d19", 200], ["r50", 60]]),
  breakfastMeal("Turkey Mince & Egg Breakfast Hash", [["m32", 100], ["v06", 150], ["d01", 55]]),
  breakfastMeal("Muesli with Greek Yoghurt", [["g07", 50], ["d06", 150], ["n01", 10], ["r01", 60]]),
  breakfastMeal("Peanut Butter Banana Protein Shake", [["p01", 30], ["n05", 20], ["r01", 100], ["d04", 250]])
);

// ---- Snacks / shakes ----
meals.push(
  snackMeal("Post-Workout Whey Protein Shake", [["p01", 35], ["d04", 300]]),
  snackMeal("Whey Protein & Banana Shake", [["p01", 30], ["r01", 100], ["d19", 250]]),
  snackMeal("Tuna & Rice Cakes", [["f02", 95], ["g13", 27]]),
  snackMeal("Cottage Cheese & Rice Cakes", [["d08", 150], ["g13", 18]]),
  snackMeal("Greek Yoghurt & Almonds", [["d06", 170], ["n01", 20]]),
  snackMeal("Almonds & Banana", [["n01", 25], ["r01", 120]]),
  snackMeal("Boiled Eggs & Avocado", [["d01", 110], ["v28", 60]]),
  snackMeal("Peanut Butter Rice Cakes", [["g13", 18], ["n05", 25]]),
  snackMeal("Chickpea & Spinach Salad", [["l03", 150], ["v02", 40], ["n12", 8]]),
  snackMeal("Lentil & Mixed Salad Bowl", [["l04", 150], ["v61", 80], ["n12", 8]]),
  snackMeal("Cottage Cheese & Berries", [["d08", 150], ["r50", 80]]),
  snackMeal("Protein Shake with Oats", [["p01", 30], ["g07", 30], ["d04", 250]])
);

// ---- Signature "PT classic" dishes ----
meals.push(
  meal("Chicken, Sweet Potato & Broccoli Meal Prep", [["m01", 180], ["v05", 220], ["v01", 120], ["n12", 5]]),
  meal("Beef Mince Bolognese with Wholemeal Pasta", [["m05", 150], ["g15", 180], ["v09", 50], ["v13", 50]]),
  meal("Salmon, Quinoa & Asparagus", [["f01", 160], ["g05", 150], ["v19", 120]]),
  meal("Steak, Potato & Green Beans", [["m08", 180], ["v06", 220], ["v16", 120]]),
  meal("Prawn Stir-Fry with Brown Rice", [["f07", 180], ["g02", 180], ["v09", 60], ["v13", 60], ["n12", 8]]),
  meal("Turkey Meatballs with Wholemeal Pasta", [["m32", 160], ["g15", 180], ["v02", 60]]),
  meal("Chicken & Egg Salad Bowl", [["m01", 160], ["v61", 100], ["d01", 55]]),
  meal("Pork Loin with Sweet Potato Mash", [["m09", 170], ["v05", 220], ["v16", 100]]),
  meal("Tuna Pasta Bake", [["f02", 190], ["g15", 180], ["v02", 60]]),
  meal("Chickpea & Chicken Grain Bowl", [["m01", 140], ["l03", 120], ["g05", 100], ["v61", 60]]),
  meal("Prawn & Avocado Salad", [["f07", 160], ["v28", 80], ["v61", 100]]),
  meal("Lean Beef & Sweet Potato Bowl", [["m05", 160], ["v05", 200], ["v01", 100]])
);

console.log("Total meals generated:", meals.length);

const withIds = meals.map((m, i) => ({ id: `au_meal_${String(i + 1).padStart(3, "0")}`, ...m }));

const out = `// Auto-generated — 200 common Australian fitness-industry meals, built
// entirely from this app's own Food Library (src/lib/foodDatabase.js) so
// every ingredient's macros trace back to a real, single source of
// truth. Ingredient labels carry a real, current Coles/Woolworths-style
// product name for context; prices/pack sizes are deliberately omitted
// since they go stale quickly and weren't sourced from a live grocery
// API. Regenerate with scripts/genAuFitnessMeals.mjs.
export const FITNESS_MEALS_AU = ${JSON.stringify(withIds, null, 2)};
`;

fs.writeFileSync(new URL("../src/lib/fitnessMealsAU.js", import.meta.url), out);
console.log("Wrote src/lib/fitnessMealsAU.js");
