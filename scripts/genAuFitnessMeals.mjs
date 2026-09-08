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
// `instructions` is a short numbered how-to-prepare string shown to the
// client when they tap the meal in their plan.
function meal(name, items, mealTypes = ["Lunch", "Dinner"], instructions = "") {
  const ingredients = items.map(([id, grams]) => ingredientLine(id, grams));
  const totals = ingredients.reduce(
    (a, i) => ({ cals: a.cals + i.cals, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }),
    { cals: 0, protein: 0, carbs: 0, fat: 0 }
  );
  return {
    name,
    ingredients,
    mealTypes,
    instructions,
    cals: Math.round(totals.cals),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
  };
}
function breakfastMeal(name, items, instructions) {
  return meal(name, items, ["Breakfast"], instructions);
}
function snackMeal(name, items, instructions) {
  return meal(name, items, ["Snacks"], instructions);
}

// Per-ingredient cooking notes, composed into full step-by-step
// instructions for the 157 combo meals + 5 stir-fries below — these are
// genuinely accurate general cooking methods for each real ingredient,
// not a fabricated recipe for that specific meal.
const PROTEIN_COOK = {
  m01: "Season the chicken breast and grill, pan-fry, or bake until cooked through (about 6-8 minutes per side depending on thickness)",
  m02: "Season the chicken thigh and grill, pan-fry, or bake until cooked through (about 6-8 minutes per side)",
  m05: "Brown the beef mince in a hot pan over medium-high heat, breaking it up as it cooks, until no longer pink",
  m08: "Season the sirloin steak and grill or pan-sear for 3-4 minutes per side for medium, then rest for 5 minutes before slicing",
  m09: "Season the pork loin and grill, pan-fry, or bake until cooked through and no longer pink in the centre",
  m32: "Brown the turkey mince in a hot pan over medium-high heat, breaking it up as it cooks, until no longer pink",
  f01: "Season the salmon and bake, grill, or pan-fry skin-side down until it flakes easily with a fork (about 4-5 minutes per side)",
  f02: "Drain the tuna — no cooking needed",
  f07: "Pan-fry or sauté the prawns in a hot pan for 2-3 minutes each side until pink and cooked through",
};
const CARB_COOK = {
  g02: "cook the brown rice according to packet instructions",
  g01: "cook the white rice according to packet instructions",
  g03: "cook the basmati rice according to packet instructions",
  v05: "boil, steam, or roast the sweet potato until tender",
  v06: "boil, steam, or roast the potato until tender",
  g05: "simmer the quinoa in water until tender and the liquid is absorbed (about 15 minutes)",
  g15: "cook the wholemeal pasta according to packet instructions",
};
const VEG_COOK = {
  v01: "steam or blanch the broccoli until just tender",
  v02: "wilt the spinach briefly in a pan, or serve it raw",
  v16: "steam or blanch the green beans until just tender",
  v19: "steam or pan-fry the asparagus until just tender",
  v61: "toss the salad leaves through just before serving",
};

function comboInstructions(pKey, cKey, vKey) {
  const veg = VEG_COOK[vKey];
  return [
    `1. ${PROTEIN_COOK[pKey]}.`,
    `2. Meanwhile, ${CARB_COOK[cKey]}.`,
    `3. ${veg.charAt(0).toUpperCase()}${veg.slice(1)}.`,
    `4. Plate everything together and serve.`,
  ].join("\n");
}

function stirFryInstructions(pKey) {
  return [
    `1. ${PROTEIN_COOK[pKey]}.`,
    `2. Meanwhile, cook the brown rice according to packet instructions.`,
    `3. Slice the zucchini and capsicum and stir-fry in a hot wok or pan with a little oil for 3-4 minutes until just tender.`,
    `4. Combine everything in the pan, toss to coat, and serve over the rice.`,
  ].join("\n");
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
      ], undefined, comboInstructions(pKey, cKey, vKey)));
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
  ], undefined, stirFryInstructions(pKey)));
}

