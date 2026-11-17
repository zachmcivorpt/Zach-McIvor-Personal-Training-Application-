// Generator for the "Insta" batch: 100 popular, high-protein meals in the
// style of Australian fitness Instagram (healthy chicken parma bowl,
// Greek-yoghurt potato salad, baked oats...), 34 breakfasts, 33 lunches,
// 33 dinners. Every ingredient is a real entry in the app's own Food
// Library (src/lib/foodDatabase.js) — most are the Australian brand
// products themselves (Bulla, Mission, Perfect Italiano, Coles Perform,
// Helga's, Remano, Hans, D'Orsogna...) — so each meal's macros are the
// exact sum of its ingredient lines. Every label says whether the amount
// is weighed raw or cooked, because that changes the numbers.
//
// Run: node scripts/viteRun.mjs scripts/genInstaMealsAU.mjs
// Writes src/lib/instaMealsAU.js.
import fs from "fs";
import { FOOD_DATABASE } from "../src/lib/foodDatabase.js";
import { INSTA_MEAL_PHOTOS } from "./instaMealPhotos.mjs";

const byId = Object.fromEntries(FOOD_DATABASE.map((f) => [f.id, f]));

// alias: [food id, label shown to the coach/client, display unit]
const A = {
  // Proteins
  CB: ["m01", "Chicken breast, cooked weight — Coles RSPCA Approved Chicken Breast Fillets"],
  CT: ["m02", "Chicken thigh, skinless, cooked weight — Coles RSPCA Approved Chicken Thigh Fillets"],
  CM: ["m23", "Chicken mince, raw weight — Coles RSPCA Approved Chicken Mince"],
  BM: ["al175", "Lean beef mince 5% fat, raw weight — Aldi 5% Lean Beef Mince"],
  TM: ["m32", "Turkey mince, raw weight — Steggles Turkey Mince"],
  LMB: ["m28", "Lamb mince, raw weight — Coles Australian Lamb Mince"],
  LAMB: ["m12", "Lamb leg, roasted, cooked weight — Coles Australian Lamb Leg"],
  STK: ["m38", "Rump steak, lean, cooked weight — Coles Australian Beef Rump Steak"],
  SAL: ["f01", "Salmon fillet, raw weight — Coles Tasmanian Salmon Portions"],
  PRW: ["f07", "Prawns, cooked & peeled — Coles Cooked Australian Prawns"],
  TUNA: ["f02", "Tuna in springwater, drained — John West Tuna Chunks in Springwater"],
  SS: ["f09", "Smoked salmon — Coles Smoked Salmon Slices"],
  FISH: ["f05", "Barramundi fillet, raw weight — Coles Barramundi Fillets"],
  BAC: ["bn155", "Short cut bacon — Hans Rindless Short Cut Bacon"],
  HAM: ["bn2069", "Shaved leg ham 97% fat free — D'Orsogna Family Classic Ham"],
  SHC: ["w141", "Shaved chicken breast — Coles Deli Style Shaved Chicken Breast"],
  TURK: ["m04", "Turkey breast, sliced, cooked — Ingham's Turkey Breast"],
  CHZ: ["bn157", "Chorizo — Don Chorizo Minis"],
  EGG: ["d01", "Eggs, whole — Woolworths Free Range Eggs", "eggs"],
  EW: ["d02", "Egg whites — Woolworths Egg Whites", "ml"],
  // Dairy
  GY: ["d06", "Greek yoghurt, low fat — Coles High Protein Greek Style Natural Yoghurt"],
  CF: ["pr221", "Chobani Fit High Protein Greek Yogurt Vanilla (170g tub)"],
  YPC: ["pr219", "YoPro High Protein Yoghurt Salted Caramel (160g tub)"],
  CC: ["w023", "Cottage cheese — Bulla Cottage Cheese"],
  RIC: ["d15", "Ricotta — Coles Ricotta"],
  MOZ: ["bn044", "Mozzarella, shredded — Perfect Italiano Shredded Mozzarella"],
  LTC: ["al093", "Light tasty cheese, shredded — Westacre Light Tasty (Aldi)"],
  PAR: ["bn045", "Parmesan, shredded — Perfect Italiano Shredded Parmesan"],
  FETA: ["d11", "Feta — Coles Danish Feta"],
  SWISS: ["d24", "Swiss cheese slice — Coles Swiss Cheese Slices"],
  BLUE: ["d25", "Blue cheese — Castello Blue"],
  PCL: ["bn047", "Light cream cheese — Philadelphia Light"],
  BUT: ["d13", "Butter — Western Star"],
  SKIM: ["d04", "Skim milk — Coles Skim Milk", "ml"],
  // Supplements
  WHV: ["pr105", "Whey protein, vanilla — Coles Perform Whey Protein Powder Vanilla"],
  WHC: ["pr104", "Whey protein, chocolate — Coles Perform Whey Protein Powder Chocolate"],
  // Carbs
  OATS: ["w155", "Rolled oats — Coles Rolled Oats"],
  GRAN: ["bn133", "Granola — Carman's Protein Rich Granola Almond & Hazelnut"],
  SOUR: ["w049", "Sourdough bread — Coles Bakery Sourdough"],
  PBREAD: ["w039", "High-protein bread — Helga's Protein Bread"],
  WMB: ["w036", "Wholemeal bread — Helga's Wholemeal"],
  WRAP: ["bn116", "Low fat tortilla wrap — Mission Low Fat Tortillas"],
  WWRAP: ["w040", "Wholemeal wrap — Mission Wholemeal Wraps"],
  TORT: ["bn114", "Small flour tortillas — Mission Original Tortillas"],
  CORNT: ["g40", "Corn tortillas — Mission Corn Tortillas"],
  BAGEL: ["w162", "Bagel — Coles Bagels"],
  NAAN: ["g36", "Naan bread — Coles Naan"],
  BUN: ["g52", "Wholemeal burger bun — Coles Wholemeal Burger Buns"],
  RICE: ["g04", "Jasmine rice, cooked weight — SunRice Jasmine"],
  WRICE: ["g01", "White rice (medium grain), cooked weight — SunRice Medium Grain"],
  BAS: ["g03", "Basmati rice, cooked weight — SunRice Basmati"],
  QUIN: ["g05", "Quinoa, cooked weight — Coles Quinoa"],
  PASTA: ["g41", "Penne, cooked weight — San Remo Penne"],
  SPAG: ["g16", "Spaghetti/linguine, cooked weight — San Remo"],
  FETT: ["g14", "Fettuccine, cooked weight — San Remo"],
  MAC: ["g42", "Macaroni, cooked weight — San Remo Macaroni"],
  LAS: ["g43", "Lasagne sheets, cooked weight — San Remo Lasagne Sheets"],
  GNOC: ["w143", "Potato gnocchi — San Remo Fresh Gnocchi"],
  VERM: ["afcddb_F006038", "Rice vermicelli, cooked weight — Lucky Vermicelli"],
  HOK: ["w166", "Hokkien noodles — Fantastic Hokkien Noodles"],
  RAMEN: ["afcddb_F006048", "Fresh ramen (wheat) noodles, cooked weight"],
  EGGN: ["g17", "Egg noodles, cooked weight — Chang's Egg Noodles"],
  POT: ["v06", "Potato, cooked weight — Coles Brushed / Baby Potatoes"],
  SWP: ["v05", "Sweet potato, cooked weight — Coles Sweet Potato"],
  RCAKE: ["g13", "Rice cakes — Coles Rice Cakes"],
  CRUMB: ["bk15", "Breadcrumbs — Coles Breadcrumbs"],
  FLOUR: ["bk01", "Plain flour — White Wings"],
  CORNF: ["w180", "Cornflour — Manildra Cornflour"],
  BPOW: ["bk07", "Baking powder — Lighthouse"],
  // Fruit
  BAN: ["r01", "Banana — Coles Cavendish Bananas"],
  BLU: ["r05", "Blueberries — Coles Blueberries"],
  STR: ["r04", "Strawberries — Coles Strawberries"],
  RASP: ["w195", "Raspberries, frozen — Coles Frozen Raspberries"],
  MB: ["r50", "Mixed berries, frozen — Coles Frozen Mixed Berries"],
  APP: ["r02", "Apple — Pink Lady"],
  MANGO: ["r09", "Mango — Coles Mango"],
  LEMON: ["r44", "Lemon juice & zest"],
  LIME: ["r43", "Lime juice"],
  // Veg & herbs
  SPIN: ["v02", "Baby spinach — Coles Baby Spinach"],
  ROCK: ["w148", "Rocket — Coles Perfection Rocket"],
  COS: ["v22", "Cos / iceberg lettuce"],
  LEAVES: ["v61", "Mixed salad leaves — Coles Mixed Salad Leaves"],
  TOM: ["v11", "Tomato — Coles Truss Tomatoes"],
  CTOM: ["v12", "Cherry tomatoes — Coles Cherry Tomatoes"],
  CUC: ["v10", "Lebanese cucumber"],
  CAPS: ["v13", "Capsicum"],
  ONION: ["v14", "Onion (brown or red)"],
  SPRING: ["v47", "Spring onion"],
  GARLIC: ["v27", "Garlic, fresh"],
  GINGER: ["v48", "Ginger, fresh"],
  CHILLI: ["afcddb_F002901", "Red chilli, fresh"],
  MUSH: ["v15", "Mushrooms — Coles Cup Mushrooms"],
  ZUC: ["v09", "Zucchini"],
  BROC: ["v01", "Broccoli"],
  CARROT: ["v04", "Carrot"],
  CABB: ["v21", "Cabbage (slaw)"],
  CELERY: ["v26", "Celery"],
  LEEK: ["v37", "Leek"],
  CORN: ["v29", "Corn kernels, canned, drained — Edgell Corn Kernels"],
  PEAS: ["v17", "Peas — Birds Eye Garden Peas"],
  BEANSG: ["v16", "Green beans"],
  BOK: ["v31", "Baby bok choy"],
  SPROUT: ["l20", "Bean sprouts"],
  WCHEST: ["v41", "Water chestnuts — Ayam Water Chestnuts"],
  AVO: ["v28", "Avocado — Hass"],
  GHERK: ["v54", "Gherkins — Coles Sliced Gherkins"],
  OLIVE: ["v53", "Kalamata olives"],
  SDT: ["w170", "Sun-dried tomatoes in oil, drained — Coles"],
  KIMCHI: ["v56", "Kimchi"],
  NORI: ["v57", "Nori — Obento Nori Sheets"],
  CORI: ["afcddb_F003192", "Coriander, fresh"],
  PARS: ["afcddb_F006321", "Parsley, fresh"],
  BASIL: ["afcddb_F000396", "Basil, fresh"],
  // Legumes
  BLACKB: ["l01", "Black beans, drained — Coles Black Beans"],
  KIDNEY: ["l02", "Red kidney beans, drained — Coles Red Kidney Beans"],
  EDAM: ["l05", "Edamame, shelled — Coles Frozen Edamame"],
  BBEANS: ["l06", "Baked beans — Heinz Baked Beanz"],
  HUMMUS: ["l09", "Hummus — Coles Hummus Dip"],
  // Nuts, seeds, fats
  PB: ["w071", "Peanut butter, smooth — Bega"],
  PEANUT: ["n04", "Peanuts, roasted — Coles Dry Roasted Peanuts"],
  ALMOND: ["n01", "Almonds — Coles Australian Almonds"],
  WALNUT: ["n02", "Walnuts — Coles Walnuts"],
  CHIA: ["n08", "Chia seeds — Coles Chia Seeds"],
  COCO: ["n15", "Shredded coconut — McKenzie's"],
  SESAME: ["n23", "Sesame seeds"],
  OIL: ["n12", "Olive oil — Cobram Estate Extra Virgin"],
  SOIL: ["n27", "Sesame oil — Ayam"],
  COCOM: ["w063", "Coconut milk — Ayam Coconut Milk", "ml"],
  // Sauces & pantry
  PASS: ["al114", "Passata — Remano Passata (Aldi)"],
  DTOM: ["bn111", "Chopped tomatoes — Mutti Polpa"],
  TPASTE: ["bn058", "Tomato paste — Leggo's"],
  PESTO: ["al014", "Basil pesto — Remano (Aldi)"],
  SALSA: ["s10", "Salsa — Old El Paso Thick 'n Chunky Salsa"],
  TZAT: ["s21", "Tzatziki — Coles Tzatziki Dip"],
  CHIMI: ["s26", "Chimichurri"],
  CURRY: ["s25", "Curry paste — Patak's / Coles"],
  MISO: ["s32", "White miso paste — Marukome"],
  SOY: ["w171", "Soy sauce, salt reduced — Fountain", "ml"],
  FISHS: ["s18", "Fish sauce — Squid Brand", "ml"],
  OYSTER: ["s19", "Oyster sauce — Lee Kum Kee"],
  SRIR: ["s15", "Sriracha — Flying Goose"],
  SCHILLI: ["bn060", "Sweet chilli sauce — Masterfoods"],
  HOTS: ["bn2006", "Hot chilli sauce — Fountain"],
  BBQ: ["w078", "BBQ sauce — Masterfoods"],
  TSAUCE: ["w076", "Tomato sauce — Masterfoods"],
  WORC: ["w174", "Worcestershire sauce — Rosella", "ml"],
  MUST: ["s05", "Dijon mustard — Masterfoods"],
  LMAYO: ["w172", "Fat free mayonnaise — Praise Fat Free Mayo"],
  HON: ["w081", "Honey — Capilano"],
  MAPLE: ["s07", "Maple syrup — Coles"],
  JAM: ["s08", "Strawberry jam — IXL"],
  BISC: ["w080", "Biscoff spread — Lotus"],
  COCOA: ["bn072", "Cocoa powder — Cadbury Bournville"],
  DCHIP: ["bn074", "Dark choc bits — Nestlé Bakers' Choice"],
  ESP: ["b21", "Espresso shot", "ml"],
  STOCK: ["w068", "Chicken style stock powder — Massel"],
  VAN: ["bk13", "Vanilla extract — Queen", "ml"],
  // Spices (USDA)
  PAP: ["sp01", "Smoked paprika — Masterfoods"],
  CUMIN: ["sp02", "Ground cumin — Masterfoods"],
  CINN: ["sp03", "Ground cinnamon — Masterfoods"],
  GPOW: ["sp04", "Garlic powder — Masterfoods"],
  OREG: ["sp05", "Dried oregano — Masterfoods"],
  CFLAKE: ["sp06", "Chilli flakes — Masterfoods"],
};

