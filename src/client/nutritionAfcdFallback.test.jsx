// @vitest-environment jsdom
//
// The Australian Food Composition Database (afcdFoods.js) is a fallback
// generic-food source for the "Add to [meal]" search — it must only ever
// appear when APEX's own already-verified sources (customFoods +
// FOOD_DATABASE) have nothing for the typed query, never duplicating or
// competing with a result the client has already confirmed is right.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NutritionScreen } from "./ClientApp";

vi.mock("../lib/AppContext", () => ({
  useApp: () => ({
    db: { customFoods: [], mealPlans: {}, masterMeals: [] },
    currentUser: { id: "client-a" },
    swapMealPlanMeal: vi.fn(),
    createFood: vi.fn((data) => ({ id: "new_1", ...data })),
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
    savedMeals: [],
    onCreateSavedMeal: vi.fn(),
    onDeleteSavedMeal: vi.fn(),
    recentFoods: [],
    showToast: vi.fn(),
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("Nutrition search — AFCD fallback", () => {
  it("falls back to AFCD when the local food library has no match at all", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    fireEvent.change(screen.getByPlaceholderText("Search foods or meals"), { target: { value: "ostrich" } });

    expect(screen.getByText("FROM THE AUSTRALIAN FOOD COMPOSITION DATABASE")).toBeTruthy();
    expect(screen.getAllByText(/Ostrich/).length).toBeGreaterThan(0);
  });

  it("does not show the AFCD section when the local food library already has a match", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    fireEvent.change(screen.getByPlaceholderText("Search foods or meals"), { target: { value: "Chicken Breast" } });

    expect(screen.queryByText("FROM THE AUSTRALIAN FOOD COMPOSITION DATABASE")).toBeNull();
  });

  it("tapping an AFCD result opens the quantity sheet labelled as coming from AFCD, not the barcode database", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    fireEvent.change(screen.getByPlaceholderText("Search foods or meals"), { target: { value: "ostrich" } });
    fireEvent.click(screen.getAllByText(/Ostrich/)[0]);

    expect(screen.getByText(/From the Australian Food Composition Database/)).toBeTruthy();
  });

  it("shows no results message when neither local nor AFCD has anything", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    fireEvent.change(screen.getByPlaceholderText("Search foods or meals"), { target: { value: "zzzznonexistentfood" } });

    expect(screen.getByText(/No matches for/)).toBeTruthy();
    expect(screen.queryByText("FROM THE AUSTRALIAN FOOD COMPOSITION DATABASE")).toBeNull();
  });
});
