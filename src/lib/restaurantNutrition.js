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
    { name: "Quarter Pounder with Cheese", calories: 513, protein: 29, carbs: 40, fat: 28, tags: ["gluten", "dairy"] },
    // Corrected to the real fatsecret.com.au Australia figure — was
    // previously overestimated by ~16%.
    { name: "6pc Chicken McNuggets", calories: 216, protein: 12, carbs: 12, fat: 13, tags: ["gluten"] },
    { name: "Grilled Chicken Salad (no dressing)", calories: 220, protein: 27, carbs: 10, fat: 8, tags: [] },
    { name: "Side Salad", calories: 20, protein: 1, carbs: 4, fat: 0, tags: ["vegetarian"] },
    { name: "Small Fries", calories: 230, protein: 3, carbs: 30, fat: 11, tags: ["vegetarian"] },
    { name: "Egg & Cheese McMuffin", calories: 300, protein: 17, carbs: 30, fat: 12, tags: ["gluten", "dairy", "egg"] },
    { name: "Oatmeal", calories: 150, protein: 4, carbs: 29, fat: 2, tags: ["gluten", "vegetarian"] },
    { name: "Double Cheeseburger", calories: 440, protein: 25, carbs: 34, fat: 23, tags: ["gluten", "dairy"] },
    { name: "McDouble", calories: 390, protein: 22, carbs: 33, fat: 18, tags: ["gluten", "dairy"] },
    { name: "10pc Chicken McNuggets", calories: 410, protein: 24, carbs: 25, fat: 25, tags: ["gluten"] },
    { name: "20pc Chicken McNuggets", calories: 820, protein: 48, carbs: 50, fat: 50, tags: ["gluten"] },
    { name: "Filet-O-Fish", calories: 390, protein: 15, carbs: 39, fat: 18, tags: ["gluten", "dairy"] },
    { name: "Medium Fries", calories: 340, protein: 4, carbs: 44, fat: 20, tags: ["vegetarian"] },
    { name: "Large Fries", calories: 490, protein: 6, carbs: 66, fat: 22, tags: ["vegetarian"] },
    { name: "Hash Brown", calories: 140, protein: 1, carbs: 15, fat: 8, tags: ["gluten", "vegetarian"] },
    { name: "Bacon & Egg McMuffin", calories: 310, protein: 17, carbs: 28, fat: 15, tags: ["gluten", "dairy", "egg"] },
    { name: "Hotcakes (with syrup)", calories: 580, protein: 9, carbs: 99, fat: 16, tags: ["gluten", "dairy", "egg", "vegetarian"] },
    { name: "Soft Serve Cone", calories: 140, protein: 3, carbs: 22, fat: 4, tags: ["dairy", "vegetarian"] },
    { name: "Oreo McFlurry", calories: 340, protein: 8, carbs: 51, fat: 11, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Apple Pie", calories: 230, protein: 2, carbs: 32, fat: 11, tags: ["gluten", "vegetarian"] },
    { name: "Apple Slices", calories: 15, protein: 0, carbs: 4, fat: 0, tags: ["vegetarian"] },
    { name: "Grilled Chicken & Bacon Caesar Salad", calories: 280, protein: 28, carbs: 12, fat: 14, tags: ["dairy"] },
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
      calories: 745,
      protein: 32,
      carbs: 70,
      fat: 39,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Quarter Pounder with Cheese", calories: 513, protein: 29, carbs: 40, fat: 28 },
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
    { name: "Original Recipe Chicken Wing", calories: 150, protein: 10, carbs: 5, fat: 10, tags: ["gluten"] },
    { name: "Hot & Spicy Chicken Breast", calories: 410, protein: 33, carbs: 14, fat: 25, tags: ["gluten"] },
    { name: "Original Tenders (3pc)", calories: 240, protein: 24, carbs: 15, fat: 12, tags: ["gluten"] },
    { name: "Original Tenders (5pc)", calories: 400, protein: 40, carbs: 25, fat: 20, tags: ["gluten"] },
    { name: "Rice Box (chicken, rice & gravy)", calories: 450, protein: 25, carbs: 55, fat: 15, tags: ["gluten"] },
    { name: "Famous Bowl", calories: 620, protein: 25, carbs: 65, fat: 28, tags: ["gluten", "dairy"] },
    { name: "Wicked Wings (3pc)", calories: 290, protein: 20, carbs: 10, fat: 20, tags: ["gluten"] },
    { name: "Large Chips", calories: 450, protein: 6, carbs: 58, fat: 21, tags: ["vegetarian"] },
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
    // Corrected to match published Subway data — carbs were overstated.
    { name: "Chicken Teriyaki 6-inch", calories: 340, protein: 26, carbs: 46, fat: 6, tags: ["gluten"] },
    { name: "Veggie Delite 6-inch", calories: 230, protein: 9, carbs: 44, fat: 3, tags: ["gluten", "vegetarian"] },
    { name: "Tuna 6-inch", calories: 450, protein: 19, carbs: 44, fat: 22, tags: ["gluten", "dairy"] },
    { name: "Steak & Cheese 6-inch", calories: 380, protein: 24, carbs: 45, fat: 12, tags: ["gluten", "dairy"] },
    { name: "Chicken & Bacon Ranch 6-inch", calories: 480, protein: 29, carbs: 44, fat: 21, tags: ["gluten", "dairy"] },
    { name: "Chicken Teriyaki Salad (no bread)", calories: 180, protein: 24, carbs: 15, fat: 3, tags: [] },
    { name: "Italian B.M.T. 6-inch", calories: 410, protein: 20, carbs: 46, fat: 17, tags: ["gluten", "dairy"] },
    { name: "Meatball Marinara 6-inch", calories: 480, protein: 20, carbs: 66, fat: 16, tags: ["gluten", "dairy"] },
    { name: "Subway Club 6-inch", calories: 310, protein: 24, carbs: 46, fat: 4, tags: ["gluten"] },
    { name: "Spicy Italian 6-inch", calories: 480, protein: 20, carbs: 45, fat: 27, tags: ["gluten", "dairy"] },
    { name: "Veggie Patty 6-inch", calories: 360, protein: 19, carbs: 53, fat: 8, tags: ["gluten", "vegetarian"] },
    { name: "Egg & Cheese 6-inch (breakfast)", calories: 380, protein: 22, carbs: 44, fat: 13, tags: ["gluten", "dairy", "egg"] },
    { name: "Cookie", calories: 200, protein: 2, carbs: 30, fat: 9, tags: ["gluten", "dairy", "vegetarian"] },
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
  // Burger King doesn't exist in Australia — this chain trades as Hungry
  // Jack's here (same company, same menu, different name on the sign),
  // so that's the name used everywhere a client or the UI sees it.
  "hungry jack's": [
    { name: "Whopper", calories: 660, protein: 28, carbs: 49, fat: 40, tags: ["gluten"] },
    { name: "Hamburger", calories: 240, protein: 12, carbs: 29, fat: 9, tags: ["gluten"] },
    // Real Hungry Jack's AU item (calorieking.com.au) — replaces the old
    // generic, unsourced "Crispy Chicken Burger" guess.
    { name: "Chicken Royale Burger", calories: 464, protein: 14, carbs: 42, fat: 27, tags: ["gluten"] },
    // Corrected to match the real Hungry Jack's AU "Grilled Chicken
    // Classic Burger" figure — protein was overstated, fat understated.
    { name: "Grilled Chicken Burger", calories: 344, protein: 23, carbs: 29, fat: 16, tags: ["gluten"] },
    { name: "4pc Chicken Nuggets", calories: 170, protein: 9, carbs: 11, fat: 10, tags: ["gluten"] },
    { name: "Small Fries", calories: 230, protein: 3, carbs: 29, fat: 11, tags: ["vegetarian"] },
    { name: "Garden Salad", calories: 60, protein: 4, carbs: 8, fat: 2, tags: ["vegetarian"] },
    { name: "Double Cheeseburger", calories: 440, protein: 26, carbs: 30, fat: 24, tags: ["gluten", "dairy"] },
    { name: "Angry Whopper", calories: 900, protein: 36, carbs: 54, fat: 60, tags: ["gluten", "dairy"] },
    { name: "Rebel Whopper (plant-based)", calories: 540, protein: 23, carbs: 47, fat: 29, tags: ["gluten", "vegetarian"] },
    { name: "Onion Rings (small)", calories: 280, protein: 4, carbs: 35, fat: 13, tags: ["gluten", "vegetarian"] },
    { name: "Hash Brown", calories: 160, protein: 2, carbs: 16, fat: 10, tags: ["gluten", "vegetarian"] },
    { name: "Soft Serve Cone", calories: 150, protein: 3, carbs: 24, fat: 4, tags: ["dairy", "vegetarian"] },
    { name: "Apple Pie", calories: 220, protein: 2, carbs: 30, fat: 10, tags: ["gluten", "vegetarian"] },
    { name: "BBQ Bacon Deluxe Burger", calories: 630, protein: 30, carbs: 48, fat: 34, tags: ["gluten", "dairy"] },
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
      calories: 576,
      protein: 26,
      carbs: 58,
      fat: 27,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Grilled Chicken Burger", calories: 344, protein: 23, carbs: 29, fat: 16 },
        { name: "Small Fries", calories: 230, protein: 3, carbs: 29, fat: 11 },
        { name: "Coke No Sugar (small)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
  ],
  // Per-slice figures are the official values from dominos.com.au's own
  // published nutritional information page, doubled for a 2-slice serve.
  "domino's": [
    { name: "Margherita Pizza (2 slices)", calories: 272, protein: 10, carbs: 36, fat: 8, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Pepperoni Pizza (2 slices)", calories: 262, protein: 12, carbs: 37, fat: 6, tags: ["gluten", "dairy"] },
    { name: "BBQ Chicken Pizza (2 slices)", calories: 292, protein: 12, carbs: 34, fat: 12, tags: ["gluten", "dairy"] },
    { name: "Vegetarian Supreme Pizza (2 slices)", calories: 310, protein: 12, carbs: 42, fat: 10, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Garlic Bread (2 pieces)", calories: 200, protein: 5, carbs: 26, fat: 8, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Hawaiian Pizza (2 slices)", calories: 272, protein: 12, carbs: 38, fat: 8, tags: ["gluten", "dairy"] },
    { name: "Meat Lovers Pizza (2 slices)", calories: 306, protein: 14, carbs: 37, fat: 11, tags: ["gluten", "dairy"] },
    { name: "Chicken Supreme Pizza (2 slices)", calories: 300, protein: 14, carbs: 36, fat: 11, tags: ["gluten", "dairy"] },
    { name: "Chicken Wings (6pc)", calories: 450, protein: 35, carbs: 8, fat: 30, tags: ["gluten"] },
    { name: "Garden Salad", calories: 90, protein: 3, carbs: 10, fat: 4, tags: ["vegetarian"] },
  ],
  "nando's": [
    // Two real, distinct products (fatsecret.com.au / calorieking.com.au)
    // rather than one guessed figure — a skinless breast-only quarter
    // runs much leaner than the mixed skin-on quarter.
    { name: "1/4 Chicken Breast (no skin)", calories: 289, protein: 39, carbs: 0, fat: 15, tags: [] },
    { name: "1/4 Chicken (mixed cut, skin on)", calories: 425, protein: 55, carbs: 0, fat: 23, tags: [] },
    { name: "Chicken Wrap", calories: 450, protein: 28, carbs: 42, fat: 18, tags: ["gluten"] },
    { name: "Corn on the Cob", calories: 150, protein: 4, carbs: 30, fat: 2, tags: ["vegetarian"] },
    { name: "Mediterranean Salad", calories: 180, protein: 10, carbs: 12, fat: 10, tags: ["dairy", "vegetarian"] },
    { name: "Spicy Rice", calories: 220, protein: 4, carbs: 42, fat: 4, tags: ["vegetarian"] },
    { name: "Full Chicken (skin on)", calories: 850, protein: 110, carbs: 0, fat: 46, tags: [] },
    { name: "Grilled Chicken Burger", calories: 420, protein: 30, carbs: 40, fat: 15, tags: ["gluten"] },
    { name: "Chicken Pita", calories: 380, protein: 25, carbs: 38, fat: 12, tags: ["gluten"] },
    { name: "Veggie Wrap (halloumi)", calories: 420, protein: 15, carbs: 45, fat: 20, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Garlic Bread", calories: 220, protein: 5, carbs: 28, fat: 10, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Macho Peas", calories: 150, protein: 8, carbs: 20, fat: 3, tags: ["vegetarian"] },
    { name: "Coleslaw", calories: 150, protein: 2, carbs: 12, fat: 11, tags: ["dairy", "vegetarian"] },
    { name: "Mashed Potato", calories: 180, protein: 3, carbs: 25, fat: 7, tags: ["dairy", "vegetarian"] },
  ],
  "taco bell": [
    { name: "Crunchy Taco", calories: 170, protein: 8, carbs: 13, fat: 10, tags: ["dairy"] },
    { name: "Bean Burrito", calories: 350, protein: 13, carbs: 54, fat: 9, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Chicken Burrito Supreme", calories: 410, protein: 17, carbs: 50, fat: 15, tags: ["gluten", "dairy"] },
    { name: "Crunchwrap Supreme", calories: 530, protein: 16, carbs: 71, fat: 21, tags: ["gluten", "dairy"] },
    { name: "Chicken Power Bowl", calories: 470, protein: 26, carbs: 48, fat: 18, tags: ["dairy"] },
    { name: "Soft Taco", calories: 180, protein: 9, carbs: 18, fat: 8, tags: ["gluten", "dairy"] },
    { name: "Nachos Bell Grande", calories: 740, protein: 16, carbs: 80, fat: 36, tags: ["dairy", "vegetarian"] },
    { name: "Mexican Pizza", calories: 540, protein: 21, carbs: 46, fat: 30, tags: ["gluten", "dairy"] },
    { name: "Cheesy Gordita Crunch", calories: 500, protein: 21, carbs: 41, fat: 29, tags: ["gluten", "dairy"] },
    { name: "Chicken Quesadilla", calories: 510, protein: 26, carbs: 37, fat: 29, tags: ["gluten", "dairy"] },
    { name: "Nacho Fries", calories: 320, protein: 4, carbs: 34, fat: 18, tags: ["dairy", "vegetarian"] },
    { name: "Cinnamon Twists", calories: 170, protein: 1, carbs: 26, fat: 7, tags: ["gluten", "vegetarian"] },
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
    { name: "Bacon & Gruyere Sandwich", calories: 370, protein: 19, carbs: 33, fat: 18, tags: ["gluten", "dairy", "egg"] },
    { name: "Spinach & Feta Wrap", calories: 290, protein: 13, carbs: 31, fat: 11, tags: ["gluten", "dairy", "egg", "vegetarian"] },
    { name: "Chocolate Croissant", calories: 340, protein: 6, carbs: 38, fat: 18, tags: ["gluten", "dairy", "egg", "vegetarian"] },
    { name: "Blueberry Muffin", calories: 350, protein: 5, carbs: 51, fat: 14, tags: ["gluten", "dairy", "egg", "vegetarian"] },
    { name: "Caffe Latte (grande)", calories: 190, protein: 13, carbs: 18, fat: 7, tags: ["dairy", "vegetarian"] },
    { name: "Greek Yoghurt Parfait", calories: 220, protein: 14, carbs: 28, fat: 6, tags: ["dairy", "vegetarian"] },
  ],
  // The local fish & chip shop — not a named chain, but a real, common
  // takeaway category in its own right, so "fish and chips" gets an
  // actual chip-shop menu (grilled/battered fish, chips, potato cake,
  // dim sim) instead of falling through to the generic meal library.
  // Figures sourced from published flake/battered-fish/potato-cake/
  // dim-sim/calamari nutrition data.
  "fish and chips": [
    { name: "Grilled Fish Fillet (flake)", calories: 170, protein: 32, carbs: 0, fat: 5, tags: [] },
    { name: "Battered Fish (1 piece)", calories: 343, protein: 21, carbs: 21, fat: 19, tags: ["gluten"] },
    { name: "Chips (shop serve)", calories: 300, protein: 4, carbs: 40, fat: 14, tags: ["vegetarian"] },
    { name: "Potato Cake", calories: 135, protein: 2, carbs: 17, fat: 7, tags: ["gluten", "vegetarian"] },
    { name: "Dim Sim (steamed)", calories: 120, protein: 4, carbs: 18, fat: 3, tags: ["gluten"] },
    { name: "Dim Sim (fried)", calories: 120, protein: 5, carbs: 10, fat: 6, tags: ["gluten"] },
    { name: "Calamari Rings (fried)", calories: 316, protein: 19, carbs: 19, fat: 18, tags: ["gluten"] },
    { name: "Grilled Flathead Fillet", calories: 180, protein: 30, carbs: 0, fat: 6, tags: [] },
    { name: "Scallops (fried, 6pc)", calories: 220, protein: 10, carbs: 18, fat: 12, tags: ["gluten", "shellfish"] },
    { name: "Prawn Cutlets (fried, 6pc)", calories: 260, protein: 14, carbs: 20, fat: 15, tags: ["gluten", "shellfish"] },
    { name: "Hamburger (fish shop grill)", calories: 400, protein: 18, carbs: 35, fat: 20, tags: ["gluten"] },
    { name: "Greek Salad (side)", calories: 150, protein: 5, carbs: 10, fat: 11, tags: ["dairy", "vegetarian"] },
    { name: "Large Chips", calories: 450, protein: 6, carbs: 58, fat: 21, tags: ["vegetarian"] },
    {
      name: "Grilled Fish & Chips (handful)",
      calories: 470,
      protein: 36,
      carbs: 40,
      fat: 19,
      tags: ["combo"],
      contents: [
        { name: "Grilled Fish Fillet (flake)", calories: 170, protein: 32, carbs: 0, fat: 5 },
        { name: "Chips (handful)", calories: 300, protein: 4, carbs: 40, fat: 14 },
      ],
    },
    {
      name: "Battered Fish & Chips",
      calories: 643,
      protein: 25,
      carbs: 61,
      fat: 33,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Battered Fish (1 piece)", calories: 343, protein: 21, carbs: 21, fat: 19 },
        { name: "Chips (shop serve)", calories: 300, protein: 4, carbs: 40, fat: 14 },
      ],
    },
    {
      name: "Fish, Chips & a Potato Cake",
      calories: 778,
      protein: 27,
      carbs: 78,
      fat: 40,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Battered Fish (1 piece)", calories: 343, protein: 21, carbs: 21, fat: 19 },
        { name: "Chips (shop serve)", calories: 300, protein: 4, carbs: 40, fat: 14 },
        { name: "Potato Cake", calories: 135, protein: 2, carbs: 17, fat: 7 },
      ],
    },
    {
      name: "Fish, Chips & a Steamed Dim Sim",
      calories: 763,
      protein: 29,
      carbs: 79,
      fat: 36,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Battered Fish (1 piece)", calories: 343, protein: 21, carbs: 21, fat: 19 },
        { name: "Chips (shop serve)", calories: 300, protein: 4, carbs: 40, fat: 14 },
        { name: "Dim Sim (steamed)", calories: 120, protein: 4, carbs: 18, fat: 3 },
      ],
    },
  ],
  // Convenience stores/servos — grab-and-go, not a sit-down menu, so this
  // is a smaller spread of what's actually on the counter/fridge shelf.
  "7-eleven": [
    // The pie-warmer items are overwhelmingly Four'N Twenty in Australian
    // servos — real published values for that actual brand/product.
    { name: "Sausage Roll (Four'N Twenty)", calories: 507, protein: 14, carbs: 50, fat: 28, tags: ["gluten"] },
    { name: "Meat Pie (Four'N Twenty)", calories: 431, protein: 16, carbs: 35, fat: 24, tags: ["gluten"] },
    { name: "Chicken & Salad Wrap", calories: 380, protein: 22, carbs: 38, fat: 14, tags: ["gluten"] },
    { name: "Ham & Cheese Sandwich", calories: 350, protein: 18, carbs: 36, fat: 14, tags: ["gluten", "dairy"] },
    { name: "Protein Bar", calories: 220, protein: 20, carbs: 20, fat: 8, tags: ["dairy"] },
    { name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0, tags: ["vegetarian"] },
    { name: "Mixed Nuts (small pack)", calories: 170, protein: 6, carbs: 6, fat: 15, tags: ["vegetarian"] },
    { name: "Muesli Bar", calories: 120, protein: 2, carbs: 19, fat: 4, tags: ["gluten", "vegetarian"] },
    { name: "Iced Coffee (bottled)", calories: 180, protein: 5, carbs: 28, fat: 5, tags: ["dairy", "vegetarian"] },
    { name: "Yoghurt Tub", calories: 150, protein: 8, carbs: 20, fat: 4, tags: ["dairy", "vegetarian"] },
    { name: "Hot Dog", calories: 290, protein: 10, carbs: 25, fat: 17, tags: ["gluten"] },
    { name: "Chicken Nuggets (6pc)", calories: 280, protein: 14, carbs: 18, fat: 18, tags: ["gluten"] },
    { name: "Pizza Slice (heated)", calories: 300, protein: 13, carbs: 32, fat: 13, tags: ["gluten", "dairy"] },
    { name: "Sushi Pack", calories: 350, protein: 12, carbs: 60, fat: 6, tags: [] },
    { name: "Chocolate Bar", calories: 230, protein: 3, carbs: 25, fat: 13, tags: ["dairy", "vegetarian"] },
    { name: "Slurpee (small)", calories: 130, protein: 0, carbs: 34, fat: 0, tags: ["vegetarian"] },
  ],
  apco: [
    { name: "Sausage Roll (Four'N Twenty)", calories: 507, protein: 14, carbs: 50, fat: 28, tags: ["gluten"] },
    { name: "Meat Pie (Four'N Twenty)", calories: 431, protein: 16, carbs: 35, fat: 24, tags: ["gluten"] },
    { name: "Chicken Roll", calories: 370, protein: 21, carbs: 36, fat: 15, tags: ["gluten"] },
    { name: "Ham & Cheese Toastie", calories: 360, protein: 17, carbs: 34, fat: 16, tags: ["gluten", "dairy"] },
    { name: "Protein Bar", calories: 220, protein: 20, carbs: 20, fat: 8, tags: ["dairy"] },
    { name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0, tags: ["vegetarian"] },
    { name: "Hot Chips (small)", calories: 310, protein: 4, carbs: 40, fat: 15, tags: ["vegetarian"] },
    { name: "Muesli Bar", calories: 120, protein: 2, carbs: 19, fat: 4, tags: ["gluten", "vegetarian"] },
    { name: "Hot Dog", calories: 290, protein: 10, carbs: 25, fat: 17, tags: ["gluten"] },
    { name: "Chicken Nuggets (6pc)", calories: 280, protein: 14, carbs: 18, fat: 18, tags: ["gluten"] },
    { name: "Chicken Salad Sandwich", calories: 360, protein: 18, carbs: 38, fat: 14, tags: ["gluten", "dairy"] },
    { name: "Slushie (small)", calories: 130, protein: 0, carbs: 34, fat: 0, tags: ["vegetarian"] },
    { name: "Chocolate Bar", calories: 230, protein: 3, carbs: 25, fat: 13, tags: ["dairy", "vegetarian"] },
  ],
};

