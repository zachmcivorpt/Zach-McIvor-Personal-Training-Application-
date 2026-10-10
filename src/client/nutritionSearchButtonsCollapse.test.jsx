// @vitest-environment jsdom
//
// Real production report: on iOS, the keyboard still covered the search
// results in "Add to [meal]" — root cause traced to WKWebView itself never
// resizing the page for the keyboard (fixed natively in ViewController.swift,
// but that needs a new App Store build to reach users). As an immediate,
// web-deployable mitigation: the "Scan barcode / Photo / Quick add" row ate
// real vertical space the results list could otherwise use while the
// keyboard is up. Hidden once there's an active search query — standard
// search UX (once you're typing, you're searching) that frees that space
// right away without waiting on a native release.
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

describe("NutritionScreen 'Add to [meal]' search buttons collapse", () => {
  it("shows Scan barcode / Photo / Quick add before any search text is entered", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getAllByText("Log")[0]);
    expect(screen.getByText("Scan barcode")).toBeTruthy();
    expect(screen.getByText("Photo")).toBeTruthy();
    expect(screen.getByText("Quick add")).toBeTruthy();
  });

  it("hides them once a search query is typed, freeing space for results", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getAllByText("Log")[0]);
    const input = screen.getByPlaceholderText("Search foods or meals");
    fireEvent.change(input, { target: { value: "chicken" } });

    expect(screen.queryByText("Scan barcode")).toBeNull();
    expect(screen.queryByText("Photo")).toBeNull();
    expect(screen.queryByText("Quick add")).toBeNull();
  });

  it("shows them again once the search is cleared", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getAllByText("Log")[0]);
    const input = screen.getByPlaceholderText("Search foods or meals");
    fireEvent.change(input, { target: { value: "chicken" } });
    fireEvent.change(input, { target: { value: "" } });

    expect(screen.getByText("Scan barcode")).toBeTruthy();
  });
});
