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
  // Rebuilt from McDonald's Australia's own published per-item nutrition
  // panels (mcdonalds.com.au) — every figure below is the real current
  // AU menu value, not an estimate. "McDouble" and "Quarter Pounder with
  // Cheese" (singular) have quietly left the current AU menu — it's now
  // Double Quarter Pounder / Cheesy Quarter Pounder tiers — so those are
  // gone and replaced with what's actually sold today.
  "mcdonald's": [
    { name: "Hamburger", calories: 294, protein: 14, carbs: 30, fat: 12, tags: ["gluten"] },
    { name: "Cheeseburger", calories: 319, protein: 15, carbs: 31, fat: 14, tags: ["gluten", "dairy"] },
    { name: "Big Mac", calories: 621, protein: 29, carbs: 47, fat: 34, tags: ["gluten", "dairy"] },
    { name: "Double Big Mac", calories: 813, protein: 42, carbs: 52, fat: 48, tags: ["gluten", "dairy"] },
    { name: "McChicken", calories: 431, protein: 16, carbs: 45, fat: 20, tags: ["gluten"] },
    { name: "Chicken 'n' Cheese", calories: 418, protein: 17, carbs: 39, fat: 21, tags: ["gluten", "dairy"] },
    { name: "Double McChicken", calories: 621, protein: 28, carbs: 59, fat: 30, tags: ["gluten"] },
    { name: "Filet-O-Fish", calories: 337, protein: 15, carbs: 35, fat: 15, tags: ["gluten", "dairy"] },
    { name: "Double Quarter Pounder", calories: 844, protein: 54, carbs: 38, fat: 52, tags: ["gluten", "dairy"] },
    { name: "Double Quarter Pounder BBQ Bacon", calories: 881, protein: 58, carbs: 39, fat: 53, tags: ["gluten", "dairy"] },
    { name: "Double Quarter Pounder Deluxe", calories: 888, protein: 55, carbs: 39, fat: 55, tags: ["gluten", "dairy"] },
    { name: "Double Quarter Pounder BBQ Bacon & Crispy Onions", calories: 920, protein: 58, carbs: 43, fat: 56, tags: ["gluten", "dairy"] },
    { name: "Cheesy Quarter Pounder", calories: 887, protein: 46, carbs: 58, fat: 51, tags: ["gluten", "dairy"] },
    { name: "Cheesy Double Quarter Pounder", calories: 1186, protein: 69, carbs: 59, fat: 73, tags: ["gluten", "dairy"] },
    { name: "Big Arch", calories: 1101, protein: 59, carbs: 58, fat: 69, tags: ["gluten", "dairy"] },
    { name: "Classic Chicken McWrap", calories: 691, protein: 23, carbs: 62, fat: 39, tags: ["gluten", "dairy"] },
    { name: "Spicy Chicken McWrap", calories: 585, protein: 29, carbs: 52, fat: 28, tags: ["gluten", "dairy"] },
    { name: "Chicken McWings (10-piece, to share)", calories: 1596, protein: 92, carbs: 69, fat: 101, tags: ["gluten"] },
    { name: "6pc Chicken McNuggets", calories: 229, protein: 13, carbs: 14, fat: 13, tags: ["gluten"] },
    { name: "10pc Chicken McNuggets", calories: 381, protein: 22, carbs: 23, fat: 22, tags: ["gluten"] },
    { name: "Fries (Small)", calories: 219, protein: 4, carbs: 24, fat: 12, tags: ["vegetarian"] },
    { name: "Fries (Medium)", calories: 316, protein: 5, carbs: 35, fat: 17, tags: ["vegetarian"] },
    { name: "Fries (Large)", calories: 389, protein: 6, carbs: 43, fat: 21, tags: ["vegetarian"] },
    { name: "Hash Brown", calories: 144, protein: 1, carbs: 13, fat: 10, tags: ["gluten", "vegetarian"] },
    { name: "Mozzarella Sticks", calories: 318, protein: 13, carbs: 31, fat: 15, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Bacon & Egg McMuffin", calories: 282, protein: 18, carbs: 25, fat: 12, tags: ["gluten", "dairy", "egg"] },
    { name: "Sausage McMuffin", calories: 297, protein: 16, carbs: 25, fat: 14, tags: ["gluten", "dairy"] },
    { name: "Mighty McMuffin", calories: 441, protein: 30, carbs: 31, fat: 22, tags: ["gluten", "dairy", "egg"] },
    { name: "Deluxe Mighty McMuffin", calories: 486, protein: 30, carbs: 30, fat: 26, tags: ["gluten", "dairy", "egg"] },
    { name: "Double Sausage McMuffin", calories: 577, protein: 27, carbs: 26, fat: 26, tags: ["gluten", "dairy"] },
    { name: "Double Sausage & Egg McMuffin", calories: 714, protein: 32, carbs: 26, fat: 32, tags: ["gluten", "dairy", "egg"] },
    { name: "Deluxe Sausage & Egg McMuffin", calories: 410, protein: 22, carbs: 27, fat: 23, tags: ["gluten", "dairy", "egg"] },
    { name: "Chicken & Bacon McMuffin", calories: 428, protein: 23, carbs: 39, fat: 20, tags: ["gluten", "dairy"] },
    { name: "Big Brekkie Burger", calories: 751, protein: 40, carbs: 54, fat: 41, tags: ["gluten", "dairy", "egg"] },
    { name: "Mega Brekkie McWrap", calories: 786, protein: 40, carbs: 54, fat: 45, tags: ["gluten", "dairy", "egg"] },
    { name: "Soft Serve Cone", calories: 139, protein: 4, carbs: 22, fat: 4, tags: ["dairy", "vegetarian"] },
    { name: "Soft Serve Cone with Cadbury Flake", calories: 183, protein: 5, carbs: 27, fat: 6, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Plain Sundae", calories: 194, protein: 6, carbs: 30, fat: 6, tags: ["dairy", "vegetarian"] },
    { name: "Hot Apple Pie", calories: 251, protein: 2, carbs: 29, fat: 14, tags: ["gluten", "vegetarian"] },
    // Meals — burger + fries + drink, built by adding the real published
    // figures above to standard Coca-Cola values (0 protein/fat, 4
    // kcal/g carb — Coke's own printed panel, not restaurant-specific).
    // `contents` sums exactly to the listed total.
    {
      name: "Small Big Mac Meal (regular Coke)",
      calories: 978,
      protein: 33,
      carbs: 106,
      fat: 46,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Big Mac", calories: 621, protein: 29, carbs: 47, fat: 34 },
        { name: "Fries (Small)", calories: 219, protein: 4, carbs: 24, fat: 12 },
        { name: "Coca-Cola (small)", calories: 138, protein: 0, carbs: 35, fat: 0 },
      ],
    },
    {
      name: "Medium Big Mac Meal (regular Coke)",
      calories: 1112,
      protein: 34,
      carbs: 126,
      fat: 51,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Big Mac", calories: 621, protein: 29, carbs: 47, fat: 34 },
        { name: "Fries (Medium)", calories: 316, protein: 5, carbs: 35, fat: 17 },
        { name: "Coca-Cola (medium)", calories: 175, protein: 0, carbs: 44, fat: 0 },
      ],
    },
    {
      name: "Medium Big Mac Meal (Coke No Sugar)",
      calories: 939,
      protein: 34,
      carbs: 82,
      fat: 51,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Big Mac", calories: 621, protein: 29, carbs: 47, fat: 34 },
        { name: "Fries (Medium)", calories: 316, protein: 5, carbs: 35, fat: 17 },
        { name: "Coke No Sugar (medium)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
    {
      name: "Large Big Mac Meal (regular Coke)",
      calories: 1268,
      protein: 35,
      carbs: 155,
      fat: 55,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Big Mac", calories: 621, protein: 29, carbs: 47, fat: 34 },
        { name: "Fries (Large)", calories: 389, protein: 6, carbs: 43, fat: 21 },
        { name: "Coca-Cola (large)", calories: 258, protein: 0, carbs: 65, fat: 0 },
      ],
    },
    {
      name: "Small Cheeseburger Meal (Coke No Sugar)",
      calories: 540,
      protein: 19,
      carbs: 55,
      fat: 26,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Cheeseburger", calories: 319, protein: 15, carbs: 31, fat: 14 },
        { name: "Fries (Small)", calories: 219, protein: 4, carbs: 24, fat: 12 },
        { name: "Coke No Sugar (small)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
    {
      name: "Small McChicken Meal (Coke No Sugar)",
      calories: 652,
      protein: 20,
      carbs: 69,
      fat: 32,
      tags: ["gluten", "combo"],
      contents: [
        { name: "McChicken", calories: 431, protein: 16, carbs: 45, fat: 20 },
        { name: "Fries (Small)", calories: 219, protein: 4, carbs: 24, fat: 12 },
        { name: "Coke No Sugar (small)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
    {
      name: "Medium Double Quarter Pounder Meal (Coke No Sugar)",
      calories: 1162,
      protein: 59,
      carbs: 73,
      fat: 69,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Double Quarter Pounder", calories: 844, protein: 54, carbs: 38, fat: 52 },
        { name: "Fries (Medium)", calories: 316, protein: 5, carbs: 35, fat: 17 },
        { name: "Coke No Sugar (medium)", calories: 2, protein: 0, carbs: 0, fat: 0 },
      ],
    },
  ],
  // Rebuilt entirely from KFC Australia's own published nutrition/allergen
  // panel (kfc.com.au/nutrition-allergen). The real current AU menu is
  // structured very differently from what used to be coded here — no
  // standalone Original Recipe breast/thigh/drumstick, no "Zinger Burger"
  // by that name, no Famous Bowl/Rice Box (those were removed outright,
  // not real AU items) — so this is a structural rebuild, not a numbers
  // tweak.
  kfc: [
    { name: "1 Piece of Chicken", calories: 235, protein: 20, carbs: 7, fat: 14, tags: ["gluten"] },
    { name: "3 Pieces of Chicken", calories: 705, protein: 61, carbs: 22, fat: 42, tags: ["gluten"] },
    { name: "6 Pieces of Chicken (to share)", calories: 1410, protein: 123, carbs: 43, fat: 84, tags: ["gluten"] },
    { name: "Zinger® Fillet Piece", calories: 224, protein: 20, carbs: 9, fat: 12, tags: ["gluten"] },
    { name: "Original Crispy Fillet Piece", calories: 224, protein: 19, carbs: 11, fat: 12, tags: ["gluten"] },
    { name: "5 Original Tenders", calories: 763, protein: 44, carbs: 24, fat: 55, tags: ["gluten"] },
    { name: "3 Pieces Wicked Boneless", calories: 343, protein: 28, carbs: 18, fat: 17, tags: ["gluten"] },
    { name: "6 Pieces Wicked Boneless", calories: 685, protein: 56, carbs: 37, fat: 35, tags: ["gluten"] },
    { name: "3 Wicked Wings", calories: 389, protein: 23, carbs: 14, fat: 27, tags: ["gluten"] },
    { name: "6 Wicked Wings", calories: 779, protein: 45, carbs: 28, fat: 55, tags: ["gluten"] },
    { name: "10 Wicked Wings", calories: 1298, protein: 75, carbs: 46, fat: 91, tags: ["gluten"] },
    { name: "3 Nuggets", calories: 125, protein: 8, carbs: 6, fat: 8, tags: ["gluten"] },
    { name: "6 Nuggets", calories: 316, protein: 16, carbs: 27, fat: 16, tags: ["gluten"] },
    { name: "Snack Popcorn Chicken", calories: 241, protein: 12, carbs: 15, fat: 15, tags: ["gluten"] },
    { name: "Regular Popcorn Chicken", calories: 393, protein: 19, carbs: 24, fat: 24, tags: ["gluten"] },
    { name: "Maxi Popcorn Chicken", calories: 720, protein: 35, carbs: 44, fat: 45, tags: ["gluten"] },
    { name: "Zinger Stacker® Burger", calories: 737, protein: 51, carbs: 49, fat: 37, tags: ["gluten", "dairy"] },
    { name: "Original Crispy BBQ Bacon Stacker® Burger", calories: 843, protein: 55, carbs: 52, fat: 46, tags: ["gluten", "dairy"] },
    { name: "Zinger® Crunch Bowl", calories: 415, protein: 23, carbs: 28, fat: 23, tags: ["gluten"] },
    { name: "Original Tenders™ Crunch Bowl", calories: 403, protein: 20, carbs: 26, fat: 24, tags: ["gluten"] },
    { name: "Zinger® Protein Bowl", calories: 552, protein: 44, carbs: 28, fat: 29, tags: ["gluten"] },
    { name: "Original BBQ Slider", calories: 242, protein: 12, carbs: 28, fat: 9, tags: ["gluten"] },
    { name: "Original Supercharged Slider", calories: 259, protein: 12, carbs: 25, fat: 12, tags: ["gluten"] },
    { name: "Regular Chips", calories: 283, protein: 4, carbs: 41, fat: 12, tags: ["vegetarian"] },
    { name: "Large Chips", calories: 567, protein: 9, carbs: 81, fat: 23, tags: ["vegetarian"] },
    { name: "Regular Gravy", calories: 51, protein: 2, carbs: 8, fat: 1, tags: [] },
    { name: "Regular Potato & Gravy", calories: 64, protein: 2, carbs: 12, fat: 1, tags: [] },
    { name: "Large Potato & Gravy", calories: 261, protein: 8, carbs: 49, fat: 4, tags: [] },
    { name: "Regular Coleslaw", calories: 93, protein: 1, carbs: 14, fat: 3, tags: ["dairy", "vegetarian"] },
    { name: "Large Coleslaw", calories: 380, protein: 5, carbs: 58, fat: 14, tags: ["dairy", "vegetarian"] },
    { name: "Crunchy Jalapeno Slaw", calories: 192, protein: 3, carbs: 18, fat: 11, tags: ["dairy", "vegetarian"] },
    { name: "Dinner Roll", calories: 107, protein: 4, carbs: 17, fat: 2, tags: ["gluten", "vegetarian"] },
    { name: "Double Chocolate Mousse", calories: 356, protein: 3, carbs: 20, fat: 30, tags: ["dairy", "vegetarian"] },
    {
      name: "Zinger Stacker® Box (Pepsi Max)",
      calories: 1021,
      protein: 55,
      carbs: 90,
      fat: 49,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Zinger Stacker® Burger", calories: 737, protein: 51, carbs: 49, fat: 37 },
        { name: "Regular Chips", calories: 283, protein: 4, carbs: 41, fat: 12 },
        { name: "Pepsi Max (can)", calories: 1, protein: 0, carbs: 0, fat: 0 },
      ],
    },
    {
      name: "Zinger Stacker® Box (regular Pepsi)",
      calories: 1124,
      protein: 55,
      carbs: 117,
      fat: 49,
      tags: ["gluten", "dairy", "combo"],
      contents: [
        { name: "Zinger Stacker® Burger", calories: 737, protein: 51, carbs: 49, fat: 37 },
        { name: "Regular Chips", calories: 283, protein: 4, carbs: 41, fat: 12 },
        { name: "Regular Pepsi (cup)", calories: 104, protein: 0, carbs: 27, fat: 0 },
      ],
    },
    {
      name: "3 Pieces Wicked Boneless Box (Pepsi Max)",
      calories: 627,
      protein: 32,
      carbs: 59,
      fat: 29,
      tags: ["gluten", "combo"],
      contents: [
        { name: "3 Pieces Wicked Boneless", calories: 343, protein: 28, carbs: 18, fat: 17 },
        { name: "Regular Chips", calories: 283, protein: 4, carbs: 41, fat: 12 },
        { name: "Pepsi Max (can)", calories: 1, protein: 0, carbs: 0, fat: 0 },
      ],
    },
  ],
  // Rebuilt entirely from Subway Australia's own official "Australia
  // Nutrition Information" panel (October 2025, subway.com nutrition
  // PDF) — Subway AU's menu has moved on substantially from the old US-
  // style naming: no more plain "Steak & Cheese" (now Chipotle Steak
  // Melt), no "Subway Club"/"Spicy Italian" (discontinued), "Tuna" is
  // now "Tuna Mayo", "Chicken Teriyaki" is "Sweet Onion Chicken
  // Teriyaki". Footlong = exactly double the 6-inch, per Subway's own
  // published convention ("double values for approximate footlong sub
  // nutrition").
  subway: [
    { name: "BBQ Southern Style Chicken 6-inch", calories: 482, protein: 19, carbs: 63, fat: 16, tags: ["gluten", "dairy"] },
    { name: "Chicken & Bacon Ranch 6-inch", calories: 466, protein: 29, carbs: 39, fat: 21, tags: ["gluten", "dairy"] },
    { name: "Chicken Classic 6-inch", calories: 492, protein: 22, carbs: 48, fat: 23, tags: ["gluten", "dairy"] },
    { name: "Chicken Schnitzel 6-inch", calories: 538, protein: 30, carbs: 50, fat: 24, tags: ["gluten", "dairy"] },
    { name: "Chicken Strips 6-inch", calories: 382, protein: 26, carbs: 38, fat: 13, tags: ["gluten", "dairy"] },
    { name: "Chipotle Steak Melt 6-inch", calories: 485, protein: 25, carbs: 42, fat: 23, tags: ["gluten", "dairy"] },
    { name: "Honey Mustard Leg Ham 6-inch", calories: 391, protein: 21, carbs: 48, fat: 11, tags: ["gluten"] },
    { name: "Italian B.M.T. 6-inch", calories: 506, protein: 25, carbs: 43, fat: 26, tags: ["gluten", "dairy"] },
    { name: "Italian Meatball 6-inch", calories: 561, protein: 24, carbs: 52, fat: 28, tags: ["gluten", "dairy"] },
    { name: "Pizza Melt 6-inch", calories: 450, protein: 21, carbs: 43, fat: 21, tags: ["gluten", "dairy"] },
    { name: "Seafood Sensation 6-inch", calories: 464, protein: 15, carbs: 52, fat: 21, tags: ["gluten", "dairy", "shellfish"] },
    { name: "Smashed Falafel 6-inch", calories: 498, protein: 19, carbs: 58, fat: 19, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Sweet Onion Chicken Teriyaki 6-inch", calories: 396, protein: 25, carbs: 55, fat: 8, tags: ["gluten", "dairy"] },
    { name: "Tuna Mayo 6-inch", calories: 377, protein: 22, carbs: 38, fat: 15, tags: ["gluten", "dairy"] },
    { name: "Turkey on Rye 6-inch", calories: 394, protein: 24, carbs: 48, fat: 11, tags: ["gluten", "dairy"] },
    { name: "Veggie Delite with Avo 6-inch", calories: 377, protein: 16, carbs: 45, fat: 15, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Veggie Patty 6-inch", calories: 573, protein: 19, carbs: 67, fat: 24, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "BBQ Southern Style Chicken Footlong", calories: 964, protein: 39, carbs: 126, fat: 32, tags: ["gluten", "dairy"] },
    { name: "Chicken & Bacon Ranch Footlong", calories: 932, protein: 58, carbs: 78, fat: 42, tags: ["gluten", "dairy"] },
    { name: "Chicken Classic Footlong", calories: 984, protein: 45, carbs: 95, fat: 46, tags: ["gluten", "dairy"] },
    { name: "Chicken Schnitzel Footlong", calories: 1076, protein: 60, carbs: 99, fat: 47, tags: ["gluten", "dairy"] },
    { name: "Chicken Strips Footlong", calories: 764, protein: 52, carbs: 77, fat: 27, tags: ["gluten", "dairy"] },
    { name: "Chipotle Steak Melt Footlong", calories: 970, protein: 50, carbs: 85, fat: 45, tags: ["gluten", "dairy"] },
    { name: "Honey Mustard Leg Ham Footlong", calories: 782, protein: 43, carbs: 96, fat: 23, tags: ["gluten"] },
    { name: "Italian B.M.T. Footlong", calories: 1012, protein: 49, carbs: 85, fat: 52, tags: ["gluten", "dairy"] },
    { name: "Italian Meatball Footlong", calories: 1122, protein: 48, carbs: 104, fat: 57, tags: ["gluten", "dairy"] },
    { name: "Pizza Melt Footlong", calories: 900, protein: 43, carbs: 85, fat: 42, tags: ["gluten", "dairy"] },
    { name: "Seafood Sensation Footlong", calories: 928, protein: 29, carbs: 103, fat: 42, tags: ["gluten", "dairy", "shellfish"] },
    { name: "Smashed Falafel Footlong", calories: 996, protein: 37, carbs: 115, fat: 39, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Sweet Onion Chicken Teriyaki Footlong", calories: 792, protein: 51, carbs: 109, fat: 16, tags: ["gluten", "dairy"] },
    { name: "Tuna Mayo Footlong", calories: 754, protein: 44, carbs: 76, fat: 29, tags: ["gluten", "dairy"] },
    { name: "Turkey on Rye Footlong", calories: 788, protein: 48, carbs: 95, fat: 21, tags: ["gluten", "dairy"] },
    { name: "Veggie Delite with Avo Footlong", calories: 754, protein: 32, carbs: 89, fat: 29, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Veggie Patty Footlong", calories: 1146, protein: 38, carbs: 134, fat: 47, tags: ["gluten", "dairy", "vegetarian"] },
    // Salads — same fillings, no bread, so far lower carbs for the same
    // protein (official "regular salad" panel).
    { name: "Chicken & Bacon Ranch Salad (no bread)", calories: 291, protein: 23, carbs: 6, fat: 19, tags: ["dairy"] },
    { name: "Chicken Schnitzel Salad (no bread)", calories: 324, protein: 22, carbs: 15, fat: 20, tags: ["dairy"] },
    { name: "Sweet Onion Chicken Teriyaki Salad (no bread)", calories: 222, protein: 19, carbs: 22, fat: 6, tags: ["dairy"] },
    { name: "Tuna Mayo Salad (no bread)", calories: 204, protein: 15, carbs: 6, fat: 13, tags: ["dairy"] },
    { name: "Turkey Salad (no bread)", calories: 171, protein: 14, carbs: 13, fat: 7, tags: ["dairy"] },
    { name: "Chipotle Steak Melt Salad (no bread)", calories: 279, protein: 17, carbs: 9, fat: 19, tags: ["dairy"] },
    // Breakfast
    { name: "BLT with Egg & Cheese 6-inch", calories: 434, protein: 19, carbs: 40, fat: 21, tags: ["gluten", "dairy", "egg"] },
    { name: "Classic Ham & Egg 6-inch", calories: 391, protein: 22, carbs: 38, fat: 16, tags: ["gluten", "dairy", "egg"] },
    { name: "Steak & Egg Brekkie 6-inch", calories: 499, protein: 32, carbs: 51, fat: 17, tags: ["gluten", "dairy", "egg"] },
    { name: "Mexican-Style Brekkie Wrap", calories: 554, protein: 23, carbs: 46, fat: 31, tags: ["gluten", "dairy", "egg"] },
    // Sides & sweet
    { name: "Southern Style Chicken Bites (no sauce)", calories: 324, protein: 13, carbs: 30, fat: 17, tags: ["gluten"] },
    { name: "Chipotle Quesadilla", calories: 288, protein: 8, carbs: 22, fat: 19, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Chocolate Chip Cookie", calories: 223, protein: 2, carbs: 29, fat: 11, tags: ["gluten", "dairy", "vegetarian"] },
  ],
  // Burger King doesn't exist in Australia — this chain trades as Hungry
  // Jack's here (same company, same menu, different name on the sign),
  // so that's the name used everywhere a client or the UI sees it.
  // Rebuilt from Hungry Jack's Australia's own published nutrition data
  // (hungryjacks.com.au) — the current AU Whopper range runs
  // Junior/standard/Double/Triple (+ Cheese tiers), not the old
  // "Angry"/"Rebel"/plain-Double-Cheeseburger lineup that used to be
  // coded here.
  "hungry jack's": [
    { name: "Whopper Junior", calories: 332, protein: 14, carbs: 30, fat: 24, tags: ["gluten"] },
    { name: "Whopper", calories: 645, protein: 26, carbs: 48, fat: 39, tags: ["gluten"] },
    { name: "Whopper Double", calories: 847, protein: 47, carbs: 47, fat: 66, tags: ["gluten"] },
    { name: "Whopper Double Cheese", calories: 992, protein: 56, carbs: 48, fat: 78, tags: ["gluten", "dairy"] },
    { name: "Whopper Triple", calories: 1111, protein: 67, carbs: 47, fat: 87, tags: ["gluten"] },
    { name: "Whopper Triple Cheese", calories: 1331, protein: 80, carbs: 49, fat: 105, tags: ["gluten", "dairy"] },
    { name: "Ultimate Double Whopper", calories: 1052, protein: 63, carbs: 48, fat: 81, tags: ["gluten", "dairy"] },
    { name: "Cowboy Whopper Double", calories: 1170, protein: 64, carbs: 59, fat: 89, tags: ["gluten", "dairy"] },
    { name: "Hamburger", calories: 285, protein: 14, carbs: 28, fat: 13, tags: ["gluten"] },
    { name: "Cheeseburger", calories: 322, protein: 16, carbs: 28, fat: 16, tags: ["gluten", "dairy"] },
    { name: "Grilled Chicken Spicy", calories: 332, protein: 22, carbs: 27, fat: 15, tags: ["gluten"] },
    { name: "Grilled Chicken Classic Cheese & Bacon", calories: 418, protein: 28, carbs: 27, fat: 22, tags: ["gluten", "dairy"] },
    { name: "Napoletana Grilled Chicken", calories: 421, protein: 32, carbs: 34, fat: 32, tags: ["gluten", "dairy"] },
    { name: "Pork Belly Deluxe", calories: 660, protein: 46, carbs: 37, fat: 44, tags: ["gluten", "dairy"] },
    { name: "Big Jack Angus", calories: 1024, protein: 66, carbs: 37, fat: 69, tags: ["gluten", "dairy"] },
    { name: "Big Jack Double", calories: 822, protein: 45, carbs: 36, fat: 56, tags: ["gluten", "dairy"] },
    { name: "Grill Masters Smoky Chipotle Double", calories: 1190, protein: 79, carbs: 31, fat: 85, tags: ["gluten", "dairy"] },
    { name: "Grill Masters Angus Bacon & Cheese Double", calories: 1307, protein: 89, carbs: 32, fat: 93, tags: ["gluten", "dairy"] },
    { name: "Grill Masters Angus Cowboy Double", calories: 1353, protein: 85, carbs: 38, fat: 97, tags: ["gluten", "dairy"] },
    { name: "Grill Masters BBQ Smokehouse Angus Double", calories: 1224, protein: 80, carbs: 35, fat: 93, tags: ["gluten", "dairy"] },
    { name: "Nugget (3 Pack)", calories: 130, protein: 7, carbs: 6, fat: 11, tags: ["gluten"] },
    { name: "Nugget Carry Cup", calories: 440, protein: 11, carbs: 21, fat: 52, tags: ["gluten"] },
    { name: "JFC Tender Snack Wrap — Smoky BBQ", calories: 237, protein: 10, carbs: 11, fat: 25, tags: ["gluten"] },
    { name: "JFC Tender Snack Wrap — Spicy", calories: 261, protein: 10, carbs: 15, fat: 22, tags: ["gluten"] },
    { name: "JFC Saucy Tender Peri Peri (3 Pack)", calories: 485, protein: 24, carbs: 28, fat: 34, tags: ["gluten"] },
    { name: "Chips (Small)", calories: 254, protein: 3, carbs: 34, fat: 12, tags: ["vegetarian"] },
    { name: "Onion Rings (Medium)", calories: 286, protein: 3, carbs: 20, fat: 24, tags: ["gluten", "vegetarian"] },
    { name: "Toastie Cheese", calories: 260, protein: 11, carbs: 11, fat: 27, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Toastie Ham Cheese", calories: 287, protein: 16, carbs: 12, fat: 28, tags: ["gluten", "dairy"] },
    { name: "Turkish Bread Bacon Egg", calories: 222, protein: 13, carbs: 17, fat: 5, tags: ["gluten", "dairy", "egg"] },
    { name: "Turkish Bread Sausage Egg", calories: 489, protein: 27, carbs: 26, fat: 36, tags: ["gluten", "dairy", "egg"] },
    { name: "Turkish Bread Sausage Egg Double", calories: 646, protein: 39, carbs: 38, fat: 37, tags: ["gluten", "dairy", "egg"] },
    { name: "Turkish Bread Mega", calories: 550, protein: 33, carbs: 30, fat: 37, tags: ["gluten", "dairy", "egg"] },
    { name: "Jack's Brekky Roll", calories: 592, protein: 35, carbs: 31, fat: 37, tags: ["gluten", "dairy", "egg"] },
    { name: "Sausage Brekky Wrap", calories: 590, protein: 37, carbs: 36, fat: 33, tags: ["gluten", "dairy", "egg"] },
    { name: "Wrap Mega Brekky", calories: 962, protein: 55, carbs: 48, fat: 62, tags: ["gluten", "dairy", "egg"] },
    { name: "Soft Serve Cone", calories: 306, protein: 8, carbs: 47, fat: 9, tags: ["dairy", "vegetarian"] },
    { name: "Pudding Sticky Date", calories: 229, protein: 2, carbs: 29, fat: 12, tags: ["gluten", "dairy", "vegetarian"] },
    {
      name: "Small Whopper Meal (Coke No Sugar)",
      calories: 900,
      protein: 29,
      carbs: 82,
      fat: 51,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Whopper", calories: 645, protein: 26, carbs: 48, fat: 39 },
        { name: "Chips (Small)", calories: 254, protein: 3, carbs: 34, fat: 12 },
        { name: "Coke No Sugar (small)", calories: 1, protein: 0, carbs: 0, fat: 0 },
      ],
    },
    {
      name: "Small Grilled Chicken Meal (Coke No Sugar)",
      calories: 587,
      protein: 25,
      carbs: 61,
      fat: 27,
      tags: ["gluten", "combo"],
      contents: [
        { name: "Grilled Chicken Spicy", calories: 332, protein: 22, carbs: 27, fat: 15 },
        { name: "Chips (Small)", calories: 254, protein: 3, carbs: 34, fat: 12 },
        { name: "Coke No Sugar (small)", calories: 1, protein: 0, carbs: 0, fat: 0 },
      ],
    },
  ],
  // Rebuilt from dominos.com.au's own live nutrition calculator (per-
  // slice Classic Crust figures, Classic Crust = 8 slices/pizza) —
  // doubled/quadrupled exactly for 2-slice and 4-slice serves. Sides,
  // wings, tenders, nuggets and desserts are each a single whole-pack
  // serving as sold, straight from the same calculator.
  "domino's": [
    { name: "Margarita Pizza (2 slices)", calories: 232, protein: 10, carbs: 33, fat: 6, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Margarita Pizza (4 slices)", calories: 464, protein: 20, carbs: 66, fat: 12, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Pepperoni Pizza (2 slices)", calories: 274, protein: 12, carbs: 33, fat: 10, tags: ["gluten", "dairy"] },
    { name: "Pepperoni Pizza (4 slices)", calories: 548, protein: 24, carbs: 66, fat: 20, tags: ["gluten", "dairy"] },
    { name: "Ham & Cheese Pizza (2 slices)", calories: 246, protein: 12, carbs: 33, fat: 7, tags: ["gluten", "dairy"] },
    { name: "Ham & Cheese Pizza (4 slices)", calories: 492, protein: 24, carbs: 67, fat: 13, tags: ["gluten", "dairy"] },
    { name: "Hawaiian Pizza (2 slices)", calories: 262, protein: 12, carbs: 37, fat: 6, tags: ["gluten", "dairy"] },
    { name: "Hawaiian Pizza (4 slices)", calories: 524, protein: 24, carbs: 74, fat: 12, tags: ["gluten", "dairy"] },
    { name: "BBQ Meatlovers Pizza (2 slices)", calories: 306, protein: 14, carbs: 37, fat: 11, tags: ["gluten", "dairy"] },
    { name: "BBQ Meatlovers Pizza (4 slices)", calories: 612, protein: 27, carbs: 74, fat: 22, tags: ["gluten", "dairy"] },
    { name: "Supreme Pizza (2 slices)", calories: 294, protein: 13, carbs: 34, fat: 11, tags: ["gluten", "dairy"] },
    { name: "Supreme Pizza (4 slices)", calories: 588, protein: 26, carbs: 68, fat: 22, tags: ["gluten", "dairy"] },
    { name: "Mega Meatlovers Pizza (2 slices)", calories: 346, protein: 16, carbs: 40, fat: 13, tags: ["gluten", "dairy"] },
    { name: "Mega Meatlovers Pizza (4 slices)", calories: 692, protein: 32, carbs: 79, fat: 26, tags: ["gluten", "dairy"] },
    { name: "Chicken Supreme Pizza (2 slices)", calories: 252, protein: 12, carbs: 34, fat: 7, tags: ["gluten", "dairy"] },
    { name: "Chicken Supreme Pizza (4 slices)", calories: 504, protein: 24, carbs: 69, fat: 13, tags: ["gluten", "dairy"] },
    { name: "Butter Chicken Pizza (2 slices)", calories: 272, protein: 13, carbs: 34, fat: 7, tags: ["gluten", "dairy"] },
    { name: "Butter Chicken Pizza (4 slices)", calories: 544, protein: 25, carbs: 68, fat: 14, tags: ["gluten", "dairy"] },
    { name: "Peri Peri Chicken Pizza (2 slices)", calories: 284, protein: 13, carbs: 36, fat: 9, tags: ["gluten", "dairy"] },
    { name: "Peri Peri Chicken Pizza (4 slices)", calories: 568, protein: 25, carbs: 72, fat: 18, tags: ["gluten", "dairy"] },
    { name: "BBQ Chicken & Bacon Pizza (2 slices)", calories: 302, protein: 14, carbs: 37, fat: 11, tags: ["gluten", "dairy"] },
    { name: "BBQ Chicken & Bacon Pizza (4 slices)", calories: 604, protein: 28, carbs: 74, fat: 21, tags: ["gluten", "dairy"] },
    { name: "The Lot Pizza (2 slices)", calories: 380, protein: 16, carbs: 36, fat: 19, tags: ["gluten", "dairy"] },
    { name: "The Lot Pizza (4 slices)", calories: 760, protein: 31, carbs: 72, fat: 38, tags: ["gluten", "dairy"] },
    { name: "Vegan Margherita Pizza (2 slices)", calories: 236, protein: 5, carbs: 37, fat: 6, tags: ["gluten", "vegetarian"] },
    { name: "Vegan Margherita Pizza (4 slices)", calories: 472, protein: 10, carbs: 74, fat: 11, tags: ["gluten", "vegetarian"] },
    { name: "Vegan Spicy Veg Supreme Pizza (2 slices)", calories: 254, protein: 6, carbs: 39, fat: 7, tags: ["gluten", "vegetarian"] },
    { name: "Vegan Spicy Veg Supreme Pizza (4 slices)", calories: 508, protein: 12, carbs: 78, fat: 14, tags: ["gluten", "vegetarian"] },
    { name: "New Yorker The Big Cheese (2 slices)", calories: 690, protein: 35, carbs: 70, fat: 29, tags: ["gluten", "dairy"] },
    { name: "New Yorker Pepperoni Boss (2 slices)", calories: 670, protein: 31, carbs: 70, fat: 28, tags: ["gluten", "dairy"] },
    { name: "Garlic Bread", calories: 532, protein: 12, carbs: 70, fat: 21, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Cheesy Garlic Bread", calories: 669, protein: 23, carbs: 71, fat: 32, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Crispy Chips with Domino's Pizza Salt", calories: 487, protein: 6, carbs: 48, fat: 25, tags: ["vegetarian"] },
    { name: "Pepperoni Stuffed Cheesy Bread", calories: 606, protein: 25, carbs: 66, fat: 27, tags: ["gluten", "dairy"] },
    { name: "Triple Cheese Bites (5pk)", calories: 295, protein: 13, carbs: 24, fat: 16, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Saucy Chicken Wings — No Sauce (5pk)", calories: 374, protein: 34, carbs: 5, fat: 24, tags: ["gluten"] },
    { name: "Saucy Chicken Wings — BBQ Sauce (5pk)", calories: 427, protein: 35, carbs: 17, fat: 24, tags: ["gluten"] },
    { name: "Saucy Chicken Wings — Garlic Butter Sauce (5pk)", calories: 651, protein: 36, carbs: 9, fat: 53, tags: ["gluten", "dairy"] },
    { name: "Saucy Chicken Tenders — No Sauce (4pk)", calories: 325, protein: 23, carbs: 24, fat: 15, tags: ["gluten"] },
    { name: "Saucy Chicken Tenders — BBQ Sauce (4pk)", calories: 407, protein: 24, carbs: 43, fat: 15, tags: ["gluten"] },
    { name: "Chicken Nuggets (6pk)", calories: 277, protein: 17, carbs: 17, fat: 16, tags: ["gluten"] },
    { name: "Saucy Chicken Nuggets — BBQ Sauce (6pk)", calories: 331, protein: 18, carbs: 29, fat: 16, tags: ["gluten"] },
    { name: "Chocolate Lava Cake", calories: 399, protein: 4, carbs: 48, fat: 21, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Churros with Choc Dipping Sauce (4pk)", calories: 547, protein: 6, carbs: 62, fat: 30, tags: ["gluten", "dairy", "vegetarian"] },
  ],
  // New addition — Grill'd Australia's own published figures
  // (fatsecret.com.au, which pulls from Grill'd's own data). Grill'd
  // explicitly markets high-protein options (the "Signature Beef
  // Burger" entry here is the bunless beef patty on its own), so this
  // is a genuinely strong chain for the "high protein, lowish calorie"
  // default ranking.
  grilld: [
    { name: "Signature Beef Burger (patty only)", calories: 287, protein: 26, carbs: 3, fat: 19, tags: [] },
    { name: "Snack Slider", calories: 275, protein: 17, carbs: 21, fat: 13, tags: ["gluten"] },
    { name: "Hotbird (Traditional Bun)", calories: 425, protein: 42, carbs: 26, fat: 15, tags: ["gluten"] },
    { name: "Sweet Chilli Chicken (Traditional Bun)", calories: 483, protein: 42, carbs: 38, fat: 17, tags: ["gluten"] },
    { name: "Simon Says' (Traditional Bun)", calories: 502, protein: 43, carbs: 32, fat: 21, tags: ["gluten", "dairy"] },
    { name: "Simply Grill'd (Traditional Bun)", calories: 598, protein: 28, carbs: 30, fat: 33, tags: ["gluten"] },
    { name: "Healthy Fried Chicken Bites (6 Bites)", calories: 261, protein: 24, carbs: 18, fat: 10, tags: ["gluten"] },
    { name: "Chicken Caesar Salad", calories: 576, protein: 51, carbs: 15, fat: 34, tags: ["dairy", "egg"] },
    { name: "Famous Grill'd Chips (Regular)", calories: 588, protein: 4, carbs: 70, fat: 28, tags: ["vegetarian"] },
    { name: "Sweet Potato Chips (Regular)", calories: 540, protein: 5, carbs: 67, fat: 26, tags: ["vegetarian"] },
    { name: "Herbed Mayo Dip", calories: 218, protein: 1, carbs: 3, fat: 23, tags: ["egg"] },
  ],
  // Rebuilt from Nando's Australia's own published nutrition data
  // (nandos.com.au, via the same official-source aggregator used for the
  // other chains above). The current AU menu sells Half chicken (not a
  // separate Quarter product) — "Quarter" below is exactly half of the
  // real Half-chicken figure, same whole-divided-evenly logic as a pizza
  // slice, not an estimate.
  "nando's": [
    { name: "1/4 PERi-PERi Chicken", calories: 358, protein: 54, carbs: 1, fat: 15, tags: [] },
    { name: "1/2 PERi-PERi Chicken", calories: 715, protein: 108, carbs: 1, fat: 31, tags: [] },
    { name: "4 PERi-PERi Grilled Tenders", calories: 220, protein: 40, carbs: 1, fat: 7, tags: [] },
    { name: "BBQ Chicken Ribs", calories: 297, protein: 30, carbs: 4, fat: 18, tags: [] },
    { name: "PERinaise Classic Burger", calories: 496, protein: 41, carbs: 43, fat: 17, tags: ["gluten", "dairy"] },
    { name: "Double Cheese & Bacon Burger", calories: 667, protein: 47, carbs: 48, fat: 31, tags: ["gluten", "dairy"] },
    { name: "Avo Goodness Burger", calories: 568, protein: 38, carbs: 52, fat: 22, tags: ["gluten"] },
    { name: "The Halloumi Burger", calories: 599, protein: 40, carbs: 54, fat: 25, tags: ["gluten", "dairy"] },
    { name: "Nandoca's Choice Burger", calories: 649, protein: 43, carbs: 46, fat: 32, tags: ["gluten", "dairy"] },
    { name: "Supremo Burger", calories: 648, protein: 42, carbs: 53, fat: 29, tags: ["gluten", "dairy"] },
    { name: "The Great Pretender Protein Burger", calories: 297, protein: 17, carbs: 10, fat: 5, tags: ["gluten", "vegetarian"] },
    { name: "Mediterranean Salad with Chicken", calories: 581, protein: 38, carbs: 15, fat: 35, tags: ["dairy"] },
    { name: "Mediterranean Salad", calories: 415, protein: 8, carbs: 15, fat: 30, tags: ["dairy", "vegetarian"] },
    { name: "Grain Salad", calories: 221, protein: 8, carbs: 19, fat: 6, tags: ["vegetarian"] },
    { name: "Avo Parmesan Crunch Salad", calories: 259, protein: 11, carbs: 7, fat: 21, tags: ["dairy", "vegetarian"] },
    { name: "Roasted Broccoli with PERi-Crackle", calories: 339, protein: 11, carbs: 3, fat: 30, tags: ["vegetarian"] },
    { name: "PERi-Harvest Bowl", calories: 421, protein: 10, carbs: 27, fat: 23, tags: ["vegetarian"] },
    { name: "PERi-PERi Chips (Regular)", calories: 326, protein: 5, carbs: 45, fat: 13, tags: ["vegetarian"] },
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
  // Rebuilt from Starbucks Australia's own published food nutrition data.
  // The old list here was the US Starbucks menu (Protein Box, Bacon &
  // Gruyere Sandwich, Egg White & Spinach Wrap) — none of which are
  // actually sold at Starbucks in Australia. Coffee drinks are left out
  // (AU food panel reports them at ~0-4 kcal black, with milk/syrup
  // added separately per order, so there's no single fixed "grande
  // latte" figure to give here without guessing the milk/syrup choice).
  starbucks: [
    { name: "Chicken Caesar Wrap", calories: 516, protein: 30, carbs: 44, fat: 26, tags: ["gluten", "dairy", "egg"] },
    { name: "Chicken & Avocado Panini", calories: 576, protein: 31, carbs: 62, fat: 22, tags: ["gluten", "dairy"] },
    { name: "Chicken & Avocado Wrap", calories: 459, protein: 23, carbs: 46, fat: 19, tags: ["gluten"] },
    { name: "Spicy Fried Chicken and Slaw Deli Roll", calories: 626, protein: 27, carbs: 58, fat: 31, tags: ["gluten", "dairy"] },
    { name: "Sausage & Egg Muffin", calories: 435, protein: 25, carbs: 31, fat: 24, tags: ["gluten", "dairy", "egg"] },
    { name: "Bacon, Egg & Cheese Brekky Roll", calories: 423, protein: 22, carbs: 47, fat: 18, tags: ["gluten", "dairy", "egg"] },
    { name: "Triple Smoked Ham, Cheese & Salad Sandwich", calories: 409, protein: 27, carbs: 40, fat: 14, tags: ["gluten", "dairy"] },
    { name: "Ham & Cheese Toastie", calories: 471, protein: 24, carbs: 55, fat: 16, tags: ["gluten", "dairy"] },
    { name: "Egg, Chive & Parmesan Bagel", calories: 590, protein: 25, carbs: 62, fat: 26, tags: ["gluten", "dairy", "egg"] },
    { name: "Spinach & Ricotta Roll", calories: 285, protein: 11, carbs: 37, fat: 11, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Spinach & Feta Croissant", calories: 383, protein: 12, carbs: 33, fat: 22, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Spicy Bean & Veg Burrito", calories: 509, protein: 12, carbs: 59, fat: 24, tags: ["gluten", "vegetarian"] },
    { name: "Plain Bagel", calories: 313, protein: 11, carbs: 61, fat: 2, tags: ["gluten", "vegetarian"] },
    { name: "Butter Croissant", calories: 352, protein: 6, carbs: 39, fat: 19, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Cheese & Bacon Danish", calories: 353, protein: 8, carbs: 33, fat: 21, tags: ["gluten", "dairy"] },
    { name: "Health Lab Dubai Choc Protein Ball", calories: 182, protein: 5, carbs: 9, fat: 11, tags: ["dairy", "vegetarian"] },
    { name: "Health Lab Matcha & Strawberry Protein Bar", calories: 188, protein: 10, carbs: 17, fat: 6, tags: ["dairy", "vegetarian"] },
    { name: "Health Lab Chocolate Protein Wafer Bar", calories: 229, protein: 8, carbs: 16, fat: 15, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Chocolate Protein Crispy Slice", calories: 196, protein: 5, carbs: 19, fat: 11, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Pistachio Protein Crispy Slice", calories: 217, protein: 6, carbs: 20, fat: 12, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Kettle Chips Original Sea Salt (45g)", calories: 224, protein: 3, carbs: 24, fat: 12, tags: ["vegetarian"] },
    { name: "Confetti Cookie", calories: 284, protein: 4, carbs: 41, fat: 11, tags: ["gluten", "dairy", "vegetarian"] },
    { name: "Lemon Meringue Tart", calories: 320, protein: 5, carbs: 46, fat: 13, tags: ["gluten", "dairy", "egg", "vegetarian"] },
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
    {
      name: "Seafood Basket (fish, calamari, scallops & chips)",
      calories: 1179,
      protein: 54,
      carbs: 98,
      fat: 63,
      tags: ["gluten", "shellfish", "combo"],
      contents: [
        { name: "Battered Fish (1 piece)", calories: 343, protein: 21, carbs: 21, fat: 19 },
        { name: "Calamari Rings (fried)", calories: 316, protein: 19, carbs: 19, fat: 18 },
        { name: "Scallops (fried, 6pc)", calories: 220, protein: 10, carbs: 18, fat: 12 },
        { name: "Chips (shop serve)", calories: 300, protein: 4, carbs: 40, fat: 14 },
      ],
    },
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
  grilld: ["grill'd", "grilld", "grill d"],
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
  grilld: "Grill'd",
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

// "Eating out" (with no restaurant named yet) should prompt for which
// chain rather than silently falling through to home-cooked meal-library
// suggestions — that's not what someone typing this actually wants.
function wantsEatingOut(message) {
  return /\beating out\b|\bgoing out to eat\b|\btake ?away\b|\bfast food\b|\bwhat should i order\b/i.test(message);
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
    // Only present on home-cook meal-library suggestions (never on a
    // restaurant item, which has nothing to cook) — lets the UI show
    // real step-by-step instructions instead of just an ingredient list.
    instructions: item.instructions || undefined,
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

  if (!brand && wantsEatingOut(message)) {
    return {
      reply:
        "Which one? Tap a chain below or just type it — McDonald's, KFC, Hungry Jack's, Subway, Domino's, Grill'd, Nando's, Taco Bell, Starbucks, 7-Eleven, APCO, or fish and chips — and I'll find what fits best with what you've got left today.",
      suggestions: [],
    };
  }

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
    // Real step-by-step method from the meal library — this is what
    // lets the detail sheet show "how to cook it" for a home-cook pick.
    instructions: meal.instructions,
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
