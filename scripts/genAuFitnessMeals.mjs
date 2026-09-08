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
  n31: "Lotus Biscoff Smooth Spread",
  g51: "Sanitarium Weet-Bix",
  g52: "Coles Wholemeal Burger Buns",
  g53: "Helga's Protein Bread",
  t01: "Streets Paddle Pop Original",
  t02: "Arnott's Tim Tam Original",
  m11: "Coles Middle Bacon Rashers",
  d09: "Coles Tasty Cheese Slices",
  l01: "Coles Black Beans",
  l02: "Coles Red Kidney Beans",
  g12: "Mission Wholemeal Wraps",
  g19: "Coles Bakery Bagels",
  g35: "Coles Lebanese Style Pita Bread",
  f05: "Coles Barramundi Fillets",
  f09: "Coles Smoked Salmon",
  d11: "Coles Danish Feta",
  m27: "Coles Australian Lamb Loin Chops",
  m30: "Primo Chorizo",
  l09: "Coles Hummus Dip",
  l18: "Coles Falafel Bites",
  v58: "Coles Sweet Potato Fries",
  m10: "Coles Pork Mince",
  g43: "San Remo Lasagne Sheets",
  g27: "SunRice Arborio Rice",
};

function ingredientLine(id, grams) {
  const f = food(id);
  const scale = grams / f.per;
  const brand = BRAND_HINTS[id];
  return {
    // baseFoodId + grams let the shopping-list builder (src/lib/shoppingList.js)
    // aggregate this exact ingredient across every meal in a plan, the same
    // way manually-added food-database ingredients already do (see
    // scaleFood() in src/lib/foodDatabase.js) — the display name alone
    // can't be summed since it bakes in a brand + this one meal's amount.
    baseFoodId: id,
    grams,
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

// ---- NEW BATCH: burgers, fakeaway/bowls, wraps & sandwiches, protein
// breakfast trend items, protein treats/desserts, small snacks & treats,
// pasta/rice bakes, salads & poke bowls, shakes & smoothies, and
// signature fitness-industry dishes — a second, more "flexible dieting"
// flavoured library sitting alongside the classic PT combos above.

// ---- Burgers ----
meals.push(
  meal("Lean Beef Mince Burger", [["m05", 150], ["g52", 65], ["v11", 50], ["v22", 20], ["d09", 20]], undefined,
    "1. Shape the beef mince into a patty and season.\n2. Grill or pan-fry until cooked through, topping with the cheese in the last minute to melt.\n3. Toast the burger bun.\n4. Assemble with the lettuce and tomato and serve."),
  meal("Turkey Burger with Melted Cheese", [["m32", 150], ["g52", 65], ["d09", 20], ["v14", 20], ["s01", 15]], undefined,
    "1. Shape the turkey mince into a patty and season.\n2. Pan-fry or grill until cooked through, topping with the cheese to melt.\n3. Toast the bun and add the diced onion and ketchup.\n4. Assemble and serve."),
  meal("Air-Fried Chicken Burger", [["m01", 160], ["d01", 55], ["bk15", 30], ["g52", 65], ["v22", 20], ["s04", 10]], undefined,
    "1. Dip the chicken breast in beaten egg, then coat in breadcrumbs.\n2. Air-fry at 190°C for 12-15 minutes, turning halfway, until golden and cooked through.\n3. Toast the bun.\n4. Assemble with the lettuce and mayonnaise and serve."),
  meal("Crispy Chicken Burger with Slaw", [["m01", 160], ["d01", 55], ["bk15", 30], ["v21", 40], ["s04", 10], ["g52", 65]], undefined,
    "1. Dip the chicken breast in beaten egg, then coat in breadcrumbs, and air-fry or pan-fry until golden and cooked through.\n2. Toss the shredded cabbage with the mayonnaise to make a quick slaw.\n3. Toast the bun and assemble with the slaw."),
  meal("Double Beef Cheeseburger", [["m05", 160], ["d09", 40], ["g52", 65], ["v54", 15], ["s01", 10], ["s05", 5]], undefined,
    "1. Shape the beef mince into two thin patties and season.\n2. Pan-fry or grill until cooked through, topping each with cheese to melt.\n3. Toast the bun and stack both patties with the pickles, ketchup and mustard."),
  meal("BBQ Bacon Cheeseburger", [["m05", 150], ["m11", 30], ["d09", 20], ["s02", 15], ["g52", 65]], undefined,
    "1. Shape the beef mince into a patty and season, then grill or pan-fry until cooked through, topping with cheese to melt.\n2. Grill the bacon until crisp.\n3. Toast the bun and assemble with the bacon and BBQ sauce."),
  meal("Pork & Fennel Burger", [["m10", 150], ["v33", 40], ["g52", 65], ["s12", 10]], undefined,
    "1. Mix the finely chopped fennel through the pork mince and season, then shape into a patty.\n2. Pan-fry or grill until cooked through.\n3. Toast the bun and assemble with the sweet chilli sauce."),
  meal("Lamb Mince Burger with Tzatziki", [["m28", 150], ["g52", 65], ["s21", 30], ["v11", 40]], undefined,
    "1. Shape the lamb mince into a patty and season, then grill or pan-fry until cooked through.\n2. Toast the bun.\n3. Assemble with the tomato and a generous spoon of tzatziki."),
  meal("Salmon Burger", [["f01", 150], ["g52", 65], ["v28", 40], ["v22", 15]], undefined,
    "1. Finely chop or pulse the salmon and shape into a patty.\n2. Pan-fry over medium heat for 3-4 minutes each side until cooked through.\n3. Toast the bun and assemble with sliced avocado and lettuce."),
  meal("Falafel Burger", [["l18", 120], ["g52", 65], ["s21", 25], ["v22", 15]], undefined,
    "1. Warm the falafel through in a pan or oven.\n2. Toast the bun.\n3. Assemble with the lettuce and tzatziki and serve."),
  meal("Plant-Based Burger", [["pb02", 113], ["g52", 65], ["v11", 40], ["s04", 10]], undefined,
    "1. Cook the plant-based patty according to packet instructions (pan-fry or grill until browned).\n2. Toast the bun.\n3. Assemble with the tomato and mayonnaise and serve."),
  meal("Chicken & Halloumi Burger", [["m01", 140], ["d26", 50], ["g52", 65], ["v61", 20]], undefined,
    "1. Season the chicken breast and grill or pan-fry until cooked through.\n2. Pan-fry the halloumi slices until golden on each side.\n3. Toast the bun and assemble with the salad leaves.")
);

// ---- Fakeaway & Rice Bowls ----
meals.push(
  meal("Air-Fried Chicken Burrito Bowl", [["m01", 160], ["g01", 150], ["l01", 100], ["v13", 60], ["v14", 30], ["s22", 30], ["s10", 30]], undefined,
    "1. Season the chicken breast and grill, pan-fry, or air-fry until cooked through, then slice.\n2. Cook the rice according to packet instructions.\n3. Drain and rinse the black beans and warm through.\n4. Assemble the rice, beans, capsicum and onion in a bowl, top with the chicken, guacamole and salsa."),
  meal("Homemade Butter Chicken with Rice", [["m02", 180], ["s25", 20], ["n14", 100], ["g01", 150]], undefined,
    "1. Brown the chicken thigh pieces in a hot pan.\n2. Stir in the curry paste and cook for a minute until fragrant, then add the coconut milk and simmer until the chicken is cooked through and the sauce has thickened.\n3. Meanwhile, cook the rice according to packet instructions.\n4. Serve the curry over the rice."),
  meal("Homemade Chicken Fried Rice", [["m01", 150], ["g01", 200], ["d01", 55], ["v17", 50], ["v47", 10], ["s03", 15]], undefined,
    "1. Dice and cook the chicken breast in a hot pan or wok until cooked through, then push to one side.\n2. Add the beaten egg and scramble, then stir through the cooked rice and peas.\n3. Add the soy sauce and spring onion, toss well and serve."),
  meal("Beef & Broccoli Stir-Fry Fakeaway", [["m08", 160], ["v01", 120], ["g02", 150], ["s19", 15], ["s03", 10]], undefined,
    "1. Slice the sirloin thinly and stir-fry in a hot wok or pan for 2-3 minutes until browned.\n2. Add the broccoli and stir-fry for a further 2-3 minutes until just tender.\n3. Add the oyster sauce and soy sauce and toss to coat.\n4. Cook the brown rice according to packet instructions and serve the beef and broccoli over the rice."),
  meal("Homemade Sweet & Sour Chicken", [["m01", 160], ["v13", 60], ["r08", 80], ["g01", 150], ["s12", 20]], undefined,
    "1. Dice and pan-fry the chicken breast until cooked through.\n2. Add the capsicum and pineapple and stir-fry for a few minutes until the capsicum is just tender.\n3. Stir through the sweet chilli sauce.\n4. Cook the rice according to packet instructions and serve together."),
  meal("Homemade Pad Thai", [["g18", 200], ["m01", 120], ["d01", 55], ["l20", 60], ["s18", 10], ["n04", 15]], undefined,
    "1. Cook the rice noodles according to packet instructions.\n2. Stir-fry the diced chicken in a hot wok until cooked through, push to one side, then scramble in the egg.\n3. Add the noodles, bean sprouts and fish sauce and toss well.\n4. Top with crushed peanuts and serve."),
  meal("Homemade Kebab Bowl", [["m02", 160], ["g35", 60], ["v11", 50], ["v10", 50], ["s21", 30]], undefined,
    "1. Season the chicken thigh and grill or pan-fry until cooked through, then slice.\n2. Warm the pita bread.\n3. Serve the chicken with the tomato, cucumber and a generous spoon of tzatziki."),
  meal("Turkey Taco Bowl", [["m32", 150], ["g01", 150], ["l01", 100], ["v13", 50], ["s10", 30], ["d09", 20]], undefined,
    "1. Brown the turkey mince in a hot pan, breaking it up as it cooks.\n2. Cook the rice according to packet instructions and drain and rinse the black beans.\n3. Assemble the rice, beans and capsicum in a bowl, top with the turkey mince, salsa and cheese."),
  meal("Cajun Chicken & Rice Bowl", [["m01", 160], ["g02", 150], ["v13", 50], ["v14", 30], ["n12", 5]], undefined,
    "1. Season the chicken breast generously with Cajun spice and pan-fry or grill until cooked through, then slice.\n2. Cook the brown rice according to packet instructions.\n3. Sauté the capsicum and onion in the olive oil until softened.\n4. Combine everything in a bowl and serve."),
  meal("Beef Burrito Bowl", [["m05", 150], ["g01", 150], ["l02", 100], ["v13", 50], ["s10", 30], ["d09", 20]], undefined,
    "1. Brown the beef mince in a hot pan, breaking it up as it cooks.\n2. Cook the rice according to packet instructions and drain and rinse the kidney beans.\n3. Assemble the rice, beans and capsicum in a bowl, top with the beef mince, salsa and cheese."),
  meal("Honey Soy Salmon Bowl", [["f01", 160], ["g02", 150], ["s06", 15], ["s03", 10], ["v31", 80]], undefined,
    "1. Pan-fry or bake the salmon, brushing with the honey and soy sauce, until it flakes easily.\n2. Cook the rice according to packet instructions.\n3. Steam the bok choy until just tender.\n4. Serve the salmon over the rice with the bok choy."),
  meal("Chilli Prawn Noodle Bowl", [["f07", 150], ["g46", 180], ["v49", 5], ["s03", 10], ["v47", 10]], undefined,
    "1. Cook the soba noodles according to packet instructions.\n2. Pan-fry or sauté the prawns with the sliced chilli for 2-3 minutes until pink and cooked through.\n3. Toss through the noodles with the soy sauce and spring onion and serve."),
  meal("Homemade Nasi Goreng", [["g01", 200], ["m01", 120], ["d01", 55], ["s03", 15], ["s15", 10]], undefined,
    "1. Dice and stir-fry the chicken breast in a hot wok until cooked through, then push to one side.\n2. Add the beaten egg and scramble.\n3. Stir through the cooked rice, soy sauce and sriracha, tossing well over high heat, and serve."),
  meal("Teriyaki Chicken Rice Bowl", [["m01", 160], ["g02", 150], ["s03", 10], ["s06", 15], ["v18", 50]], undefined,
    "1. Season the chicken breast and pan-fry or grill until cooked through, then slice.\n2. Combine the soy sauce and honey in the pan and simmer briefly to glaze the chicken.\n3. Cook the rice according to packet instructions and serve the chicken and corn over the rice."),
  meal("Mongolian Beef Bowl", [["m08", 160], ["g02", 150], ["v47", 15], ["s03", 15], ["bk10", 10]], undefined,
    "1. Slice the sirloin thinly and stir-fry in a hot wok or pan until browned.\n2. Add the soy sauce and brown sugar and simmer briefly until glazed.\n3. Cook the rice according to packet instructions and serve the beef over the rice, topped with spring onion.")
);

// ---- Wraps & Sandwiches ----
meals.push(
  meal("Chicken Caesar Wrap", [["m01", 140], ["g12", 60], ["v22", 30], ["d23", 10], ["s30", 10]], undefined,
    "1. Season the chicken breast and grill, pan-fry, or bake until cooked through, then slice.\n2. Warm the wrap.\n3. Fill with the chicken, lettuce, parmesan and a drizzle of aioli, then roll up and serve."),
  meal("Tuna & Avocado Wrap", [["f02", 100], ["v28", 60], ["g12", 60], ["v10", 30]], undefined,
    "1. Drain the tuna.\n2. Warm the wrap.\n3. Fill with the tuna, mashed avocado and sliced cucumber, then roll up and serve."),
  meal("Turkey & Cheese Sandwich", [["m04", 80], ["g09", 80], ["d09", 20], ["v22", 15]], undefined,
    "1. Toast the bread if desired.\n2. Layer the turkey breast, cheese and lettuce between the slices and serve."),
  meal("Chicken & Hummus Wrap", [["m01", 140], ["l09", 40], ["g12", 60], ["v02", 30]], undefined,
    "1. Season the chicken breast and grill, pan-fry, or bake until cooked through, then slice.\n2. Warm the wrap and spread with hummus.\n3. Fill with the chicken and spinach, roll up and serve."),
  meal("BLT Sandwich", [["m11", 40], ["v11", 50], ["v22", 20], ["g10", 70], ["s04", 10]], undefined,
    "1. Grill or pan-fry the bacon until crisp.\n2. Toast the bread if desired and spread with mayonnaise.\n3. Layer the bacon, tomato and lettuce between the slices and serve."),
  meal("Egg & Bacon Roll", [["d01", 55], ["m11", 30], ["g52", 65], ["s01", 10]], undefined,
    "1. Grill or pan-fry the bacon until crisp.\n2. Fry or poach the egg to your liking.\n3. Toast the roll and assemble with the bacon, egg and ketchup."),
  meal("Steak Sandwich", [["m08", 150], ["g11", 80], ["v14", 30], ["s02", 10], ["v61", 15]], undefined,
    "1. Season the steak and grill or pan-sear to your liking, then rest for a few minutes and slice.\n2. Caramelise the sliced onion in a pan.\n3. Toast the sourdough and assemble with the steak, onion, salad leaves and BBQ sauce."),
  meal("Ham & Cheese Toastie", [["m13", 60], ["d09", 30], ["g09", 80], ["d13", 5]], undefined,
    "1. Butter the outside of the bread slices.\n2. Layer the ham and cheese between the slices.\n3. Toast in a sandwich press or pan until golden and the cheese has melted."),
  meal("Smashed Avo & Feta Wrap", [["v28", 100], ["d11", 30], ["g12", 60], ["v12", 40]], undefined,
    "1. Mash the avocado and crumble in the feta.\n2. Warm the wrap and spread with the avocado mixture.\n3. Top with the cherry tomatoes, roll up and serve."),
  meal("Chicken Schnitzel Sandwich", [["m01", 160], ["d01", 55], ["bk15", 25], ["g11", 80], ["v61", 20], ["s04", 10]], undefined,
    "1. Dip the chicken breast in beaten egg, then coat in breadcrumbs, and pan-fry until golden and cooked through.\n2. Toast the sourdough.\n3. Assemble with the salad leaves and mayonnaise and serve."),
  meal("Prawn & Avocado Sandwich", [["f07", 120], ["v28", 60], ["g09", 80], ["s04", 10]], undefined,
    "1. Pan-fry or sauté the prawns until pink and cooked through, then cool slightly.\n2. Toast the bread if desired.\n3. Layer the prawns, mashed avocado and mayonnaise between the slices and serve."),
  meal("Vegemite & Cheese Toast", [["g09", 80], ["s09", 8], ["d09", 20]], undefined,
    "1. Toast the bread.\n2. Spread thinly with Vegemite and top with the cheese.\n3. Grill briefly until the cheese melts, then serve.")
);

// ---- Protein Breakfast Trend Items ----
meals.push(
  breakfastMeal("YoPro Biscoff Overnight Weet-Bix", [["g51", 40], ["d07", 170], ["n31", 20], ["d04", 100]],
    "1. Crumble the wheat biscuits into a jar or container and pour over the milk.\n2. Cover and refrigerate overnight to soften.\n3. In the morning, top with the YoPro yoghurt and a drizzle of the biscoff spread, then serve."),
  breakfastMeal("Biscoff Protein Overnight Oats", [["g07", 60], ["p01", 30], ["n31", 15], ["d04", 200]],
    "1. Combine the oats, protein powder, biscoff spread and milk in a jar.\n2. Stir well, cover, and refrigerate overnight.\n3. Stir again before serving, adding a splash more milk if needed."),
  breakfastMeal("YoPro Berry Protein Bowl", [["d07", 170], ["r50", 80], ["g48", 30]],
    "1. Spoon the YoPro yoghurt into a bowl.\n2. Top with the mixed berries and granola and serve."),
  breakfastMeal("Protein French Toast", [["g53", 60], ["d01", 55], ["d04", 50], ["s07", 15]],
    "1. Whisk the egg and milk together in a shallow dish.\n2. Dip the high-protein bread slices in the mixture to coat.\n3. Pan-fry in a lightly greased non-stick pan until golden on each side.\n4. Drizzle with maple syrup and serve."),
  breakfastMeal("Protein Weet-Bix with Banana", [["g51", 40], ["d04", 200], ["r01", 100]],
    "1. Place the wheat biscuits in a bowl and pour over the milk.\n2. Top with sliced banana and serve."),
  breakfastMeal("High-Protein Bread Avo Toast with Egg", [["g53", 60], ["v28", 60], ["d01", 55]],
    "1. Toast the high-protein bread.\n2. Mash the avocado onto the toast.\n3. Fry or poach the egg to your liking and place on top, then serve."),
  breakfastMeal("Protein Pancake Stack", [["p11", 60], ["d01", 55], ["d04", 100], ["r50", 60]],
    "1. Whisk the pancake mix, egg and milk together into a batter.\n2. Cook spoonfuls in a lightly greased non-stick pan over medium heat until bubbles form, then flip and cook the other side.\n3. Stack and top with the mixed berries and serve."),
  breakfastMeal("Protein Waffles with Yoghurt", [["p17", 60], ["d06", 100], ["r50", 60]],
    "1. Prepare the waffle batter according to packet instructions and cook in a waffle iron until golden.\n2. Top with the Greek yoghurt and mixed berries and serve."),
  breakfastMeal("Cottage Cheese Pancakes", [["d08", 150], ["d01", 110], ["g07", 30]],
    "1. Blend or whisk the cottage cheese, eggs and oats together into a batter.\n2. Cook spoonfuls in a lightly greased non-stick pan over medium heat until golden on each side.\n3. Serve warm."),
  breakfastMeal("Protein Cereal with Milk", [["p20", 40], ["d04", 200], ["r01", 100]],
    "1. Pour the protein cereal into a bowl and add the milk.\n2. Top with sliced banana and serve."),
  breakfastMeal("Bircher Muesli with YoPro", [["g23", 50], ["d07", 150], ["r02", 100]],
    "1. Grate the apple and combine with the muesli and YoPro yoghurt in a bowl or jar.\n2. Cover and refrigerate for at least an hour (or overnight) before serving."),
  breakfastMeal("Everything Bagel with Smoked Salmon & Cream Cheese", [["f09", 60], ["g19", 90], ["d12", 30]],
    "1. Slice and toast the bagel.\n2. Spread with the cream cheese.\n3. Top with the smoked salmon and serve."),
  breakfastMeal("Protein Iced Coffee", [["p01", 30], ["b03", 200], ["d04", 100]],
    "1. Brew the coffee and allow to cool slightly, or use chilled coffee.\n2. Add to a shaker or blender with the protein powder and milk.\n3. Shake or blend until smooth and serve over ice."),
  breakfastMeal("Protein Chia Pudding with Biscoff", [["n08", 30], ["d04", 200], ["n31", 15]],
    "1. Whisk the chia seeds into the milk in a jar or container.\n2. Cover and refrigerate for at least 4 hours (or overnight) until thickened, stirring once partway through.\n3. Top with a drizzle of biscoff spread and serve."),
  breakfastMeal("Egg White Bites with Spinach & Feta", [["d02", 200], ["v02", 40], ["d11", 30]],
    "1. Preheat the oven and lightly grease a muffin tray.\n2. Whisk the egg whites and stir through the chopped spinach and crumbled feta.\n3. Pour into the muffin tray and bake until set (about 15-18 minutes at 180°C).\n4. Cool slightly before removing and serve.")
);

// ---- Protein Treats & Desserts ----
meals.push(
  snackMeal("Protein Ice Cream Tub", [["p12", 150]], "1. Scoop the protein ice cream into a bowl and serve."),
  snackMeal("Chocolate Protein Mug Cake", [["p01", 30], ["bk12", 10], ["d01", 55], ["d04", 40]],
    "1. Whisk the protein powder, cocoa powder, egg and milk together in a large mug.\n2. Microwave for 60-90 seconds until risen and set.\n3. Allow to cool slightly before eating."),
  snackMeal("Protein Biscoff Balls", [["p01", 20], ["n31", 30], ["g07", 20]],
    "1. Combine the protein powder, biscoff spread and oats in a bowl until a firm dough forms (add a splash of water if needed).\n2. Roll into small balls.\n3. Refrigerate for at least 30 minutes to firm up before eating."),
  snackMeal("YoPro & Dark Chocolate Bowl", [["d07", 170], ["k01", 15]],
    "1. Spoon the YoPro yoghurt into a bowl.\n2. Grate or chop the dark chocolate over the top and serve."),
  snackMeal("Protein Hot Chocolate", [["p01", 25], ["bk12", 10], ["d04", 250]],
    "1. Whisk the cocoa powder into the milk in a saucepan over low-medium heat until warmed through.\n2. Remove from the heat and whisk in the protein powder until smooth.\n3. Pour into a mug and serve."),
  snackMeal("Protein Cookie", [["p16", 60]], "1. Serve the protein cookie as is."),
  snackMeal("Protein Bar", [["p03", 60]], "1. Serve the protein bar as is."),
  snackMeal("Choc Protein Muesli Bar", [["p13", 40]], "1. Serve the protein muesli bar as is."),
  snackMeal("Vanilla Protein Custard", [["p04", 30], ["d30", 150]],
    "1. Whisk the casein protein powder into the custard until smooth.\n2. Chill briefly if desired and serve."),
  snackMeal("Protein Cheesecake Bite", [["d08", 150], ["p01", 20], ["k01", 10]],
    "1. Blend the cottage cheese and protein powder together until smooth and creamy.\n2. Spoon into a small bowl and top with grated dark chocolate.\n3. Chill for 20-30 minutes before eating.")
);

// ---- Small Snacks & Treats (portion-controlled, not "cheat" foods) ----
meals.push(
  snackMeal("Paddle Pop Ice Cream Stick", [["t01", 52]], "1. Enjoy straight from the freezer."),
  snackMeal("Tim Tam (One Biscuit)", [["t02", 19]], "1. Serve one biscuit as a portion-controlled treat."),
  snackMeal("Two Chocolate Biscuits", [["t02", 38]], "1. Serve two biscuits as a portion-controlled treat."),
  snackMeal("Small Chocolate Square", [["k01", 15]], "1. Break off a small square of dark chocolate and enjoy."),
  snackMeal("Handful of Lollies", [["k16", 20]], "1. Portion out a small handful of lollies and enjoy."),
  snackMeal("Small Bag of Chips", [["k03", 25]], "1. Portion out a small serve of chips and enjoy."),
  snackMeal("Rice Crackers Snack Pack", [["k11", 20]], "1. Portion out the rice crackers and enjoy."),
  snackMeal("Fruit & Nut Trail Mix Snack", [["k13", 30]], "1. Portion out a small serve of trail mix and enjoy."),
  snackMeal("Yoghurt-Coated Nuts Snack", [["k12", 25]], "1. Portion out a small serve of yoghurt-coated nuts and enjoy."),
  snackMeal("Small Scoop of Gelato", [["k14", 80]], "1. Scoop into a bowl and enjoy."),
  snackMeal("One Meringue", [["k29", 20]], "1. Enjoy one meringue as a light, low-fat treat."),
  snackMeal("Air-Popped Popcorn Snack", [["g25", 20]], "1. Air-pop the popcorn (or use a pre-popped pack) and enjoy."),
  snackMeal("Dark Chocolate Coated Almonds", [["k35", 30]], "1. Portion out a small serve and enjoy."),
  snackMeal("Licorice Treat", [["k30", 20]], "1. Portion out a small serve of licorice and enjoy."),
  snackMeal("Date & Nut Bar", [["k18", 45]], "1. Serve the date and nut bar as is.")
);

// ---- Pasta & Rice Bakes ----
meals.push(
  meal("Chicken & Broccoli Pasta Bake", [["m01", 160], ["g15", 180], ["v01", 100], ["d09", 30]], undefined,
    "1. Season the chicken breast and pan-fry until cooked through, then dice.\n2. Cook the wholemeal pasta according to packet instructions, adding the broccoli for the last 2-3 minutes.\n3. Combine the chicken, pasta and broccoli in a baking dish, top with the cheese and grill or bake until melted."),
  meal("Beef Mince Lasagne", [["m05", 150], ["g43", 150], ["d15", 60], ["d09", 30], ["v11", 100]], undefined,
    "1. Brown the beef mince in a hot pan, breaking it up as it cooks, then stir through the diced tomato and simmer for a few minutes.\n2. Layer the lasagne sheets, beef mixture and ricotta in a baking dish, finishing with the cheese on top.\n3. Bake at 180°C for 25-30 minutes until golden and bubbling."),
  meal("Creamy Tuna Pasta Bake", [["f02", 190], ["g15", 180], ["d14", 40], ["d09", 30], ["v02", 40]], undefined,
    "1. Cook the wholemeal pasta according to packet instructions, wilting the spinach through for the last minute.\n2. Drain the tuna and stir through the pasta with the sour cream.\n3. Transfer to a baking dish, top with the cheese, and bake or grill until golden."),
  meal("Chicken & Mushroom Risotto", [["m01", 140], ["g27", 150], ["v15", 80], ["d23", 15]], undefined,
    "1. Season the chicken breast and pan-fry until cooked through, then dice.\n2. Sauté the mushrooms in a pan until softened.\n3. Cook the arborio rice risotto-style, gradually adding stock or water and stirring until creamy and tender.\n4. Stir through the chicken, mushrooms and parmesan and serve."),
  meal("Beef & Vegetable Rice Bake", [["m05", 150], ["g01", 150], ["v13", 50], ["v09", 50], ["d09", 20]], undefined,
    "1. Brown the beef mince in a hot pan, breaking it up as it cooks.\n2. Cook the rice according to packet instructions and dice and sauté the capsicum and zucchini.\n3. Combine everything in a baking dish, top with the cheese, and bake until golden."),
  meal("Turkey Mince & Zucchini Pasta Bake", [["m32", 150], ["g15", 180], ["v09", 80], ["d09", 20]], undefined,
    "1. Brown the turkey mince in a hot pan, breaking it up as it cooks, and dice and add the zucchini partway through.\n2. Cook the wholemeal pasta according to packet instructions.\n3. Combine in a baking dish, top with the cheese, and bake or grill until golden."),
  meal("Mac & Cheese with Chicken", [["m01", 140], ["g42", 180], ["d09", 40], ["d03", 60]], undefined,
    "1. Season the chicken breast and pan-fry until cooked through, then dice.\n2. Cook the macaroni according to packet instructions.\n3. Stir the cheese and milk through the hot macaroni until melted and creamy.\n4. Fold through the chicken and serve."),
  meal("Prawn & Chorizo Paella", [["f07", 150], ["m30", 40], ["g27", 150], ["v13", 50]], undefined,
    "1. Pan-fry the chorizo until it releases its oil, then add the diced capsicum and cook until softened.\n2. Add the rice and stir to coat, then gradually add stock or water, stirring occasionally, until tender.\n3. Add the prawns for the last few minutes of cooking until pink and cooked through, then serve."),
  meal("Salmon & Pea Risotto", [["f01", 150], ["g27", 150], ["v17", 60], ["d23", 15]], undefined,
    "1. Season the salmon and pan-fry or bake until it flakes easily, then flake into chunks.\n2. Cook the arborio rice risotto-style, gradually adding stock or water and stirring until creamy and tender.\n3. Stir through the peas, parmesan and flaked salmon and serve."),
  meal("Beef & Bean Chilli with Rice", [["m05", 150], ["l02", 120], ["g01", 150], ["v13", 50], ["s10", 20]], undefined,
    "1. Brown the beef mince in a hot pan, breaking it up as it cooks.\n2. Add the diced capsicum and drained kidney beans and simmer for 10-15 minutes.\n3. Cook the rice according to packet instructions and serve the chilli over the rice with a spoon of salsa.")
);

// ---- Salads & Poke Bowls ----
meals.push(
  meal("Salmon Poke Bowl", [["f01", 150], ["g01", 150], ["v10", 50], ["v57", 5], ["s03", 10], ["v28", 50]], undefined,
    "1. Cook the rice according to packet instructions and cool slightly.\n2. Cube the salmon (sushi-grade if eating raw, or sear it lightly) and toss with a little soy sauce.\n3. Assemble the rice, salmon, cucumber, avocado and nori in a bowl and serve."),
  meal("Tuna Poke Bowl", [["f03", 150], ["g01", 150], ["v10", 50], ["v18", 40], ["s15", 10]], undefined,
    "1. Cook the rice according to packet instructions and cool slightly.\n2. Sear the tuna steak briefly on each side (or use sushi-grade raw) and slice.\n3. Assemble the rice, tuna, cucumber and corn in a bowl, drizzle with sriracha and serve."),
  meal("Greek Chicken Salad", [["m01", 150], ["d11", 30], ["v52", 20], ["v10", 60], ["v11", 60], ["n12", 8]], undefined,
    "1. Season the chicken breast and grill, pan-fry, or bake until cooked through, then slice.\n2. Toss the cucumber, tomato, olives and feta in a bowl with the olive oil.\n3. Top with the sliced chicken and serve."),
  meal("Chicken Caesar Salad", [["m01", 150], ["v22", 60], ["d23", 15], ["g11", 30], ["s30", 15]], undefined,
    "1. Season the chicken breast and grill, pan-fry, or bake until cooked through, then slice.\n2. Toast or cube the sourdough into croutons.\n3. Toss the lettuce with the parmesan, croutons and aioli, then top with the chicken."),
  meal("Prawn & Mango Salad", [["f07", 150], ["r09", 80], ["v61", 60], ["v13", 40]], undefined,
    "1. Pan-fry or sauté the prawns for 2-3 minutes each side until pink and cooked through.\n2. Toss the salad leaves and capsicum with the diced mango in a bowl.\n3. Top with the prawns and serve."),
  meal("Halloumi & Roast Veg Salad", [["d26", 60], ["v24", 100], ["v61", 60], ["n12", 8]], undefined,
    "1. Roast the pumpkin until tender and lightly caramelised.\n2. Pan-fry the halloumi slices until golden on each side.\n3. Toss the salad leaves with the roasted pumpkin and olive oil, then top with the halloumi."),
  meal("Steak Salad with Balsamic", [["m08", 150], ["v61", 60], ["v12", 60], ["s14", 10]], undefined,
    "1. Season the steak and grill or pan-sear to your liking, then rest for a few minutes and slice.\n2. Toss the salad leaves and cherry tomatoes with the balsamic vinegar.\n3. Top with the sliced steak and serve."),
  meal("Falafel & Hummus Salad Bowl", [["l18", 100], ["l09", 30], ["v61", 60], ["v10", 50]], undefined,
    "1. Warm the falafel through in a pan or oven.\n2. Toss the salad leaves and cucumber in a bowl and spoon over the hummus.\n3. Top with the falafel and serve."),
  meal("Chickpea & Feta Salad", [["l03", 150], ["d11", 30], ["v12", 60], ["v14", 20], ["n12", 8]], undefined,
    "1. Drain and rinse the chickpeas.\n2. Toss with the cherry tomatoes, onion, feta and olive oil in a bowl and serve."),
  meal("Salmon & Quinoa Superfood Salad", [["f01", 140], ["g05", 100], ["v02", 40], ["v28", 50]], undefined,
    "1. Season the salmon and bake, grill, or pan-fry until it flakes easily.\n2. Simmer the quinoa in water until tender and the liquid is absorbed.\n3. Toss the quinoa with the spinach and sliced avocado, then top with the salmon and serve.")
);

// ---- Shakes & Smoothies ----
meals.push(
  snackMeal("Chocolate Peanut Butter Protein Shake", [["p01", 30], ["n05", 20], ["d04", 250]],
    "1. Add the protein powder, peanut butter and milk to a blender.\n2. Blend until smooth and serve."),
  snackMeal("Berry Protein Smoothie", [["p01", 30], ["r50", 100], ["d19", 200]],
    "1. Add the protein powder, mixed berries and almond milk to a blender.\n2. Blend until smooth and serve."),
  snackMeal("Mango Protein Smoothie", [["p01", 30], ["r09", 100], ["d20", 200]],
    "1. Add the protein powder, mango and soy milk to a blender.\n2. Blend until smooth and serve."),
  snackMeal("Green Protein Smoothie", [["p01", 30], ["v02", 40], ["r01", 100], ["d19", 200]],
    "1. Add the protein powder, spinach, banana and almond milk to a blender.\n2. Blend until smooth and serve."),
  snackMeal("Vanilla Protein & Oats Smoothie", [["p01", 30], ["g07", 30], ["r01", 80], ["d04", 200]],
    "1. Add the protein powder, oats, banana and milk to a blender.\n2. Blend until smooth and serve."),
  snackMeal("Iced Coffee Protein Shake", [["p01", 30], ["b03", 150], ["d04", 100]],
    "1. Add the protein powder, cooled coffee and milk to a shaker or blender.\n2. Shake or blend until smooth and serve over ice."),
  snackMeal("Tropical Protein Smoothie", [["p01", 30], ["r08", 100], ["r09", 80], ["d21", 150]],
    "1. Add the protein powder, pineapple, mango and oat milk to a blender.\n2. Blend until smooth and serve."),
  snackMeal("Casein Overnight Shake", [["p04", 30], ["d04", 250]],
    "1. Add the casein protein powder and milk to a shaker.\n2. Shake well and refrigerate, or drink immediately before bed."),
  snackMeal("Plant Protein Berry Smoothie", [["p02", 30], ["r50", 100], ["d20", 200]],
    "1. Add the plant protein powder, mixed berries and soy milk to a blender.\n2. Blend until smooth and serve."),
  snackMeal("Peanut Butter Banana Protein Smoothie Bowl", [["p01", 30], ["r01", 120], ["n05", 15], ["d04", 100], ["g48", 20]],
    "1. Add the protein powder, banana, peanut butter and milk to a blender and blend until thick and smooth.\n2. Pour into a bowl and top with the granola.")
);

// ---- Signature Fitness-Industry Dishes ----
meals.push(
  meal("Chicken Souvlaki Plate", [["m02", 170], ["g35", 60], ["v10", 50], ["s21", 30]], undefined,
    "1. Marinate and grill or pan-fry the chicken thigh until cooked through, then slice.\n2. Warm the pita bread.\n3. Serve the chicken with the cucumber and a generous spoon of tzatziki."),
  meal("Beef & Vegetable Skewers", [["m08", 160], ["v13", 50], ["v14", 40], ["g02", 150]], undefined,
    "1. Cube the sirloin and thread onto skewers with the capsicum and onion.\n2. Grill or pan-fry, turning occasionally, until cooked to your liking.\n3. Cook the brown rice according to packet instructions and serve together."),
  meal("Lamb Chops with Roast Veg", [["m27", 160], ["v24", 120], ["v20", 100]], undefined,
    "1. Season the lamb chops and grill or pan-fry until cooked to your liking.\n2. Roast the pumpkin until tender and lightly caramelised.\n3. Steam the Brussels sprouts until just tender.\n4. Plate together and serve."),
  meal("Fish & Sweet Potato Chips", [["f05", 160], ["v58", 150], ["v61", 40]], undefined,
    "1. Season the barramundi and bake, grill, or pan-fry until it flakes easily.\n2. Bake the sweet potato fries according to packet instructions until golden.\n3. Serve together with the salad leaves."),
  meal("Chicken Parmigiana with Sweet Potato Fries", [["m01", 170], ["d01", 55], ["bk15", 30], ["v11", 60], ["d10", 30], ["v58", 150]], undefined,
    "1. Dip the chicken breast in beaten egg, then coat in breadcrumbs, and pan-fry until golden and cooked through.\n2. Top with the diced tomato and mozzarella and grill until the cheese melts.\n3. Bake the sweet potato fries according to packet instructions and serve together."),
  meal("Honey Mustard Chicken Traybake", [["m02", 170], ["s06", 15], ["s05", 10], ["v05", 150], ["v20", 100]], undefined,
    "1. Toss the chicken thigh with the honey and mustard.\n2. Arrange on a tray with the cubed sweet potato and Brussels sprouts.\n3. Bake at 200°C for 25-30 minutes until the chicken is cooked through and the vegetables are tender."),
  meal("Beef Massaman Curry with Rice", [["m08", 160], ["s25", 20], ["n14", 100], ["g01", 150]], undefined,
    "1. Brown the diced beef in a hot pan.\n2. Stir in the curry paste and cook for a minute until fragrant, then add the coconut milk and simmer until the beef is tender and the sauce has thickened.\n3. Cook the rice according to packet instructions and serve together."),
  meal("Chicken Tikka with Rice", [["m01", 160], ["s25", 15], ["d06", 40], ["g01", 150]], undefined,
    "1. Combine the chicken breast with the curry paste and yoghurt and marinate briefly.\n2. Grill, pan-fry, or bake until cooked through.\n3. Cook the rice according to packet instructions and serve together."),
  meal("Grilled Barramundi with Asparagus", [["f05", 160], ["v19", 100], ["v05", 150]], undefined,
    "1. Season the barramundi and grill or pan-fry until it flakes easily.\n2. Roast or boil the sweet potato until tender.\n3. Steam or pan-fry the asparagus until just tender.\n4. Plate together and serve."),
  meal("Turkey & Sweet Potato Chilli", [["m32", 150], ["l01", 100], ["v05", 100], ["s10", 20]], undefined,
    "1. Brown the turkey mince in a hot pan, breaking it up as it cooks.\n2. Add the diced sweet potato and drained black beans and simmer until the sweet potato is tender.\n3. Serve topped with a spoon of salsa.")
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
