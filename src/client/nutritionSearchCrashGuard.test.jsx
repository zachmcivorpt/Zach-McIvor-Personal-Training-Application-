// @vitest-environment jsdom
//
// Regression coverage for a real production report: typing in the
// Nutrition "Add to [meal]" search bar made the whole sheet vanish
// mid-search, with the keyboard left open and the page behind it visible
// (see also bodyScrollLockIOS.test.jsx for the related "background still
// scrolls" bug from the same report). One concrete way this can happen:
// the search-results filter called `.name.toLowerCase()` directly on
// every saved meal and food — a single malformed entry (a saved meal or
// custom food with a missing/null `name`) throws there and crashes the
// render on every keystroke once the query reaches it, taking the whole
// sheet down with it. Fixed by filtering through the already-null-safe
// `matchesSearch()` helper (same one every other search in this app
// already uses) instead of a raw, unguarded `.toLowerCase()` chain.
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

const DEFAULT_NUTRITION = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  water: 0,
  meals: { Breakfast: [], Lunch: [], Dinner: [], Snacks: [], "Pre-workout": [], "Post-workout": [] },
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function baseProps(overrides = {}) {
  return {
    nutritionByDateKey: { [todayKey()]: DEFAULT_NUTRITION },
    targets: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
    onAddFood: vi.fn(() => Promise.resolve()),
    onRemoveFood: vi.fn(),
    onAddWater: vi.fn(),
    savedMeals: [],
    onCreateSavedMeal: vi.fn(),
    onDeleteSavedMeal: vi.fn(),
    recentFoods: [],
    showToast: vi.fn(),
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("NutritionScreen search results — malformed-data crash guard", () => {
  it("does not throw and keeps the sheet open when a saved meal has a missing/null name", () => {
    render(<NutritionScreen {...baseProps({ savedMeals: [{ id: "bad-1", name: null, cals: 100, protein: 1, carbs: 1, fat: 1 }] })} />);
    fireEvent.click(screen.getAllByText("Log")[0]);
    const input = screen.getByPlaceholderText("Search foods or meals");

    expect(() => fireEvent.change(input, { target: { value: "anything" } })).not.toThrow();
    // The sheet (and its search box) must still be on screen afterwards.
    expect(screen.getByPlaceholderText("Search foods or meals")).toBeTruthy();
  });

  it("still correctly matches well-formed saved meals and foods by name", () => {
    render(<NutritionScreen {...baseProps({ savedMeals: [{ id: "m1", name: "Pea Protein Shake", cals: 200, protein: 30, carbs: 10, fat: 5 }] })} />);
    fireEvent.click(screen.getAllByText("Log")[0]);
    const input = screen.getByPlaceholderText("Search foods or meals");
    fireEvent.change(input, { target: { value: "pea protein" } });
    expect(screen.getByText("Pea Protein Shake")).toBeTruthy();
  });
});
