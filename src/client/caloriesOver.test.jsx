// @vitest-environment jsdom
//
// Going over the calorie target used to show "0 left" / "Calories remaining
// 0" with a green bar (red only past 10% over). It now shows how much over,
// in red, as soon as the day goes over (REGRESSION_TESTS.md #114).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NutritionSummaryCard, ClientThemeContext, calorieStatus } from "./ClientApp";
import { OVER_RED, GOAL_GREEN, MEASURE_BLUE } from "../theme";

afterEach(() => cleanup());

const TARGETS = { calories: 2250, protein: 174, carbs: 292, fat: 43, water: 3 };

describe("calories over target", () => {
  it("calorieStatus: under, exactly on, and over", () => {
    expect(calorieStatus(1852, 2250)).toEqual({ over: false, amount: 398, color: MEASURE_BLUE });
    expect(calorieStatus(2250, 2250)).toEqual({ over: false, amount: 0, color: GOAL_GREEN });
    expect(calorieStatus(2379, 2250)).toEqual({ over: true, amount: 129, color: OVER_RED });
    expect(calorieStatus(2251, 2250).over).toBe(true);
    expect(calorieStatus(500, 0).over).toBe(false);
  });

  it("Home shows '129 over' in red instead of '0 left'", () => {
    render(
      <ClientThemeContext.Provider value={false}>
        <NutritionSummaryCard nutrition={{ calories: 2379, protein: 193.6, carbs: 264.9, fat: 54.8, water: 0 }} targets={TARGETS} onLogFood={() => {}} onLogWater={() => {}} isToday />
      </ClientThemeContext.Provider>
    );
    const amount = screen.getByText("129");
    expect(amount.parentElement.textContent).toMatch(/129\s*over/);
    expect(amount.parentElement.style.color).toBe("rgb(239, 68, 68)");
    expect(screen.queryByText(/left/)).toBeNull();
  });
});
