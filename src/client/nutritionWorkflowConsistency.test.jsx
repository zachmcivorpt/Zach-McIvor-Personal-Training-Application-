// @vitest-environment jsdom
//
// Nutrition Overhaul Section 7 — end-to-end workflow consistency. Unit
// tests already cover each piece (FoodQuantitySheet's scaling, the
// duplicate-add guards, etc.) in isolation; this exercises the full
// client journeys end-to-end through NutritionScreen itself: search a
// food, open the quantity sheet, change the serving, confirm, and check
// exactly what onAddFood/onRemoveFood were actually called with — the
// meal, the date, and the scaled macros — for both today and a date
// reached by navigating back with the date-nav control.
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

function swipeLeft(row, dx = -250) {
  fireEvent.pointerDown(row, { clientX: 0, pointerId: 1 });
  fireEvent.pointerMove(row, { clientX: dx, pointerId: 1 });
  fireEvent.pointerUp(row, { clientX: dx, pointerId: 1 });
}

function dateKeyOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
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
    nutritionByDateKey: { [todayKey()]: DEFAULT_NUTRITION, [dateKeyOffset(1)]: DEFAULT_NUTRITION },
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

afterEach(() => cleanup());

describe("Nutrition end-to-end: search -> quantity sheet -> log", () => {
  it("logs a searched food to today, for the selected meal, scaled to the chosen quantity and unit", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(<NutritionScreen {...baseProps({ onAddFood })} />);

    // Open "Add to Breakfast" (the first meal tab's Log button).
    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    fireEvent.change(screen.getByPlaceholderText("Search foods or meals"), { target: { value: "Chicken Breast" } });

    fireEvent.click(screen.getByText("Chicken Breast"));

    // Quantity sheet opens on the food's own default unit/qty (g, 150 per
    // the static database) — bump it to 300g and confirm.
    const qtyInput = document.querySelector('input[type="number"]');
    fireEvent.change(qtyInput, { target: { value: "300" } });
    fireEvent.click(screen.getByText(/ADD/).closest("button"));

    expect(onAddFood).toHaveBeenCalledTimes(1);
    const [meal, scaled, dateKey] = onAddFood.mock.calls[0];
    expect(meal).toBe("Breakfast");
    expect(dateKey).toBe(todayKey());
    // Chicken Breast: 165 cal/100g -> 300g should be 495, not the
    // unscaled 165 a broken quantity pipeline would log instead.
    expect(scaled.cals).toBe(495);
    expect(scaled.protein).toBeCloseTo(93, 0);
  });

  it("logs to the date reached via the date-nav control, not always today", async () => {
    const onAddFood = vi.fn(() => Promise.resolve());
    render(<NutritionScreen {...baseProps({ onAddFood })} />);

    // Step back one day via the date-nav's "previous day" control before
    // opening the log sheet.
    const prevDayButton = document.querySelector(".lucide-chevron-left").closest("button");
    fireEvent.click(prevDayButton);

    fireEvent.click(screen.getByLabelText("Add food to Breakfast"));
    fireEvent.change(screen.getByPlaceholderText("Search foods or meals"), { target: { value: "Chicken Breast" } });
    fireEvent.click(screen.getByText("Chicken Breast"));
    fireEvent.click(screen.getByText(/ADD/).closest("button"));

    expect(onAddFood).toHaveBeenCalledTimes(1);
    const [, , dateKey] = onAddFood.mock.calls[0];
    expect(dateKey).toBe(dateKeyOffset(1));
    expect(dateKey).not.toBe(todayKey());
  });

  it("removes a logged entry from the date it's actually being viewed on", async () => {
    vi.useFakeTimers();
    const onRemoveFood = vi.fn(() => Promise.resolve());
    const loggedEntry = { id: "e1", name: "Oats (dry)", cals: 379, protein: 13, carbs: 68, fat: 7 };
    const yesterday = dateKeyOffset(1);
    render(
      <NutritionScreen
        {...baseProps({
          onRemoveFood,
          nutritionByDateKey: {
            [todayKey()]: DEFAULT_NUTRITION,
            [yesterday]: { ...DEFAULT_NUTRITION, meals: { ...DEFAULT_NUTRITION.meals, Breakfast: [loggedEntry] } },
          },
        })}
      />
    );

    const prevDayButton = document.querySelector(".lucide-chevron-left").closest("button");
    fireEvent.click(prevDayButton);

    // Open the Breakfast detail sheet (tapping the meal card's name/total)
    // to reach the swipe-to-delete row, then swipe it left — the same
    // gesture swipeDeleteFreeze.test.jsx already covers for SwipeableRow
    // itself; this is the same gesture exercised through NutritionScreen
    // end-to-end, on a non-today date.
    fireEvent.click(screen.getByText("Breakfast"));
    const row = screen.getByText("Oats (dry)").closest("div").parentElement;
    swipeLeft(row);
    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(0);

    expect(onRemoveFood).toHaveBeenCalled();
    const [meal, entryId, dateKey] = onRemoveFood.mock.calls[0];
    expect(meal).toBe("Breakfast");
    expect(entryId).toBe("e1");
    expect(dateKey).toBe(yesterday);
    vi.useRealTimers();
  });
});
