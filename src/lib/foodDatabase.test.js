// Regression coverage for the automatic per-food-type unit system (modelled
// on MyFitnessPal: a liquid gets ml/cup/tbsp, a spread gets tbsp/tsp/cup/
// pat/stick, a condiment gets tbsp/tsp, a generic weighed solid gets grams
// only) — every food in the static library, and every future barcode scan,
// gets a sensible unit set automatically rather than needing each one
// hand-curated. Metric-only requirement: neither kg nor any imperial unit
// (oz, lb) is ever offered as a selectable logging unit — see the "never
// offers oz/lb/imperial units" sanity check below.
import { describe, it, expect } from "vitest";
import { isLiquidFood, unitsFor, scaleFoodByUnit, FOOD_DATABASE, getAllFoods, sanitizeFoodUnits } from "./foodDatabase";
import { matchesSearch } from "./search";

describe("isLiquidFood", () => {
  it("classifies plain milks and waters as liquid", () => {
    expect(isLiquidFood({ name: "Milk (full cream)" })).toBe(true);
    expect(isLiquidFood({ name: "Soy Milk" })).toBe(true);
    expect(isLiquidFood({ name: "Spring Water" })).toBe(true);
  });

  it("classifies strong beverage phrases as liquid even though they'd otherwise look solid", () => {
    expect(isLiquidFood({ name: "Hot Chocolate (Small, McCafé, Skim Milk) (McDonald's)" })).toBe(true);
    expect(isLiquidFood({ name: "Rokeby Protein Smoothie Choc Honeycomb" })).toBe(true);
    expect(isLiquidFood({ name: "Chai Latte (Medium, McCafé, Skim Milk) (McDonald's)" })).toBe(true);
  });

  it("never classifies an actual chocolate/candy item as liquid just because 'milk' appears in its name", () => {
    expect(isLiquidFood({ name: "Milk Chocolate" })).toBe(false);
    expect(isLiquidFood({ name: "Cadbury Dairy Milk Chocolate" })).toBe(false);
    expect(isLiquidFood({ name: "Easter Bunnies Milk Creme (Choceur)" })).toBe(false);
    expect(isLiquidFood({ name: "Coles Perform Elite Whey High Protein Bar Milk Chocolate Fudge Brownie" })).toBe(false);
  });

  it("never misfires on 'honeydew', which merely contains the substring 'honey'", () => {
    expect(isLiquidFood({ name: "Honeydew Melon" })).toBe(false);
  });

  it("respects an explicit liquid flag (e.g. set from a barcode scan's real package data) over the name heuristic", () => {
    expect(isLiquidFood({ name: "Mystery Product", liquid: true })).toBe(true);
    expect(isLiquidFood({ name: "Milk of Something Weird", liquid: false })).toBe(false);
  });

  it("classifies ordinary solid foods as not liquid", () => {
    expect(isLiquidFood({ name: "Lean Beef Mince (5% fat)" })).toBe(false);
    expect(isLiquidFood({ name: "Washed White Potatoes" })).toBe(false);
  });

  // Real misclassifications found by auditing every entry in the static
  // FOOD_DATABASE (not just spot checks) — each confirmed against the
  // entry's own real-world defaultQty (grams for a solid, ml for a
  // liquid) before being fixed, not just by eyeballing the name.
  describe("full-database audit fixes", () => {
    it("never classifies a solid food as liquid just because 'water' describes its packaging, not the food itself", () => {
      // Real entry: cals/protein/fat per 100g, defaultQty 100 — a canned
      // fish, not a drink.
      expect(isLiquidFood({ name: "Tuna (canned, spring water)" })).toBe(false);
      // A vegetable whose own name happens to contain the word "water".
      expect(isLiquidFood({ name: "Water Chestnuts" })).toBe(false);
      expect(isLiquidFood({ name: "Water Chestnuts (sliced)" })).toBe(false); // plural still matches with any trailing text
      // Porridge made with water is still porridge, eaten by the bowl.
      expect(isLiquidFood({ name: "Oatmeal (cooked with water)" })).toBe(false);
    });

    it("never classifies 'Baking Soda' as liquid just because it contains 'soda'", () => {
      expect(isLiquidFood({ name: "Baking Soda" })).toBe(false);
    });

    it("never classifies a dry powder as liquid, however its name otherwise reads", () => {
      // Real entries: defaultQty 5g (a bouillon-powder teaspoon) and 45g
      // (a protein-powder scoop) — neither is a ready-to-drink liquid,
      // despite "Stock" and "Milkshake" in their names.
      expect(isLiquidFood({ name: "Massel Chicken Style Stock Powder" })).toBe(false);
      expect(isLiquidFood({ name: "Musashi P30 High Protein Powder Chocolate Milkshake" })).toBe(false);
      expect(isLiquidFood({ name: "Bulk Nutrients BCAA Energy Drink Mix" })).toBe(false);
    });

    it("classifies brand-name soft drinks and sports drinks as liquid — these were missed entirely before the audit", () => {
      // None of these contain "milk," "juice," or "water," so the plain
      // name heuristic alone never caught them; real entries all have a
      // genuine ml-scale defaultQty (Coca-Cola 375ml, Powerade 600ml, a
      // Hungry Jack's Sprite 340-630ml by size).
      expect(isLiquidFood({ name: "Coca-Cola" })).toBe(true);
      expect(isLiquidFood({ name: "Coca-Cola No Sugar" })).toBe(true);
      expect(isLiquidFood({ name: "Fanta Orange (Small, Hungry Jack's)" })).toBe(true);
      expect(isLiquidFood({ name: "Sprite (Medium, Hungry Jack's)" })).toBe(true);
      expect(isLiquidFood({ name: "Gatorade Sports Drink" })).toBe(true);
      expect(isLiquidFood({ name: "Powerade Ion4" })).toBe(true);
      expect(isLiquidFood({ name: "Hydralyte Electrolyte Drink" })).toBe(true);
      expect(isLiquidFood({ name: "Jack'd Up Dirty Cola (Hungry Jack's)" })).toBe(true);
    });

    it("classifies alcoholic drinks as liquid — also missed entirely before the audit", () => {
      expect(isLiquidFood({ name: "Beer" })).toBe(true);
      expect(isLiquidFood({ name: "Wine (red)" })).toBe(true);
      expect(isLiquidFood({ name: "White Wine" })).toBe(true);
    });

    it("never misfires the alcohol/drink words on an unrelated solid food name", () => {
      // "rum" inside "Drumstick", "gin" inside a transliterated dish
      // name — neither has a word boundary around the alcohol word, so
      // neither should match.
      expect(isLiquidFood({ name: "Chicken Drumstick" })).toBe(false);
      expect(isLiquidFood({ name: "Jin Ga Ne Vegetable Pancake (Arum)" })).toBe(false);
    });
  });
});