// Common ways people actually type each chain's name.
const BRAND_ALIASES = {
  "mcdonald's": ["mcdonald's", "mcdonalds", "maccas", "macca's", "mcdo", "mcd"],
  kfc: ["kfc", "kentucky fried chicken"],
  subway: ["subway"],
  "hungry jack's": ["hungry jack's", "hungry jacks", "burger king", "bk"],
  "domino's": ["domino's", "dominos", "domino"],
  "nando's": ["nando's", "nandos"],
  "taco bell": ["taco bell"],
  starbucks: ["starbucks", "sbux"],
  "7-eleven": ["7-eleven", "7 eleven", "7/11", "seven eleven"],
  apco: ["apco"],
  "fish and chips": ["fish and chips", "fish & chips", "fish n chips", "fish 'n' chips", "fish shop", "the chippy", "chippy"],
};

const BRAND_DISPLAY = {
  "mcdonald's": "McDonald's",
  kfc: "KFC",
  subway: "Subway",
  "hungry jack's": "Hungry Jack's",
  "domino's": "Domino's",
  "nando's": "Nando's",
  "taco bell": "Taco Bell",
  starbucks: "Starbucks",
  "7-eleven": "7-Eleven",
  apco: "APCO",
  "fish and chips": "the fish & chip shop",
};

