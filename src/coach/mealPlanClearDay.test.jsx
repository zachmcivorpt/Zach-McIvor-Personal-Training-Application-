// @vitest-environment jsdom
//
// "Clear day" in the meal plan builder: empties every slot on the day being
// edited in one go (two taps — the first arms it), leaving the other days
// untouched, instead of removing meals one at a time.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MealPlanBuilder from "./MealPlanBuilder";

const setMealPlan = vi.fn();
const meal = (id, name) => ({ id, name, cals: 400, protein: 40, carbs: 30, fat: 10, ingredients: [] });
const plan = {
  days: [
    { id: "d1", label: "Monday", weekIndex: 0, meals: { Breakfast: ["m1"], Lunch: ["m2"], Dinner: ["m3"], Snacks: [] } },
    { id: "d2", label: "Tuesday", weekIndex: 0, meals: { Breakfast: ["m1"], Lunch: [], Dinner: ["m3"], Snacks: [] } },
  ],
  weeks: 1,
  startDate: "2026-11-16",
};
vi.mock("../lib/AppContext", () => ({
  useApp: () => ({ db: { masterMeals: [meal("m1", "Oats"), meal("m2", "Wrap"), meal("m3", "Curry")], mealPlans: { "client-a": [plan] } }, setMealPlan }),
}));

const client = { id: "client-a", name: "Alice", nutritionTargets: { calories: 2200, proteinPct: 29, carbsPct: 44, fatPct: 27 } };

afterEach(() => {
  cleanup();
  setMealPlan.mockClear();
});

describe("MealPlanBuilder — Clear day", () => {
  it("needs a second tap, then empties only the day being edited", () => {
    const showToast = vi.fn();
    render(<MealPlanBuilder client={client} onClose={() => {}} showToast={showToast} />);
    fireEvent.click(screen.getByLabelText("Clear this day"));
    // First tap only arms it.
    expect(screen.getByLabelText("Tap again to clear this day")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Tap again to clear this day"));
    expect(showToast).toHaveBeenCalledWith("Cleared Monday");

    fireEvent.click(screen.getByText("Publish"));
    const saved = setMealPlan.mock.calls[0][1].days;
    expect(saved.find((d) => d.id === "d1").meals).toEqual({ Breakfast: [], Lunch: [], Dinner: [], Snacks: [] });
    expect(saved.find((d) => d.id === "d2").meals).toEqual(plan.days[1].meals);
  });

  it("is disabled on a day with no meals", () => {
    render(<MealPlanBuilder client={client} onClose={() => {}} showToast={() => {}} />);
    fireEvent.click(screen.getByLabelText("Clear this day"));
    fireEvent.click(screen.getByLabelText("Tap again to clear this day"));
    expect(screen.getByLabelText("Clear this day").disabled).toBe(true);
  });
});
