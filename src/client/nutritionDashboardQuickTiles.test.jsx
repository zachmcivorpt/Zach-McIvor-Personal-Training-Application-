// @vitest-environment jsdom
//
// Nutrition dashboard redesign — the three quick-action tiles (Scan Food,
// Search Food, Fuel IQ) above Today's Meals. Scan/Search open with no meal
// preselected, unlike the per-meal add buttons, so a food picked this way
// needs an explicit "which meal?" step before it's actually saved — these
// tests lock that behaviour in, and confirm the existing per-meal add flow
// (meal already known) still saves straight through with no extra step.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NutritionScreen } from "./ClientApp";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: { customFoods: [], mealPlans: {}, masterMeals: [] },
    currentUser: { id: "client-a" },
    swapMealPlanMeal: vi.fn(),
  }),
}));

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DEFAULT_NUTRITION = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  water: 0,
  meals: { Breakfast: [], Lunch: [], Dinner: [], Snacks: [], "Pre-workout": [], "Post-workout": [] },
};

function baseProps(overrides = {}) {
  return {
    nutritionByDateKey: { [todayKey()]: DEFAULT_NUTRITION },
    targets: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
    onAddFood: vi.fn(() => Promise.resolve()),
    onRemoveFood: vi.fn(() => Promise.resolve()),
    onAddWater: vi.fn(),
    savedMeals: [],
    onCreateSavedMeal: vi.fn(),
    onDeleteSavedMeal: vi.fn(),
    recentFoods: [],
    showToast: vi.fn(),
    ...overrides,
  };
}

// jsdom doesn't implement scrollIntoView at all — stub it globally so the
// Fuel IQ tile's handler doesn't throw when it fires.
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

describe("Nutrition dashboard quick-action tiles", () => {
  it("renders the three reference tiles above Today's Meals, with no separate AI Food Help tile", () => {
    render(<NutritionScreen {...baseProps()} />);
    expect(screen.getByText("Scan Food")).toBeTruthy();
    expect(screen.getByText("Search Food")).toBeTruthy();
    expect(screen.getByText("Fuel IQ")).toBeTruthy();
    expect(screen.queryByText("AI Food Help")).toBeNull();
  });

  it("Search Food (no meal preselected) asks which meal before saving, then logs to the chosen meal", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(<NutritionScreen {...baseProps({ onAddFood })} />);

    fireEvent.click(screen.getByText("Search Food"));
    expect(screen.getByPlaceholderText("Search foods or meals")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search foods or meals"), { target: { value: "Chicken Breast" } });
    fireEvent.click(screen.getByText("Chicken Breast"));

    // Quantity sheet confirm — should NOT save yet, since no meal was ever
    // chosen for this dashboard-level entry.
    fireEvent.click(screen.getByText(/ADD/).closest("button"));
    expect(onAddFood).not.toHaveBeenCalled();

    // The meal-choice step should now be showing all six meal slots.
    expect(screen.getByText(/Add .*Chicken Breast.* to/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lunch" }));

    expect(onAddFood).toHaveBeenCalledTimes(1);
    const [meal, , dateKey] = onAddFood.mock.calls[0];
    expect(meal).toBe("Lunch");
    expect(dateKey).toBe(todayKey());
  });

  it("Scan Food opens the barcode scanner directly, with no meal preselected", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByText("Scan Food"));
    expect(document.getElementById("barcode-scanner-region")).toBeTruthy();
  });

  it("Fuel IQ tile scrolls to the existing AiNutritionHelpCard (Fuel IQ heading) rather than a new screen", () => {
    render(<NutritionScreen {...baseProps()} />);
    // Confirms the one AI nutrition feature is still in the DOM (its "FUEL
    // IQ" heading) and untouched — only the dashboard's dedicated "AI Food
    // Help" tile pointing at the same feature was removed.
    expect(screen.getByText("FUEL IQ")).toBeTruthy();

    fireEvent.click(screen.getByText("Fuel IQ"));
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("the per-meal add button still saves straight through with no meal-choice step (regression)", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(<NutritionScreen {...baseProps({ onAddFood })} />);

    fireEvent.click(screen.getByLabelText("Add food to Breakfast")); // first meal row = Breakfast
    fireEvent.change(screen.getByPlaceholderText("Search foods or meals"), { target: { value: "Chicken Breast" } });
    fireEvent.click(screen.getByText("Chicken Breast"));
    fireEvent.click(screen.getByText(/ADD/).closest("button"));

    expect(onAddFood).toHaveBeenCalledTimes(1);
    const [meal] = onAddFood.mock.calls[0];
    expect(meal).toBe("Breakfast");
    // No meal-choice sheet should have appeared.
    expect(screen.queryByText(/Add .*Chicken Breast.* to/)).toBeNull();
  });
});