const r1 = (n) => Math.round(n * 10) / 10;

function line(alias, grams) {
  const def = A[alias];
  if (!def) throw new Error(`Unknown ingredient alias ${alias}`);
  const [id, label, unit] = def;
  const f = byId[id];
  if (!f) throw new Error(`Food ${id} (${alias}) not in foodDatabase.js`);
  const k = grams / f.per;
  const amount = unit === "ml" ? `${grams}ml` : unit === "eggs" ? `${grams / 50} egg${grams === 50 ? "" : "s"}, ${grams}g` : `${grams}g`;
  return {
    baseFoodId: id,
    grams,
    name: `${label} (${amount})`,
    cals: Math.round(f.cals * k),
    protein: r1(f.protein * k),
    carbs: r1(f.carbs * k),
    fat: r1(f.fat * k),
  };
}

const meals = [];
function add(type, name, items, steps) {
  const ingredients = items.map(([a, g]) => line(a, g));
  const sum = ingredients.reduce((s, i) => ({ cals: s.cals + i.cals, protein: s.protein + i.protein, carbs: s.carbs + i.carbs, fat: s.fat + i.fat }), { cals: 0, protein: 0, carbs: 0, fat: 0 });
  meals.push({
    name,
    ingredients,
    mealTypes: [type],
    instructions: steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    cals: sum.cals,
    protein: r1(sum.protein),
    carbs: r1(sum.carbs),
    fat: r1(sum.fat),
  });
}
const B = (...a) => add("Breakfast", ...a);
const L = (...a) => add("Lunch", ...a);
const D = (...a) => add("Dinner", ...a);