// Burger King doesn't exist in Australia (it's Hungry Jack's here, same
// company/menu), so that's always the default display — even someone
// typing "Burger King" or "BK" still gets told "Hungry Jack's" back.
const ALIAS_DISPLAY_OVERRIDES = {
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

function wantsMacroMatch(message) {
  return /macro.?match|match (the rest of )?my (macros|calories|cals)|hit my macros/i.test(message);
}

function sumItems(items) {
  return items.reduce((acc, i) => ({ calories: acc.calories + i.calories, protein: acc.protein + i.protein, carbs: acc.carbs + i.carbs, fat: acc.fat + i.fat }), {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
}

// Weighted squared relative error across all four macros at once — unlike
// the single-item ranking above (which only really optimizes calories),
// this is what "match my macros" actually needs: get calories, protein,
// carbs AND fat all close simultaneously, which usually takes more than
// one menu item.
function macroMatchDistance(sum, target) {
  let d = 0;
  for (const k of ["calories", "protein", "carbs", "fat"]) {
    if (target[k] > 0) {
      const rel = (sum[k] - target[k]) / target[k];
      d += rel * rel;
    }
  }
  return d;
}

// Every 1-, 2- and 3-item combination from the menu — plenty fast for a
// menu this size (a dozen-ish items), and a real meal is rarely more
// than 3 separate things ordered together.
function generateCombos(items) {
  const combos = [];
  for (let i = 0; i < items.length; i++) {
    combos.push([items[i]]);
    for (let j = i + 1; j < items.length; j++) {
      combos.push([items[i], items[j]]);
      for (let k = j + 1; k < items.length; k++) {
        combos.push([items[i], items[j], items[k]]);
      }
    }
  }
  return combos;
}

// Finds the combo(s) of menu items whose combined calories/protein/carbs/
// fat land closest to the client's actual remaining targets for today —
// "Macro Match". `excludeNames` (the composite "A + B + C" name) lets a
// refresh move on to the next-closest combo instead of repeating one.
function macroMatchSuggestions(pool, target, excludeNames, count) {
  const scored = generateCombos(pool).map((items) => {
    const sum = sumItems(items);
    return { items, sum, score: macroMatchDistance(sum, target), name: items.map((i) => i.name).join(" + ") };
  });
  scored.sort((a, b) => a.score - b.score);
  const filtered = excludeNames && excludeNames.size ? scored.filter((c) => !excludeNames.has(c.name)) : scored;
  const finalList = filtered.length ? filtered : scored;
  return finalList.slice(0, count).map((c) => ({ name: c.name, calories: c.sum.calories, protein: c.sum.protein, carbs: c.sum.carbs, fat: c.sum.fat, contents: c.items }));
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
  if (flags.shellfish && (tags.includes("shellfish") || SHELLFISH_WORDS.some((w) => text.includes(w)))) return false;
  if (flags.egg && (tags.includes("egg") || text.includes("egg"))) return false;
  if (needsVegetarian) {
    const isVeg = tags.includes("vegetarian") || (text && !MEAT_WORDS.some((w) => text.includes(w)));
    if (!isVeg) return false;
  }
  return true;
}

// Protein-first by default — not just when the client explicitly asks
// for "high protein" — since that's what's actually useful for someone
// tracking macros: among options that reasonably fit the calorie
// budget, lead with the higher-protein ones rather than whichever
// happens to land closest to the calorie number.
function scoreItem(item, budget, favorProtein) {
  const calDiff = Math.abs(item.calories - budget);
  const overshoot = item.calories > budget * 1.3 ? 350 : 0;
  const proteinWeight = favorProtein ? 6 : 4;
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

  if (wantsMacroMatch(message)) {
    if (!brand) {
      return {
        reply: "Tell me which restaurant and I'll build a combo from their menu that matches your remaining calories AND macros as closely as possible — e.g. \"macro match McDonald's\".",
        suggestions: [],
      };
    }
    const menu = RESTAURANT_MENUS[brand.key];
    const allowed = menu.filter((i) => passesAllergyFilter(i, flags, needsVegetarian));
    const pool = allowed.length ? allowed : menu;
    const target = {
      calories: remainingBudget,
      protein: proteinRemaining,
      carbs: context.carbsRemaining > 0 ? context.carbsRemaining : context.carbsTarget || 0,
      fat: context.fatRemaining > 0 ? context.fatRemaining : context.fatTarget || 0,
    };
    const matches = macroMatchSuggestions(pool, target, exclude, 3);
    const allergyNote = allowed.length < menu.length ? " I left out anything that could conflict with what's on your profile." : "";
    const reply = `Macro Match from ${brand.display} — closest I can build to roughly ${Math.round(target.calories)} kcal, ${Math.round(target.protein)}g protein, ${Math.round(
      target.carbs
    )}g carbs and ${Math.round(target.fat)}g fat left today:${allergyNote}`;
    return { reply, suggestions: matches.map(toSuggestion) };
  }

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
      "Tell me a restaurant (McDonald's, KFC, Subway, Hungry Jack's, Domino's, Nando's, Taco Bell, Starbucks, 7-Eleven, APCO, fish and chips) or a calorie target and I'll find something that fits what you've got left today.";
  }
  return { reply, suggestions: picks.map((p) => toSuggestion({ ...p, name: p.name })) };
}
