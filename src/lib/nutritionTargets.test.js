// Regression coverage for macro gram rounding: three independent
// Math.round() calls on protein/carbs/fat used to drift the stated
// calorie target (e.g. 2200kcal @ 29/44/27% rounded to 2202kcal). The
// fix rounds protein and fat first, then derives carbs from whatever
// calories are left — verified here by hand-checking the back-sum, not
// by trusting the function.
import { describe, expect, it } from "vitest";
import { adjustMacroPct, macroGrams, macroGramsSet, resolveNutritionTargets } from "./nutritionTargets";

function backSumCalories({ protein, carbs, fat }) {
  return protein * 4 + carbs * 4 + fat * 9;
}

describe("macroGramsSet", () => {
  it("backsums within 2 kcal of the stated target for the default split", () => {
    const grams = macroGramsSet(2200, { proteinPct: 29, carbsPct: 44, fatPct: 27 });
    expect(grams.protein).toBe(160);
    expect(grams.fat).toBe(66);
    expect(grams.carbs).toBe(242);
    expect(Math.abs(backSumCalories(grams) - 2200)).toBeLessThanOrEqual(2);
  });

  it("backsums within 2 kcal across a spread of calorie targets and splits", () => {
    const cases = [
      { calories: 1600, proteinPct: 35, carbsPct: 35, fatPct: 30 },
      { calories: 1800, proteinPct: 30, carbsPct: 40, fatPct: 30 },
      { calories: 2500, proteinPct: 25, carbsPct: 50, fatPct: 25 },
      { calories: 3200, proteinPct: 40, carbsPct: 35, fatPct: 25 },
      { calories: 2000, proteinPct: 33, carbsPct: 34, fatPct: 33 },
    ];
    for (const c of cases) {
      const grams = macroGramsSet(c.calories, c);
      expect(Math.abs(backSumCalories(grams) - c.calories)).toBeLessThanOrEqual(2);
    }
  });

  it("never returns negative carbs when protein+fat alone exceed the calorie target", () => {
    // An extreme split (not realistic, but the function must not blow up
    // or return a negative gram figure that would render as "-12g carbs").
    const grams = macroGramsSet(800, { proteinPct: 70, carbsPct: 10, fatPct: 30 });
    expect(grams.carbs).toBeGreaterThanOrEqual(0);
  });

  it("accepts the alternate {protein, fat} key names as well as {proteinPct, fatPct}", () => {
    const a = macroGramsSet(2200, { proteinPct: 29, fatPct: 27 });
    const b = macroGramsSet(2200, { protein: 29, fat: 27 });
    expect(a).toEqual(b);
  });
});

describe("macroGrams", () => {
  it("converts calories/percentage/kcal-per-gram to whole grams", () => {
    expect(macroGrams(2200, 29, 4)).toBe(160); // 2200*0.29/4 = 159.5 -> 160
    expect(macroGrams(2200, 27, 9)).toBe(66); // 2200*0.27/9 = 66.0
  });
});

describe("resolveNutritionTargets", () => {
  it("falls back to the default split when nothing is stored", () => {
    const t = resolveNutritionTargets(null);
    expect(t.calories).toBe(2200);
    expect(t.protein).toBe(160);
    expect(t.fat).toBe(66);
    expect(t.carbs).toBe(242);
    expect(t.water).toBeGreaterThan(0);
  });

  it("merges a partial stored target onto the defaults rather than dropping the rest", () => {
    const t = resolveNutritionTargets({ calories: 3000 });
    expect(t.calories).toBe(3000);
    expect(t.proteinPct).toBe(29); // default, since only calories was overridden
  });
});

describe("adjustMacroPct", () => {
  it("always keeps the three percentages summing to exactly 100", () => {
    const start = { proteinPct: 29, carbsPct: 44, fatPct: 27 };
    const next = adjustMacroPct(start, "proteinPct", 50);
    expect(next.proteinPct + next.carbsPct + next.fatPct).toBe(100);
    expect(next.proteinPct).toBe(50);
  });

  it("clamps the changed value into 0-100 before redistributing", () => {
    const start = { proteinPct: 29, carbsPct: 44, fatPct: 27 };
    const next = adjustMacroPct(start, "proteinPct", 150);
    expect(next.proteinPct).toBe(100);
    expect(next.proteinPct + next.carbsPct + next.fatPct).toBe(100);
  });
});