describe("unitsFor — automatic unit sets by food type", () => {
  it("gives a liquid ml as its base unit (not grams), plus cup and tbsp", () => {
    const units = unitsFor({ name: "Lite Milk" });
    const ids = units.map((u) => u.id);
    expect(ids[0]).toBe("ml");
    expect(ids).not.toContain("g");
    expect(ids).toContain("cup");
    expect(ids).toContain("tbsp");
  });

  it("gives a spread (butter/margarine/ghee), at a real small serving size, tbsp/tsp/cup/pat/stick, based in grams", () => {
    const units = unitsFor({ name: "Butter, Salted", defaultQty: 10 });
    const ids = units.map((u) => u.id);
    expect(ids[0]).toBe("g");
    expect(ids).toEqual(expect.arrayContaining(["tbsp", "tsp", "cup", "pat", "stick"]));
  });

  it("gives a condiment, at a real small serving size, tbsp/tsp without the weight units a plain solid gets", () => {
    const units = unitsFor({ name: "Capilano Pure Honey", defaultQty: 15 });
    const ids = units.map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining(["tbsp", "tsp"]));
    expect(ids).not.toContain("lb");
  });

  // Real production report: a Coles barcode-scanned BBQ sauce offered
  // g/tbsp/tsp with no ml option, defaulting to grams. Sauces/condiments
  // (honey, sauce, syrup, jam, dressing, mayo, vinegar, gravy) must always
  // be ml-based with tbsp/tsp — never a grams option — for both the static
  // database AND a future barcode scan, even one whose own OFF package
  // data says otherwise (`liquid: false`).
  it("classifies a sauce/condiment as liquid (ml base, no grams option) — including from barcode scan data that says otherwise", () => {
    const bbqSauce = unitsFor({ name: "BBQ Sauce", defaultQty: 20 });
    const ids = bbqSauce.map((u) => u.id);
    expect(ids[0]).toBe("ml");
    expect(ids).not.toContain("g");
    expect(ids).toEqual(expect.arrayContaining(["tbsp", "tsp"]));
    expect(ids).not.toContain("cup");

    // The exact reported case: a scanned product whose own package data
    // set `liquid: false` (e.g. derived from a weight-labeled OFF
    // `quantity` field) must still come out ml-based by name alone.
    const scannedFood = { name: "Coles Barbeque Sauce", defaultQty: 20, liquid: false };
    expect(isLiquidFood(scannedFood)).toBe(true);
    const scannedIds = unitsFor(scannedFood).map((u) => u.id);
    expect(scannedIds[0]).toBe("ml");
    expect(scannedIds).not.toContain("g");

    expect(isLiquidFood({ name: "Capilano Pure Honey", defaultQty: 15 })).toBe(true);
    expect(isLiquidFood({ name: "Maple Syrup", defaultQty: 20 })).toBe(true);
    expect(isLiquidFood({ name: "French Dressing", defaultQty: 15 })).toBe(true);
    expect(isLiquidFood({ name: "Beef Gravy", defaultQty: 50 })).toBe(true);
    expect(isLiquidFood({ name: "Malt Vinegar", defaultQty: 15 })).toBe(true);
    expect(isLiquidFood({ name: "Whole Egg Mayonnaise", defaultQty: 15 })).toBe(true);
  });

  // Peanut butter/nutella are thick, scooped spreads, not pourable
  // liquids — they should stay solid/grams, like butter itself, rather
  // than becoming ml-based just because they're a "condiment."
  it("keeps thick nut spreads (peanut butter, nutella) solid/grams, unlike pourable sauces", () => {
    expect(isLiquidFood({ name: "Peanut Butter", defaultQty: 20 })).toBe(false);
    expect(isLiquidFood({ name: "Nutella", defaultQty: 20 })).toBe(false);
    const ids = unitsFor({ name: "Peanut Butter", defaultQty: 20 }).map((u) => u.id);
    expect(ids[0]).toBe("g");
  });

  // Real misclassifications found auditing every entry in the static
  // database: a whole DISH that merely contains a spread/condiment word
  // as an ingredient ("Butter Chicken," "Butter Beans," "Caesar Salad
  // (with dressing)," "Salt and Vinegar ... Chips," "... Honey Bar") was
  // logged at a full-serving size (100-350g, real defaultQty values) but
  // lost its normal weight units entirely to a spoon-only set — nobody
  // logs a plate of butter chicken in tablespoons.
  it("keeps normal weight units (not spoon-only, and never kg/oz/lb) for a full-size dish that merely contains a spread/condiment word", () => {
    const butterChicken = unitsFor({ name: "Butter Chicken", defaultQty: 250 });
    expect(butterChicken.map((u) => u.id)).not.toContain("oz");
    expect(butterChicken.map((u) => u.id)).not.toContain("lb");
    expect(butterChicken.map((u) => u.id)).not.toContain("pat");
    expect(butterChicken.map((u) => u.id)).not.toContain("kg");

    const butterBeans = unitsFor({ name: "Butter Beans (cooked)", defaultQty: 150 });
    expect(butterBeans.map((u) => u.id)).not.toContain("oz");
    expect(butterBeans.map((u) => u.id)).not.toContain("lb");
    expect(butterBeans.map((u) => u.id)).not.toContain("pat");
    expect(butterBeans.map((u) => u.id)).not.toContain("kg");

    const caesarSalad = unitsFor({ name: "Caesar Salad (with dressing)", defaultQty: 200 });
    expect(caesarSalad.map((u) => u.id)).not.toContain("oz");
    expect(caesarSalad.map((u) => u.id)).not.toContain("lb");
    expect(caesarSalad.map((u) => u.id)).not.toContain("kg");

    const chips = unitsFor({ name: "Salt and Vinegar Crinkle Cut Potato Chips (Aldi)", defaultQty: 100 });
    expect(chips.map((u) => u.id)).not.toContain("oz");
    expect(chips.map((u) => u.id)).not.toContain("lb");
    expect(chips.map((u) => u.id)).not.toContain("kg");

    const honeyBar = unitsFor({ name: "Nature Valley Oats & Honey Bar", defaultQty: 42 });
    expect(honeyBar.map((u) => u.id)).not.toContain("oz");
    expect(honeyBar.map((u) => u.id)).not.toContain("lb");
    expect(honeyBar.map((u) => u.id)).not.toContain("kg");
  });

  // Metric-only requirement: neither kg nor any imperial unit (oz, lb) is
  // ever offered as a selectable logging unit for ANY individual solid
  // food serving. Nobody logs a potato, a slice of cheese, or a plate of
  // butter chicken in kilograms, ounces or pounds — grams is the one
  // reliable fallback.
  it("gives a generic weighed solid grams only, matching the metric-only requirement — never kg, oz or lb", () => {
    const potatoes = unitsFor({ name: "Washed White Potatoes" });
    const ids = potatoes.map((u) => u.id);
    expect(ids).toEqual(["g"]);
  });

  // Real production report: an individual meat/fish portion (a chicken
  // breast, a steak, a scoop of mince) offered kg as a loggable unit — a
  // bulk/wholesale unit nobody uses for a single meal. Imperial units
  // (oz/lb) are dropped too, per the metric-only requirement — grams is
  // the one reliable fallback, at the shared classifier level so neither
  // ever reappears from any source (static database, barcode scan,
  // custom food, saved meal).
  it("gives meat/fish an individual-portion unit set — grams only, never kg, oz or lb", () => {
    const meatNames = [
      "5% Lean Beef Mince (Aldi)",
      "Chicken Breast",
      "Scotch Fillet Steak (ribeye, grilled)",
      "Pork Loin",
      "Lamb Chops (grilled)",
      "Salmon Fillet",
      "Cod",
    ];
    meatNames.forEach((name) => {
      const ids = unitsFor({ name, defaultQty: 150 }).map((u) => u.id);
      expect(ids, name).toEqual(["g"]);
    });
  });

  it("still applies a food's own customUnit (e.g. Weet-Bix's 'biscuit') alongside the auto-detected weight units, never oz/lb/kg", () => {
    const units = unitsFor({ name: "Sanitarium Weet-Bix", customUnit: { label: "biscuit", pluralLabel: "biscuits", grams: 15 } });
    const ids = units.map((u) => u.id);
    expect(ids).toContain("piece");
    expect(ids).not.toContain("oz");
    expect(ids).not.toContain("lb");
    expect(ids).not.toContain("kg");
  });

  // Tried and removed per real client feedback: a "container" unit (1
  // container = the whole package) didn't read as a meaningful answer to
  // "how much did you have" — it implied the whole package regardless of
  // how much was actually consumed. `containerGrams` on a food object is
  // now simply ignored rather than turned into a selectable unit.
  it("never offers a 'container' unit, even when containerGrams is set on the food", () => {
    const units = unitsFor({ name: "Scanned Milk", liquid: true, containerGrams: 3000 });
    expect(units.find((u) => u.id === "container")).toBeUndefined();
  });

  it("never offers both 'g' and 'ml' for the same food (the base unit replaces, not adds to, the other)", () => {
    const units = unitsFor({ name: "Milk (full cream)" });
    const ids = units.map((u) => u.id);
    expect(ids.filter((id) => id === "g" || id === "ml")).toHaveLength(1);
  });

  // Real production report: a scanned sports drink ("Berry Ice," a
  // Powerade) offered tablespoons as a unit — nobody measures a drink in
  // tablespoons. The barcode path sets `liquid: true` explicitly (real
  // package data, not a name guess), with no "milk/juice/water" word in
  // the name for the plain-liquid carve-out to match, which is exactly
  // what's being tested here: an explicitly-flagged drink with no
  // matching name pattern must still correctly drop tbsp.
  it("never offers tablespoons for an actual drink — whether recognised by name or flagged explicitly from barcode package data", () => {
    const sportsDrink = unitsFor({ name: "Berry Ice", brand: "Powerade", liquid: true, containerGrams: 600 });
    expect(sportsDrink.map((u) => u.id)).not.toContain("tbsp");

    const smoothie = unitsFor({ name: "Rokeby Protein Smoothie Choc Honeycomb" });
    expect(smoothie.map((u) => u.id)).not.toContain("tbsp");

    // Not plain milk/juice/water and not a STRONG_LIQUID_RE phrase either
    // — isLiquidFood() itself wouldn't flag this from the name alone, so
    // this only matters once something (e.g. a barcode scan) sets
    // `liquid: true` on it directly; covered for completeness since a
    // real scan of a soda would do exactly that.
    const soda = unitsFor({ name: "Coca-Cola Classic", liquid: true });
    expect(soda.map((u) => u.id)).not.toContain("tbsp");
  });

  it("still offers tablespoons for plain milk/juice/water (genuinely used that way in recipes/coffee) and for pourable cooking liquids (oil, cream)", () => {
    expect(unitsFor({ name: "Milk (full cream)" }).map((u) => u.id)).toContain("tbsp");
    expect(unitsFor({ name: "Orange Juice" }).map((u) => u.id)).toContain("tbsp");
    expect(unitsFor({ name: "Olive Oil", liquid: true }).map((u) => u.id)).toContain("tbsp");
    expect(unitsFor({ name: "Thickened Cream", liquid: true }).map((u) => u.id)).toContain("tbsp");
  });
});