// ---- Breakfasts ----
meals.push(
  breakfastMeal(
    "Protein Oats with Banana",
    [["g07", 60], ["p01", 30], ["d04", 200], ["r01", 100]],
    "1. Combine the oats, protein powder and milk in a bowl or saucepan.\n2. Microwave or simmer, stirring occasionally, until thickened (about 2-3 minutes).\n3. Top with sliced banana and serve."
  ),
  breakfastMeal(
    "Protein Oats with Mixed Berries",
    [["g07", 60], ["p01", 30], ["d19", 200], ["r50", 80]],
    "1. Combine the oats, protein powder and almond milk in a bowl or saucepan.\n2. Microwave or simmer, stirring occasionally, until thickened (about 2-3 minutes).\n3. Top with the mixed berries and serve."
  ),
  breakfastMeal(
    "Overnight Oats with Chia & Peanut Butter",
    [["g07", 50], ["n08", 15], ["n05", 20], ["d04", 180], ["d06", 100]],
    "1. Combine the oats, chia seeds, peanut butter and milk in a jar or container.\n2. Stir well, cover, and refrigerate overnight.\n3. Top with the Greek yoghurt before serving."
  ),
  breakfastMeal(
    "Scrambled Eggs on Wholemeal Toast",
    [["d01", 150], ["g09", 60], ["v28", 50]],
    "1. Whisk the eggs and scramble in a non-stick pan over medium heat until just set.\n2. Toast the bread.\n3. Serve the scrambled eggs on the toast with sliced avocado."
  ),
  breakfastMeal(
    "Egg White Omelette with Spinach",
    [["d02", 200], ["d01", 55], ["v02", 40], ["n12", 5]],
    "1. Whisk the egg whites and whole egg together.\n2. Heat the olive oil in a non-stick pan and wilt the spinach briefly.\n3. Pour in the egg mixture and cook until set, folding in half to serve."
  ),
  breakfastMeal(
    "Greek Yoghurt Bowl with Berries & Almonds",
    [["d06", 200], ["r50", 80], ["n01", 15]],
    "1. Spoon the Greek yoghurt into a bowl.\n2. Top with the mixed berries and almonds and serve."
  ),
  breakfastMeal(
    "Cottage Cheese with Banana & Oats",
    [["d08", 150], ["r01", 100], ["g07", 30]],
    "1. Combine the cottage cheese and oats in a bowl.\n2. Top with sliced banana and serve."
  ),
  breakfastMeal(
    "Protein Pancakes",
    [["g07", 50], ["d01", 100], ["p01", 30], ["r01", 80], ["d04", 60]],
    "1. Whisk the eggs, protein powder, oats and milk together into a batter (blend for a smoother texture if preferred).\n2. Cook spoonfuls in a lightly greased non-stick pan over medium heat until bubbles form, then flip and cook the other side.\n3. Top with sliced banana and serve."
  ),
  breakfastMeal(
    "Egg Wholemeal Wrap",
    [["d01", 110], ["g09", 60]],
    "1. Whisk and scramble the eggs in a non-stick pan until just set.\n2. Warm the wholemeal wrap, fill with the scrambled eggs, roll up and serve."
  ),
  breakfastMeal(
    "Smoked Salmon & Avocado on Toast",
    [["f01", 80], ["v28", 60], ["g09", 60]],
    "1. Toast the bread.\n2. Mash or slice the avocado onto the toast.\n3. Top with the smoked salmon and serve."
  ),
  breakfastMeal(
    "Chia Pudding with Almond Milk & Berries",
    [["n08", 30], ["d19", 200], ["r50", 60]],
    "1. Whisk the chia seeds into the almond milk in a jar or container.\n2. Cover and refrigerate for at least 4 hours (or overnight) until thickened, stirring once partway through.\n3. Top with the mixed berries and serve."
  ),
  breakfastMeal(
    "Turkey Mince & Egg Breakfast Hash",
    [["m32", 100], ["v06", 150], ["d01", 55]],
    "1. Brown the turkey mince in a hot pan, breaking it up as it cooks.\n2. Add the diced potato and cook, stirring occasionally, until tender and golden.\n3. Push the hash to one side, crack in the egg and cook to your liking, then serve together."
  ),
  breakfastMeal(
    "Muesli with Greek Yoghurt",
    [["g07", 50], ["d06", 150], ["n01", 10], ["r01", 60]],
    "1. Combine the oats-based muesli with the Greek yoghurt in a bowl.\n2. Top with sliced banana and almonds and serve."
  ),
  breakfastMeal(
    "Peanut Butter Banana Protein Shake",
    [["p01", 30], ["n05", 20], ["r01", 100], ["d04", 250]],
    "1. Add the protein powder, peanut butter, banana and milk to a blender.\n2. Blend until smooth and serve."
  )
);