// ============================== BREAKFAST ==============================
B("Tiramisu Protein Overnight Oats", [["OATS", 50], ["SKIM", 120], ["WHV", 30], ["ESP", 30], ["GY", 100], ["COCOA", 5]], [
  "Stir the oats, milk, whey and cooled espresso together in a jar.",
  "Spoon the Greek yoghurt over the top and dust with the cocoa.",
  "Cover and refrigerate overnight (at least 4 hours). Eat cold.",
]);
B("Apple Pie Baked Oats", [["OATS", 45], ["EW", 60], ["WHV", 30], ["SKIM", 100], ["APP", 120], ["CINN", 2], ["MAPLE", 10]], [
  "Heat the oven to 180°C. Dice the apple.",
  "Mix the oats, egg whites, whey, milk, cinnamon and half the apple in a small oven dish.",
  "Top with the rest of the apple and bake 25-30 minutes until set. Drizzle with the maple syrup.",
]);
B("Carrot Cake Overnight Oats", [["OATS", 45], ["SKIM", 120], ["GY", 120], ["WHV", 25], ["CARROT", 50], ["CINN", 2], ["WALNUT", 8], ["MAPLE", 8]], [
  "Finely grate the carrot.",
  "Mix the oats, milk, whey, carrot, cinnamon and maple syrup in a jar; refrigerate overnight.",
  "Top with the Greek yoghurt ('cream cheese icing') and chopped walnuts.",
]);
B("Choc Peanut Butter Baked Oats", [["OATS", 45], ["EW", 60], ["WHC", 30], ["COCOA", 6], ["SKIM", 80], ["BAN", 50], ["PB", 10]], [
  "Heat the oven to 180°C. Mash the banana.",
  "Mix the oats, egg whites, chocolate whey, cocoa, milk and banana in a small oven dish.",
  "Swirl the peanut butter through the top and bake 20-25 minutes until just set in the middle.",
]);
B("Banana Bread Baked Oats", [["OATS", 45], ["EW", 60], ["WHV", 25], ["SKIM", 80], ["BAN", 80], ["CINN", 1], ["WALNUT", 5]], [
  "Heat the oven to 180°C. Mash 60g of the banana; slice the rest.",
  "Mix the oats, egg whites, whey, milk, mashed banana and cinnamon in a small oven dish.",
  "Top with the banana slices and walnuts and bake 25 minutes until golden.",
]);
B("Blueberry Cheesecake Overnight Oats", [["OATS", 45], ["CF", 170], ["SKIM", 80], ["WHV", 15], ["PCL", 20], ["BLU", 60], ["CHIA", 5]], [
  "Whisk the yoghurt, light cream cheese, whey and milk until smooth.",
  "Stir in the oats and chia; layer with the blueberries in a jar.",
  "Refrigerate overnight and eat cold.",
]);
B("Raspberry Coconut Overnight Oats", [["OATS", 45], ["SKIM", 120], ["GY", 100], ["WHV", 25], ["RASP", 70], ["COCO", 6], ["CHIA", 5]], [
  "Mix the oats, milk, whey, chia and coconut in a jar.",
  "Layer with the Greek yoghurt and raspberries.",
  "Refrigerate overnight; the frozen raspberries thaw into a jammy layer.",
]);
B("PB&J Overnight Oats", [["OATS", 40], ["SKIM", 120], ["GY", 100], ["WHV", 25], ["PB", 10], ["JAM", 10], ["STR", 50]], [
  "Mix the oats, milk, whey and Greek yoghurt in a jar.",
  "Top with the jam, peanut butter and sliced strawberries.",
  "Refrigerate overnight and eat cold.",
]);
B("Cinnamon Scroll Protein Oats", [["OATS", 50], ["SKIM", 200], ["WHV", 30], ["CINN", 2], ["MAPLE", 10], ["PCL", 15], ["GY", 30]], [
  "Cook the oats in the milk with the cinnamon for 3-4 minutes, stirring.",
  "Take off the heat and stir in the whey.",
  "Whisk the light cream cheese, Greek yoghurt and maple syrup into an icing and swirl over the top.",
]);
B("Caramel Latte Overnight Oats", [["OATS", 45], ["SKIM", 100], ["ESP", 30], ["YPC", 160], ["WHV", 15], ["CHIA", 5]], [
  "Stir the oats, milk, cooled espresso, whey and chia together in a jar.",
  "Spoon the salted caramel YoPro on top.",
  "Refrigerate overnight and eat cold.",
]);
B("Lemon & Raspberry Yoghurt Bowl", [["GY", 200], ["WHV", 15], ["LEMON", 10], ["RASP", 80], ["GRAN", 25], ["HON", 5]], [
  "Whisk the Greek yoghurt, whey and lemon juice and zest until smooth.",
  "Top with the raspberries and granola, and drizzle with the honey.",
]);
B("Snickers Protein Yoghurt Bowl", [["GY", 200], ["WHC", 15], ["PB", 12], ["PEANUT", 8], ["DCHIP", 8], ["MAPLE", 5]], [
  "Whisk the Greek yoghurt and chocolate whey until smooth.",
  "Warm the peanut butter with the maple syrup for 10 seconds into a 'caramel' and drizzle over.",
  "Top with the chopped peanuts and dark choc bits.",
]);
B("Apple Crumble Yoghurt Bowl", [["GY", 200], ["WHV", 15], ["APP", 120], ["CINN", 1], ["OATS", 15], ["MAPLE", 8], ["ALMOND", 6]], [
  "Dice the apple and microwave 2 minutes with the cinnamon and a splash of water until soft.",
  "Toast the oats and chopped almonds in a dry pan, then toss with the maple syrup for a 'crumble'.",
  "Whisk the Greek yoghurt with the whey; top with the warm apple and crumble.",
]);
B("Blueberry Protein Smoothie Bowl", [["BLU", 120], ["BAN", 60], ["GY", 150], ["WHV", 25], ["SKIM", 60], ["GRAN", 20]], [
  "Blend the frozen blueberries, banana, Greek yoghurt, whey and milk until thick (add milk a splash at a time).",
  "Pour into a bowl and top with the granola.",
]);
B("Strawberry Cheesecake Protein Pancakes", [["OATS", 40], ["EW", 100], ["CC", 80], ["WHV", 20], ["BPOW", 3], ["STR", 80], ["GY", 50]], [
  "Blend the oats, egg whites, cottage cheese, whey and baking powder into a batter.",
  "Cook ladlefuls in a non-stick pan over medium heat, about 2 minutes per side.",
  "Stack and top with the Greek yoghurt and sliced strawberries.",
]);
B("Protein Crepes with Berries", [["EW", 120], ["EGG", 50], ["FLOUR", 20], ["SKIM", 60], ["WHV", 15], ["MB", 100], ["GY", 60], ["MAPLE", 5]], [
  "Whisk the egg whites, egg, flour, milk and whey into a thin batter.",
  "Swirl a thin layer into a hot non-stick pan; cook 1 minute per side. Repeat.",
  "Warm the berries until jammy; fill the crepes with the Greek yoghurt and berries and drizzle with maple.",
]);
B("Choc-Chip Banana Protein Muffins", [["OATS", 40], ["BAN", 80], ["EW", 60], ["WHV", 25], ["GY", 40], ["BPOW", 3], ["DCHIP", 8]], [
  "Heat the oven to 180°C. Blend the oats into a flour.",
  "Mix in the mashed banana, egg whites, whey, Greek yoghurt and baking powder; fold in the choc bits.",
  "Divide between 2 lined muffin holes and bake 18-20 minutes. One serve = both muffins.",
]);
B("Cottage Cheese Toast with Everything Bagel Seasoning", [["SOUR", 80], ["CC", 200], ["TOM", 80], ["SESAME", 3], ["GPOW", 1]], [
  "Toast the sourdough.",
  "Spread thickly with the cottage cheese and top with sliced tomato.",
  "Mix the sesame seeds and garlic powder and sprinkle over ('everything' seasoning).",
]);
B("Ricotta, Berries & Honey Protein Toast", [["PBREAD", 76], ["RIC", 50], ["GY", 100], ["WHV", 15], ["STR", 80], ["BLU", 40], ["HON", 8]], [
  "Toast the protein bread.",
  "Whip the ricotta, Greek yoghurt and whey until smooth.",
  "Spread over the toast, top with the berries and drizzle with the honey.",
]);
B("Avo & Egg Toast with Fresh Chilli", [["PBREAD", 76], ["EGG", 100], ["EW", 60], ["AVO", 40], ["CHILLI", 5]], [
  "Toast the protein bread and smash the avocado onto it.",
  "Scramble the eggs and egg whites in a non-stick pan until just set.",
  "Pile onto the toast and top with sliced fresh chilli.",
]);
B("Pesto Eggs on Sourdough", [["SOUR", 60], ["PESTO", 10], ["EGG", 100], ["EW", 90], ["SPIN", 30], ["FETA", 15]], [
  "Spread the pesto in a non-stick pan over medium heat until it sizzles.",
  "Crack in the eggs and pour the egg whites around them; cover and cook until the whites set, wilting the spinach alongside.",
  "Serve on toasted sourdough with crumbled feta.",
]);
B("Turkish Eggs with Greek Yoghurt", [["GY", 150], ["GARLIC", 3], ["EGG", 100], ["OIL", 4], ["CFLAKE", 1], ["PARS", 3], ["SOUR", 60]], [
  "Stir the grated garlic into the Greek yoghurt and spread on a plate.",
  "Poach the eggs 3 minutes and set on the yoghurt.",
  "Warm the olive oil with the chilli flakes, spoon over, top with parsley and serve with toasted sourdough.",
]);
B("Shakshuka with Turkey Mince", [["TM", 80], ["ONION", 40], ["CAPS", 60], ["GARLIC", 4], ["CUMIN", 1], ["PAP", 2], ["OIL", 2], ["DTOM", 200], ["EGG", 100], ["SOUR", 30]], [
  "Brown the turkey mince with the onion, capsicum and garlic in the oil.",
  "Add the cumin, paprika and chopped tomatoes; simmer 8 minutes.",
  "Make two wells, crack in the eggs, cover and cook 5-6 minutes. Serve with the sourdough.",
]);
B("Spinach & Feta Cottage Cheese Egg Bites", [["EGG", 150], ["CC", 100], ["SPIN", 40], ["CAPS", 30], ["FETA", 20]], [
  "Heat the oven to 170°C.",
  "Blend the eggs and cottage cheese until smooth; stir in the chopped spinach and capsicum.",
  "Pour into 4 silicone muffin cups, top with feta and bake 20-22 minutes. One serve = 4 bites.",
]);
B("Ham, Cheese & Tomato Egg Muffins", [["EGG", 100], ["EW", 120], ["HAM", 60], ["LTC", 20], ["TOM", 60], ["SPIN", 20]], [
  "Heat the oven to 180°C.",
  "Whisk the eggs and egg whites; stir in the chopped ham, tomato and spinach.",
  "Pour into 4 muffin cups, top with the cheese and bake 18-20 minutes. One serve = 4 muffins.",
]);
B("Egg White Breakfast Burrito", [["EW", 150], ["EGG", 50], ["BAC", 30], ["SPIN", 20], ["LTC", 15], ["SALSA", 30], ["WRAP", 42]], [
  "Crisp the bacon in a non-stick pan; set aside.",
  "Scramble the egg and egg whites with the spinach.",
  "Fill the wrap with the eggs, bacon, cheese and salsa, roll tightly and toast seam-side down.",
]);
B("Breakfast Bagel with Shaved Ham & Egg", [["BAGEL", 90], ["EGG", 50], ["EW", 60], ["HAM", 50], ["LTC", 10], ["TOM", 30], ["ROCK", 10]], [
  "Toast the bagel.",
  "Cook the egg and egg whites as a folded omelette in a small non-stick pan; top with the cheese to melt.",
  "Fill the bagel with the egg, ham, tomato and rocket.",
]);
B("High Protein Bacon & Egg Wrap", [["BAC", 40], ["EGG", 50], ["EW", 90], ["SPIN", 20], ["LTC", 15], ["BBQ", 10], ["WWRAP", 45]], [
  "Crisp the bacon; set aside.",
  "Pour the egg and egg whites into the pan as a thin omelette and lay the wrap on top for 30 seconds so it sticks; flip.",
  "Top with bacon, spinach, cheese and BBQ sauce, roll up and serve.",
]);
B("Breakfast Quesadilla", [["EGG", 50], ["EW", 90], ["CAPS", 30], ["SPRING", 10], ["LTC", 20], ["SALSA", 30], ["WRAP", 84]], [
  "Scramble the egg and egg whites with the diced capsicum and spring onion.",
  "Spread over one wrap, top with cheese and the second wrap.",
  "Toast in a dry pan 2 minutes per side, cut into wedges and serve with the salsa.",
]);
B("Breakfast Tacos with Egg & Chorizo", [["CHZ", 15], ["EGG", 100], ["EW", 120], ["TORT", 50], ["SALSA", 30], ["AVO", 20], ["CORI", 3]], [
  "Dice the chorizo and crisp it in a dry pan.",
  "Add the eggs and egg whites and scramble until just set.",
  "Warm the tortillas and fill with the egg, salsa, avocado and coriander.",
]);
B("Breakfast Burrito Bowl", [["POT", 120], ["EGG", 100], ["EW", 60], ["BLACKB", 60], ["SALSA", 40], ["AVO", 30], ["LTC", 10]], [
  "Dice the cooked potato and crisp it in a non-stick pan or air fryer.",
  "Scramble the eggs and egg whites; warm the black beans.",
  "Bowl up the potato, eggs and beans; top with salsa, avocado and cheese.",
]);
B("Big Brekkie Protein Plate", [["EGG", 100], ["BAC", 50], ["MUSH", 80], ["TOM", 80], ["BBEANS", 80], ["SPIN", 30], ["SOUR", 40]], [
  "Grill the bacon, mushrooms and halved tomato.",
  "Fry or poach the eggs; warm the baked beans and wilt the spinach.",
  "Plate everything with the toasted sourdough.",
]);
B("Smoked Salmon & Egg Sourdough Stack", [["SOUR", 60], ["PCL", 15], ["SS", 60], ["EGG", 100], ["ROCK", 10], ["LEMON", 5]], [
  "Toast the sourdough and spread with the light cream cheese.",
  "Poach or soft-scramble the eggs.",
  "Stack the rocket, smoked salmon and eggs on the toast and finish with lemon.",
]);
B("Breakfast Pizza on a Wrap", [["WRAP", 42], ["PASS", 30], ["EGG", 50], ["EW", 60], ["HAM", 40], ["MUSH", 30], ["SPIN", 15], ["LTC", 20]], [
  "Heat the oven or air fryer to 200°C. Spread the passata over the wrap.",
  "Top with the ham, sliced mushrooms, spinach and cheese; bake 4 minutes.",
  "Pour the whisked egg and egg whites into a pan as a thin omelette, slide on top and bake 2 more minutes.",
]);

