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

  it("gives a spread (butter/margarine/ghee) tbsp/tsp/cup/pat/stick, based in grams", () => {
    const units = unitsFor({ name: "Butter, Salted" });
    const ids = units.map((u) => u.id);
    expect(ids[0]).toBe("g");
    expect(ids).toEqual(expect.arrayContaining(["tbsp", "tsp", "cup", "pat", "stick"]));
  });

  it("gives a condiment tbsp/tsp without the weight units a plain solid gets", () => {
    const units = unitsFor({ name: "Capilano Pure Honey" });
    const ids = units.map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining(["tbsp", "tsp"]));
    expect(ids).not.toContain("lb");
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
});