describe("scaleFoodByUnit — correct macro recalculation across the newly-added unit types", () => {
  const mince = { id: "mince", name: "Lean Mince", cals: 172, protein: 26, carbs: 0, fat: 7, per: 100, defaultQty: 150 };

  // Metric-only requirement: neither kg nor any imperial unit (oz, lb) is
  // offered as a selectable logging unit for any individual solid food —
  // meat/fish included (see the unitsFor tests above). A caller still
  // requesting one of these falls back to the food's own base unit (g),
  // the same safe fallback the "invalid unitId" case below already relies
  // on, rather than silently doing imperial/kg-scale math against a unit
  // that isn't really offered any more.
  it("falls back to grams (not lb/kg-scale math) when 'lb' or 'kg' is requested for any solid food", () => {
    const lbScaled = scaleFoodByUnit(mince, "lb", 1);
    expect(lbScaled.unitId).toBe("g");
    // "lb" isn't a real unit for this food any more, so the requested
    // quantity (1) is treated as 1 of the base unit (grams), not 1 pound.
    expect(lbScaled.cals).toBe(Math.round(172 / 100));

    const scaled = scaleFoodByUnit(mince, "kg", 0.5);
    expect(scaled.unitId).toBe("g");
    // "kg" isn't a real unit for this food, so the requested quantity (0.5)
    // is treated as 0.5 of the base unit (grams), not 0.5kg.
    expect(scaled.cals).toBe(Math.round((172 * 0.5) / 100));

    const rice = { id: "rice", name: "White Rice (cooked)", cals: 130, protein: 2.4, carbs: 28, fat: 0.3, per: 100, defaultQty: 180 };
    const riceScaled = scaleFoodByUnit(rice, "kg", 0.5);
    expect(riceScaled.unitId).toBe("g");
    expect(riceScaled.cals).toBe(Math.round((130 * 0.5) / 100));
  });

  const butter = { id: "butter", name: "Butter, Salted", cals: 717, protein: 0.9, carbs: 0.1, fat: 81, per: 100, defaultQty: 10 };

  it("recalculates correctly for 1 pat (5g) and 1 stick (113g)", () => {
    const pat = scaleFoodByUnit(butter, "pat", 1);
    expect(pat.cals).toBe(Math.round(717 * 0.05));
    const stick = scaleFoodByUnit(butter, "stick", 1);
    expect(stick.cals).toBe(Math.round(717 * 1.13));
  });

  // Real production bug: an invalid/stale unitId used to fall back to a
  // hardcoded UNIT_DEFS.g — numerically harmless for a liquid (ml and g
  // share `grams: 1`, which is exactly why this went unnoticed), but it
  // mislabeled the resolved entry's name and stored `unitId` as "g" for
  // what was actually a serving measured in ml: a real mismatch between
  // the unit shown/stored and the food's actual base unit.
  it("falls back to the food's own base unit (not a hardcoded 'g') for an invalid unitId", () => {
    const berryIce = { id: "off_1", name: "Berry Ice", cals: 27, protein: 0, carbs: 6, fat: 0, per: 100, defaultQty: 600, liquid: true, containerGrams: 600 };
    const scaled = scaleFoodByUnit(berryIce, "not-a-real-unit", 600);
    expect(scaled.unitId).toBe("ml");
    expect(scaled.name).toMatch(/600ml/);
    expect(scaled.name).not.toMatch(/600g\b/);
  });
});

