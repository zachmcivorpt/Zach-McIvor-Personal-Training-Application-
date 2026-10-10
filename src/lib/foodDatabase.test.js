// Regression coverage for the automatic per-food-type unit system (modelled
// on MyFitnessPal: a liquid gets ml/cup/tbsp, a spread gets tbsp/tsp/cup/
// pat/stick, a condiment gets tbsp/tsp, a generic weighed solid gets
// g/oz/lb/kg) — every food in the static library, and every future barcode
// scan, gets a sensible unit set automatically rather than needing each one
// hand-curated.
import { describe, it, expect } from "vitest";
import { isLiquidFood, unitsFor, scaleFoodByUnit, FOOD_DATABASE } from "./foodDatabase";

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

  // Real misclassifications found auditing every entry in the static
  // database: a whole DISH that merely contains a spread/condiment word
  // as an ingredient ("Butter Chicken," "Butter Beans," "Caesar Salad
  // (with dressing)," "Salt and Vinegar ... Chips," "... Honey Bar") was
  // logged at a full-serving size (100-350g, real defaultQty values) but
  // lost its normal weight units entirely to a spoon-only set — nobody
  // logs a plate of butter chicken in tablespoons.
  it("keeps normal weight units (not spoon-only) for a full-size dish that merely contains a spread/condiment word", () => {
    const butterChicken = unitsFor({ name: "Butter Chicken", defaultQty: 250 });
    expect(butterChicken.map((u) => u.id)).toEqual(expect.arrayContaining(["oz", "lb", "kg"]));
    expect(butterChicken.map((u) => u.id)).not.toContain("pat");

    const butterBeans = unitsFor({ name: "Butter Beans (cooked)", defaultQty: 150 });
    expect(butterBeans.map((u) => u.id)).toEqual(expect.arrayContaining(["oz", "lb", "kg"]));
    expect(butterBeans.map((u) => u.id)).not.toContain("pat");

    const caesarSalad = unitsFor({ name: "Caesar Salad (with dressing)", defaultQty: 200 });
    expect(caesarSalad.map((u) => u.id)).toEqual(expect.arrayContaining(["oz", "lb", "kg"]));

    const chips = unitsFor({ name: "Salt and Vinegar Crinkle Cut Potato Chips (Aldi)", defaultQty: 100 });
    expect(chips.map((u) => u.id)).toEqual(expect.arrayContaining(["oz", "lb", "kg"]));

    const honeyBar = unitsFor({ name: "Nature Valley Oats & Honey Bar", defaultQty: 42 });
    expect(honeyBar.map((u) => u.id)).toEqual(expect.arrayContaining(["oz", "lb", "kg"]));
  });

  it("gives a generic weighed solid oz/lb/kg on top of grams, matching MyFitnessPal's mince/potato unit lists", () => {
    const mince = unitsFor({ name: "5% Lean Beef Mince (Aldi)" });
    const minceIds = mince.map((u) => u.id);
    expect(minceIds[0]).toBe("g");
    expect(minceIds).toEqual(expect.arrayContaining(["oz", "lb", "kg"]));

    const potatoes = unitsFor({ name: "Washed White Potatoes" });
    expect(potatoes.map((u) => u.id)).toEqual(expect.arrayContaining(["oz", "lb", "kg"]));
  });

  it("still applies a food's own customUnit (e.g. Weet-Bix's 'biscuit') alongside the auto-detected weight units", () => {
    const units = unitsFor({ name: "Sanitarium Weet-Bix", customUnit: { label: "biscuit", pluralLabel: "biscuits", grams: 15 } });
    const ids = units.map((u) => u.id);
    expect(ids).toContain("piece");
    expect(ids).toEqual(expect.arrayContaining(["oz", "lb", "kg"]));
  });

  it("adds a 'container' unit at the real package size when one is known (e.g. from a barcode scan)", () => {
    const units = unitsFor({ name: "Scanned Milk", liquid: true, containerGrams: 3000 });
    const container = units.find((u) => u.id === "container");
    expect(container).toBeTruthy();
    expect(container.grams).toBe(3000);
    expect(container.label).toMatch(/3000ml/);
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

  it("recalculates correctly for 1 lb (453.59g)", () => {
    const scaled = scaleFoodByUnit(mince, "lb", 1);
    expect(scaled.cals).toBe(Math.round(172 * 4.5359));
    expect(scaled.protein).toBeCloseTo(26 * 4.5359, 0);
  });

  it("recalculates correctly for 0.5 kg", () => {
    const scaled = scaleFoodByUnit(mince, "kg", 0.5);
    expect(scaled.cals).toBe(Math.round(172 * 5));
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
});