// ================================ LUNCH ================================
L("Healthy Chicken Parma Bowl", [["CB", 130], ["EW", 20], ["CRUMB", 15], ["PASS", 60], ["HAM", 20], ["LTC", 20], ["POT", 130], ["OIL", 2], ["LEAVES", 40], ["CTOM", 60]], [
  "Dip the chicken in the egg white, coat in the breadcrumbs and air-fry at 200°C for 12-15 minutes until golden and cooked through.",
  "Top with the passata, ham and cheese; air-fry 3 more minutes until melted.",
  "Toss the cooked potato chunks with the oil and air-fry until crisp; bowl up with the salad leaves and cherry tomatoes.",
]);
L("Greek Yoghurt & Dijon Potato Salad with Chicken", [["POT", 200], ["GY", 80], ["MUST", 10], ["SPRING", 15], ["CELERY", 30], ["PARS", 3], ["EGG", 50], ["CB", 130]], [
  "Boil the baby potatoes until tender, cool and halve. Hard-boil the egg and chop.",
  "Mix the Greek yoghurt, Dijon, sliced spring onion, diced celery and parsley into a dressing.",
  "Fold the potatoes and egg through the dressing and serve with the sliced chicken.",
]);
L("Big Mac Salad", [["BM", 170], ["COS", 80], ["LTC", 20], ["ONION", 20], ["TOM", 50], ["GHERK", 20], ["LMAYO", 20], ["GY", 20], ["MUST", 5], ["SESAME", 2], ["BUN", 40]], [
  "Brown the mince, breaking it up, and season.",
  "Mix the fat free mayo, Greek yoghurt, mustard and a little chopped gherkin into a 'special sauce'.",
  "Toast the bun into croutons. Toss the lettuce, onion, tomato and gherkins; top with the mince, cheese, croutons, sauce and sesame seeds.",
]);
L("Chicken Caesar Pasta Salad", [["CB", 130], ["PASTA", 120], ["COS", 80], ["BAC", 20], ["PAR", 10], ["GY", 40], ["LMAYO", 10], ["LEMON", 5], ["GARLIC", 2], ["MUST", 3]], [
  "Crisp the bacon and slice the chicken.",
  "Whisk the Greek yoghurt, fat free mayo, lemon, grated garlic, mustard and half the parmesan into a Caesar dressing.",
  "Toss the cooked penne and cos with the dressing; top with the chicken, bacon and remaining parmesan.",
]);
L("Crunchy Chicken Pesto Pasta Salad", [["CB", 120], ["PASTA", 130], ["PESTO", 15], ["GY", 30], ["CTOM", 60], ["CUC", 40], ["ROCK", 20], ["PAR", 8]], [
  "Stir the pesto and Greek yoghurt together into a creamy pesto dressing.",
  "Toss with the cooked penne, halved cherry tomatoes, diced cucumber and rocket.",
  "Top with the sliced chicken and parmesan. Keeps 3 days in the fridge.",
]);
L("Tuna Pasta Salad", [["TUNA", 140], ["PASTA", 130], ["CORN", 50], ["CELERY", 30], ["ONION", 15], ["LMAYO", 20], ["GY", 40], ["PARS", 3]], [
  "Mix the fat free mayo and Greek yoghurt.",
  "Fold through the cooked penne, drained tuna, corn, diced celery, red onion and parsley.",
  "Chill and serve.",
]);
L("Chicken Shawarma Bowl with Garlic Yoghurt", [["CB", 150], ["CUMIN", 2], ["PAP", 2], ["BAS", 130], ["CUC", 50], ["TOM", 50], ["ONION", 15], ["GY", 60], ["GARLIC", 3], ["PARS", 3]], [
  "Rub the chicken with the cumin and paprika and grill or pan-fry until cooked through; slice.",
  "Mix the Greek yoghurt with the grated garlic.",
  "Bowl up the rice, chicken, chopped cucumber, tomato and red onion; spoon over the garlic yoghurt and parsley.",
]);
L("Korean Fried Chicken Rice Bowl", [["CB", 140], ["CORNF", 12], ["SRIR", 10], ["HON", 10], ["SOY", 10], ["GARLIC", 3], ["SESAME", 2], ["RICE", 120], ["KIMCHI", 30], ["CUC", 50], ["SPRING", 10]], [
  "Toss bite-size chicken pieces in the cornflour and air-fry at 200°C for 12 minutes until crisp.",
  "Simmer the sriracha, honey, soy and garlic for 1 minute; toss the chicken through the glaze.",
  "Serve over the rice with kimchi, cucumber, spring onion and sesame seeds.",
]);
L("Chicken Katsu Curry Bowl", [["CB", 130], ["EW", 20], ["CRUMB", 15], ["CURRY", 20], ["CARROT", 50], ["ONION", 30], ["POT", 40], ["STOCK", 3], ["CORNF", 5], ["RICE", 100]], [
  "Dip the chicken in egg white, coat in breadcrumbs and air-fry at 200°C for 12-15 minutes.",
  "Simmer the diced carrot, onion and potato in 200ml water with the stock and curry paste for 12 minutes; thicken with the cornflour.",
  "Slice the katsu and serve over the rice with the curry sauce.",
]);
L("Greek Chicken Gyro Bowl", [["CB", 140], ["OREG", 1], ["LEMON", 5], ["BAS", 110], ["TZAT", 40], ["TOM", 60], ["CUC", 60], ["ONION", 15], ["COS", 40], ["FETA", 15], ["OLIVE", 15]], [
  "Season the chicken with the oregano and lemon and grill until cooked through; slice.",
  "Bowl up the rice, cos, tomato, cucumber and red onion.",
  "Top with the chicken, feta, olives and tzatziki.",
]);
L("Salmon Sushi Bake Bowl", [["SAL", 140], ["WRICE", 100], ["LMAYO", 15], ["SRIR", 8], ["SOY", 8], ["NORI", 3], ["CUC", 50], ["EDAM", 60], ["SESAME", 2]], [
  "Bake the salmon at 200°C for 12 minutes, then flake it.",
  "Mix the flaked salmon with the fat free mayo and sriracha.",
  "Layer over the rice, drizzle with soy and top with cucumber, edamame, sesame seeds and torn nori.",
]);
L("Sweet Chilli Chicken Wrap", [["WRAP", 42], ["CB", 130], ["SCHILLI", 15], ["LMAYO", 10], ["COS", 30], ["CARROT", 30], ["CUC", 40], ["LTC", 15]], [
  "Slice the chicken and toss with the sweet chilli sauce.",
  "Spread the wrap with the fat free mayo and layer the lettuce, grated carrot, cucumber and cheese.",
  "Add the chicken, roll tightly and toast if you like.",
]);
L("Chicken Pesto Toastie", [["PBREAD", 76], ["PESTO", 10], ["SHC", 100], ["MOZ", 25], ["TOM", 40], ["SPIN", 15]], [
  "Spread the pesto over the bread.",
  "Fill with the shaved chicken, mozzarella, tomato and spinach.",
  "Toast in a sandwich press until golden and melted.",
]);
L("Chicken Bacon Ranch Wrap", [["WRAP", 42], ["CB", 120], ["BAC", 25], ["GY", 30], ["LMAYO", 10], ["GPOW", 1], ["PARS", 2], ["COS", 30], ["TOM", 40], ["LTC", 15]], [
  "Crisp the bacon and slice the chicken.",
  "Mix the Greek yoghurt, fat free mayo, garlic powder and parsley into a ranch dressing.",
  "Fill the wrap with lettuce, tomato, chicken, bacon, cheese and the ranch; roll up.",
]);
L("Satay Chicken Noodle Salad", [["CB", 130], ["VERM", 100], ["PB", 12], ["SOY", 10], ["LIME", 10], ["SCHILLI", 8], ["CABB", 60], ["CARROT", 40], ["CUC", 40], ["CORI", 3], ["PEANUT", 8]], [
  "Whisk the peanut butter, soy, lime juice, sweet chilli and a splash of hot water into a satay dressing.",
  "Toss the cooked vermicelli with the shredded cabbage, carrot and cucumber.",
  "Top with the sliced chicken, dressing, chopped peanuts and coriander.",
]);
L("Vietnamese Chicken Vermicelli Bowl", [["CB", 130], ["VERM", 120], ["COS", 40], ["CARROT", 40], ["CUC", 50], ["SPROUT", 30], ["CORI", 4], ["FISHS", 10], ["LIME", 10], ["HON", 8], ["CHILLI", 3], ["PEANUT", 8]], [
  "Mix the fish sauce, lime juice, honey, sliced chilli and 2 tbsp water into a dressing.",
  "Bowl up the cooked vermicelli, lettuce, carrot, cucumber, bean sprouts and herbs.",
  "Top with the sliced chicken and peanuts and pour over the dressing.",
]);
L("Prawn, Mango & Avocado Vermicelli Bowl", [["PRW", 150], ["VERM", 110], ["MANGO", 60], ["AVO", 30], ["CUC", 50], ["COS", 30], ["CORI", 3], ["FISHS", 8], ["LIME", 10], ["SCHILLI", 10]], [
  "Mix the fish sauce, lime juice and sweet chilli into a dressing.",
  "Bowl up the cooked vermicelli, lettuce, cucumber, mango and avocado.",
  "Top with the prawns and coriander and pour over the dressing.",
]);
L("Chicken Cobb Salad", [["CB", 130], ["EGG", 50], ["BAC", 20], ["AVO", 30], ["CTOM", 60], ["COS", 80], ["BLUE", 10], ["GY", 30], ["MUST", 5]], [
  "Hard-boil the egg, crisp the bacon and slice the chicken.",
  "Arrange the cos, cherry tomatoes, avocado, egg, bacon, chicken and crumbled blue cheese in rows.",
  "Whisk the Greek yoghurt and mustard with a splash of water and drizzle over.",
]);
L("Smoky Chicken, Corn & Black Bean Quinoa Salad", [["CB", 130], ["PAP", 2], ["QUIN", 100], ["BLACKB", 60], ["CORN", 50], ["CAPS", 40], ["ONION", 15], ["CORI", 3], ["LIME", 10], ["GY", 30]], [
  "Rub the chicken with the smoked paprika and grill; slice.",
  "Toss the quinoa, black beans, corn, diced capsicum, red onion, coriander and lime juice.",
  "Top with the chicken and a spoon of Greek yoghurt.",
]);
L("Chicken Banh Mi Bowl", [["CB", 130], ["RICE", 120], ["CARROT", 40], ["CUC", 40], ["CORI", 3], ["CHILLI", 3], ["LMAYO", 10], ["SRIR", 8], ["SOY", 8]], [
  "Quick-pickle the julienned carrot in a splash of vinegar for 10 minutes.",
  "Mix the fat free mayo and sriracha.",
  "Bowl up the rice, sliced chicken (drizzled with soy), pickled carrot, cucumber, coriander and chilli; drizzle the sriracha mayo.",
]);
L("Tuna Crunch Wrap", [["WRAP", 42], ["TUNA", 120], ["LMAYO", 15], ["GY", 20], ["CORN", 30], ["COS", 30], ["CUC", 30], ["LTC", 15], ["RCAKE", 10]], [
  "Mix the tuna with the fat free mayo, Greek yoghurt and corn.",
  "Lay the lettuce, cucumber and cheese on the wrap, add the tuna and a crushed rice cake for crunch.",
  "Fold the edges in, roll, and toast seam-side down.",
]);
L("Greek Yoghurt Egg Salad Sandwich", [["PBREAD", 80], ["EGG", 100], ["EW", 100], ["GY", 40], ["MUST", 5], ["SPRING", 5], ["COS", 20]], [
  "Hard-boil the eggs (and the egg whites in a small dish in the microwave, 1 minute) and chop.",
  "Mix with the Greek yoghurt, mustard and spring onion.",
  "Sandwich between the bread with the lettuce.",
]);
L("Chicken Tikka Naan Wrap", [["NAAN", 80], ["CB", 120], ["CURRY", 10], ["GY", 50], ["ONION", 15], ["CUC", 30], ["COS", 20]], [
  "Coat the chicken in the curry paste and half the Greek yoghurt and grill until charred; slice.",
  "Warm the naan.",
  "Fill with lettuce, cucumber, red onion, the chicken and the remaining yoghurt; fold and eat.",
]);
L("Loaded Sweet Potato with Chicken & Cottage Cheese", [["SWP", 250], ["CB", 120], ["PAP", 1], ["CC", 100], ["SALSA", 30], ["SPRING", 10]], [
  "Bake the sweet potato at 200°C for 45 minutes (or microwave 8-10 minutes) until soft; split open.",
  "Shred the chicken and season with the paprika.",
  "Fill with the chicken, cottage cheese and salsa; top with spring onion.",
]);
L("Mexican Street Corn Chicken Salad", [["CB", 130], ["CORN", 100], ["COS", 60], ["FETA", 15], ["GY", 30], ["LMAYO", 10], ["LIME", 10], ["CHILLI", 2], ["PAP", 1], ["CORI", 3], ["ONION", 15], ["AVO", 20]], [
  "Char the corn in a hot dry pan.",
  "Mix the Greek yoghurt, fat free mayo, lime, paprika and chilli; toss the warm corn through it.",
  "Pile onto the cos with the sliced chicken, red onion, avocado, crumbled feta and coriander.",
]);
L("Thai Beef Salad", [["STK", 140], ["CUC", 60], ["CTOM", 60], ["ONION", 20], ["CORI", 5], ["COS", 50], ["FISHS", 10], ["LIME", 15], ["HON", 6], ["CHILLI", 3], ["VERM", 60]], [
  "Sear the rump steak to medium-rare, rest 5 minutes and slice thinly.",
  "Mix the fish sauce, lime juice, honey and chilli into a dressing.",
  "Toss the lettuce, cucumber, tomatoes, red onion, herbs and vermicelli with the dressing; top with the beef.",
]);
L("Salmon Pesto Pasta Salad", [["SAL", 110], ["PASTA", 120], ["PESTO", 12], ["GY", 30], ["ROCK", 20], ["CTOM", 60], ["LEMON", 5], ["PAR", 8]], [
  "Bake the salmon at 200°C for 12 minutes and flake.",
  "Stir the pesto, Greek yoghurt and lemon together.",
  "Toss with the cooked penne, rocket and cherry tomatoes; top with the salmon and parmesan.",
]);
L("Turkey & Swiss Protein Toastie", [["PBREAD", 76], ["TURK", 100], ["SWISS", 20], ["TOM", 40], ["SPIN", 15], ["MUST", 5]], [
  "Spread the bread with the mustard.",
  "Fill with the sliced turkey, Swiss cheese, tomato and spinach.",
  "Toast in a sandwich press until golden.",
]);
L("Peri Peri Chicken Bowl", [["CB", 140], ["PAP", 2], ["CFLAKE", 1], ["GARLIC", 3], ["LEMON", 10], ["OIL", 3], ["BAS", 120], ["CORN", 50], ["CAPS", 50], ["ROCK", 20], ["GY", 30]], [
  "Blend the paprika, chilli flakes, garlic, lemon and oil into a peri peri marinade and coat the chicken.",
  "Grill the chicken until charred and cooked through; slice.",
  "Bowl up with the rice, charred corn and capsicum, rocket and a spoon of Greek yoghurt.",
]);
L("Lamb Souvlaki Wrap", [["LAMB", 130], ["OREG", 1], ["WRAP", 42], ["TZAT", 40], ["TOM", 40], ["ONION", 15], ["COS", 30]], [
  "Slice the roast lamb and warm it in a hot pan with the oregano.",
  "Spread the wrap with the tzatziki.",
  "Add the lettuce, tomato, red onion and lamb, roll up and toast.",
]);
L("Cottage Cheese Macaroni Salad", [["MAC", 130], ["CC", 120], ["SHC", 80], ["CELERY", 30], ["ONION", 15], ["CAPS", 40], ["MUST", 5], ["GY", 30], ["PAP", 1]], [
  "Blend the cottage cheese, Greek yoghurt and mustard until smooth.",
  "Fold through the cooked macaroni with the diced celery, red onion, capsicum and shaved chicken.",
  "Dust with paprika and chill.",
]);
L("Chicken Kebab Wrap", [["WRAP", 42], ["CB", 130], ["CUMIN", 1], ["PAP", 1], ["HUMMUS", 20], ["COS", 30], ["TOM", 40], ["ONION", 15], ["GY", 30], ["GARLIC", 2], ["HOTS", 5]], [
  "Season the chicken with the cumin and paprika, grill and slice.",
  "Mix the Greek yoghurt and grated garlic.",
  "Spread the wrap with hummus, add lettuce, tomato, onion and chicken; top with garlic yoghurt and chilli sauce, roll and toast.",
]);
L("Honey Mustard Chicken Salad", [["CB", 140], ["LEAVES", 60], ["CTOM", 60], ["CUC", 50], ["AVO", 30], ["ONION", 15], ["QUIN", 80], ["GY", 30], ["MUST", 10], ["HON", 8], ["LEMON", 5]], [
  "Whisk the Greek yoghurt, mustard, honey and lemon into a dressing.",
  "Toss the leaves, cherry tomatoes, cucumber, red onion and quinoa.",
  "Top with the sliced chicken and avocado and drizzle with the dressing.",
]);

