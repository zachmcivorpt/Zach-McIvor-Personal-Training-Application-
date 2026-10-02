// Local, instant replacement for the "AI Nutrition Help" backend — no
// external API, no API key, no network call, so it never depends on
// anything outside this app being configured. Values below are
// well-known, publicly published approximate nutrition figures for each
// chain's standard menu (actual numbers vary slightly by region/recipe
// updates, which is exactly why every suggestion is still labelled with
// "~" in the UI rather than presented as exact).
//
// Matching is entirely deterministic: detect a restaurant name (or a
// calorie/protein-style request) in the client's free-text message,
// filter out anything that conflicts with their stored allergies/
// dietary preferences, then rank what's left by how well it fits
// whatever calories/macros they actually have remaining today — the
// same job the old LLM-backed function did, just without the LLM.
import { FITNESS_MEALS_AU } from "./fitnessMealsAU";

// tags: dairy | gluten | egg | vegetarian — used for simple allergy/
// preference filtering against the client's stored profile text.
const RESTAURANT_MENUS = {
  "mcdonald's": [
    { name: "Hamburger", calories: 250, protein: 12, carbs: 31, fat: 9, tags: ["gluten"] },
    { name: "Cheeseburger", calories: 300, protein: 15, carbs: 33, fat: 12, tags: ["gluten", "dairy"] },
    { name: "McChicken", calories: 400, protein: 14, carbs: 39, fat: 21, tags: ["gluten"] },
    // Big Mac figure is the real published McDonald's Australia value
    // (fatsecret.com.au) — the meal combos below are built from this
    // same number so a tapped breakdown always sums to the real total.
    { name: "Big Mac", calories: 492, protein: 25, carbs: 35, fat: 27, tags: ["gluten", "dairy"] },
    { name: "Quarter Pounder with Cheese", calories: 520, protein: 30, carbs: 41, fat: 26, tags: ["gluten", "dairy"] },
    { name: "6pc Chicken McNuggets", calories: 250, protein: 14, carbs: 15, fat: 15, tags: ["gluten"] },
    { name: "Grilled Chicken Salad (no dressing)", calories: 220, protein: 27, carbs: 10, fat: 8, tags: [] },
    { name: "Side Salad", calories: 20, protein: 1, carbs: 4, fat: 0, tags: ["vegetarian"] },
    { name: "Small Fries", calories: 230, protein: 3, carbs: 30, fat: 11, tags: ["vegetarian"] },
    { name: "Egg & Cheese McMuffin", calories: 300, protein: 17, carbs: 30, fat: 12, tags: ["gluten", "dairy", "egg"] },
    { name: "Oatmeal", calories: 150, protein: 4, carbs: 29, fat: 2, tags: ["gluten", "vegetarian"] },
    // Meals — burger + fries + drink, labelled by actual McDonald's
    // Australia meal size (Small/Medium/Large), matching published
    // CalorieKing AU totals for "Meal, Big Mac, [size] Fries, [size]
    // Coke" so these hold up against the real menu, not just an
    // in-house estimate. `contents` sums exactly to the listed total.
    {
      name: "Small Big Mac Meal (regular Coke)",
      calories: 850,
      protein: 28,
      carbs: 89,
      fat: 41,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Big Mac", calories: 492, protein: 25, carbs: 35, fat: 27 },
        { name: "Small Fries", calories: 220, protein: 2, carbs: 29, fat: 11 },
        { name: "Coca-Cola (small)", calories: 138, protein: 1, carbs: 25, fat: 3 },
      ],
    },
    {
      name: "Medium Big Mac Meal (regular Coke)",
      calories: 1007,
      protein: 29,
      carbs: 112,
      fat: 47,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Big Mac", calories: 492, protein: 25, carbs: 35, fat: 27 },
        { name: "Medium Fries", calories: 340, protein: 4, carbs: 44, fat: 20 },
        { name: "Coca-Cola (medium)", calories: 175, protein: 0, carbs: 33, fat: 0 },
      ],
    },
    {
      name: "Medium Big Mac Meal (Coke No Sugar)",
      calories: 834,
      protein: 29,
      carbs: 79,
      fat: 47,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Big Mac", calories: 492, protein: 25, carbs: 35, fat: 27 },
        { name: "Medium Fries", calories: 340, protein: 4, carbs: 44, fat: 20 },
        { name: "Coke No Sugar (medium)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
    {
      name: "Large Big Mac Meal (regular Coke)",
      calories: 1170,
      protein: 30,
      carbs: 141,
      fat: 51,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Big Mac", calories: 492, protein: 25, carbs: 35, fat: 27 },
        { name: "Large Fries", calories: 420, protein: 5, carbs: 55, fat: 24 },
        { name: "Coca-Cola (large)", calories: 258, protein: 0, carbs: 51, fat: 0 },
      ],
    },
    {
      name: "Small Cheeseburger Meal (Coke No Sugar)",
      calories: 532,
      protein: 18,
      carbs: 63,
      fat: 23,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Cheeseburger", calories: 300, protein: 15, carbs: 33, fat: 12 },
        { name: "Small Fries", calories: 230, protein: 3, carbs: 30, fat: 11 },
        { name: "Coke No Sugar (small)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
    {
      name: "Small McChicken Meal (Coke No Sugar)",
      calories: 632,
      protein: 17,
      carbs: 69,
      fat: 32,
      tags: ["gluten", "combo"],
      contents: [
        { name: "McChicken", calories: 400, protein: 14, carbs: 39, fat: 21 },
        { name: "Small Fries", calories: 230, protein: 3, carbs: 30, fat: 11 },
        { name: "Coke No Sugar (small)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
    {
      name: "Small Quarter Pounder Meal (Coke No Sugar)",
      calories: 752,
      protein: 33,
      carbs: 71,
      fat: 37,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Quarter Pounder with Cheese", calories: 520, protein: 30, carbs: 41, fat: 26 },
        { name: "Small Fries", calories: 230, protein: 3, carbs: 30, fat: 11 },
        { name: "Coke No Sugar (small)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
  ],
  kfc: [
    { name: "Original Recipe Chicken Breast", calories: 390, protein: 39, carbs: 11, fat: 21, tags: ["gluten"] },
    { name: "Original Recipe Chicken Drumstick", calories: 150, protein: 14, carbs: 4, fat: 9, tags: ["gluten"] },
    { name: "Original Recipe Chicken Thigh", calories: 280, protein: 19, carbs: 9, fat: 19, tags: ["gluten"] },
    // Zinger Burger bumped to match published figures (fatsecret/fitia AU)
    // — the old 450 figure undercounted it relative to real menu data,
    // which is exactly why the "Zinger Box Meal" combo below didn't line
    // up against the real KFC Australia "Zinger Burger Box" total.
    { name: "Zinger Burger", calories: 480, protein: 24, carbs: 43, fat: 24, tags: ["gluten"] },
    { name: "Popcorn Chicken (regular)", calories: 400, protein: 20, carbs: 23, fat: 25, tags: ["gluten"] },
    { name: "Grilled Chicken Fillet (no bun)", calories: 200, protein: 35, carbs: 2, fat: 6, tags: [] },
    { name: "Corn Cob", calories: 150, protein: 4, carbs: 32, fat: 2, tags: ["vegetarian"] },
    { name: "Coleslaw (small)", calories: 150, protein: 1, carbs: 14, fat: 10, tags: ["dairy", "vegetarian"] },
    { name: "Mashed Potato & Gravy", calories: 120, protein: 2, carbs: 17, fat: 5, tags: ["gluten"] },
    {
      name: "Regular Zinger Box Meal (Pepsi Max)",
      calories: 872,
      protein: 29,
      carbs: 89,
      fat: 44,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Zinger Burger", calories: 480, protein: 24, carbs: 43, fat: 24 },
        { name: "Regular Chips", calories: 390, protein: 5, carbs: 46, fat: 20 },
        { name: "Pepsi Max (can)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
    {
      name: "Regular Zinger Box Meal (regular Pepsi)",
      calories: 1030,
      protein: 29,
      carbs: 130,
      fat: 44,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Zinger Burger", calories: 480, protein: 24, carbs: 43, fat: 24 },
        { name: "Regular Chips", calories: 390, protein: 5, carbs: 46, fat: 20 },
        { name: "Pepsi (can)", calories: 160, protein: 0, carbs: 41, fat: 0 },
      ],
    },
  ],
  subway: [
    { name: "Turkey Breast 6-inch", calories: 280, protein: 18, carbs: 46, fat: 4, tags: ["gluten"] },
    { name: "Chicken Teriyaki 6-inch", calories: 370, protein: 26, carbs: 55, fat: 5, tags: ["gluten"] },
    { name: "Veggie Delite 6-inch", calories: 230, protein: 9, carbs: 44, fat: 3, tags: ["gluten", "vegetarian"] },
    { name: "Tuna 6-inch", calories: 450, protein: 19, carbs: 44, fat: 22, tags: ["gluten", "dairy"] },
    { name: "Steak & Cheese 6-inch", calories: 380, protein: 24, carbs: 45, fat: 12, tags: ["gluten", "dairy"] },
    { name: "Chicken & Bacon Ranch 6-inch", calories: 480, protein: 29, carbs: 44, fat: 21, tags: ["gluten", "dairy"] },
    { name: "Chicken Teriyaki Salad (no bread)", calories: 180, protein: 24, carbs: 15, fat: 3, tags: [] },
    {
      name: "Turkey Breast Sub Meal (chips, Coke No Sugar)",
      calories: 512,
      protein: 21,
      carbs: 76,
      fat: 15,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Turkey Breast 6-inch", calories: 280, protein: 18, carbs: 46, fat: 4 },
        { name: "Baked Chips", calories: 230, protein: 3, carbs: 30, fat: 11 },
        { name: "Coke No Sugar (small)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
  ],
  "burger king": [
    { name: "Whopper", calories: 660, protein: 28, carbs: 49, fat: 40, tags: ["gluten"] },
    { name: "Hamburger", calories: 240, protein: 12, carbs: 29, fat: 9, tags: ["gluten"] },
    { name: "Crispy Chicken Burger", calories: 500, protein: 22, carbs: 50, fat: 24, tags: ["gluten"] },
    { name: "Grilled Chicken Burger", calories: 380, protein: 28, carbs: 38, fat: 13, tags: ["gluten"] },
    { name: "4pc Chicken Nuggets", calories: 170, protein: 9, carbs: 11, fat: 10, tags: ["gluten"] },
    { name: "Small Fries", calories: 230, protein: 3, carbs: 29, fat: 11, tags: ["vegetarian"] },
    { name: "Garden Salad", calories: 60, protein: 4, carbs: 8, fat: 2, tags: ["vegetarian"] },
    // "Medium chips" calorie figure matches Hungry Jack's published value
    // (fatsecret.com.au) — close to the real "Whopper Value Meal Medium"
    // total (~1074 kcal) once a regular Coke is added.
    {
      name: "Medium Whopper Meal (regular Coke)",
      calories: 1138,
      protein: 32,
      carbs: 132,
      fat: 55,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Whopper", calories: 660, protein: 28, carbs: 49, fat: 40 },
        { name: "Medium Chips", calories: 308, protein: 4, carbs: 40, fat: 15 },
        { name: "Coca-Cola (medium)", calories: 170, protein: 0, carbs: 43, fat: 0 },
      ],
    },
    {
      name: "Medium Whopper Meal (Coke No Sugar)",
      calories: 970,
      protein: 32,
      carbs: 89,
      fat: 55,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Whopper", calories: 660, protein: 28, carbs: 49, fat: 40 },
        { name: "Medium Chips", calories: 308, protein: 4, carbs: 40, fat: 15 },
        { name: "Coke No Sugar (medium)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
    {
      name: "Small Grilled Chicken Meal (Coke No Sugar)",
      calories: 612,
      protein: 31,
      carbs: 67,
      fat: 24,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Grilled Chicken Burger", calories: 380, protein: 28, carbs: 38, fat: 13 },
        { name: "Small Fries", calories: 230, protein: 3, carbs: 29, fat: 11 },
        { name: "Coke No Sugar (small)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
  ],
  "domino's": [
    { name: "Margherita Pizza (2 slices)", calories: 380, protein: 16, carbs: 48, fat: 14, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Pepperoni Pizza (2 slices)", calories: 440, protein: 18, carbs: 46, fat: 20, tags: ["gluten", "dairy"] },
    { name: "BBQ Chicken Pizza (2 slices)", calories: 420, protein: 20, carbs: 50, fat: 15, tags: ["gluten", "dairy"] },
    { name: "Vegetarian Supreme Pizza (2 slices)", calories: 360, protein: 14, carbs: 46, fat: 13, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Garlic Bread (2 pieces)", calories: 200, protein: 5, carbs: 26, fat: 8, tags: ["gluten", "dairy", "vegetarian"] },
  ],
  "nando's": [
    { name: "1/4 Chicken Breast (no skin)", calories: 220, protein: 40, carbs: 0, fat: 6, tags: [] },
    { name: "1/4 Chicken Thigh & Leg", calories: 280, protein: 28, carbs: 0, fat: 18, tags: [] },
    { name: "Chicken Wrap", calories: 450, protein: 28, carbs: 42, fat: 18, tags: ["gluten"] },
    { name: "Corn on the Cob", calories: 150, protein: 4, carbs: 30, fat: 2, tags: ["vegetarian"] },
    { name: "Mediterranean Salad", calories: 180, protein: 10, carbs: 12, fat: 10, tags: ["dairy", "vegetarian"] },
    { name: "Spicy Rice", calories: 220, protein: 4, carbs: 42, fat: 4, tags: ["vegetarian"] },
  ],
  "taco bell": [
    { name: "Crunchy Taco", calories: 170, protein: 8, carbs: 13, fat: 10, tags: ["dairy"] },
    { name: "Bean Burrito", calories: 350, protein: 13, carbs: 54, fat: 9, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Chicken Burrito Supreme", calories: 410, protein: 17, carbs: 50, fat: 15, tags: ["gluten", "dairy"] },
    { name: "Crunchwrap Supreme", calories: 530, protein: 16, carbs: 71, fat: 21, tags: ["gluten", "dairy"] },
    { name: "Chicken Power Bowl", calories: 470, protein: 26, carbs: 48, fat: 18, tags: ["dairy"] },
    {
      name: "Crunchwrap Supreme Box (Baja Blast Zero)",
      calories: 650,
      protein: 18,
      carbs: 86,
      fat: 24,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Crunchwrap Supreme", calories: 530, protein: 16, carbs: 71, fat: 21 },
        { name: "Cinnamon Twists", calories: 120, protein: 2, carbs: 15, fat: 3 },
        { name: "Baja Blast Zero", calories: 0, protein: 0, carbs: 0, fat: 0 },
      ],
    },
  ],
  starbucks: [
    { name: "Egg White & Spinach Wrap", calories: 290, protein: 20, carbs: 33, fat: 8, tags: ["gluten", "dairy", "egg"] },
    { name: "Turkey Bacon Egg White Sandwich", calories: 230, protein: 17, carbs: 25, fat: 6, tags: ["gluten", "dairy", "egg"] },
    { name: "Protein Box", calories: 450, protein: 20, carbs: 30, fat: 25, tags: ["dairy", "egg"] },
    { name: "Oatmeal", calories: 160, protein: 5, carbs: 28, fat: 2.5, tags: ["gluten", "vegetarian"] },
    { name: "Banana", calories: 100, protein: 1, carbs: 27, fat: 0, tags: ["vegetarian"] },
  ],
  // Convenience stores/servos — grab-and-go, not a sit-down menu, so this
  // is a smaller spread of what's actually on the counter/fridge shelf.
  "7-eleven": [
    { name: "Sausage Roll", calories: 310, protein: 8, carbs: 24, fat: 20, tags: ["gluten"] },
    { name: "Meat Pie", calories: 400, protein: 13, carbs: 34, fat: 24, tags: ["gluten"] },
    { name: "Chicken & Salad Wrap", calories: 380, protein: 22, carbs: 38, fat: 14, tags: ["gluten"] },
    { name: "Ham & Cheese Sandwich", calories: 350, protein: 18, carbs: 36, fat: 14, tags: ["gluten", "dairy"] },
    { name: "Protein Bar", calories: 220, protein: 20, carbs: 20, fat: 8, tags: ["dairy"] },
    { name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0, tags: ["vegetarian"] },
    { name: "Mixed Nuts (small pack)", calories: 170, protein: 6, carbs: 6, fat: 15, tags: ["vegetarian"] },
    { name: "Muesli Bar", calories: 120, protein: 2, carbs: 19, fat: 4, tags: ["gluten", "vegetarian"] },
    { name: "Iced Coffee (bottled)", calories: 180, protein: 5, carbs: 28, fat: 5, tags: ["dairy", "vegetarian"] },
    { name: "Yoghurt Tub", calories: 150, protein: 8, carbs: 20, fat: 4, tags: ["dairy", "vegetarian"] },
  ],
  apco: [
    { name: "Sausage Roll", calories: 310, protein: 8, carbs: 24, fat: 20, tags: ["gluten"] },
    { name: "Meat Pie", calories: 400, protein: 13, carbs: 34, fat: 24, tags: ["gluten"] },
    { name: "Chicken Roll", calories: 370, protein: 21, carbs: 36, fat: 15, tags: ["gluten"] },
    { name: "Ham & Cheese Toastie", calories: 360, protein: 17, carbs: 34, fat: 16, tags: ["gluten", "dairy"] },
    { name: "Protein Bar", calories: 220, protein: 20, carbs: 20, fat: 8, tags: ["dairy"] },
    { name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0, tags: ["vegetarian"] },
    { name: "Hot Chips (small)", calories: 310, protein: 4, carbs: 40, fat: 15, tags: ["vegetarian"] },
    { name: "Muesli Bar", calories: 120, protein: 2, carbs: 19, fat: 4, tags: ["gluten", "vegetarian"] },
  ],
};

// Common ways people actually type each chain's name.
const BRAND_ALIASES = {
  "mcdonald's": ["mcdonald's", "mcdonalds", "maccas", "macca's", "mcdo", "mcd"],
  kfc: ["kfc", "kentucky fried chicken"],
  subway: ["subway"],
  "burger king": ["burger king", "hungry jack's", "hungry jacks", "bk"],
  "domino's": ["domino's", "dominos", "domino"],
  "nando's": ["nando's", "nandos"],
  "taco bell": ["taco bell"],
  starbucks: ["starbucks", "sbux"],
  "7-eleven": ["7-eleven", "7 eleven", "7/11", "seven eleven"],
  apco: ["apco"],
};

const BRAND_DISPLAY = {
  "mcdonald's": "McDonald's",
  kfc: "KFC",
  subway: "Subway",
  "burger king": "Burger King",
  "domino's": "Domino's",
  "nando's": "Nando's",
  "taco bell": "Taco Bell",
  starbucks: "Starbucks",
  "7-eleven": "7-Eleven",
  apco: "APCO",
};

// Burger King trades as "Hungry Jack's" in Australia — same company,
// same menu, different name on the sign — so echo back whichever one
// the client actually typed rather than always saying "Burger King".
const ALIAS_DISPLAY_OVERRIDES = {
  "hungry jack's": "Hungry Jack's",
  "hungry jacks": "Hungry Jack's",
  maccas: "Macca's",
  "macca's": "Macca's",
};

const DAIRY_WORDS = ["milk", "cheese", "yoghurt", "yogurt", "cream", "butter"];
const GLUTEN_WORDS = ["bread", "wrap", "pasta", "tortilla", "flour", "bun", "oats"];
const NUT_WORDS = ["peanut", "almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut"];
const SHELLFISH_WORDS = ["prawn", "shrimp", "crab", "lobster", "oyster"];
const MEAT_WORDS = ["chicken", "beef", "pork", "turkey", "lamb", "bacon", "ham", "salami", "fish", "salmon", "tuna", "prawn", "shrimp"];

function normalize(s) {
  return (s || "").toLowerCase();
}

function detectBrand(message) {
  const m = normalize(message);
  for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
    const matchedAlias = aliases.find((a) => m.includes(a));
    if (matchedAlias) return { key: brand, display: ALIAS_DISPLAY_OVERRIDES[matchedAlias] || BRAND_DISPLAY[brand] };
  }
  return null;
}

function parseCalorieTarget(message) {
  const m = normalize(message).match(/(\d{2,4})\s*(kcal|cal|calorie)/);
  return m ? Number(m[1]) : null;
}

function wantsMealType(message) {
  const m = normalize(message);
  if (m.includes("breakfast")) return "Breakfast";
  if (m.includes("lunch")) return "Lunch";
  if (m.includes("dinner")) return "Dinner";
  if (m.includes("snack")) return "Snacks";
  if (m.includes("pre-workout") || m.includes("pre workout")) return "Pre-workout";
  if (m.includes("post-workout") || m.includes("post workout")) return "Post-workout";
  return null;
}

function allergyFlags(context) {
  const a = normalize(context.allergies);
  return {
    dairy: a.includes("dairy") || a.includes("lactose") || a.includes("milk"),
    gluten: a.includes("gluten") || a.includes("coeliac") || a.includes("celiac"),
    nuts: a.includes("nut"),
    shellfish: a.includes("shellfish") || a.includes("prawn") || a.includes("shrimp"),
    egg: a.includes("egg"),
  };
}

function wantsVegetarian(context) {
  const prefs = (context.dietaryPreferences || []).map(normalize);
  return prefs.some((p) => p.includes("vegetarian") || p.includes("vegan"));
}

// Works for both tagged restaurant items and raw fitness-meal ingredient
// text — whichever one a given item carries.
function passesAllergyFilter(item, flags, needsVegetarian) {
  const tags = item.tags || [];
  const text = item.ingredientText || "";
  if (flags.dairy && (tags.includes("dairy") || DAIRY_WORDS.some((w) => text.includes(w)))) return false;
  if (flags.gluten && (tags.includes("gluten") || GLUTEN_WORDS.some((w) => text.includes(w)))) return false;
  if (flags.nuts && NUT_WORDS.some((w) => text.includes(w))) return false;
  if (flags.shellfish && SHELLFISH_WORDS.some((w) => text.includes(w))) return false;
  if (flags.egg && (tags.includes("egg") || text.includes("egg"))) return false;
  if (needsVegetarian) {
    const isVeg = tags.includes("vegetarian") || (text && !MEAT_WORDS.some((w) => text.includes(w)));
    if (!isVeg) return false;
  }
  return true;
}

function scoreItem(item, budget, favorProtein) {
  const calDiff = Math.abs(item.calories - budget);
  const overshoot = item.calories > budget * 1.3 ? 350 : 0;
  const proteinWeight = favorProtein ? 4 : 1.2;
  return calDiff + overshoot - item.protein * proteinWeight;
}

// `excludeNames` lets the UI ask for a fresh batch ("show different
// options") without repeating what it already showed. If excluding
// everything already seen would leave nothing, the exclusion list is
// ignored for that call and ranking just starts over from the top —
// better to repeat a good fit than to show nothing.
function pickTop(items, budget, favorProtein, count, excludeNames) {
  const excluded = excludeNames && excludeNames.size ? items.filter((i) => !excludeNames.has(i.name)) : items;
  const pool = excluded.length ? excluded : items;
  return [...pool]
    .map((item) => ({ item, score: scoreItem(item, budget, favorProtein) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((x) => x.item);
}

function toSuggestion(item) {
  return {
    name: item.name,
    calories: Math.round(item.calories),
    protein: Math.round(item.protein),
    carbs: Math.round(item.carbs),
    fat: Math.round(item.fat),
    // Present only on combo/meal items — lets the UI show "what's
    // actually in this" instead of just the combined total.
    contents: item.contents
      ? item.contents.map((c) => ({ name: c.name, calories: Math.round(c.calories), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) }))
      : undefined,
  };
}

// Mirrors the shape the old Cloud Function returned: { reply, suggestions }.
// `excludeNames` (array of suggestion names already shown for this same
// query) lets "show different options" rotate through fresh picks
// instead of repeating the same 3 every time.
export function getLocalNutritionSuggestion(message, context, excludeNames) {
  const exclude = new Set(excludeNames || []);
  const flags = allergyFlags(context);
  const needsVegetarian = wantsVegetarian(context);
  const favorProtein = /protein|muscle|lean|cut(ting)?/i.test(message) || /muscle|lean/i.test(context.goal || "");

  const remainingBudget = context.caloriesRemaining > 0 ? context.caloriesRemaining : context.calorieTarget || 600;
  const proteinRemaining = context.proteinRemaining > 0 ? context.proteinRemaining : context.proteinTarget || 0;

  const brand = detectBrand(message);
  const parsedTarget = parseCalorieTarget(message);

  if (brand) {
    const menu = RESTAURANT_MENUS[brand.key];
    const budget = parsedTarget || remainingBudget;
    const allowed = menu.filter((i) => passesAllergyFilter(i, flags, needsVegetarian));
    const pool = allowed.length ? allowed : menu;
    const picks = pickTop(pool, budget, favorProtein, 3, exclude);
    const best = picks[0];
    const heavy = best && best.calories > budget * 1.3;
    const allergyNote = allowed.length < menu.length ? " I left out anything that could conflict with what's on your profile." : "";

    let reply;
    if (heavy) {
      reply = `Everything at ${brand.display} runs a bit heavier than what you've got left today (roughly ${Math.round(budget)} kcal) — this is the lightest fit I'd go with:${allergyNote}`;
    } else {
      reply = `From ${brand.display}, here's what fits well with roughly ${Math.round(budget)} kcal and ${Math.round(proteinRemaining)}g protein left today:${allergyNote}`;
    }
    return { reply, suggestions: picks.slice(0, heavy ? 1 : 3).map(toSuggestion) };
  }

  // No specific chain named — search the app's own 400+ real meal library
  // instead, which already carries real, verified macros.
  const mealType = wantsMealType(message);
  const toCandidate = (meal) => ({
    name: meal.name,
    calories: meal.cals,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    ingredientText: (meal.ingredients || []).map((i) => normalize(i.name)).join(" "),
    // Real per-ingredient breakdown from the meal library, so tapping a
    // suggestion here shows what's actually in it too.
    contents: (meal.ingredients || []).map((i) => ({ name: i.name, calories: i.cals, protein: i.protein, carbs: i.carbs, fat: i.fat })),
  });
  const candidates = FITNESS_MEALS_AU.filter((meal) => !mealType || (meal.mealTypes || []).includes(mealType)).map(toCandidate);
  const pool = candidates.length ? candidates : FITNESS_MEALS_AU.map(toCandidate);

  const budget = parsedTarget || remainingBudget;
  const allowed = pool.filter((i) => passesAllergyFilter(i, flags, needsVegetarian));
  const finalPool = allowed.length ? allowed : pool;
  const picks = pickTop(finalPool, budget, favorProtein, 3, exclude);
  const allergyNote = allowed.length < pool.length ? " I left out anything that could conflict with what's on your profile." : "";

  let reply;
  if (parsedTarget) {
    reply = `Here's something around ${Math.round(parsedTarget)} kcal that fits well:${allergyNote}`;
  } else if (picks.length) {
    reply = `Based on roughly ${Math.round(budget)} kcal and ${Math.round(proteinRemaining)}g protein you've got left today, here's a good fit:${allergyNote}`;
  } else {
    reply =
      "Tell me a restaurant (McDonald's, KFC, Subway, Burger King/Hungry Jack's, Domino's, Nando's, Taco Bell, Starbucks, 7-Eleven, APCO) or a calorie target and I'll find something that fits what you've got left today.";
  }
  return { reply, suggestions: picks.map((p) => toSuggestion({ ...p, name: p.name })) };
}
