// @vitest-environment jsdom
//
// Immediate, web-deployable mitigation for the keyboard-covers-search-
// results bug: on iOS, WKWebView (this app's actual native shell, unlike
// Safari) never reports the on-screen keyboard to the page at all — no
// resize event, no visualViewport change, nothing — so no JS-side keyboard
// detection can be trusted. Instead of trying to detect it, a large spacer
// reserves extra scroll room below the results while the search box has
// focus, so a client can always scroll a result past wherever the keyboard
// actually sits, using the same plain scroll gesture they already use for
// the list itself. (The real fix — resizing the native WKWebView's own
// frame for the keyboard — lives in ios/ApexCoach/ViewController.swift and
// needs a new App Store build to reach users; this spacer works today,
// on the current build, without waiting for that.)
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

describe("NutritionScreen keyboard-safe scroll spacer", () => {
  it("has no extra spacer before the search box is focused", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    expect(document.querySelector('[data-testid="keyboard-safe-spacer"]')).toBeNull();
  });

  it("reserves extra scroll room once the search box gains focus", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    const input = screen.getByPlaceholderText("Search foods, brands, meals");
    fireEvent.focus(input);
    expect(document.querySelector('[data-testid="keyboard-safe-spacer"]')).toBeTruthy();
  });

  it("removes the spacer once the search box loses focus", () => {
    render(<NutritionScreen {...baseProps()} />);
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    const input = screen.getByPlaceholderText("Search foods, brands, meals");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(document.querySelector('[data-testid="keyboard-safe-spacer"]')).toBeNull();
  });
});