// ---- Snacks / shakes ----
meals.push(
  snackMeal(
    "Post-Workout Whey Protein Shake",
    [["p01", 35], ["d04", 300]],
    "1. Add the protein powder and milk to a shaker or blender.\n2. Shake or blend until smooth and serve immediately."
  ),
  snackMeal(
    "Whey Protein & Banana Shake",
    [["p01", 30], ["r01", 100], ["d19", 250]],
    "1. Add the protein powder, banana and almond milk to a blender.\n2. Blend until smooth and serve."
  ),
  snackMeal("Tuna & Rice Cakes", [["f02", 95], ["g13", 27]], "1. Drain the tuna.\n2. Serve on top of or alongside the rice cakes."),
  snackMeal("Cottage Cheese & Rice Cakes", [["d08", 150], ["g13", 18]], "1. Spoon the cottage cheese onto the rice cakes and serve."),
  snackMeal("Greek Yoghurt & Almonds", [["d06", 170], ["n01", 20]], "1. Spoon the Greek yoghurt into a bowl and top with the almonds."),
  snackMeal("Almonds & Banana", [["n01", 25], ["r01", 120]], "1. Serve the almonds alongside the banana."),
  snackMeal(
    "Boiled Eggs & Avocado",
    [["d01", 110], ["v28", 60]],
    "1. Boil the eggs to your liking (about 8-9 minutes for firm yolks), then peel.\n2. Serve with sliced avocado."
  ),
  snackMeal("Peanut Butter Rice Cakes", [["g13", 18], ["n05", 25]], "1. Spread the peanut butter over the rice cakes and serve."),
  snackMeal(
    "Chickpea & Spinach Salad",
    [["l03", 150], ["v02", 40], ["n12", 8]],
    "1. Drain and rinse the chickpeas.\n2. Toss with the spinach and olive oil in a bowl and serve."
  ),
  snackMeal(
    "Lentil & Mixed Salad Bowl",
    [["l04", 150], ["v61", 80], ["n12", 8]],
    "1. Drain and rinse the lentils.\n2. Toss with the salad leaves and olive oil in a bowl and serve."
  ),
  snackMeal("Cottage Cheese & Berries", [["d08", 150], ["r50", 80]], "1. Spoon the cottage cheese into a bowl and top with the mixed berries."),
  snackMeal(
    "Protein Shake with Oats",
    [["p01", 30], ["g07", 30], ["d04", 250]],
    "1. Add the protein powder, oats and milk to a blender.\n2. Blend until smooth and serve."
  )
);