// ================================ DINNER ===============================
D("Chicken Parma Pasta Bake", [["CB", 130], ["PASTA", 130], ["PASS", 100], ["GARLIC", 3], ["HAM", 20], ["MOZ", 25], ["CRUMB", 8], ["BASIL", 2]], [
  "Heat the oven to 200°C. Dice the chicken.",
  "Mix the cooked penne, chicken, passata, garlic and diced ham in an oven dish.",
  "Top with the mozzarella and breadcrumbs and bake 15 minutes until golden. Finish with basil.",
]);
D("Creamy Tuscan Chicken Pasta", [["CB", 130], ["PASTA", 100], ["CC", 80], ["SKIM", 50], ["PAR", 10], ["SDT", 15], ["SPIN", 40], ["GARLIC", 4]], [
  "Blend the cottage cheese, milk and parmesan until smooth.",
  "Sauté the garlic and chopped sun-dried tomatoes, add the sauce and spinach and warm gently (don't boil).",
  "Toss through the cooked penne and sliced chicken.",
]);
D("Creamy Coconut Chicken Curry", [["CB", 130], ["CURRY", 20], ["COCOM", 60], ["ONION", 40], ["CAPS", 50], ["SPIN", 30], ["STOCK", 2], ["BAS", 120]], [
  "Soften the onion in a non-stick pan, add the curry paste and cook 1 minute.",
  "Add the coconut milk, 100ml water, stock and capsicum; simmer 8 minutes.",
  "Stir in the diced chicken and spinach to heat through; serve with the rice.",
]);
D("Healthy Beef Stroganoff", [["STK", 130], ["MUSH", 100], ["ONION", 40], ["PAP", 1], ["STOCK", 3], ["GY", 60], ["PCL", 15], ["EGGN", 120]], [
  "Sear the sliced steak quickly in a hot pan; set aside.",
  "Cook the onion and mushrooms, add the paprika, stock and 100ml water and simmer 5 minutes.",
  "Off the heat stir in the Greek yoghurt and light cream cheese, return the beef and serve over the noodles.",
]);
D("Buffalo Chicken Pasta Bake", [["CB", 130], ["PASTA", 120], ["HOTS", 10], ["CC", 60], ["LTC", 20], ["CELERY", 30], ["SPRING", 10]], [
  "Heat the oven to 200°C. Shred the chicken and toss with the hot sauce.",
  "Mix with the cooked penne, cottage cheese and diced celery in an oven dish.",
  "Top with the cheese, bake 15 minutes and finish with spring onion.",
]);
D("Egg Roll in a Bowl", [["CM", 180], ["GARLIC", 4], ["GINGER", 3], ["CABB", 150], ["CARROT", 50], ["SOY", 15], ["SOIL", 3], ["SRIR", 8], ["SPRING", 10], ["RICE", 100]], [
  "Brown the chicken mince with the garlic and ginger.",
  "Add the shredded cabbage and carrot and stir-fry 4 minutes until just soft.",
  "Season with soy and sesame oil; serve over rice with sriracha and spring onion.",
]);
D("Honey Garlic Chicken Thighs with Rice", [["CT", 140], ["HON", 10], ["SOY", 10], ["GARLIC", 5], ["RICE", 120], ["BROC", 100]], [
  "Pan-fry the chicken thighs until cooked through.",
  "Add the honey, soy and garlic and reduce until sticky.",
  "Serve with the rice and steamed broccoli.",
]);
D("Beef & Broccoli Stir-Fry", [["STK", 140], ["BROC", 120], ["OYSTER", 15], ["SOY", 10], ["GARLIC", 4], ["GINGER", 3], ["CORNF", 4], ["SOIL", 2], ["RICE", 120]], [
  "Slice the steak thinly and toss in the cornflour.",
  "Stir-fry in the sesame oil over high heat 2 minutes; add the garlic, ginger and broccoli with a splash of water.",
  "Add the oyster and soy sauces, toss to glaze and serve over the rice.",
]);
D("Lasagne Soup", [["BM", 140], ["ONION", 40], ["GARLIC", 4], ["OREG", 1], ["PASS", 150], ["STOCK", 4], ["LAS", 100], ["SPIN", 30], ["RIC", 30], ["PAR", 8]], [
  "Brown the mince with the onion, garlic and oregano.",
  "Add the passata, stock and 300ml water; simmer 10 minutes. Add the broken lasagne sheets and spinach and cook until tender.",
  "Serve topped with a dollop of ricotta and the parmesan.",
]);
D("Lean Beef Tacos with Yoghurt Crema", [["BM", 140], ["CUMIN", 2], ["PAP", 2], ["GPOW", 1], ["TORT", 60], ["COS", 40], ["TOM", 50], ["LTC", 15], ["GY", 40], ["LIME", 5], ["CORI", 3], ["AVO", 20]], [
  "Brown the mince with the cumin, paprika, garlic powder and a splash of water.",
  "Mix the Greek yoghurt with the lime juice for the crema.",
  "Warm the tortillas and fill with lettuce, mince, tomato, cheese, avocado, crema and coriander.",
]);
D("Crispy Salmon with Lemon Garlic Potatoes", [["SAL", 140], ["POT", 160], ["OIL", 4], ["GARLIC", 4], ["LEMON", 10], ["BEANSG", 100], ["PARS", 3]], [
  "Smash the cooked baby potatoes and roast at 220°C with the oil and garlic for 20 minutes.",
  "Pan-fry the salmon skin-side down 4 minutes until crisp, flip for 2 minutes.",
  "Serve with the potatoes and green beans; finish with lemon and parsley.",
]);
D("Garlic Prawn Linguine", [["PRW", 180], ["SPAG", 140], ["OIL", 5], ["GARLIC", 6], ["CHILLI", 3], ["CTOM", 80], ["LEMON", 10], ["PARS", 4], ["PAR", 8]], [
  "Warm the oil with the garlic and chilli, add the halved cherry tomatoes and cook 2 minutes.",
  "Add the prawns to heat through, then the cooked linguine and a splash of pasta water.",
  "Toss with the lemon and parsley and top with the parmesan.",
]);
D("Healthy Chicken Korma", [["CB", 140], ["ONION", 40], ["GARLIC", 3], ["GINGER", 3], ["CURRY", 15], ["STOCK", 2], ["GY", 80], ["ALMOND", 8], ["BAS", 120]], [
  "Soften the onion, garlic and ginger; add the curry paste and cook 1 minute.",
  "Add 100ml water, the stock and ground almonds; simmer 5 minutes.",
  "Off the heat stir in the Greek yoghurt and diced chicken; serve with the rice.",
]);
D("Smash Burger Tacos", [["BM", 150], ["TORT", 60], ["LTC", 20], ["COS", 30], ["ONION", 15], ["GHERK", 20], ["LMAYO", 15], ["TSAUCE", 8], ["MUST", 4]], [
  "Press a thin layer of raw mince onto each tortilla and cook mince-side down in a hot pan 2-3 minutes; flip, add cheese, 1 minute more.",
  "Mix the fat free mayo, tomato sauce and mustard into burger sauce.",
  "Top with shredded lettuce, onion, gherkins and sauce.",
]);
D("Healthy Chicken Ramen", [["CB", 130], ["STOCK", 6], ["MISO", 15], ["SOY", 10], ["GARLIC", 3], ["GINGER", 3], ["RAMEN", 120], ["BOK", 80], ["MUSH", 40], ["EGG", 50], ["SPRING", 10]], [
  "Simmer 500ml water with the stock, miso, soy, garlic and ginger 5 minutes.",
  "Add the bok choy and mushrooms for 2 minutes; soft-boil the egg 6.5 minutes.",
  "Pour the broth over the noodles and top with the sliced chicken, halved egg and spring onion.",
]);
D("Steak with Chimichurri & Sweet Potato", [["STK", 160], ["SWP", 180], ["CHIMI", 15], ["ROCK", 30], ["CTOM", 50]], [
  "Roast the sweet potato wedges at 200°C for 30 minutes.",
  "Sear the steak to your liking and rest 5 minutes.",
  "Slice and serve with the chimichurri, wedges and a rocket and tomato salad.",
]);
D("One-Pan Cheeseburger Pasta", [["BM", 130], ["ONION", 30], ["TPASTE", 10], ["PASS", 80], ["MUST", 4], ["SKIM", 50], ["MAC", 120], ["LTC", 25], ["GHERK", 15]], [
  "Brown the mince and onion; stir in the tomato paste, passata and mustard.",
  "Add the cooked macaroni and milk and stir until creamy.",
  "Melt the cheese over the top and finish with chopped gherkins.",
]);
D("Chicken Pesto Gnocchi", [["CB", 130], ["GNOC", 120], ["PESTO", 12], ["CTOM", 60], ["SPIN", 30], ["PAR", 8]], [
  "Pan-fry the gnocchi in a non-stick pan until golden.",
  "Add the halved cherry tomatoes and spinach until wilted, then the sliced chicken.",
  "Toss through the pesto and top with parmesan.",
]);
D("Miso Salmon with Rice & Bok Choy", [["SAL", 140], ["MISO", 12], ["HON", 6], ["SOY", 5], ["RICE", 110], ["BOK", 120], ["SESAME", 2], ["SPRING", 10]], [
  "Mix the miso, honey and soy and brush over the salmon.",
  "Bake at 200°C for 12-14 minutes until caramelised.",
  "Serve with the rice and steamed bok choy; top with sesame seeds and spring onion.",
]);
D("Crumbed Fish & Air-Fryer Chips", [["FISH", 170], ["EW", 30], ["CRUMB", 20], ["POT", 170], ["OIL", 3], ["GY", 30], ["GHERK", 10], ["LEMON", 10], ["LEAVES", 40]], [
  "Dip the fish in the egg white, coat in the breadcrumbs and air-fry at 200°C for 10-12 minutes.",
  "Toss the cooked potato chips with the oil and air-fry until crisp.",
  "Mix the Greek yoghurt with chopped gherkin for a tartare; serve with lemon and salad.",
]);
D("Chicken Parm Meatballs with Pasta", [["CM", 160], ["CRUMB", 10], ["EW", 20], ["PAR", 8], ["PASS", 120], ["SPAG", 90], ["MOZ", 15], ["BASIL", 2]], [
  "Mix the chicken mince, breadcrumbs, egg white and parmesan; roll into 8 meatballs and bake at 200°C for 15 minutes.",
  "Simmer the meatballs in the passata 5 minutes; top with mozzarella to melt.",
  "Serve over the spaghetti with basil.",
]);
D("Lamb Kofta with Tzatziki & Rice", [["LMB", 60], ["BM", 100], ["CUMIN", 1], ["GARLIC", 3], ["PARS", 3], ["TZAT", 40], ["BAS", 110], ["CUC", 60], ["TOM", 60]], [
  "Mix the lamb and beef mince with the cumin, garlic and parsley; shape onto 4 skewers.",
  "Grill 8-10 minutes, turning, until cooked through.",
  "Serve with the rice, a cucumber and tomato salad and the tzatziki.",
]);
D("High Protein Chicken Enchiladas", [["CB", 140], ["BLACKB", 40], ["PASS", 100], ["CUMIN", 1], ["PAP", 1], ["CORNT", 60], ["LTC", 20], ["GY", 30], ["SPRING", 10]], [
  "Heat the oven to 200°C. Simmer the passata with the cumin and paprika for an enchilada sauce.",
  "Fill the tortillas with the shredded chicken, black beans and half the sauce; roll into a dish.",
  "Top with the rest of the sauce and the cheese; bake 15 minutes. Serve with Greek yoghurt and spring onion.",
]);
D("Light Cajun Chicken Alfredo", [["CB", 130], ["PAP", 2], ["GPOW", 1], ["OREG", 1], ["CFLAKE", 1], ["FETT", 120], ["CC", 70], ["SKIM", 60], ["PAR", 12], ["GARLIC", 3], ["SPIN", 30]], [
  "Rub the chicken with the paprika, garlic powder, oregano and chilli; pan-fry and slice.",
  "Blend the cottage cheese, milk, parmesan and garlic and warm gently with the spinach.",
  "Toss through the cooked fettuccine and top with the chicken.",
]);
D("Sticky Sesame Chicken", [["CB", 140], ["CORNF", 10], ["HON", 12], ["SOY", 12], ["GARLIC", 3], ["SRIR", 5], ["SESAME", 3], ["RICE", 120], ["BROC", 80], ["SPRING", 10]], [
  "Toss diced chicken in the cornflour and air-fry at 200°C for 12 minutes.",
  "Simmer the honey, soy, garlic and sriracha 1 minute; toss the chicken through with the sesame seeds.",
  "Serve with the rice and broccoli and top with spring onion.",
]);
D("Chilli Con Carne with Rice", [["BM", 140], ["ONION", 40], ["CAPS", 50], ["GARLIC", 4], ["CUMIN", 2], ["PAP", 2], ["CFLAKE", 1], ["TPASTE", 10], ["DTOM", 150], ["KIDNEY", 70], ["BAS", 100], ["GY", 30]], [
  "Brown the mince with the onion, capsicum and garlic.",
  "Add the spices, tomato paste, chopped tomatoes and kidney beans; simmer 20 minutes.",
  "Serve over the rice with a spoon of Greek yoghurt.",
]);
D("Healthy Shepherd's Pie", [["LMB", 40], ["BM", 100], ["ONION", 40], ["CARROT", 50], ["PEAS", 40], ["TPASTE", 10], ["WORC", 5], ["STOCK", 3], ["POT", 160], ["SKIM", 30], ["LTC", 10]], [
  "Brown the lamb and beef mince with the onion and carrot; add the tomato paste, Worcestershire, stock, peas and 100ml water and simmer 10 minutes.",
  "Mash the cooked potato with the milk.",
  "Spoon the mash over the mince, top with cheese and grill until golden.",
]);
D("Garlic Butter Steak Bites with Potatoes", [["STK", 160], ["BUT", 5], ["GARLIC", 5], ["POT", 180], ["BEANSG", 100], ["PARS", 3]], [
  "Cut the steak into bites and sear in a very hot pan 2-3 minutes.",
  "Add the butter and garlic and toss for 30 seconds.",
  "Serve with the roasted potatoes and green beans; finish with parsley.",
]);
D("Chicken & Chorizo Jambalaya", [["CHZ", 20], ["ONION", 40], ["CAPS", 60], ["CELERY", 30], ["GARLIC", 4], ["PAP", 2], ["DTOM", 100], ["STOCK", 3], ["WRICE", 130], ["CB", 120]], [
  "Crisp the sliced chorizo, then soften the onion, capsicum, celery and garlic in its oil.",
  "Add the paprika, chopped tomatoes, stock and 100ml water and simmer 5 minutes.",
  "Stir in the cooked rice and diced chicken until hot.",
]);
D("Chicken San Choy Bow", [["CM", 180], ["GARLIC", 3], ["GINGER", 3], ["WCHEST", 40], ["CARROT", 40], ["MUSH", 50], ["OYSTER", 12], ["SOY", 10], ["SOIL", 3], ["SPRING", 10], ["COS", 60], ["RICE", 80]], [
  "Stir-fry the chicken mince with the garlic and ginger until cooked.",
  "Add the diced water chestnuts, carrot and mushrooms, then the oyster sauce, soy and sesame oil.",
  "Spoon into lettuce cups, top with spring onion and serve with the rice.",
]);
D("Chicken & Leek Pot Pie with Mash Top", [["CB", 130], ["LEEK", 60], ["MUSH", 50], ["CARROT", 40], ["PEAS", 40], ["SKIM", 120], ["CORNF", 8], ["STOCK", 3], ["POT", 120], ["PAR", 6]], [
  "Soften the leek, mushrooms and carrot; add the milk, stock and cornflour (mixed with a little water) and stir until thick.",
  "Stir in the diced chicken and peas and spoon into a pie dish.",
  "Top with the mashed potato and parmesan and bake at 200°C for 15 minutes.",
]);
D("Healthy Tuna Mornay", [["TUNA", 150], ["PASTA", 80], ["SKIM", 150], ["CORNF", 10], ["MUST", 3], ["LTC", 20], ["ONION", 30], ["PEAS", 50], ["CORN", 40]], [
  "Soften the onion; whisk in the milk, mustard and cornflour (mixed with a little water) and stir until thick.",
  "Fold in the tuna, peas, corn and cooked pasta.",
  "Top with the cheese and grill until golden.",
]);
D("Satay Beef Noodle Stir-Fry", [["STK", 120], ["HOK", 80], ["PB", 12], ["SOY", 10], ["SCHILLI", 8], ["LIME", 5], ["CAPS", 60], ["BROC", 60], ["CARROT", 30]], [
  "Whisk the peanut butter, soy, sweet chilli, lime and 3 tbsp hot water into a satay sauce.",
  "Stir-fry the sliced steak 2 minutes, then the capsicum, broccoli and carrot.",
  "Add the noodles and sauce and toss until coated.",
]);

