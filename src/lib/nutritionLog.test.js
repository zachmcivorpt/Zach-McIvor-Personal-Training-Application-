import { describe, expect, it } from "vitest";
import { hasFoodLogged, baseFoodName, entryAmountLabel, buildFrequentFoods, entrySourceFood, scaleServings, sourceSnapshot } from "./nutritionLog";
import { scaleFoodByUnit, getAllFoods } from "./foodDatabase";

function key(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CHICKEN = getAllFoods([]).find((f) => f.name === "Chicken Breast");

describe("hasFoodLogged", () => {
  it("is false for a water-only day (the doc exists, but no food was logged)", () => {
    expect(hasFoodLogged({ date: key(0), water: 1.5, meals: { Breakfast: [], Lunch: [] } })).toBe(false);
    expect(hasFoodLogged({ date: key(0), water: 1.5 })).toBe(false);
    expect(hasFoodLogged(null)).toBe(false);
  });
  it("is true once any meal has an item", () => {
    expect(hasFoodLogged({ meals: { Breakfast: [], Snacks: [{ id: "a", name: "Apple", cals: 52 }] } })).toBe(true);
  });
});

describe("entry names and amounts", () => {
  it("splits a scaled entry into the food and the amount", () => {
    const e = scaleFoodByUnit(CHICKEN, "g", 150);
    expect(e.name).toBe("Chicken Breast (150g)");
    expect(baseFoodName(e)).toBe("Chicken Breast");
    expect(entryAmountLabel(e)).toBe("150g");
  });
  it("leaves a name with its own brackets alone when it isn't a scaled entry", () => {
    const meal = { id: "m1", name: "Burrito (chicken)", cals: 500 };
    expect(baseFoodName(meal)).toBe("Burrito (chicken)");
    expect(entryAmountLabel(meal)).toBe("");
  });
});

describe("buildFrequentFoods", () => {
  it("groups the same food logged at different amounts, most-logged first", () => {
    const days = [
      { date: key(0), meals: { Lunch: [scaleFoodByUnit(CHICKEN, "g", 200)], Breakfast: [{ id: "o1", name: "Oats (40g)", baseFoodId: "oats", grams: 40, cals: 150 }] } },
      { date: key(1), meals: { Lunch: [scaleFoodByUnit(CHICKEN, "g", 150)] } },
      { date: key(2), meals: { Dinner: [scaleFoodByUnit(CHICKEN, "g", 180)] } },
    ];
    const rows = buildFrequentFoods(days);
    expect(rows[0].name).toBe("Chicken Breast");
    expect(rows[0].count).toBe(3);
    // The most recent amount is what a + re-logs.
    expect(rows[0].entry.grams).toBe(200);
    expect(rows).toHaveLength(2);
  });
  it("ignores days outside the window and malformed entries", () => {
    const rows = buildFrequentFoods([
      { date: key(90), meals: { Lunch: [{ id: "x", name: "Old food", cals: 1 }] } },
      { date: key(1), meals: { Lunch: [null, { id: "y" }, { id: "z", name: "Apple", cals: 52 }] } },
      { meals: {} },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Apple"]);
  });
});

describe("entrySourceFood", () => {
  it("re-opens a new entry from its stored source food, at the amount logged", () => {
    const e = { ...scaleFoodByUnit(CHICKEN, "g", 150), src: sourceSnapshot(CHICKEN) };
    const r = entrySourceFood(e, {});
    expect(r.food.cals).toBe(CHICKEN.cals);
    expect(r.unitId).toBe("g");
    expect(r.qty).toBe(150);
  });
  it("falls back to the library by baseFoodId for an older entry", () => {
    const e = scaleFoodByUnit(CHICKEN, "g", 150);
    const r = entrySourceFood(e, { [CHICKEN.id]: CHICKEN });
    expect(r.food).toBe(CHICKEN);
    expect(r.qty).toBe(150);
  });
  it("rebuilds per-gram values from an entry with a known weight", () => {
    const e = { id: "e", baseFoodId: "gone", name: "Mystery (200g)", grams: 200, cals: 300, protein: 20, carbs: 30, fat: 10 };
    const r = entrySourceFood(e, {});
    expect(r.food.per).toBe(200);
    expect(r.qty).toBe(200);
  });
  it("treats a whole-meal entry as servings, scaling every macro", () => {
    const e = { id: "m1", name: "Chicken Bowl", cals: 600, protein: 45, carbs: 60, fat: 18 };
    const r = entrySourceFood(e, {});
    expect(r.food.servingOnly).toBe(true);
    expect(r.qty).toBe(1);
    const half = scaleServings(r.food, 0.5);
    expect(half).toMatchObject({ cals: 300, protein: 22.5, carbs: 30, fat: 9, servings: 0.5, name: "Chicken Bowl" });
    expect(entryAmountLabel(half)).toBe("0.5 × serving");
    // Re-opening that half serving starts at 0.5 of the same one serving.
    const again = entrySourceFood(half, {});
    expect(again.qty).toBe(0.5);
    expect(again.food.cals).toBe(600);
  });
});