describe("real library data sanity check", () => {
  it("every food in the static database still resolves a non-empty, g/ml-first unit list without throwing", () => {
    FOOD_DATABASE.forEach((food) => {
      const units = unitsFor(food);
      expect(units.length).toBeGreaterThan(0);
      expect(["g", "ml"]).toContain(units[0].id);
    });
  });

  // Nutrition Overhaul requirement: lb is never an acceptable DEFAULT
  // serving unit for an individual food — nobody opens a food's quantity
  // sheet and sees "0.15 lb of chicken breast" pre-selected; the first
  // entry (what the sheet actually defaults to) must always be g or ml.
  it("never defaults an individual food's quantity to lb/lbs, in the static database or a barcode-scanned shape", () => {
    FOOD_DATABASE.forEach((food) => {
      const defaultUnit = unitsFor(food)[0];
      expect(["lb", "lbs"]).not.toContain(defaultUnit.id);
    });
    const scannedSolid = { name: "Mystery Snack Bar", defaultQty: 40, liquid: false };
    const scannedLiquid = { name: "Mystery Drink", defaultQty: 330, liquid: true };
    expect(["lb", "lbs"]).not.toContain(unitsFor(scannedSolid)[0].id);
    expect(["lb", "lbs"]).not.toContain(unitsFor(scannedLiquid)[0].id);
  });

  // Stronger follow-up fix: kg isn't just kept out of the DEFAULT unit —
  // it's never offered as a selectable unit at all, anywhere, for any
  // individual food serving (static database, or a barcode-scanned/
  // custom-food shape), full stop. The only kg usage left in the app is
  // unrelated to food logging entirely: body-weight tracking
  // (CoachClientDetail.jsx) and the shopping list's own bulk/aggregated
  // display (shoppingList.js) — neither goes through unitsFor().
  it("never offers kg as a selectable unit at all, for any individual food", () => {
    FOOD_DATABASE.forEach((food) => {
      const ids = unitsFor(food).map((u) => u.id);
      expect(ids, food.name).not.toContain("kg");
    });
    const scannedSolid = { name: "Mystery Snack Bar", defaultQty: 40, liquid: false };
    const scannedLiquid = { name: "Mystery Drink", defaultQty: 330, liquid: true };
    const customMeat = { name: "Coach-added Lamb Shoulder", defaultQty: 300, liquid: false };
    expect(unitsFor(scannedSolid).map((u) => u.id)).not.toContain("kg");
    expect(unitsFor(scannedLiquid).map((u) => u.id)).not.toContain("kg");
    expect(unitsFor(customMeat).map((u) => u.id)).not.toContain("kg");
  });

  // Metric-only requirement: APEX is an Australian platform — no imperial
  // unit (oz, lb, or any other) is ever offered as a selectable logging
  // unit, for any food in the static database, a barcode scan, or a
  // custom food, full stop. Mirrors the kg check above.
  it("never offers oz, lb, or any other imperial unit, for any individual food", () => {
    const IMPERIAL_IDS = ["oz", "lb", "lbs", "ounce", "pound"];
    FOOD_DATABASE.forEach((food) => {
      const ids = unitsFor(food).map((u) => u.id);
      IMPERIAL_IDS.forEach((imperial) => expect(ids, `${food.name} offered ${imperial}`).not.toContain(imperial));
    });
    const scannedSolid = { name: "Mystery Snack Bar", defaultQty: 40, liquid: false };
    const scannedLiquid = { name: "Mystery Drink", defaultQty: 330, liquid: true };
    const customMeat = { name: "Coach-added Lamb Shoulder", defaultQty: 300, liquid: false };
    const customSpread = { name: "Homemade Peanut Butter", defaultQty: 20, liquid: false };
    [scannedSolid, scannedLiquid, customMeat, customSpread].forEach((food) => {
      const ids = unitsFor(food).map((u) => u.id);
      expect(ids).not.toContain("oz");
      expect(ids).not.toContain("lb");
    });
  });

  // Pinned by id (not just by re-typed name) against the REAL, live
  // database entries found misclassified during a full audit of every
  // one of its ~1,330 entries — this is what actually regresses if a
  // future edit to the classifier (or to these specific entries' names)
  // undoes the fix, not just a reconstructed test fixture.
  it("classifies real, specific database entries correctly by id (locks in the full-database audit)", () => {
    const byId = Object.fromEntries(FOOD_DATABASE.map((f) => [f.id, f]));
    const solid = ["f02", "g08", "v41", "bk08", "w068", "w119"]; // Tuna (spring water), Oatmeal (water), Water Chestnuts, Baking Soda, Massel Stock Powder, BCAA Energy Drink Mix
    const liquid = ["b05", "b07", "b08"]; // Coca-Cola, Beer, Wine (red)
    solid.forEach((id) => {
      expect(byId[id], `missing fixture id ${id} — database entry may have been renumbered`).toBeTruthy();
      expect(isLiquidFood(byId[id]), byId[id]?.name).toBe(false);
    });
    liquid.forEach((id) => {
      expect(byId[id], `missing fixture id ${id} — database entry may have been renumbered`).toBeTruthy();
      expect(isLiquidFood(byId[id]), byId[id]?.name).toBe(true);
    });
  });

  // Catches any future accidental duplicate before it ships — same food
  // and variant represented twice (by name) inflates search results and
  // invites a client to pick the "wrong" copy of what's really one food.
  it("has no two entries with the exact same name (case-insensitive)", () => {
    const seen = new Map();
    const dupes = [];
    FOOD_DATABASE.forEach((f) => {
      const key = (f.name || "").toLowerCase().trim();
      if (seen.has(key)) dupes.push([seen.get(key), f.id]);
      else seen.set(key, f.id);
    });
    expect(dupes).toEqual([]);
  });
});

