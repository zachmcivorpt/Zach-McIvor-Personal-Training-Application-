// One-off generator: builds 200 common Australian fitness-industry meals
// from real-world Coles/Woolworths-style product names, with macros
// computed from standard per-100g nutrition values (not sourced from a
// live grocery API — pack sizes/prices aren't included since those go
// stale immediately; product NAMES are grounded in real current Coles/
// Woolworths listings). Run with `node scripts/genAuFitnessMeals.mjs`,
// writes src/lib/fitnessMealsAU.js.
import fs from "fs";

// per-100g (or per-100ml for liquids) macros + the real supermarket
// product name each ingredient represents.
const ING = {
  chickenBreast: { label: "Coles RSPCA Approved Chicken Breast Fillets", cals: 165, protein: 31, carbs: 0, fat: 3.6 },
  chickenThigh: { label: "Coles RSPCA Approved Chicken Thigh Fillets Skinless", cals: 209, protein: 26, carbs: 0, fat: 10.9 },
  beefMinceLean: { label: "Woolworths Lean Beef Mince", cals: 172, protein: 26, carbs: 0, fat: 7 },
  beefMinceExtraLean: { label: "Coles Extra Lean Beef Mince", cals: 137, protein: 22, carbs: 0, fat: 5 },
  sirloinSteak: { label: "Coles Australian Beef Sirloin Steak", cals: 183, protein: 29, carbs: 0, fat: 7 },
  porkTenderloin: { label: "Coles Pork Tenderloin", cals: 143, protein: 26, carbs: 0, fat: 3.5 },
  turkeyMince: { label: "Woolworths Turkey Breast Mince", cals: 148, protein: 20, carbs: 0, fat: 7 },
  salmon: { label: "Coles Tasmanian Salmon Portions", cals: 208, protein: 20, carbs: 0, fat: 13 },
  tuna: { label: "John West Tuna Chunks in Springwater (drained)", cals: 100, protein: 24, carbs: 0, fat: 0.5 },
  prawns: { label: "Coles Cooked Prawns", cals: 99, protein: 24, carbs: 0.2, fat: 0.3 },
  eggs: { label: "Woolworths Free Range Eggs", cals: 155, protein: 13, carbs: 1.1, fat: 11 },
  eggWhites: { label: "Woolworths Egg Whites", cals: 52, protein: 11, carbs: 0.7, fat: 0.2 },
  greekYoghurt: { label: "Coles High Protein Greek Style Natural Yoghurt No Added Sugar", cals: 75, protein: 10, carbs: 4, fat: 2 },
  cottageCheese: { label: "Coles Low Fat Creamed Cottage Cheese", cals: 82, protein: 12, carbs: 4, fat: 2 },
  wheyProtein: { label: "Woolworths Macro Whey Protein Isolate Powder", cals: 380, protein: 80, carbs: 5, fat: 3 },
  oats: { label: "Woolworths Australian Rolled Oats", cals: 379, protein: 13, carbs: 62, fat: 7 },
  brownRiceCooked: { label: "SunRice Brown Rice (cooked)", cals: 123, protein: 2.6, carbs: 26, fat: 1 },
  whiteRiceCooked: { label: "SunRice Medium Grain White Rice (cooked)", cals: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  basmatiRiceCooked: { label: "SunRice Basmati Rice (cooked)", cals: 121, protein: 2.7, carbs: 25, fat: 0.4 },
  sweetPotato: { label: "Coles Sweet Potato (roasted)", cals: 90, protein: 2, carbs: 21, fat: 0.1 },
  potato: { label: "Coles White Potato (roasted)", cals: 94, protein: 2.1, carbs: 21, fat: 0.2 },
  quinoaCooked: { label: "Coles Quinoa (cooked)", cals: 120, protein: 4.4, carbs: 21, fat: 1.9 },
  wholemealPastaCooked: { label: "San Remo Wholemeal Pasta (cooked)", cals: 124, protein: 5, carbs: 25, fat: 0.9 },
  wholemealBread: { label: "Tip Top 9 Grain Bread", cals: 250, protein: 10, carbs: 40, fat: 3 },
  riceCakes: { label: "Coles Rice Cakes", cals: 387, protein: 8, carbs: 82, fat: 3 },
  broccoli: { label: "Perfection Fresh Broccoli (steamed)", cals: 34, protein: 2.8, carbs: 7, fat: 0.4 },
  spinach: { label: "Coles Baby Spinach", cals: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
  greenBeans: { label: "Coles Green Beans (steamed)", cals: 35, protein: 1.9, carbs: 7, fat: 0.2 },
  asparagus: { label: "Coles Asparagus (steamed)", cals: 22, protein: 2.4, carbs: 3.9, fat: 0.2 },
  mixedSalad: { label: "Coles Mixed Salad Leaves", cals: 15, protein: 1.4, carbs: 2.9, fat: 0.2 },
  zucchiniCapsicum: { label: "Coles Zucchini & Capsicum Mix (sauteed)", cals: 28, protein: 1.3, carbs: 4.5, fat: 0.8 },
  avocado: { label: "Woolworths Hass Avocado", cals: 160, protein: 2, carbs: 8.5, fat: 15 },
  almonds: { label: "Coles Australian Almonds", cals: 579, protein: 21, carbs: 22, fat: 50 },
  peanutButter: { label: "Bega Peanut Butter Smooth", cals: 600, protein: 25, carbs: 20, fat: 50 },
  banana: { label: "Coles Cavendish Bananas", cals: 89, protein: 1.1, carbs: 23, fat: 0.3 },
  berriesFrozen: { label: "Coles Mixed Berries Frozen", cals: 43, protein: 0.7, carbs: 10, fat: 0.3 },
  chiaSeeds: { label: "Coles Chia Seeds", cals: 486, protein: 17, carbs: 42, fat: 31 },
  skimMilk: { label: "Coles Skim Milk", cals: 35, protein: 3.6, carbs: 5, fat: 0.1 },
  almondMilk: { label: "Woolworths Unsweetened Almond Milk", cals: 13, protein: 0.6, carbs: 0.3, fat: 1.1 },
  oliveOil: { label: "Cobram Estate Extra Virgin Olive Oil", cals: 884, protein: 0, carbs: 0, fat: 100 },
  chickpeas: { label: "Coles Chickpeas (canned, drained)", cals: 164, protein: 8.9, carbs: 27, fat: 2.6 },
  lentilsCooked: { label: "Coles Lentils (cooked)", cals: 116, protein: 9, carbs: 20, fat: 0.4 },
};

function meal(name, items) {
  const totals = { cals: 0, protein: 0, carbs: 0, fat: 0 };
  const ingredients = items.map(([key, grams]) => {
    const i = ING[key];
    const scale = grams / 100;
    totals.cals += i.cals * scale;
    totals.protein += i.protein * scale;
    totals.carbs += i.carbs * scale;
    totals.fat += i.fat * scale;
    return { name: `${i.label} (${grams}g)`, cals: Math.round(i.cals * scale), protein: Math.round(i.protein * scale * 10) / 10, carbs: Math.round(i.carbs * scale * 10) / 10, fat: Math.round(i.fat * scale * 10) / 10 };
  });
  return {
    name,
    ingredients,
    cals: Math.round(totals.cals),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
  };
}

const meals = [];

// ---- Protein + carb + veg combos (the bulk of a PT's meal library) ----
const proteins = [
  ["chickenBreast", "Chicken Breast", 150],
  ["chickenThigh", "Chicken Thigh", 150],
  ["beefMinceLean", "Lean Beef Mince", 150],
  ["beefMinceExtraLean", "Extra Lean Beef Mince", 150],
  ["sirloinSteak", "Sirloin Steak", 150],
  ["porkTenderloin", "Pork Tenderloin", 150],
  ["turkeyMince", "Turkey Mince", 150],
  ["salmon", "Salmon", 150],
  ["tuna", "Tuna", 120],
  ["prawns", "Prawns", 150],
];
const carbs = [
  ["brownRiceCooked", "Brown Rice", 150],
  ["whiteRiceCooked", "White Rice", 150],
  ["basmatiRiceCooked", "Basmati Rice", 150],
  ["sweetPotato", "Sweet Potato", 200],
  ["potato", "Potato", 200],
  ["quinoaCooked", "Quinoa", 150],
  ["wholemealPastaCooked", "Wholemeal Pasta", 150],
];
const veggies = [
  ["broccoli", "Broccoli", 100],
  ["spinach", "Spinach", 60],
  ["greenBeans", "Green Beans", 100],
  ["asparagus", "Asparagus", 100],
  ["mixedSalad", "Side Salad", 60],
  ["zucchiniCapsicum", "Zucchini & Capsicum", 100],
];

let combo = 0;
outer: for (const [pKey, pLabel, pGrams] of proteins) {
  for (const [cKey, cLabel, cGrams] of carbs) {
    for (const [vKey, vLabel, vGrams] of veggies) {
      combo++;
      // Every 2nd combo (not every single one — 10*7*6=420 is too many)
      // keeps this to a manageable, still-varied set of mains.
      if (combo % 2 !== 0) continue;
      meals.push(meal(`${pLabel} & ${cLabel} with ${vLabel}`, [
        [pKey, pGrams],
        [cKey, cGrams],
        [vKey, vGrams],
        ["oliveOil", 5],
      ]));
      if (meals.length >= 164) break outer;
    }
  }
}

// ---- Breakfasts ----
meals.push(
  meal("Protein Oats with Banana", [["oats", 60], ["wheyProtein", 30], ["skimMilk", 200], ["banana", 100]]),
  meal("Protein Oats with Mixed Berries", [["oats", 60], ["wheyProtein", 30], ["almondMilk", 200], ["berriesFrozen", 80]]),
  meal("Overnight Oats with Chia & Peanut Butter", [["oats", 50], ["chiaSeeds", 15], ["peanutButter", 20], ["skimMilk", 180], ["greekYoghurt", 100]]),
  meal("Scrambled Eggs on Wholemeal Toast", [["eggs", 150], ["wholemealBread", 60], ["avocado", 50]]),
  meal("Egg White Omelette with Spinach", [["eggWhites", 200], ["eggs", 55], ["spinach", 40], ["oliveOil", 5]]),
  meal("Greek Yoghurt Bowl with Berries & Almonds", [["greekYoghurt", 200], ["berriesFrozen", 80], ["almonds", 15]]),
  meal("Cottage Cheese with Banana & Oats", [["cottageCheese", 150], ["banana", 100], ["oats", 30]]),
  meal("Protein Pancakes", [["oats", 50], ["eggs", 100], ["wheyProtein", 30], ["banana", 80], ["skimMilk", 60]]),
  meal("Bacon & Egg Wholemeal Wrap", [["eggs", 110], ["wholemealBread", 60]]),
  meal("Smoked Salmon & Avocado on Toast", [["salmon", 80], ["avocado", 60], ["wholemealBread", 60]]),
  meal("Chia Pudding with Almond Milk & Berries", [["chiaSeeds", 30], ["almondMilk", 200], ["berriesFrozen", 60]]),
  meal("Turkey Mince & Egg Breakfast Hash", [["turkeyMince", 100], ["potato", 150], ["eggs", 55]]),
  meal("Muesli with Greek Yoghurt", [["oats", 50], ["greekYoghurt", 150], ["almonds", 10], ["banana", 60]]),
  meal("Peanut Butter Banana Protein Shake", [["wheyProtein", 30], ["peanutButter", 20], ["banana", 100], ["skimMilk", 250]])
);

// ---- Snacks / shakes ----
meals.push(
  meal("Post-Workout Whey Protein Shake", [["wheyProtein", 35], ["skimMilk", 300]]),
  meal("Whey Protein & Banana Shake", [["wheyProtein", 30], ["banana", 100], ["almondMilk", 250]]),
  meal("Tuna & Rice Cakes", [["tuna", 95], ["riceCakes", 27]]),
  meal("Cottage Cheese & Rice Cakes", [["cottageCheese", 150], ["riceCakes", 18]]),
  meal("Greek Yoghurt & Almonds", [["greekYoghurt", 170], ["almonds", 20]]),
  meal("Almonds & Banana", [["almonds", 25], ["banana", 120]]),
  meal("Boiled Eggs & Avocado", [["eggs", 110], ["avocado", 60]]),
  meal("Peanut Butter Rice Cakes", [["riceCakes", 18], ["peanutButter", 25]]),
  meal("Chickpea & Spinach Salad", [["chickpeas", 150], ["spinach", 40], ["oliveOil", 8]]),
  meal("Lentil & Mixed Salad Bowl", [["lentilsCooked", 150], ["mixedSalad", 80], ["oliveOil", 8]]),
  meal("Cottage Cheese & Berries", [["cottageCheese", 150], ["berriesFrozen", 80]]),
  meal("Protein Shake with Oats", [["wheyProtein", 30], ["oats", 30], ["skimMilk", 250]])
);

// ---- A few signature "PT classic" dishes ----
meals.push(
  meal("Chicken, Sweet Potato & Broccoli Meal Prep", [["chickenBreast", 180], ["sweetPotato", 220], ["broccoli", 120], ["oliveOil", 5]]),
  meal("Beef Mince Bolognese with Wholemeal Pasta", [["beefMinceLean", 150], ["wholemealPastaCooked", 180], ["zucchiniCapsicum", 100]]),
  meal("Salmon, Quinoa & Asparagus", [["salmon", 160], ["quinoaCooked", 150], ["asparagus", 120]]),
  meal("Steak, Potato & Green Beans", [["sirloinSteak", 180], ["potato", 220], ["greenBeans", 120]]),
  meal("Prawn Stir-Fry with Brown Rice", [["prawns", 180], ["brownRiceCooked", 180], ["zucchiniCapsicum", 120], ["oliveOil", 8]]),
  meal("Turkey Meatballs with Wholemeal Pasta", [["turkeyMince", 160], ["wholemealPastaCooked", 180], ["spinach", 60]]),
  meal("Chicken Caesar-Style Salad (No Dressing)", [["chickenBreast", 160], ["mixedSalad", 100], ["eggs", 55]]),
  meal("Pork Tenderloin with Sweet Potato Mash", [["porkTenderloin", 170], ["sweetPotato", 220], ["greenBeans", 100]]),
  meal("Tuna Pasta Bake", [["tuna", 190], ["wholemealPastaCooked", 180], ["spinach", 60]]),
  meal("Chickpea & Chicken Grain Bowl", [["chickenBreast", 140], ["chickpeas", 120], ["quinoaCooked", 100], ["mixedSalad", 60]])
);

console.log("Total meals generated:", meals.length);

const withIds = meals.map((m, i) => ({ id: `au_meal_${String(i + 1).padStart(3, "0")}`, ...m }));

const out = `// Auto-generated — 200 common Australian fitness-industry meals, built
// from real Coles/Woolworths product names (as of the research date) with
// macros computed from standard nutrition values. Prices/pack sizes are
// deliberately omitted since they go stale quickly and weren't sourced
// from a live grocery API. Regenerate with scripts/genAuFitnessMeals.mjs.
export const FITNESS_MEALS_AU = ${JSON.stringify(withIds, null, 2)};
`;

fs.writeFileSync(new URL("../src/lib/fitnessMealsAU.js", import.meta.url), out);
console.log("Wrote src/lib/fitnessMealsAU.js");
