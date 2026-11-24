// @vitest-environment jsdom
// #327: Nutrition Detail must show exactly what Home / the Nutrition tab show.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { nutritionDetailRows, macroEnergySplit, calorieStatus, NutritionDetailSheet, ClientThemeContext } from "./ClientApp";
import { OVER_RED } from "../theme";

// The client's day from the bug report screenshot (fat over its target).
const day = { calories: 1803.4, protein: 101.44, carbs: 231.52, fat: 52.66 };
const targets = { calories: 2400, protein: 180, carbs: 323, fat: 51.2 };

afterEach(() => cleanup());

describe("Nutrition Detail figures", () => {
  it("uses the cards' calories and remaining maths", () => {
    const [cal] = nutritionDetailRows(day, targets);
    expect(cal.value).toBe(1803);
    const s = calorieStatus(day.calories, targets.calories);
    expect([cal.amount, cal.over, cal.color]).toEqual([s.amount, s.over, s.color]);
    expect(cal.amount).toBe(597);
  });

  it("shows macros rounded like the cards and 'over' past target, never '0g left'", () => {
    const rows = Object.fromEntries(nutritionDetailRows(day, targets).map((r) => [r.key, r]));
    expect(rows.protein).toMatchObject({ value: 101.4, amount: 78.6, over: false });
    expect(rows.carbs).toMatchObject({ value: 231.5, amount: 91.5, over: false });
    expect(rows.fat).toMatchObject({ value: 52.7, amount: 1.5, over: true, color: OVER_RED });
  });

  it("macro percentages always add to 100", () => {
    const split = macroEnergySplit(day);
    expect(split.reduce((a, p) => a + p.pct, 0)).toBe(100);
    expect(macroEnergySplit({ protein: 101.4, carbs: 231.5, fat: 51.2 }).map((p) => p.pct)).toEqual([22, 52, 26]);
    expect(macroEnergySplit({})).toEqual([]);
  });

  for (const dark of [false, true]) {
    it(`the page shows the cards' numbers (${dark ? "dark" : "light"})`, () => {
      render(
        <ClientThemeContext.Provider value={dark}>
          <NutritionDetailSheet open onClose={() => {}} nutrition={day} targets={targets} />
        </ClientThemeContext.Provider>
      );
      expect(screen.getByTestId("nd-calories").textContent).toContain("1,803");
      expect(screen.getByTestId("nd-calories").textContent).toContain("597 left");
      expect(screen.getByTestId("nd-fat").textContent).toContain("1.5g over");
      expect(screen.getByTestId("nd-fat").textContent).not.toContain("0g left");
      expect(screen.getByTestId("nd-donut-kcal").textContent).toBe("1,803");
    });
  }
});