describe("generic café coffees (espresso, long black/americano, latte, cappuccino, macchiato, mocha, iced coffee)", () => {
  const COFFEE_NAMES = ["Espresso / Short Black", "Long Black / Americano", "Latte", "Cappuccino", "Macchiato", "Mocha", "Iced Coffee"];

  function byName(name) {
    return FOOD_DATABASE.find((f) => f.name === name);
  }

  it("exists exactly once each, found by id (locks in the real database entries, not a reconstructed fixture)", () => {
    COFFEE_NAMES.forEach((name) => {
      const matches = FOOD_DATABASE.filter((f) => f.name === name);
      expect(matches.length, name).toBe(1);
    });
  });

  it("is searchable by its own name and by each listed synonym", () => {
    const queries = ["espresso", "short black", "long black", "americano", "latte", "cappuccino", "macchiato", "mocha", "iced coffee", "flat white"];
    queries.forEach((q) => {
      const hit = FOOD_DATABASE.some((f) => matchesSearch(f.name, q));
      expect(hit, `no food matches search "${q}"`).toBe(true);
    });
    // "flat white" already matches the existing b04 entry — confirms no
    // duplicate "Flat White" entry was needed alongside it.
    expect(matchesSearch("Coffee with Milk (flat white)", "flat white")).toBe(true);
  });

  it("classifies every one of them as liquid, ml-based (never grams)", () => {
    COFFEE_NAMES.forEach((name) => {
      const food = byName(name);
      expect(food, name).toBeTruthy();
      expect(isLiquidFood(food), name).toBe(true);
      expect(unitsFor(food)[0].id, name).toBe("ml");
    });
  });

  it("never offers 'cup' for a shot-sized black coffee (espresso, long black/americano, macchiato)", () => {
    ["Espresso / Short Black", "Long Black / Americano", "Macchiato"].forEach((name) => {
      const ids = unitsFor(byName(name)).map((u) => u.id);
      expect(ids, name).not.toContain("cup");
      expect(ids, name).not.toContain("tbsp");
    });
  });

  it("offers 'cup' for the larger milk-based/sweetened coffees (latte, cappuccino, mocha, iced coffee)", () => {
    ["Latte", "Cappuccino", "Mocha", "Iced Coffee"].forEach((name) => {
      const ids = unitsFor(byName(name)).map((u) => u.id);
      expect(ids, name).toContain("cup");
    });
  });

  it("represents black, milk-based and sweetened/mocha coffee as genuinely different nutrition, not copies of each other", () => {
    const espresso = byName("Espresso / Short Black");
    const latte = byName("Latte");
    const mocha = byName("Mocha");
    // Black coffee is calorie-negligible; milk-based is meaningfully
    // higher; mocha (chocolate added) is higher again, with real sugar.
    expect(espresso.cals).toBeLessThan(latte.cals);
    expect(latte.cals).toBeLessThan(mocha.cals);
    expect(mocha.sugar).toBeGreaterThan(0);
    expect(espresso.sugar || 0).toBe(0);
  });

  it("scales calories and macros correctly when the logged quantity changes (serving-size scaling)", () => {
    const latte = byName("Latte");
    const halfServe = scaleFoodByUnit(latte, "ml", 140); // half of its 280ml default
    const fullServe = scaleFoodByUnit(latte, "ml", 280);
    expect(halfServe.cals).toBe(Math.round(fullServe.cals / 2));
    expect(halfServe.protein).toBeCloseTo(fullServe.protein / 2, 1);

    const doubleShot = scaleFoodByUnit(byName("Espresso / Short Black"), "ml", 60); // a double shot
    expect(doubleShot.cals).toBe(Math.round(9 * 0.6));
  });

  it("logs with correct, non-zero macros via the same scaleFoodByUnit path the rest of Nutrition logging uses", () => {
    COFFEE_NAMES.forEach((name) => {
      const food = byName(name);
      const resolved = scaleFoodByUnit(food, "ml", food.defaultQty);
      expect(resolved.cals, name).toBeGreaterThan(0);
      expect(resolved.unitId, name).toBe("ml");
    });
  });
});