// ---- Signature "PT classic" dishes ----
meals.push(
  meal(
    "Chicken, Sweet Potato & Broccoli Meal Prep",
    [["m01", 180], ["v05", 220], ["v01", 120], ["n12", 5]],
    undefined,
    "1. Season the chicken breast and grill, pan-fry, or bake until cooked through.\n2. Roast or steam the sweet potato until tender.\n3. Steam the broccoli until just tender.\n4. Divide between meal prep containers and refrigerate — reheat before eating."
  ),
  meal(
    "Beef Mince Bolognese with Wholemeal Pasta",
    [["m05", 150], ["g15", 180], ["v09", 50], ["v13", 50]],
    undefined,
    "1. Brown the beef mince in a hot pan, breaking it up as it cooks.\n2. Add the diced zucchini and capsicum and cook until softened, then simmer together for a few minutes.\n3. Meanwhile, cook the wholemeal pasta according to packet instructions.\n4. Combine the pasta and bolognese and serve."
  ),
  meal(
    "Salmon, Quinoa & Asparagus",
    [["f01", 160], ["g05", 150], ["v19", 120]],
    undefined,
    "1. Season the salmon and bake, grill, or pan-fry until it flakes easily.\n2. Simmer the quinoa in water until tender and the liquid is absorbed.\n3. Steam or pan-fry the asparagus until just tender.\n4. Plate together and serve."
  ),
  meal(
    "Steak, Potato & Green Beans",
    [["m08", 180], ["v06", 220], ["v16", 120]],
    undefined,
    "1. Season the steak and grill or pan-sear to your liking, then rest for 5 minutes before slicing.\n2. Boil, steam, or roast the potato until tender.\n3. Steam the green beans until just tender.\n4. Plate together and serve."
  ),
  meal(
    "Prawn Stir-Fry with Brown Rice",
    [["f07", 180], ["g02", 180], ["v09", 60], ["v13", 60], ["n12", 8]],
    undefined,
    "1. Cook the brown rice according to packet instructions.\n2. Pan-fry or sauté the prawns for 2-3 minutes each side until pink and cooked through.\n3. Add the sliced zucchini and capsicum and stir-fry for a few minutes until just tender.\n4. Serve over the rice."
  ),
  meal(
    "Turkey Meatballs with Wholemeal Pasta",
    [["m32", 160], ["g15", 180], ["v02", 60]],
    undefined,
    "1. Shape the turkey mince into meatballs and pan-fry or bake until cooked through.\n2. Meanwhile, cook the wholemeal pasta according to packet instructions.\n3. Wilt the spinach through the hot pasta.\n4. Serve the meatballs over the pasta."
  ),
  meal(
    "Chicken & Egg Salad Bowl",
    [["m01", 160], ["v61", 100], ["d01", 55]],
    undefined,
    "1. Season the chicken breast and grill, pan-fry, or bake until cooked through, then slice.\n2. Boil the egg to your liking, then peel and slice.\n3. Toss the salad leaves in a bowl and top with the chicken and egg."
  ),
  meal(
    "Pork Loin with Sweet Potato Mash",
    [["m09", 170], ["v05", 220], ["v16", 100]],
    undefined,
    "1. Season the pork loin and grill, pan-fry, or bake until cooked through.\n2. Boil the sweet potato until tender, then mash.\n3. Steam the green beans until just tender.\n4. Plate together and serve."
  ),
  meal(
    "Tuna Pasta Bake",
    [["f02", 190], ["g15", 180], ["v02", 60]],
    undefined,
    "1. Cook the wholemeal pasta according to packet instructions.\n2. Drain the tuna and wilt the spinach through the hot pasta.\n3. Combine everything in a baking dish and bake until heated through (or serve straight from the pan)."
  ),
  meal(
    "Chickpea & Chicken Grain Bowl",
    [["m01", 140], ["l03", 120], ["g05", 100], ["v61", 60]],
    undefined,
    "1. Season the chicken breast and grill, pan-fry, or bake until cooked through, then slice.\n2. Drain and rinse the chickpeas. Simmer the quinoa in water until tender.\n3. Combine the chicken, chickpeas, quinoa and salad leaves in a bowl and serve."
  ),
  meal(
    "Prawn & Avocado Salad",
    [["f07", 160], ["v28", 80], ["v61", 100]],
    undefined,
    "1. Pan-fry or sauté the prawns for 2-3 minutes each side until pink and cooked through.\n2. Toss the salad leaves with the sliced avocado in a bowl.\n3. Top with the prawns and serve."
  ),
  meal(
    "Lean Beef & Sweet Potato Bowl",
    [["m05", 160], ["v05", 200], ["v01", 100]],
    undefined,
    "1. Brown the beef mince in a hot pan, breaking it up as it cooks.\n2. Roast or boil the sweet potato until tender.\n3. Steam the broccoli until just tender.\n4. Combine in a bowl and serve."
  )
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
