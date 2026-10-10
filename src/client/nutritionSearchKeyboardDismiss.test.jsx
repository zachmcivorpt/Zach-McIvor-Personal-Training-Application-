// @vitest-environment jsdom
//
// Regression coverage for a real production report: on iOS, the on-screen
// keyboard stayed up ("attached") after searching for and logging a food
// in the Nutrition "Add to [meal]" sheet — typing into the search bar,
// then tapping a result, left the keyboard covering the screen instead of
// dismissing like a native app would. Root cause: nothing ever called
// .blur() on the search input — iOS only dismisses its keyboard when the
// focused element is explicitly blurred (or something else takes focus),
// not just because the element it's attached to scrolls off or a sibling
// button gets tapped. Fixed by blurring the search input on every path
// that logically finishes the search: picking a food or saved meal, and
// closing the sheet.
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

describe("NutritionScreen search keyboard dismissal", () => {
  it("blurs the search input when the Add sheet is closed", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getAllByText("Log")[0]);
    const input = screen.getByPlaceholderText("Search foods or meals");
    input.focus();
    expect(document.activeElement).toBe(input);

    // The sheet's own X button closes it.
    const closeButtons = screen.getAllByRole("button").filter((b) => b.querySelector(".lucide-x"));
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(document.activeElement).not.toBe(input);
  });

  it("blurs the search input when a matching saved meal is tapped from search results", () => {
    render(<NutritionScreen {...baseProps({ savedMeals: [{ id: "m1", name: "Pea Protein Shake", cals: 200, protein: 30, carbs: 10, fat: 5 }] })} />);
    fireEvent.click(screen.getAllByText("Log")[0]);
    const input = screen.getByPlaceholderText("Search foods or meals");
    input.focus();
    fireEvent.change(input, { target: { value: "Pea Protein" } });
    expect(document.activeElement).toBe(input);

    fireEvent.click(screen.getByText("Pea Protein Shake"));
    expect(document.activeElement).not.toBe(input);
  });
});