describe("getAllFoods — the shared customFoods + FOOD_DATABASE merge", () => {
  it("includes every static database food when there are no custom foods", () => {
    const all = getAllFoods([]);
    expect(all.length).toBe(FOOD_DATABASE.length);
  });

  it("includes custom foods alongside the static database", () => {
    const custom = { id: "cf_1", name: "My Homemade Soup", cals: 80, protein: 4, carbs: 10, fat: 2, per: 100 };
    const all = getAllFoods([custom]);
    expect(all.length).toBe(FOOD_DATABASE.length + 1);
    expect(all.find((f) => f.id === "cf_1")).toEqual(custom);
  });

  it("a custom food reusing a built-in id REPLACES the static entry rather than duplicating it", () => {
    const builtIn = FOOD_DATABASE[0];
    const imported = { ...builtIn, name: `${builtIn.name} (imported, with photo)`, photoUrl: "https://example.com/p.jpg" };
    const all = getAllFoods([imported]);
    // Same total count as the static database alone — the custom entry
    // replaced the static one in place, it didn't add a duplicate.
    expect(all.length).toBe(FOOD_DATABASE.length);
    const matches = all.filter((f) => f.id === builtIn.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe(imported.name);
  });

  it("tolerates a missing/undefined customFoods argument", () => {
    expect(() => getAllFoods(undefined)).not.toThrow();
    expect(getAllFoods(undefined).length).toBe(FOOD_DATABASE.length);
  });
});

describe("sanitizeFoodUnits — the single validation gate every custom/barcode/AI food save goes through", () => {
  it("clamps an invalid or missing per/defaultQty to the safe metric fallback, never 0 or negative", () => {
    expect(sanitizeFoodUnits({ per: 0 }).per).toBe(100);
    expect(sanitizeFoodUnits({ per: -50 }).per).toBe(100);
    expect(sanitizeFoodUnits({ per: "not a number" }).per).toBe(100);
    expect(sanitizeFoodUnits({ per: 250 }).per).toBe(250);
    expect(sanitizeFoodUnits({ defaultQty: -1 }).defaultQty).toBe(100);
    expect(sanitizeFoodUnits({ per: 250, defaultQty: 0 }).defaultQty).toBe(250);
  });

  it("leaves per/defaultQty untouched when not supplied at all (safe for a partial updateFood merge)", () => {
    const out = sanitizeFoodUnits({ cals: 200 });
    expect(out.per).toBeUndefined();
    expect(out.defaultQty).toBeUndefined();
    expect(out.cals).toBe(200);
  });

  it("strips any imperial or kg unit from a hand-curated/imported units list, keeping valid metric ones", () => {
    const out = sanitizeFoodUnits({ units: ["cup", "oz", "lb", "kg", "tbsp", "ounce", "pound", "not-a-real-unit"] });
    expect(out.units).toEqual(["cup", "tbsp"]);
  });

  it("drops a customUnit with a missing, zero, or non-positive gram weight rather than inventing one", () => {
    expect(sanitizeFoodUnits({ customUnit: { label: "scoop", grams: 0 } }).customUnit).toBeUndefined();
    expect(sanitizeFoodUnits({ customUnit: { label: "scoop", grams: -5 } }).customUnit).toBeUndefined();
    expect(sanitizeFoodUnits({ customUnit: { label: "scoop" } }).customUnit).toBeUndefined();
    expect(sanitizeFoodUnits({ customUnit: { grams: 30 } }).customUnit).toBeUndefined(); // no label
  });

  it("keeps a customUnit with a real, verified positive gram weight", () => {
    const out = sanitizeFoodUnits({ customUnit: { label: "scoop", pluralLabel: "scoops", grams: 30 } });
    expect(out.customUnit).toEqual({ label: "scoop", pluralLabel: "scoops", grams: 30 });
  });

  it("never throws on completely empty or malformed input", () => {
    expect(() => sanitizeFoodUnits({})).not.toThrow();
    expect(() => sanitizeFoodUnits({ units: "not-an-array", customUnit: "not-an-object" })).not.toThrow();
  });

  it("round-trips through unitsFor/scaleFoodByUnit cleanly for a sanitized barcode-style import", () => {
    // Simulates a hostile/malformed Open Food Facts response trying to
    // introduce an oz-based unit and a made-up customUnit weight.
    const rawImport = {
      id: "off_999",
      name: "Mystery Imported Snack",
      cals: 450,
      protein: 10,
      carbs: 50,
      fat: 20,
      per: -1, // malformed
      units: ["oz", "lb"], // forbidden
      customUnit: { label: "bag" }, // no verified weight
    };
    const clean = sanitizeFoodUnits(rawImport);
    expect(clean.per).toBe(100);
    expect(clean.units).toEqual([]);
    expect(clean.customUnit).toBeUndefined();
    const units = unitsFor(clean).map((u) => u.id);
    expect(units).toEqual(["g"]);
    const scaled = scaleFoodByUnit(clean, "g", 50);
    expect(scaled.cals).toBe(Math.round(450 * 0.5));
  });
});
