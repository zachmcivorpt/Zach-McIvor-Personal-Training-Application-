// @vitest-environment jsdom
//
// Compact mobile search layout: the "Add to [meal]" search results list
// shows a food/saved-meal's name with only its kcal value directly
// underneath — the P/C/F macro breakdown that used to render there is
// removed, matching MyFitnessPal's compact mobile list. This applies to
// search results ONLY; the full macro breakdown stays everywhere else a
// food is actually reviewed/logged (the quantity sheet, the recent-foods
// list, the My Meals tab) — scoped precisely so this doesn't regress
// macro visibility anywhere but the search dropdown itself.
import { afterEach, describe, expect, it, vi } from "vitest";
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
    onRemoveFood: vi.fn(),
    onAddWater: vi.fn(),
    savedMeals: [{ id: "m1", name: "My Protein Shake", cals: 220, protein: 30, carbs: 10, fat: 5 }],
    onCreateSavedMeal: vi.fn(),
    onDeleteSavedMeal: vi.fn(),
    recentFoods: [{ id: "r1", name: "Pea Protein Shake", cals: 200, protein: 30, carbs: 10, fat: 5 }],
    showToast: vi.fn(),
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("Nutrition search results — kcal only, no macro breakdown", () => {
  it("shows a searched food's name with only its kcal value underneath, no P/C/F text", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    fireEvent.change(screen.getByPlaceholderText("Search foods or meals"), { target: { value: "Chicken Breast" } });

    const row = screen.getByText("Chicken Breast").closest("button");
    expect(row).toBeTruthy();
    expect(row.textContent).toContain("165 kcal");
    expect(row.textContent).not.toMatch(/P\d.*C\d.*F\d/);
  });

  it("shows a matched saved meal's name with 'My Meals · <kcal>', no P/C/F text", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    fireEvent.change(screen.getByPlaceholderText("Search foods or meals"), { target: { value: "Protein Shake" } });

    expect(screen.getByText("My Protein Shake")).toBeTruthy();
    expect(screen.getByText("My Meals · 220 kcal")).toBeTruthy();
    expect(screen.queryByText(/P\d.*C\d.*F\d/)).toBeNull();
  });

  // Scoped change: the recent-foods list (shown before any search text is
  // typed, not a search "result") keeps its existing macro display
  // untouched — only the active-search results list changed.
  it("still shows the full macro breakdown in the recent-foods list (not a search result)", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    expect(screen.getByText("Pea Protein Shake")).toBeTruthy();
    expect(screen.getByText(/P30.*C10.*F5/)).toBeTruthy();
  });

  // Keyboard/search/logging behaviour must be unaffected by the layout
  // change: typing still filters results, and selecting a search result
  // still opens the quantity sheet for that exact food (same as before).
  it("still filters as you type and still opens the quantity sheet when a result is tapped", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    const input = screen.getByPlaceholderText("Search foods or meals");
    fireEvent.change(input, { target: { value: "Chicken Breast" } });
    expect(screen.queryByText("Brown Rice (cooked)")).toBeNull();

    fireEvent.click(screen.getByText("Chicken Breast"));
    // The quantity sheet (FoodQuantitySheet) opens with this food's name
    // as its title and its own, unabridged macro/quantity controls.
    expect(screen.getAllByText("Chicken Breast").length).toBeGreaterThan(0);
    expect(document.querySelector('input[type="number"]')).toBeTruthy();
  });
});
