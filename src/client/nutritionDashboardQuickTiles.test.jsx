// @vitest-environment jsdom
//
// Nutrition dashboard redesign — the three quick-action tiles (Scan Food,
// Search Food, Fuel IQ) above Today's Meals. Scan/Search aren't reached from
// a meal, so they start on the meal for this time of day; the food page's
// own Meal picker changes it before saving (this replaced a separate
// "which meal?" popup that cost an extra tap every time). These tests lock
// that in, and confirm the per-meal add flow (meal already known) still
// saves straight through to that meal.
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

  it("Search Food opens the Add Food page, and the food page's Meal picker chooses where it's logged", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(<NutritionScreen {...baseProps({ onAddFood })} />);

    fireEvent.click(screen.getByText("Search Food"));
    expect(screen.getByPlaceholderText("Search foods, brands, meals")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search foods, brands, meals"), { target: { value: "Chicken Breast" } });
    fireEvent.click(screen.getByText("Chicken Breast"));

    // Nothing is saved until the client confirms on the food page.
    expect(onAddFood).not.toHaveBeenCalled();
    // The food page's Meal row lists all six meal slots — pick Lunch.
    fireEvent.click(screen.getByRole("button", { name: "Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Log" }));

    expect(onAddFood).toHaveBeenCalledTimes(1);
    const [meal, , dateKey] = onAddFood.mock.calls[0];
    expect(meal).toBe("Lunch");
    expect(dateKey).toBe(todayKey());
  });

  it("Scan Food opens the barcode scanner directly", () => {
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

  it("the per-meal add button logs to that meal with no extra step (regression)", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(<NutritionScreen {...baseProps({ onAddFood })} />);

    fireEvent.click(screen.getByLabelText("Add food to Breakfast")); // first meal row = Breakfast
    fireEvent.change(screen.getByPlaceholderText("Search foods, brands, meals"), { target: { value: "Chicken Breast" } });
    fireEvent.click(screen.getByText("Chicken Breast"));
    fireEvent.click(screen.getByRole("button", { name: "Log" }));

    expect(onAddFood).toHaveBeenCalledTimes(1);
    const [meal] = onAddFood.mock.calls[0];
    expect(meal).toBe("Breakfast");
    // No separate meal-choice popup exists any more.
    expect(screen.queryByText(/Add .*Chicken Breast.* to/)).toBeNull();
  });
});