if (meals.length !== 100) throw new Error(`Expected 100 meals, got ${meals.length}`);
const names = new Set();
meals.forEach((m) => {
  if (names.has(m.name)) throw new Error(`Duplicate name ${m.name}`);
  names.add(m.name);
});

const out = meals.map((m, i) => {
  const id = `au_insta_${String(i + 1).padStart(3, "0")}`;
  const photo = INSTA_MEAL_PHOTOS[m.name];
  return { id, ...m, ...(photo ? { photoUrl: photo } : {}) };
});

const header = `// Auto-generated by scripts/genInstaMealsAU.mjs — do not edit by hand.
// 100 popular high-protein meals (34 breakfast, 33 lunch, 33 dinner),
// every ingredient a real Food Library entry (src/lib/foodDatabase.js),
// mostly Australian brand products; each meal's macros are the exact sum
// of its ingredient lines. Labels say raw or cooked weight. Photos are
// Unsplash (free licence), checked against each recipe.
`;
fs.writeFileSync(new URL("../src/lib/instaMealsAU.js", import.meta.url), `${header}export const INSTA_MEALS_AU = ${JSON.stringify(out, null, 2)};\n`);

// Summary for review.
const rows = out.map((m) => `${m.id}\t${m.mealTypes[0]}\t${m.cals}\t${m.protein}\t${m.carbs}\t${m.fat}\t${m.photoUrl ? "photo" : "-"}\t${m.name}`);
fs.writeFileSync(process.env.SUMMARY || "/dev/null", rows.join("\n"));
console.log(`Wrote ${out.length} meals`);
